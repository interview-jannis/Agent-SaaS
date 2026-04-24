'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logAsCurrentUser } from '@/lib/audit'

type BankInfo = Record<string, string>

type Agent = {
  id: string
  agent_number: string | null
  name: string
  email: string | null
  phone: string | null
  country: string | null
  margin_rate: number | null
  monthly_completed: number | null
  is_active: boolean
  bank_info: BankInfo | null
  onboarding_status: 'pending_onboarding' | 'awaiting_approval' | 'approved' | null
  rejection_reason: string | null
  rejected_at: string | null
  invite_token: string | null
  invite_expires_at: string | null
}

type ContractRow = {
  id: string
  contract_type: 'nda' | 'partnership'
  title_snapshot: string
  signed_at: string
  approved_at: string | null
}

type CaseRow = {
  id: string
  case_number: string
  status: string
  travel_start_date: string | null
  travel_end_date: string | null
  created_at: string
  quotes: { total_price: number; agent_margin_rate: number }[]
  case_members: { is_lead: boolean; clients: { name: string } | null }[]
}

type SettlementRow = {
  id: string
  settlement_number: string | null
  case_id: string | null
  amount: number
  paid_at: string | null
}

const STATUS_LABELS: Record<string, string> = {
  payment_pending: 'Awaiting Payment', payment_completed: 'Payment Confirmed',
  schedule_reviewed: 'Schedule Reviewed', schedule_confirmed: 'Schedule Confirmed', travel_completed: 'Travel Completed',
}
const STATUS_STYLES: Record<string, string> = {
  payment_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  payment_completed: 'bg-blue-50 text-blue-700 border-blue-200',
  schedule_reviewed: 'bg-violet-50 text-violet-700 border-violet-200',
  schedule_confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  travel_completed: 'bg-gray-50 text-gray-500 border-gray-200',
}

function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function commissionKrw(totalKrw: number, margin: number): number {
  if (!margin || margin <= 0) return 0
  return Math.round(totalKrw * margin / (1 + margin))
}

