'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type OnboardingStatus = 'pending_onboarding' | 'awaiting_approval' | 'approved'

type Agent = {
  id: string
  agent_number: string | null
  name: string
  email: string | null
  country: string | null
  margin_rate: number | null
  is_active: boolean
  onboarding_status: OnboardingStatus | null
  rejection_reason: string | null
}

type CaseRow = {
  id: string
  agent_id: string
  status: string
  quotes: { total_price: number; agent_margin_rate: number }[]
}

type ClientRow = { id: string; agent_id: string }

type SettlementRow = { id: string; agent_id: string; case_id: string | null; amount: number }

function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function commissionKrw(totalKrw: number, margin: number): number {
  if (!margin || margin <= 0) return 0
  return Math.round(totalKrw * margin / (1 + margin))
}

export default function AdminAgentsPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [cases, setCases] = useState<CaseRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [settlements, setSettlements] = useState<SettlementRow[]>([])
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Invite Agent modal
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdInvite, setCreatedInvite] = useState<{ agent_number: string; invite_url: string; expires_at: string } | null>(null)
  const [copiedInvite, setCopiedInvite] = useState(false)

  async function fetchAll() {
    const [agentsRes, casesRes, clientsRes, settlementsRes, rateRes] = await Promise.all([
      supabase.from('agents')
        .select('id, agent_number, name, email, country, margin_rate, is_active, onboarding_status, rejection_reason')
        .order('name'),
      supabase.from('cases').select('id, agent_id, status, quotes(total_price, agent_margin_rate)'),
      supabase.from('clients').select('id, agent_id'),
      supabase.from('settlements').select('id, agent_id, case_id, amount'),
      supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
    ])
    setAgents((agentsRes.data as Agent[]) ?? [])
    setCases((casesRes.data as unknown as CaseRow[]) ?? [])
    setClients((clientsRes.data as ClientRow[]) ?? [])
    setSettlements((settlementsRes.data as SettlementRow[]) ?? [])
    const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
    if (r) setExchangeRate(r)
  }

  useEffect(() => {
    async function init() { await fetchAll(); setLoading(false) }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createInvite() {
    setCreating(true); setCreateError('')
    try {
      const res = await fetch('/api/admin/invite-agent', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      setCreatedInvite({
        agent_number: data.agent_number,
        invite_url: `${origin}${data.invite_path}`,
        expires_at: data.expires_at,
      })
      await fetchAll()
    } catch (e: unknown) {
      setCreateError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setCreating(false)
    }
  }

  function closeCreateModal() {
    setShowCreate(false)
    setCreateError(''); setCreatedInvite(null); setCopiedInvite(false)
  }

  // Per-agent aggregates
  const agentMetrics = new Map<string, { cases: number; clients: number; unsettledKrw: number; paidKrw: number }>()
  for (const a of agents) agentMetrics.set(a.id, { cases: 0, clients: 0, unsettledKrw: 0, paidKrw: 0 })
  for (const c of cases) {
    const m = agentMetrics.get(c.agent_id)
    if (m) m.cases++
  }
  for (const cl of clients) {
    const m = agentMetrics.get(cl.agent_id)
    if (m) m.clients++
  }
  const settledCaseIds = new Set(settlements.filter(s => s.case_id).map(s => s.case_id!))
  for (const c of cases) {
    if (c.status !== 'completed') continue
    if (settledCaseIds.has(c.id)) continue
    const q = c.quotes?.[0]
    if (!q) continue
    const m = agentMetrics.get(c.agent_id)
    if (m) m.unsettledKrw += commissionKrw(q.total_price, q.agent_margin_rate)
  }
  for (const s of settlements) {
    const m = agentMetrics.get(s.agent_id)
    if (m) m.paidKrw += s.amount ?? 0
  }

  const filtered = agents.filter(a => {
    if (statusFilter === 'active' && !a.is_active) return false
    if (statusFilter === 'inactive' && a.is_active) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (a.name?.toLowerCase().includes(q) || a.agent_number?.toLowerCase().includes(q) || a.country?.toLowerCase().includes(q))
  })

  const approvedAgents = filtered.filter(a => a.onboarding_status === 'approved' || a.onboarding_status === null)
  const tempAgents = filtered.filter(a => a.onboarding_status === 'pending_onboarding' || a.onboarding_status === 'awaiting_approval')

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-gray-900">Agents</h1>
          {!loading && (
            <span className="text-xs text-gray-400">
              {approvedAgents.length} approved
              {tempAgents.length > 0 && <span className="ml-1 text-amber-600">· {tempAgents.length} onboarding</span>}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-48 text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-600">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f4c35] text-white text-xs font-medium rounded-lg hover:bg-[#0a3828]">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Invite Agent
          </button>
        </div>
      </div>

      {/* Table — split layout: approved (scrollable) on top, onboarding pinned to bottom */}
      <div className="flex-1 flex flex-col min-h-0">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-24">{search ? 'No results.' : 'No agents yet.'}</p>
        ) : (
          <>
            {/* Approved agents — takes 5/7 of the viewport, scrolls within */}
            <section className="flex-[5] overflow-y-auto min-h-0">
              <div className="px-6 pt-4 pb-2 flex items-center gap-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Approved Agents</h2>
                <span className="text-[10px] text-gray-400">{approvedAgents.length}</span>
              </div>
              {approvedAgents.length === 0 ? (
                <p className="text-xs text-gray-400 px-6 py-8">No approved agents yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-y border-gray-100 bg-gray-50/60">
                    <tr>
                      {['Agent #', 'Name', 'Country', 'Cases', 'Margin', 'Unsettled', 'Paid Out', 'Status'].map(h => (
                        <th key={h} className="py-2.5 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {approvedAgents.map(a => {
                      const m = agentMetrics.get(a.id) ?? { cases: 0, clients: 0, unsettledKrw: 0, paidKrw: 0 }
                      return (
                        <tr key={a.id} onClick={() => router.push(`/admin/agents/${a.id}`)}
                          className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                          <td className="py-3.5 px-4 font-mono text-xs text-gray-400">{a.agent_number ?? '—'}</td>
                          <td className="py-3.5 px-4">
                            <p className="font-medium text-gray-900">{a.name}</p>
                            <p className="text-[10px] text-gray-400">{a.email ?? ''}</p>
                          </td>
                          <td className="py-3.5 px-4 text-gray-500">{a.country ?? '—'}</td>
                          <td className="py-3.5 px-4 text-gray-500 text-center">{m.cases}</td>
                          <td className="py-3.5 px-4 text-gray-700">{a.margin_rate != null ? `${(a.margin_rate * 100).toFixed(0)}%` : '—'}</td>
                          <td className={`py-3.5 px-4 font-medium ${m.unsettledKrw > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmtUSD(m.unsettledKrw / exchangeRate)}</td>
                          <td className="py-3.5 px-4 text-gray-600">{fmtUSD(m.paidKrw / exchangeRate)}</td>
                          <td className="py-3.5 px-4">
                            {a.is_active
                              ? <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">Active</span>
                              : <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200">Inactive</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {/* Temp agents (onboarding in progress) — takes 2/5 of the viewport, scrolls within */}
            <section className="flex-[2] min-h-0 overflow-y-auto bg-gray-50/30 border-t-2 border-gray-200">
              <div className="px-6 pt-2 pb-2 flex items-center gap-2 bg-gray-50/30 sticky top-0">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Onboarding</h2>
                <span className="text-[10px] text-gray-400">{tempAgents.length}</span>
                <p className="text-[11px] text-gray-400 ml-3">Pending signature, awaiting approval, or rejected.</p>
              </div>
              {tempAgents.length === 0 ? (
                <p className="text-xs text-gray-400 px-6 py-8">No temp agents in onboarding.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-y border-gray-100 bg-gray-50">
                    <tr>
                      {['Agent #', 'Login Email', 'Status'].map(h => (
                        <th key={h} className="py-2.5 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tempAgents.map(a => {
                      const status = a.onboarding_status
                      const isRejected = !!a.rejection_reason && status !== 'awaiting_approval'
                      const style =
                        isRejected ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : status === 'awaiting_approval' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-gray-100 text-gray-600 border-gray-200'
                      const label =
                        isRejected ? 'Rejected'
                        : status === 'awaiting_approval' ? 'Awaiting Approval'
                        : 'Pending Onboarding'
                      return (
                        <tr key={a.id}
                          onClick={() => router.push(`/admin/agents/${a.id}`)}
                          className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                          <td className="py-3.5 px-4 font-mono text-xs text-gray-400">{a.agent_number ?? '—'}</td>
                          <td className="py-3.5 px-4 font-mono text-xs text-gray-700">{a.email ?? '—'}</td>
                          <td className="py-3.5 px-4">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${style}`}>{label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>

      {/* Invite Agent Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !creating && closeCreateModal()}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            {!createdInvite ? (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Invite a New Agent</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Generates a one-use invite link. Share it via WhatsApp / email — the agent opens
                    it and goes straight into Orientation and contract signing. The link expires in 7 days.
                  </p>
                </div>

                {createError && <p className="text-xs text-red-500">{createError}</p>}

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <button onClick={closeCreateModal} disabled={creating}
                    className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg disabled:opacity-40">Cancel</button>
                  <button onClick={createInvite} disabled={creating}
                    className="text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-4 py-1.5 rounded-lg disabled:opacity-40">
                    {creating ? 'Generating...' : 'Generate Invite Link'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Invite Link Ready</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Share this link with the agent. They&apos;ll start onboarding immediately.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Agent #</span>
                    <span className="font-mono text-sm text-gray-800">{createdInvite.agent_number}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">Invite Link</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdInvite.invite_url)
                          setCopiedInvite(true)
                          setTimeout(() => setCopiedInvite(false), 2000)
                        }}
                        className="text-[10px] text-[#0f4c35] hover:underline">
                        {copiedInvite ? 'Copied!' : 'Copy Link'}
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-gray-800 break-all bg-white border border-gray-200 rounded-lg px-3 py-2">
                      {createdInvite.invite_url}
                    </p>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Expires</span>
                    <span className="text-xs text-gray-700">
                      {new Date(createdInvite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-gray-500">
                  The agent sets their own email and password at the end of onboarding — no credentials to hand over.
                </p>

                <div className="flex justify-end pt-2 border-t border-gray-100">
                  <button onClick={closeCreateModal}
                    className="text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-4 py-1.5 rounded-lg">Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
