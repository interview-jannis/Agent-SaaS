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

type QuoteItem = {
  base_price: number
  products: { partner_name: string | null } | null
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
  quotes: {
    total_price: number
    agent_margin_rate: number
    quote_groups: { quote_items: QuoteItem[] }[]
  }[]
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

type PartnerPayment = {
  id: string
  case_id: string
  partner_name: string
  amount: number
  paid_at: string
  note: string | null
  created_at: string
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
  const [partnerPayments, setPartnerPayments] = useState<PartnerPayment[]>([])

  // Settle modal state
  const [settlingCase, setSettlingCase] = useState<CompletedCase | null>(null)
  const [settlePaidDate, setSettlePaidDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')

  const fetchData = useCallback(async () => {
    const [casesRes, settlementsRes, rateRes, partnerRes] = await Promise.all([
      supabase.from('cases')
        .select('id, case_number, travel_start_date, travel_end_date, travel_completed_at, agent_id, agents!cases_agent_id_fkey(id, agent_number, name, email, bank_info), case_members(is_lead, clients(name)), quotes(total_price, agent_margin_rate, quote_groups(quote_items(base_price, products(partner_name))))')
        .eq('status', 'completed')
        .order('travel_end_date', { ascending: false }),
      supabase.from('settlements')
        .select('id, settlement_number, agent_id, case_id, amount, paid_at, created_at, agents!settlements_agent_id_fkey(id, agent_number, name, email, bank_info)')
        .order('created_at', { ascending: false }),
      supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
      supabase.from('partner_payments')
        .select('id, case_id, partner_name, amount, paid_at, note, created_at')
        .order('paid_at', { ascending: false }),
    ])
    if (casesRes.error) console.error('[settlement] cases error:', casesRes.error)
    if (settlementsRes.error) console.error('[settlement] settlements error:', settlementsRes.error)
    setCases((casesRes.data as unknown as CompletedCase[]) ?? [])
    setSettlements((settlementsRes.data as unknown as Settlement[]) ?? [])
    setPartnerPayments((partnerRes.data as PartnerPayment[]) ?? [])
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

  // Hero stats — combined Partner + Agent
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Agent settlement stats
  const agentPaidThisMonthKrw = settlements
    .filter(s => s.paid_at?.startsWith(monthKey))
    .reduce((sum, s) => sum + (s.amount ?? 0), 0)
  const agentTotalPaidKrw = settlements.filter(s => s.paid_at).reduce((sum, s) => sum + (s.amount ?? 0), 0)
  const unsettledTotalKrw = unsettled.reduce((sum, c) => sum + caseCommissionKrw(c), 0)

  // Partner payment stats
  const partnerPaidThisMonthKrw = partnerPayments
    .filter(p => p.paid_at?.startsWith(monthKey))
    .reduce((sum, p) => sum + (p.amount ?? 0), 0)
  const partnerTotalPaidKrw = partnerPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0)

  // Per-case partner status (for completed cases)
  type PartnerCaseInfo = { partners: string[]; paid: Set<string>; suggestedKrw: number; pendingKrw: number }
  const partnerInfoByCase = new Map<string, PartnerCaseInfo>()
  for (const c of cases) {
    const partners = new Set<string>()
    let suggested = 0
    for (const g of c.quotes?.[0]?.quote_groups ?? []) {
      for (const item of g.quote_items ?? []) {
        const name = item.products?.partner_name?.trim()
        if (!name) continue
        partners.add(name)
        suggested += item.base_price ?? 0
      }
    }
    const paid = new Set(partnerPayments.filter(p => p.case_id === c.id).map(p => p.partner_name))
    const paidAmount = partnerPayments.filter(p => p.case_id === c.id).reduce((s, p) => s + (p.amount ?? 0), 0)
    partnerInfoByCase.set(c.id, {
      partners: [...partners],
      paid,
      suggestedKrw: suggested,
      pendingKrw: Math.max(0, suggested - paidAmount),
    })
  }

  // Partner-pending = completed cases with at least one unpaid partner
  const partnerPendingCases = cases.filter(c => {
    const info = partnerInfoByCase.get(c.id)
    if (!info || info.partners.length === 0) return false
    return info.partners.some(p => !info.paid.has(p))
  })
  const partnerPendingKrw = partnerPendingCases.reduce((s, c) => s + (partnerInfoByCase.get(c.id)?.pendingKrw ?? 0), 0)



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
        <h1 className="text-base font-semibold text-gray-900">Settlement</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-12 py-6 md:py-8 space-y-6">

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
          ) : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:divide-x xl:divide-gray-200">
              {/* ════════════════════ PARTNER ════════════════════ */}
              <section className="space-y-4 min-w-0 xl:pr-6">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m4.5-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                  <h2 className="text-base font-bold text-gray-900">Partner Payouts</h2>
                  <span className="text-[10px] text-gray-400">cash sent to hospitals/hotels/etc</span>
                </div>

                {/* Partner mini-hero */}
                <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">This Month</p>
                    <p className="text-xl font-bold text-gray-900 tracking-tight leading-none">{fmtUSD(toUsd(partnerPaidThisMonthKrw))}</p>
                  </div>
                  <div className="border-l border-gray-200 pl-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Pending</p>
                    <p className="text-xl font-bold text-amber-700 tracking-tight leading-none">{fmtUSD(toUsd(partnerPendingKrw))}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{partnerPendingCases.length} case{partnerPendingCases.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="border-l border-gray-200 pl-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">All Time</p>
                    <p className="text-xl font-bold text-gray-900 tracking-tight leading-none">{fmtUSD(toUsd(partnerTotalPaidKrw))}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{partnerPayments.length} payment{partnerPayments.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {/* Partner Pending */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending</h3>
                  {partnerPendingCases.length === 0 ? (
                    <div className="bg-gray-50 rounded-xl p-5 text-center">
                      <p className="text-sm text-gray-400">All partners settled.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-100 rounded-xl overflow-x-auto">
                      <table className="w-full text-sm whitespace-nowrap tracking-tight">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left">Case</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left">Lead</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left hidden md:table-cell">Travel End</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left hidden md:table-cell">Partners</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left">Pending</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left hidden md:table-cell"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {partnerPendingCases.map(c => {
                            const info = partnerInfoByCase.get(c.id)!
                            const lead = c.case_members?.find(m => m.is_lead)
                            const unpaid = info.partners.filter(p => !info.paid.has(p))
                            return (
                              <tr key={c.id} onClick={() => { if (typeof window !== 'undefined') window.location.href = `/admin/cases/${c.id}` }}
                                className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 cursor-pointer">
                                <td className="py-3 px-2 md:px-4 font-mono text-xs text-gray-500">{c.case_number}</td>
                                <td className="py-3 px-2 md:px-4 text-gray-800">{lead?.clients?.name ?? '—'}</td>
                                <td className="py-3 px-2 md:px-4 text-xs text-gray-500 hidden md:table-cell">{c.travel_end_date ?? '—'}</td>
                                <td className="py-3 px-2 md:px-4 text-xs text-gray-600 hidden md:table-cell">
                                  <span className="text-amber-700 font-medium">{unpaid.length}</span>
                                  <span className="text-gray-400"> / {info.partners.length}</span>
                                  {unpaid.length > 0 && (
                                    <span className="ml-2 text-gray-500 truncate">{unpaid.slice(0, 2).join(', ')}{unpaid.length > 2 ? `, +${unpaid.length - 2}` : ''}</span>
                                  )}
                                </td>
                                <td className="py-3 px-2 md:px-4 tabular-nums">
                                  <span className="text-sm font-semibold text-gray-900">{fmtUSD(toUsd(info.pendingKrw))}</span>
                                </td>
                                <td className="py-3 px-2 md:px-4 text-right hidden md:table-cell">
                                  <a href={`/admin/cases/${c.id}`} className="text-xs text-[#0f4c35] hover:underline">Open →</a>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Partner History */}
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">History</h3>
                    <span className="text-[10px] text-gray-400">{partnerPayments.length}</span>
                  </div>
                  {partnerPayments.length === 0 ? (
                    <div className="bg-gray-50 rounded-xl p-5 text-center">
                      <p className="text-sm text-gray-400">No partner payments logged yet.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-100 rounded-xl overflow-x-auto">
                      <table className="w-full text-sm whitespace-nowrap tracking-tight">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left">Paid On</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left">Partner</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left hidden md:table-cell">Case</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left hidden md:table-cell">Note</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partnerPayments.map(p => {
                            const linkedCase = cases.find(c => c.id === p.case_id)
                            const lead = linkedCase?.case_members?.find(m => m.is_lead)
                            return (
                              <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                <td className="py-3 px-2 md:px-4 text-gray-800 text-xs md:text-sm">{p.paid_at?.slice(0, 10) ?? '—'}</td>
                                <td className="py-3 px-2 md:px-4 text-gray-800">{p.partner_name}</td>
                                <td className="py-3 px-2 md:px-4 text-xs text-left align-middle hidden md:table-cell">
                                  {linkedCase ? (
                                    <a href={`/admin/cases/${linkedCase.id}`} className="block md:inline text-[#0f4c35] hover:underline">
                                      <span className="block md:inline font-mono">{linkedCase.case_number}</span>
                                      <span className="hidden md:inline"> · </span>
                                      <span className="block md:inline">{lead?.clients?.name ?? '—'}</span>
                                    </a>
                                  ) : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="py-3 px-2 md:px-4 text-xs text-gray-500 truncate max-w-[200px] hidden md:table-cell">{p.note ?? '—'}</td>
                                <td className="py-3 px-2 md:px-4 text-left">
                                  <p className="text-sm font-semibold text-gray-900">{fmtUSD(toUsd(p.amount))}</p>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>

              {/* ════════════════════ AGENT ════════════════════ */}
              <section className="space-y-4 min-w-0 xl:pl-6">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <h2 className="text-base font-bold text-gray-900">Agent Settlements</h2>
                  <span className="text-[10px] text-gray-400">commission paid to agents</span>
                </div>

                {/* Agent mini-hero */}
                <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">This Month</p>
                    <p className="text-xl font-bold text-gray-900 tracking-tight leading-none">{fmtUSD(toUsd(agentPaidThisMonthKrw))}</p>
                  </div>
                  <div className="border-l border-gray-200 pl-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Pending</p>
                    <p className="text-xl font-bold text-amber-700 tracking-tight leading-none">{fmtUSD(toUsd(unsettledTotalKrw))}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{unsettled.length} case{unsettled.length !== 1 ? 's' : ''} · {byAgent.size} agent{byAgent.size !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="border-l border-gray-200 pl-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">All Time</p>
                    <p className="text-xl font-bold text-gray-900 tracking-tight leading-none">{fmtUSD(toUsd(agentTotalPaidKrw))}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{settlements.filter(s => s.paid_at).length} settlement{settlements.filter(s => s.paid_at).length !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {/* Agent Pending */}
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending</h3>
                    {unsettled.length > 0 && <span className="text-[10px] text-gray-400">grouped by agent · oldest waiting first</span>}
                  </div>
                  {groupedUnsettled.length === 0 ? (
                    <div className="bg-gray-50 rounded-xl p-5 text-center">
                      <p className="text-sm text-gray-400">No cases awaiting settlement.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {groupedUnsettled.map(group => {
                        const hasBank = group.agent.bank_info && Object.keys(group.agent.bank_info).length > 0
                        const overdue = group.oldestDaysWaiting >= 14
                        return (
                          <div key={group.agent.id} className="border border-gray-100 rounded-xl overflow-x-auto">
                            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100 flex items-center gap-3 flex-wrap">
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
                                <p className="text-[10px] text-gray-500">{group.cases.length} case{group.cases.length !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                            <div className="divide-y divide-gray-50">
                              {group.cases.map(c => {
                                const lead = c.case_members?.find(m => m.is_lead)
                                const commKrw = caseCommissionKrw(c)
                                const days = daysWaiting(c.travel_end_date)
                                const margin = c.quotes?.[0]?.agent_margin_rate ?? 0
                                return (
                                  <div key={c.id} className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 hover:bg-gray-50/50 flex-wrap">
                                    <span className="text-xs font-mono text-gray-400 shrink-0">{c.case_number}</span>
                                    <span className="text-sm text-gray-800 truncate flex-1 min-w-0">{lead?.clients?.name ?? '—'}</span>
                                    <span className="text-xs text-gray-500 shrink-0 hidden md:inline">
                                      {c.travel_end_date ?? '—'}
                                      {days !== null && days > 0 && <span className="ml-1 text-gray-400">({days}d ago)</span>}
                                    </span>
                                    <span className="text-xs text-gray-500 shrink-0 hidden md:inline">{(margin * 100).toFixed(0)}%</span>
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
                </div>

                {/* Agent History */}
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">History</h3>
                    <span className="text-[10px] text-gray-400">{settlements.length}</span>
                  </div>
                  {settlements.length === 0 ? (
                    <div className="bg-gray-50 rounded-xl p-5 text-center">
                      <p className="text-sm text-gray-400">No settlements yet.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-100 rounded-xl overflow-x-auto">
                      <table className="w-full text-sm whitespace-nowrap tracking-tight">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left">Paid On</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left hidden md:table-cell">#</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left">Agent</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left hidden md:table-cell">Case</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left hidden md:table-cell">Margin</th>
                            <th className="py-2.5 px-2 md:px-4 text-xs font-medium text-gray-500 text-left">Amount</th>
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
                                <td className="py-3 px-2 md:px-4 text-gray-800 text-xs md:text-sm">{s.paid_at?.slice(0, 10) ?? '—'}</td>
                                <td className="py-3 px-2 md:px-4 font-mono text-xs text-gray-500 hidden md:table-cell">{s.settlement_number ?? '—'}</td>
                                <td className="py-3 px-2 md:px-4 text-gray-800">{agent?.name ?? '—'}</td>
                                <td className="py-3 px-2 md:px-4 text-xs text-left align-middle hidden md:table-cell">
                                  {linkedCase ? (
                                    <span className="block md:inline text-gray-500">
                                      <span className="block md:inline font-mono">{linkedCase.case_number}</span>
                                      <span className="hidden md:inline"> · </span>
                                      <span className="block md:inline">{lead?.clients?.name ?? '—'}</span>
                                    </span>
                                  ) : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="py-3 px-2 md:px-4 text-gray-600 text-xs hidden md:table-cell">{margin != null ? `${(margin * 100).toFixed(0)}%` : '—'}</td>
                                <td className="py-3 px-2 md:px-4 text-left">
                                  <p className="text-sm font-semibold text-gray-900">{fmtUSD(toUsd(s.amount))}</p>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
              </div>
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