export default function AdminAgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [agent, setAgent] = useState<Agent | null>(null)
  const [cases, setCases] = useState<CaseRow[]>([])
  const [settlements, setSettlements] = useState<SettlementRow[]>([])
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    const [agentRes, casesRes, settlementsRes, contractsRes, rateRes] = await Promise.all([
      supabase.from('agents')
        .select('id, agent_number, name, email, phone, country, margin_rate, monthly_completed, is_active, bank_info, onboarding_status, rejection_reason, rejected_at, invite_token, invite_expires_at')
        .eq('id', id).single(),
      supabase.from('cases')
        .select('id, case_number, status, travel_start_date, travel_end_date, created_at, quotes(total_price, agent_margin_rate), case_members(is_lead, clients(name))')
        .eq('agent_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('settlements')
        .select('id, settlement_number, case_id, amount, paid_at')
        .eq('agent_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('agent_contracts')
        .select('id, contract_type, title_snapshot, signed_at, approved_at')
        .eq('agent_id', id)
        .order('contract_type', { ascending: true }),  // 'nda' < 'partnership' alphabetically
      supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
    ])
    setAgent((agentRes.data as Agent) ?? null)
    setCases((casesRes.data as unknown as CaseRow[]) ?? [])
    setSettlements((settlementsRes.data as SettlementRow[]) ?? [])
    setContracts((contractsRes.data as ContractRow[]) ?? [])
    const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
    if (r) setExchangeRate(r)
  }, [id])

  useEffect(() => {
    async function init() { await fetchData(); setLoading(false) }
    init()
  }, [fetchData])

  async function toggleActive() {
    if (!agent) return
    setToggling(true); setError('')
    try {
      const nextActive = !agent.is_active
      const { error } = await supabase.from('agents').update({ is_active: nextActive }).eq('id', agent.id)
      if (error) throw error
      await logAsCurrentUser(nextActive ? 'agent.activated' : 'agent.deactivated',
        { type: 'agent', id: agent.id, label: `${agent.name}${agent.agent_number ? ` · ${agent.agent_number}` : ''}` })
      await fetchData()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setToggling(false)
    }
  }

  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  async function approveAgent() {
    if (!agent) return
    if (!window.confirm(`Approve ${agent.name} and activate their account?\n\nThey will be able to sign in and start using Tiktak immediately.`)) return
    setApproving(true); setError('')
    try {
      const now = new Date().toISOString()
      const { data: { session } } = await supabase.auth.getSession()
      const { data: adminRow } = await supabase.from('admins').select('id').eq('auth_user_id', session?.user?.id ?? '').maybeSingle()

      const { error: aErr } = await supabase.from('agents')
        .update({ onboarding_status: 'approved', is_active: true, rejection_reason: null, rejected_at: null })
        .eq('id', agent.id)
      if (aErr) throw aErr

      // Stamp approval on each contract
      await supabase.from('agent_contracts')
        .update({ approved_at: now, approved_by: (adminRow as { id: string } | null)?.id ?? null })
        .eq('agent_id', agent.id)

      await logAsCurrentUser('agent.approved', { type: 'agent', id: agent.id, label: `${agent.name}${agent.agent_number ? ` · ${agent.agent_number}` : ''}` })
      await fetchData()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setApproving(false)
    }
  }

  async function rejectAgent() {
    if (!agent) return
    if (!rejectReason.trim()) { setError('Please enter a reason.'); return }
    setRejecting(true); setError('')
    try {
      const reason = rejectReason.trim()
      const now = new Date().toISOString()
      // Wipe contracts + stamp rejection on the agent row so they see the reason on Waiting page.
      await supabase.from('agent_contracts').delete().eq('agent_id', agent.id)
      await supabase.from('agents').update({
        onboarding_status: 'pending_onboarding',
        rejection_reason: reason,
        rejected_at: now,
      }).eq('id', agent.id)
      await logAsCurrentUser('agent.rejected',
        { type: 'agent', id: agent.id, label: `${agent.name}${agent.agent_number ? ` · ${agent.agent_number}` : ''}` },
        { reason })
      setShowReject(false)
      setRejectReason('')
      await fetchData()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to reject.')
    } finally {
      setRejecting(false)
    }
  }

  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)

  async function deleteAgent() {
    if (!agent) return
    setDeleting(true); setError('')
    try {
      const res = await fetch('/api/admin/delete-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete.')
      await logAsCurrentUser('agent.deleted',
        { type: 'agent', id: agent.id, label: `${agent.name}${agent.agent_number ? ` · ${agent.agent_number}` : ''}` })
      router.replace('/admin/agents')
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to delete.')
      setDeleting(false)
    }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  if (!agent) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Agent not found.</p></div>

  // Metrics
  const settledCaseIds = new Set(settlements.filter(s => s.case_id).map(s => s.case_id!))
  const completedCases = cases.filter(c => c.status === 'travel_completed')
  const unsettledKrw = completedCases
    .filter(c => !settledCaseIds.has(c.id))
    .reduce((sum, c) => sum + commissionKrw(c.quotes?.[0]?.total_price ?? 0, c.quotes?.[0]?.agent_margin_rate ?? 0), 0)
  const paidKrw = settlements.reduce((s, st) => s + (st.amount ?? 0), 0)

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-gray-100">
        <button onClick={() => router.push('/admin/agents')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Agents
        </button>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-900">{agent.name}</span>
        <span className="text-[10px] font-mono text-gray-400">{agent.agent_number ?? ''}</span>
        {agent.is_active
          ? <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">Active</span>
          : <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200">Inactive</span>
        }
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Approved-only blocks (metrics/profile/bank/cases/settlements) — skip for temp accounts */}
          {agent.onboarding_status === 'approved' && (
          <>
          {/* Basic + margin */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Margin Rate</p>
              <p className="text-lg font-bold text-[#0f4c35]">{agent.margin_rate != null ? `${(agent.margin_rate * 100).toFixed(0)}%` : '—'}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{agent.monthly_completed ?? 0} completed this month · {completedCases.length} total</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-[10px] text-amber-700 uppercase tracking-wide mb-1">Unsettled</p>
              <p className="text-lg font-bold text-amber-800">{fmtUSD(unsettledKrw / exchangeRate)}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <p className="text-[10px] text-emerald-700 uppercase tracking-wide mb-1">Paid Out</p>
              <p className="text-lg font-bold text-emerald-800">{fmtUSD(paidKrw / exchangeRate)}</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">{settlements.length} settlement{settlements.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Profile */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Profile</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><p className="text-[10px] text-gray-400 mb-0.5">Email</p><p className="text-gray-800 break-all">{agent.email ?? '—'}</p></div>
              <div><p className="text-[10px] text-gray-400 mb-0.5">Phone</p><p className="text-gray-800">{agent.phone ?? '—'}</p></div>
              <div><p className="text-[10px] text-gray-400 mb-0.5">Country</p><p className="text-gray-800">{agent.country ?? '—'}</p></div>
            </div>
          </section>

          {/* Bank info */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Bank Information</h3>
            {agent.bank_info && Object.keys(agent.bank_info).length > 0 ? (
              <div className="grid grid-cols-1 gap-y-2 text-sm">
                {Object.entries(agent.bank_info).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-start">
                    <p className="text-[11px] text-gray-500 capitalize">{k.replace(/_/g, ' ')}</p>
                    <p className="text-gray-800 font-mono text-xs text-right max-w-[60%] break-all">{String(v)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-700">Agent has not submitted bank details. Settlement cannot be processed until they fill their profile.</p>
            )}
          </section>
          </>
          )}

          {/* Contracts */}
          <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Signed Contracts</h3>
              <span className="text-[10px] text-gray-400">{contracts.length}</span>
            </div>
            {contracts.length === 0 ? (
              <p className="text-xs text-gray-500">No contracts signed yet.</p>
            ) : (
              <div className="space-y-2">
                {contracts.map(c => (
                  <button key={c.id}
                    onClick={() => router.push(`/admin/agents/${agent.id}/contract/${c.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-gray-100 hover:border-[#0f4c35]/40 hover:bg-gray-50 transition-colors text-left">
                    <svg className="w-5 h-5 text-[#0f4c35] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.title_snapshot}</p>
                      <p className="text-[11px] text-gray-500">Signed {c.signed_at.slice(0, 10)}{c.approved_at ? ` · Approved ${c.approved_at.slice(0, 10)}` : ''}</p>
                    </div>
                    <span className="text-xs text-[#0f4c35] font-medium shrink-0">View ↗</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Invite link — visible while agent hasn't claimed or signed yet */}
          {agent.invite_token && agent.onboarding_status === 'pending_onboarding' && !agent.rejection_reason && (() => {
            const inviteUrl = typeof window !== 'undefined'
              ? `${window.location.origin}/invite/${agent.invite_token}`
              : `/invite/${agent.invite_token}`
            const expired = agent.invite_expires_at ? new Date(agent.invite_expires_at) < new Date() : false
            return (
              <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Invite Link</h3>
                  <div className="flex items-center gap-3">
                    {agent.invite_expires_at && (
                      <span className={`text-[11px] ${expired ? 'text-red-500' : 'text-gray-500'}`}>
                        {expired ? 'Expired' : 'Expires'} {new Date(agent.invite_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inviteUrl)
                        setCopiedInvite(true)
                        setTimeout(() => setCopiedInvite(false), 2000)
                      }}
                      className="text-[10px] text-[#0f4c35] hover:underline">
                      {copiedInvite ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>
                <p className="font-mono text-[11px] text-gray-800 break-all bg-white border border-gray-200 rounded-lg px-3 py-2">
                  {inviteUrl}
                </p>
                <p className="text-[11px] text-gray-500">
                  Share this with the agent to start onboarding. The link becomes invalid once they complete the Setup Wizard.
                </p>
              </section>
            )
          })()}

          {/* Previous rejection banner — visible if rejected and not yet re-signed */}
          {agent.rejection_reason && agent.onboarding_status !== 'approved' && (
            <section className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-xs font-semibold text-rose-800 uppercase tracking-wide">Previously Rejected</h3>
                  <p className="text-xs text-rose-800 mt-1">&quot;{agent.rejection_reason}&quot;</p>
                  {agent.rejected_at && (
                    <p className="text-[10px] text-rose-600 mt-1">Rejected {new Date(agent.rejected_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Approval action — only while awaiting approval */}
          {agent.onboarding_status === 'awaiting_approval' && (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">Awaiting Approval</h3>
                <p className="text-xs text-amber-800">Review the signed contracts above. Approve to activate the account, or reject to send the agent back to the onboarding step.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowReject(true); setError('') }} disabled={approving || rejecting}
                  className="px-4 py-2 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40">
                  Reject
                </button>
                <button onClick={approveAgent} disabled={approving || rejecting || contracts.length < 2}
                  title={contracts.length < 2 ? 'Agent has not signed all required contracts yet.' : ''}
                  className="px-4 py-2 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                  {approving ? 'Approving...' : 'Approve & Activate'}
                </button>
              </div>
            </section>
          )}

          {/* Reject modal */}
          {showReject && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={() => { if (!rejecting) setShowReject(false) }}>
              <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Reject Agent</h3>
                  <p className="text-xs text-gray-500 mt-1">The signed contracts will be cleared and the agent returned to onboarding. Please note the reason — it will be recorded in the audit log.</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Reason *</label>
                  <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    rows={3} placeholder="e.g. Signature does not match the provided name"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] resize-none" />
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => { setShowReject(false); setRejectReason(''); setError('') }}
                    disabled={rejecting}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800">Cancel</button>
                  <button onClick={rejectAgent} disabled={rejecting || !rejectReason.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40">
                    {rejecting ? 'Rejecting...' : 'Confirm Reject'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Danger Zone — only for non-approved agents (deletion of agents with cases is blocked server-side) */}
          {agent.onboarding_status !== 'approved' && (
            <section className="bg-white border border-red-200 rounded-2xl p-5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Danger Zone</h3>
                <p className="text-xs text-gray-600">
                  Permanently delete this agent, their login, and any signed contracts.
                  Cannot be undone. Only allowed when the agent has no cases.
                </p>
              </div>
              <button onClick={() => { setShowDelete(true); setError('') }} disabled={deleting}
                className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40">
                Delete Agent
              </button>
            </section>
          )}

          {/* Delete modal */}
          {showDelete && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={() => { if (!deleting) setShowDelete(false) }}>
              <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
                <div>
                  <h3 className="text-sm font-semibold text-red-700">Delete Agent</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    This will permanently remove <span className="font-semibold">{agent.name}</span>
                    {agent.agent_number ? <> (<span className="font-mono">{agent.agent_number}</span>)</> : null},
                    their login, and any signed contracts. This cannot be undone.
                  </p>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => { setShowDelete(false); setError('') }} disabled={deleting}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Cancel</button>
                  <button onClick={deleteAgent} disabled={deleting}
                    className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40">
                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Account control — only for approved agents */}
          {agent.onboarding_status === 'approved' && (
            <section className="bg-gray-50 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Account Status</h3>
                <p className="text-xs text-gray-500">
                  {agent.is_active
                    ? 'Agent can log in and use the platform.'
                    : 'Agent account is deactivated. They cannot log in.'}
                </p>
              </div>
              <button onClick={toggleActive} disabled={toggling}
                className={`px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-40 ${
                  agent.is_active
                    ? 'border border-red-200 text-red-600 hover:bg-red-50'
                    : 'bg-[#0f4c35] text-white hover:bg-[#0a3828]'
                }`}>
                {toggling ? '...' : agent.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </section>
          )}

          {/* Cases list + Settlement History — approved only */}
          {agent.onboarding_status === 'approved' && (<>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cases</h3>
              <span className="text-[10px] text-gray-400">{cases.length}</span>
            </div>
            {cases.length === 0 ? (
              <div className="bg-gray-50 rounded-2xl p-6 text-center">
                <p className="text-sm text-gray-400">No cases yet.</p>
              </div>
            ) : (
              <div className="border border-gray-100 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Case #', 'Lead', 'Status', 'Travel', 'Total'].map(h => (
                        <th key={h} className="py-2.5 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map(c => {
                      const lead = c.case_members?.find(m => m.is_lead)
                      const q = c.quotes?.[0]
                      return (
                        <tr key={c.id} onClick={() => router.push(`/admin/cases/${c.id}`)}
                          className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 cursor-pointer">
                          <td className="py-3 px-4 font-mono text-xs text-gray-500">{c.case_number}</td>
                          <td className="py-3 px-4 text-gray-800">{lead?.clients?.name ?? '—'}</td>
                          <td className="py-3 px-4">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[c.status] ?? ''}`}>
                              {STATUS_LABELS[c.status] ?? c.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-500 text-xs">
                            {c.travel_start_date || c.travel_end_date
                              ? `${c.travel_start_date ?? '—'} ~ ${c.travel_end_date ?? '—'}`
                              : '—'}
                          </td>
                          <td className="py-3 px-4 font-medium text-gray-900">{q ? fmtUSD(q.total_price / exchangeRate) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Settlement history */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Settlement History</h3>
              <span className="text-[10px] text-gray-400">{settlements.length}</span>
            </div>
            {settlements.length === 0 ? (
              <div className="bg-gray-50 rounded-2xl p-6 text-center">
                <p className="text-sm text-gray-400">No settlements yet.</p>
              </div>
            ) : (
              <div className="border border-gray-100 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['#', 'Case', 'Paid On', 'Amount'].map(h => (
                        <th key={h} className="py-2.5 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map(s => {
                      const linkedCase = cases.find(c => c.id === s.case_id)
                      return (
                        <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                          <td className="py-3 px-4 font-mono text-xs text-gray-400">{s.settlement_number ?? '—'}</td>
                          <td className="py-3 px-4 text-xs text-gray-500">{linkedCase?.case_number ?? '—'}</td>
                          <td className="py-3 px-4 text-gray-500 text-xs">{s.paid_at?.slice(0, 10) ?? '—'}</td>
                          <td className="py-3 px-4 font-medium text-gray-900">{fmtUSD(s.amount / exchangeRate)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          </>)}

        </div>
      </div>
    </div>
  )
}
