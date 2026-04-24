'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { notifyAgent } from '@/lib/notifications'
import { logAsCurrentUser } from '@/lib/audit'

// ── Types ─────────────────────────────────────────────────────────────────────

type Agent = {
  id: string
  agent_number: string | null
  name: string
  email: string | null
  bank_info: Record<string, string> | null
}

type CompletedCase = {
  id: string
  case_number: string
  travel_start_date: string | null
  travel_end_date: string | null
  travel_completed_at: string | null
  agent_id: string
  agents: Agent | Agent[] | null
  case_members: { is_lead: boolean; clients: { name: string } | null }[]
  quotes: { total_price: number; agent_margin_rate: number }[]
}

type Settlement = {
  id: string
  settlement_number: string | null
  agent_id: string
  case_id: string | null
  amount: number
  paid_at: string | null
  created_at: string
  agents: Agent | Agent[] | null
}

function pickAgent(a: Agent | Agent[] | null | undefined): Agent | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function fmtKRW(n: number) { return '₩' + n.toLocaleString('ko-KR') }
function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function commissionKrw(totalKrw: number, agentMargin: number): number {
  if (!agentMargin || agentMargin <= 0) return 0
  return Math.round(totalKrw * agentMargin / (1 + agentMargin))
}

function daysWaiting(endDate: string | null): number | null {
  if (!endDate) return null
  return Math.floor((Date.now() - new Date(endDate).getTime()) / 86400000)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminSettlementPage() {
  const [loading, setLoading] = useState(true)
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [cases, setCases] = useState<CompletedCase[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])

  // Settle modal state
  const [settlingCase, setSettlingCase] = useState<CompletedCase | null>(null)
  const [settlePaidDate, setSettlePaidDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')

  const fetchData = useCallback(async () => {
    const [casesRes, settlementsRes, rateRes] = await Promise.all([
      supabase.from('cases')
        .select('id, case_number, travel_start_date, travel_end_date, travel_completed_at, agent_id, agents!cases_agent_id_fkey(id, agent_number, name, email, bank_info), case_members(is_lead, clients(name)), quotes(total_price, agent_margin_rate)')
        .eq('status', 'travel_completed')
        .order('travel_end_date', { ascending: false }),
      supabase.from('settlements')
        .select('id, settlement_number, agent_id, case_id, amount, paid_at, created_at, agents!settlements_agent_id_fkey(id, agent_number, name, email, bank_info)')
        .order('created_at', { ascending: false }),
      supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
    ])
    if (casesRes.error) console.error('[settlement] cases error:', casesRes.error)
    if (settlementsRes.error) console.error('[settlement] settlements error:', settlementsRes.error)
    setCases((casesRes.data as unknown as CompletedCase[]) ?? [])
    setSettlements((settlementsRes.data as unknown as Settlement[]) ?? [])
    const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
    if (r) setExchangeRate(r)
  }, [])

  useEffect(() => {
    async function init() { await fetchData(); setLoading(false) }
    init()
  }, [fetchData])

  // ── Derive ─────────────────────────────────────────────────────────────────

  const settledCaseIds = new Set(settlements.filter(s => s.case_id).map(s => s.case_id!))
  const unsettled = cases.filter(c => !settledCaseIds.has(c.id))

  const caseCommissionKrw = (c: CompletedCase) => {
    const q = c.quotes?.[0]
    return q ? commissionKrw(q.total_price, q.agent_margin_rate) : 0
  }

  const toUsd = (krw: number) => krw / exchangeRate

  // Hero stats
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const paidThisMonthKrw = settlements
    .filter(s => s.paid_at?.startsWith(monthKey))
    .reduce((sum, s) => sum + (s.amount ?? 0), 0)
  const paidThisMonthCount = settlements.filter(s => s.paid_at?.startsWith(monthKey)).length
  const unsettledTotalKrw = unsettled.reduce((sum, c) => sum + caseCommissionKrw(c), 0)
  const totalPaidKrw = settlements.filter(s => s.paid_at).reduce((sum, s) => sum + (s.amount ?? 0), 0)
  const totalPaidCount = settlements.filter(s => s.paid_at).length

  // Group unsettled cases by agent
  type AgentGroup = { agent: Agent; cases: CompletedCase[]; totalKrw: number; oldestDaysWaiting: number }
  const byAgent = new Map<string, AgentGroup>()
  for (const c of unsettled) {
    const agent = pickAgent(c.agents)
    if (!agent) continue
    const days = daysWaiting(c.travel_end_date) ?? 0
    const existing = byAgent.get(agent.id) ?? { agent, cases: [], totalKrw: 0, oldestDaysWaiting: 0 }
    existing.cases.push(c)
    existing.totalKrw += caseCommissionKrw(c)
    existing.oldestDaysWaiting = Math.max(existing.oldestDaysWaiting, days)
    byAgent.set(agent.id, existing)
  }
  const groupedUnsettled = [...byAgent.values()].sort((a, b) => {
    // Oldest waiting first, then by amount
    if (a.oldestDaysWaiting !== b.oldestDaysWaiting) return b.oldestDaysWaiting - a.oldestDaysWaiting
    return b.totalKrw - a.totalKrw
  })

  // ── Actions ────────────────────────────────────────────────────────────────

  function openSettleModal(c: CompletedCase) {
    setSettlingCase(c)
    setSettlePaidDate(new Date().toISOString().slice(0, 10))
    setModalError('')
  }

  function closeSettleModal() {
    setSettlingCase(null)
    setModalError('')
  }

  async function confirmSettle() {
    if (!settlingCase) return
    if (!settlePaidDate) { setModalError('Paid date is required.'); return }
    setSaving(true); setModalError('')
    try {
      const { count } = await supabase.from('settlements').select('*', { count: 'exact', head: true })
      const next = (count ?? 0) + 1
      const settlementNumber = `#S-${String(next).padStart(3, '0')}`
      const amountKrw = caseCommissionKrw(settlingCase)

      const { error } = await supabase.from('settlements').insert({
        settlement_number: settlementNumber,
        agent_id: settlingCase.agent_id,
        case_id: settlingCase.id,
        amount: amountKrw,
        paid_at: settlePaidDate,
      })
      if (error) throw error
      await notifyAgent(settlingCase.agent_id, `${settlingCase.case_number} Settlement paid — ${fmtUSD(toUsd(amountKrw))}`, '/agent/payouts')
      await logAsCurrentUser('settlement.paid',
        { type: 'case', id: settlingCase.id, label: settlingCase.case_number },
        { amount_krw: amountKrw, paid_at: settlePaidDate, settlement_number: settlementNumber })
      await fetchData()
      closeSettleModal()
    } catch (e: unknown) {
      setModalError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-900">Settlement</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-12 py-8 space-y-6">

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
          ) : (
            <>
              {/* HERO — Payout activity */}
              <section className="bg-gray-50 rounded-2xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Paid This Month */}
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Paid This Month</p>
                    <p className="text-4xl font-bold text-gray-900 tracking-tight leading-none">{fmtUSD(toUsd(paidThisMonthKrw))}</p>
                    <p className="text-xs text-gray-500 mt-2 tabular-nums">{fmtKRW(paidThisMonthKrw)}</p>
                    <p className="text-xs text-gray-500 mt-1">{paidThisMonthCount} payout{paidThisMonthCount !== 1 ? 's' : ''}</p>
                  </div>

                  {/* Pending Payouts — primary action focus */}
                  <div className="md:border-l md:border-gray-200 md:pl-6">
                    <p className="text-[10px] text-amber-700 uppercase tracking-wide mb-2">Pending Payouts</p>
                    <p className="text-4xl font-bold text-amber-700 tracking-tight leading-none">{fmtUSD(toUsd(unsettledTotalKrw))}</p>
                    <p className="text-xs text-amber-600 mt-2 tabular-nums">{fmtKRW(unsettledTotalKrw)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {unsettled.length} case{unsettled.length !== 1 ? 's' : ''} · {byAgent.size} agent{byAgent.size !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Total All-Time */}
                  <div className="md:border-l md:border-gray-200 md:pl-6">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Total Paid · All Time</p>
                    <p className="text-2xl font-bold text-emerald-700 tracking-tight leading-none">{fmtUSD(toUsd(totalPaidKrw))}</p>
                    <p className="text-xs text-gray-500 mt-2">{totalPaidCount} payout{totalPaidCount !== 1 ? 's' : ''} across {new Set(settlements.filter(s => s.paid_at).map(s => s.agent_id)).size} agent{new Set(settlements.filter(s => s.paid_at).map(s => s.agent_id)).size !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </section>

              {/* UNSETTLED CASES — grouped by agent, oldest first (primary action area) */}
              <section className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-sm font-semibold text-gray-900">Pending Settlements</h2>
                  {unsettled.length > 0 && (
                    <span className="text-xs text-gray-500">grouped by agent · oldest waiting first</span>
                  )}
                </div>
                {groupedUnsettled.length === 0 ? (
                  <div className="bg-gray-50 rounded-2xl p-8 text-center">
                    <p className="text-sm text-gray-400">No cases awaiting settlement. All completed cases have been paid out.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupedUnsettled.map(group => {
                      const hasBank = group.agent.bank_info && Object.keys(group.agent.bank_info).length > 0
                      const overdue = group.oldestDaysWaiting >= 14
                      return (
                        <div key={group.agent.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                          {/* Agent group header */}
                          <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold text-gray-900">{group.agent.name}</span>
                              <span className="text-xs font-mono text-gray-400">{group.agent.agent_number ?? ''}</span>
                            </div>
                            {!hasBank && (
                              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Bank info missing</span>
                            )}
                            {overdue && (
                              <span className="text-[10px] font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded">{group.oldestDaysWaiting}d waiting</span>
                            )}
                            <div className="ml-auto text-right">
                              <p className="text-sm font-bold text-gray-900">{fmtUSD(toUsd(group.totalKrw))}</p>
                              <p className="text-[10px] text-gray-500">{group.cases.length} case{group.cases.length !== 1 ? 's' : ''} · {fmtKRW(group.totalKrw)}</p>
                            </div>
                          </div>

                          {/* Cases in group */}
                          <div className="divide-y divide-gray-100">
                            {group.cases.map(c => {
                              const lead = c.case_members?.find(m => m.is_lead)
                              const commKrw = caseCommissionKrw(c)
                              const days = daysWaiting(c.travel_end_date)
                              const margin = c.quotes?.[0]?.agent_margin_rate ?? 0
                              return (
                                <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50">
                                  <span className="text-xs font-mono text-gray-400 shrink-0">{c.case_number}</span>
                                  <span className="text-sm text-gray-800 truncate flex-1">{lead?.clients?.name ?? '—'}</span>
                                  <span className="text-xs text-gray-500 shrink-0">
                                    {c.travel_end_date ?? '—'}
                                    {days !== null && days > 0 && <span className="ml-1 text-gray-400">({days}d ago)</span>}
                                  </span>
                                  <span className="text-xs text-gray-500 shrink-0">{(margin * 100).toFixed(0)}%</span>
                                  <span className="text-sm font-semibold text-gray-900 shrink-0 tabular-nums min-w-[90px] text-right">{fmtUSD(toUsd(commKrw))}</span>
                                  <button onClick={() => openSettleModal(c)}
                                    className="px-3 py-1 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] shrink-0">
                                    Settle
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* SETTLEMENT HISTORY (reference) */}
              <section className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-sm font-semibold text-gray-900">Settlement History</h2>
                  <span className="text-xs text-gray-400">{settlements.length}</span>
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
                          {['Paid On', '#', 'Agent', 'Case', 'Margin', 'Amount'].map(h => (
                            <th key={h} className="py-2.5 px-4 text-xs font-medium text-gray-500 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {settlements.map(s => {
                          const agent = pickAgent(s.agents)
                          const linkedCase = cases.find(c => c.id === s.case_id)
                          const lead = linkedCase?.case_members?.find(m => m.is_lead)
                          const margin = linkedCase?.quotes?.[0]?.agent_margin_rate
                          return (
                            <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                              <td className="py-3 px-4 text-gray-800">{s.paid_at?.slice(0, 10) ?? '—'}</td>
                              <td className="py-3 px-4 font-mono text-xs text-gray-500">{s.settlement_number ?? '—'}</td>
                              <td className="py-3 px-4 text-gray-800">{agent?.name ?? '—'}</td>
                              <td className="py-3 px-4 text-xs">
                                {linkedCase
                                  ? <span className="text-gray-500">{linkedCase.case_number} · {lead?.clients?.name ?? '—'}</span>
                                  : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="py-3 px-4 text-gray-600 text-xs">{margin != null ? `${(margin * 100).toFixed(0)}%` : '—'}</td>
                              <td className="py-3 px-4 text-right">
                                <p className="text-base font-semibold text-gray-900">{fmtUSD(toUsd(s.amount))}</p>
                                <p className="text-[10px] text-gray-400">{fmtKRW(s.amount)}</p>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {/* Settle Modal */}
      {settlingCase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && closeSettleModal()}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Log Settlement</h3>
              <p className="text-xs text-gray-500 mt-1">Record a payout after sending the bank transfer.</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-xs">
              {(() => {
                const agent = pickAgent(settlingCase.agents)
                const lead = settlingCase.case_members?.find(m => m.is_lead)
                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Agent</span>
                      <span className="text-gray-900 font-medium">{agent?.name ?? '—'} <span className="font-mono text-gray-400">{agent?.agent_number ?? ''}</span></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Case</span>
                      <span className="text-gray-900">{settlingCase.case_number} · {lead?.clients?.name ?? '—'}</span>
                    </div>
                    {agent?.bank_info && Object.keys(agent.bank_info).length > 0 && (
                      <div className="pt-2 mt-2 border-t border-gray-200 space-y-1">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Bank Details</p>
                        {Object.entries(agent.bank_info).map(([k, v]) => (
                          <div key={k} className="flex justify-between">
                            <span className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}</span>
                            <span className="text-gray-800 font-mono">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(!agent?.bank_info || Object.keys(agent.bank_info).length === 0) && (
                      <p className="pt-2 mt-2 border-t border-gray-200 text-[11px] text-amber-700">
                        ⚠ No bank details on file. Agent must update their profile.
                      </p>
                    )}
                  </>
                )
              })()}
            </div>

            {(() => {
              const amountKrw = caseCommissionKrw(settlingCase)
              return (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="block text-xs text-gray-500 mb-1">Amount</p>
                    <p className="text-lg font-bold text-[#0f4c35]">{fmtUSD(toUsd(amountKrw))}</p>
                    <p className="text-[10px] text-gray-400">{fmtKRW(amountKrw)}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Paid Date *</label>
                    <input type="date" value={settlePaidDate}
                      onChange={e => setSettlePaidDate(e.target.value)}
                      min={settlingCase.travel_end_date ?? undefined}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                </div>
              )
            })()}

            {modalError && <p className="text-xs text-red-500">{modalError}</p>}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={closeSettleModal} disabled={saving}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg disabled:opacity-40">
                Cancel
              </button>
              <button onClick={confirmSettle} disabled={saving}
                className="text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-3 py-1.5 rounded-lg disabled:opacity-40">
                {saving ? 'Logging...' : 'Confirm Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
