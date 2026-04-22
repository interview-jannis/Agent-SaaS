'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    const [agentRes, casesRes, settlementsRes, rateRes] = await Promise.all([
      supabase.from('agents')
        .select('id, agent_number, name, email, phone, country, margin_rate, monthly_completed, is_active, bank_info')
        .eq('id', id).single(),
      supabase.from('cases')
        .select('id, case_number, status, travel_start_date, travel_end_date, created_at, quotes(total_price, agent_margin_rate), case_members(is_lead, clients(name))')
        .eq('agent_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('settlements')
        .select('id, settlement_number, case_id, amount, paid_at')
        .eq('agent_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
    ])
    setAgent((agentRes.data as Agent) ?? null)
    setCases((casesRes.data as unknown as CaseRow[]) ?? [])
    setSettlements((settlementsRes.data as SettlementRow[]) ?? [])
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
      const { error } = await supabase.from('agents').update({ is_active: !agent.is_active }).eq('id', agent.id)
      if (error) throw error
      await fetchData()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setToggling(false)
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

          {/* Account control */}
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

          {/* Cases list */}
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

        </div>
      </div>
    </div>
  )
}
