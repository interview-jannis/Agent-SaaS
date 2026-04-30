import Link from 'next/link'
import { createServerClient } from '@/lib/supabase-server'
import ChartLab from './ChartLab'
import { STATUS_LABELS } from '@/lib/caseStatus'

export const dynamic = 'force-dynamic'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── Types ─────────────────────────────────────────────────────────────────────

type CaseMember = {
  is_lead: boolean
  clients: { name: string } | null
}

type ActionCase = {
  id: string
  case_number: string
  status: string
  travel_start_date: string | null
  travel_end_date: string | null
  created_at: string
  case_members: CaseMember[]
  quotes: { total_price: number; payment_due_date: string | null }[]
}

type AgentCaseRow = {
  agent_id: string | null
  agents: { agent_number: string; name: string } | null
  quotes: { total_price: number }[]
}

type PendingAgent = {
  id: string
  agent_number: string | null
  name: string
  onboarding_status: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function leadName(members: CaseMember[]): string {
  return members.find((m) => m.is_lead)?.clients?.name ?? '—'
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
}

function fmtKRW(n: number): string {
  return '₩' + n.toLocaleString('ko-KR')
}

function fmtUSD(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminOverviewPage() {
  const supabase = createServerClient()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayISO = now.toISOString().slice(0, 10)

  const CASE_WITH_ALL = 'id, case_number, status, travel_start_date, travel_end_date, created_at, case_members(is_lead, clients(name)), quotes(total_price, payment_due_date)'

  const monthStartDate = monthStart.slice(0, 10)
  const sixMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10)

  const [
    { data: paymentPending },
    { data: pricingNeeded },
    { data: scheduleNeeded },
    { data: completedCases },
    { data: settledCaseIdRows },
    { data: allInProgressCases },
    { data: allPaidCases },
    { data: allClients },
    { count: totalAgentCount },
    { data: agentCaseRows },
    { data: pendingAgents },
    { data: rateRow },
    { data: allPartnerPayments },
    { data: allAgentSettlements },
  ] = await Promise.all([
    // paymentPending — admin needs to confirm payment received from client
    supabase.from('cases').select(CASE_WITH_ALL).eq('status', 'awaiting_payment').order('created_at', { ascending: false }),
    // pricingNeeded — admin needs to finalize line-item prices and issue invoice
    supabase.from('cases').select(CASE_WITH_ALL).eq('status', 'awaiting_pricing').order('created_at', { ascending: false }),
    // scheduleNeeded — admin needs to upload itinerary PDF
    supabase.from('cases').select(CASE_WITH_ALL).eq('status', 'awaiting_schedule').order('created_at', { ascending: false }),
    // completedCases — travel done, possibly waiting on settlement
    supabase.from('cases').select(CASE_WITH_ALL).eq('status', 'completed').order('created_at', { ascending: false }),
    // settledCaseIdRows — cases whose agent settlement has been paid
    supabase.from('settlements').select('case_id').not('paid_at', 'is', null),
    // All in-progress cases — used for "stuck" detection. Exclude terminal states.
    supabase.from('cases').select('id, case_number, status, created_at, case_members(is_lead, clients(name))')
      .not('status', 'in', '(completed,canceled)'),
    // All paid cases ever — drives Hero (all-time totals) + 6mo sparkline trends
    supabase.from('cases')
      .select('id, payment_date, agent_id, case_members(id), quotes(total_price, company_margin_rate, agent_margin_rate)')
      .not('payment_date', 'is', null),
    // All clients (used for total count + new clients per month for sparkline)
    supabase.from('clients').select('id, created_at'),
    // Active agents total count
    supabase.from('agents').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('onboarding_status', 'approved'),
    supabase.from('cases').select('agent_id, agents!cases_agent_id_fkey(agent_number, name), quotes(total_price)').eq('status', 'completed').gte('created_at', monthStart),
    // Pending agent approvals
    supabase.from('agents').select('id, agent_number, name, onboarding_status').eq('onboarding_status', 'awaiting_approval'),
    supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
    supabase.from('partner_payments').select('id, amount, paid_at'),
    supabase.from('settlements').select('id, amount, paid_at').not('paid_at', 'is', null),
  ])

  const exchangeRate = (rateRow?.value as { usd_krw?: number } | null)?.usd_krw ?? 1350

  // Accrual-basis financial decomposition — recognized at payment_date.
  // total_price = base × (1+co) × (1+agent)  →  base = total / ((1+co)(1+agent))
  //   Revenue + Earnings + Partner + Agent = Σ total_price (reconciles)
  type PaidCase = {
    id: string
    payment_date: string | null
    agent_id: string | null
    case_members: { id: string }[]
    quotes: { total_price: number; company_margin_rate: number | null; agent_margin_rate: number | null }[]
  }
  const paidCasesAll = (allPaidCases as unknown as PaidCase[]) ?? []

  function decompose(c: PaidCase) {
    const q = c.quotes?.[0]
    if (!q) return { total: 0, base: 0, earn: 0, ag: 0 }
    const total = q.total_price ?? 0
    const co = q.company_margin_rate ?? 0
    const ag = q.agent_margin_rate ?? 0
    const denom = (1 + co) * (1 + ag)
    const base = denom > 0 ? total / denom : 0
    return { total, base, earn: base * co, ag: base * (1 + co) * ag }
  }

  // All-time totals for Hero
  // Revenue / Earnings: accrual (recognized when client pays)
  // Partner / Agent: cash basis (counted only when admin actually sends money out)
  type CashPayment = { id: string; amount: number; paid_at: string }
  const partnerPaymentRows = (allPartnerPayments as unknown as CashPayment[]) ?? []
  const agentSettlementRows = (allAgentSettlements as unknown as CashPayment[]) ?? []

  let revenueTotal = 0, earningsTotal = 0
  for (const c of paidCasesAll) {
    const d = decompose(c)
    revenueTotal += d.total
    earningsTotal += d.earn
  }
  const partnerTotal = partnerPaymentRows.reduce((sum, p) => sum + (p.amount ?? 0), 0)
  const agentTotal = agentSettlementRows.reduce((sum, p) => sum + (p.amount ?? 0), 0)

  // Monthly breakdown for sparklines
  const clientRows = (allClients as unknown as { id: string; created_at: string }[]) ?? []
  const monthly: {
    key: string
    label: string
    revenue: number
    earnings: number
    partner: number
    agent: number
    patients: number
    newClients: number
    activeAgents: number
  }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthCases = paidCasesAll.filter(c => c.payment_date?.startsWith(key))
    let revenue = 0, earnings = 0
    const agentSet = new Set<string>()
    for (const c of monthCases) {
      const dec = decompose(c)
      revenue += dec.total
      earnings += dec.earn
      if (c.agent_id) agentSet.add(c.agent_id)
    }
    // Partner & Agent are cash basis — sum of payouts in this month
    const partner = partnerPaymentRows
      .filter(p => p.paid_at?.startsWith(key))
      .reduce((s, p) => s + (p.amount ?? 0), 0)
    const agent = agentSettlementRows
      .filter(p => p.paid_at?.startsWith(key))
      .reduce((s, p) => s + (p.amount ?? 0), 0)
    const patients = monthCases.reduce((s, c) => s + (c.case_members?.length ?? 0), 0)
    const newClientsCount = clientRows.filter(c => c.created_at?.startsWith(key)).length
    monthly.push({
      key,
      label: MONTH_SHORT[d.getMonth()],
      revenue, earnings, partner, agent,
      patients,
      newClients: newClientsCount,
      activeAgents: agentSet.size,
    })
  }

  const totalClientCount = clientRows.length
  const agentCountTotal = totalAgentCount ?? 0

  // Top agents
  const agentMap = new Map<string, { agent_number: string; name: string; count: number; revenue: number }>()
  for (const row of (agentCaseRows as unknown as AgentCaseRow[]) ?? []) {
    if (!row.agent_id || !row.agents) continue
    const prev = agentMap.get(row.agent_id) ?? { ...row.agents, count: 0, revenue: 0 }
    prev.count += 1
    prev.revenue += (row.quotes ?? []).reduce((s, q) => s + (q.total_price ?? 0), 0)
    agentMap.set(row.agent_id, prev)
  }
  const topAgents = [...agentMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 3)

  // Stuck cases — in the same status > 5 days, excluding normal recent ones
  const STUCK_DAYS = 5
  const stuckCases = ((allInProgressCases as unknown as { id: string; case_number: string; status: string; created_at: string; case_members: CaseMember[] }[]) ?? [])
    .map(c => ({ ...c, stuckDays: daysSince(c.created_at) }))
    .filter(c => c.stuckDays >= STUCK_DAYS)
    .sort((a, b) => b.stuckDays - a.stuckDays)
    .slice(0, 5)

  // Overdue payments — awaiting_payment with payment_due_date past
  const overduePayments = ((paymentPending as unknown as ActionCase[]) ?? [])
    .map(c => ({ ...c, due: c.quotes?.[0]?.payment_due_date ?? null }))
    .filter(c => c.due && c.due < todayISO)

  // Settlement to process — completed cases whose agent settlement isn't paid yet
  const settledIds = new Set(((settledCaseIdRows as { case_id: string | null }[] | null) ?? [])
    .map(s => s.case_id).filter((x): x is string => !!x))
  const pendingSettlements = ((completedCases as unknown as ActionCase[]) ?? [])
    .filter(c => !settledIds.has(c.id))

  const pendingAgentCount = pendingAgents?.length ?? 0
  const paymentPendingCount = paymentPending?.length ?? 0
  const pricingNeededCount = pricingNeeded?.length ?? 0
  const scheduleNeededCount = scheduleNeeded?.length ?? 0
  const pendingSettlementCount = pendingSettlements.length

  const totalActionCount = pendingAgentCount + paymentPendingCount + pricingNeededCount + scheduleNeededCount + pendingSettlementCount + stuckCases.length

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-base font-semibold text-gray-900">Overview</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-12 py-6 md:py-8 space-y-6">

        {/* HERO — All-time totals */}
        <section className="bg-gray-50 rounded-2xl p-6">
          {/* Top row: Revenue + Earnings (primary, big) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Revenue · All Time</p>
              <p className="text-4xl font-bold text-gray-900 tracking-tight leading-none">{fmtUSD(revenueTotal / exchangeRate)}</p>
              <p className="text-xs text-gray-500 mt-2 tabular-nums">{fmtKRW(revenueTotal)}</p>
              <p className="text-[11px] text-gray-500 mt-1">from {paidCasesAll.length} paid case{paidCasesAll.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="md:border-l md:border-gray-200 md:pl-6">
              <p className="text-[10px] text-emerald-700 uppercase tracking-wide mb-2">Earnings · All Time</p>
              <p className="text-4xl font-bold text-emerald-700 tracking-tight leading-none">{fmtUSD(earningsTotal / exchangeRate)}</p>
              <p className="text-xs text-emerald-600 mt-2 tabular-nums">{fmtKRW(earningsTotal)}</p>
              <p className="text-[11px] text-gray-500 mt-1">company margin only (our actual take)</p>
            </div>
          </div>

          {/* Bottom row: Partner / Agent / Clients / Agents */}
          <div className="mt-5 pt-5 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Partner Costs</p>
              <p className="text-xl font-semibold text-gray-700 tracking-tight">{fmtUSD(partnerTotal / exchangeRate)}</p>
              <p className="text-[11px] text-gray-500 mt-1 tabular-nums">{fmtKRW(partnerTotal)} · sent to partners</p>
            </div>
            <div className="md:border-l md:border-gray-200 md:pl-6">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Agent Payouts</p>
              <p className="text-xl font-semibold text-gray-700 tracking-tight">{fmtUSD(agentTotal / exchangeRate)}</p>
              <p className="text-[11px] text-gray-500 mt-1 tabular-nums">{fmtKRW(agentTotal)} · sent to agents</p>
            </div>
            <div className="md:border-l md:border-gray-200 md:pl-6">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Registered Clients</p>
              <p className="text-xl font-semibold text-gray-700 tracking-tight tabular-nums">{totalClientCount.toLocaleString()}</p>
              <p className="text-[11px] text-gray-500 mt-1">across all agents</p>
            </div>
            <div className="md:border-l md:border-gray-200 md:pl-6">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Approved Agents</p>
              <p className="text-xl font-semibold text-gray-700 tracking-tight tabular-nums">{agentCountTotal.toLocaleString()}</p>
              <p className="text-[11px] text-gray-500 mt-1">approved &amp; active</p>
            </div>
          </div>
        </section>

        {/* ACTION REQUIRED — unified queue */}
        <section className="space-y-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Action Required</h2>
            {totalActionCount > 0 && <span className="text-xs text-gray-400">{totalActionCount} item{totalActionCount !== 1 ? 's' : ''}</span>}
          </div>

          {totalActionCount === 0 ? (
            <div className="bg-gray-50 rounded-2xl p-8 text-center">
              <p className="text-sm text-gray-400">All caught up. Nothing urgent right now.</p>
            </div>
          ) : (
            <div className="space-y-3">

              {/* Pending agent approvals */}
              {pendingAgentCount > 0 && (
                <Link href="/admin/agents"
                  className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-3 hover:bg-gray-50 transition-colors">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {pendingAgentCount} agent{pendingAgentCount !== 1 ? 's' : ''} awaiting approval
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {(pendingAgents as PendingAgent[] | null)?.slice(0, 3).map(a => `${a.agent_number ?? ''} ${a.name}`).join(' · ') ?? ''}
                      {pendingAgentCount > 3 && ` · +${pendingAgentCount - 3} more`}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">Review →</span>
                </Link>
              )}

              {/* Overdue payments (subset of payment_pending) */}
              {overduePayments.length > 0 && (
                <div className="bg-white border border-red-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-red-100 flex items-center gap-2 bg-red-50">
                    <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z" />
                    </svg>
                    <p className="text-xs font-semibold text-red-800 uppercase tracking-wide">Payments Overdue</p>
                    <span className="text-[10px] text-red-600">{overduePayments.length}</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {overduePayments.slice(0, 4).map(c => (
                      <li key={c.id}>
                        <Link href={`/admin/cases/${c.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50/40 transition-colors">
                          <span className="text-xs font-mono text-gray-400 shrink-0">{c.case_number}</span>
                          <span className="text-sm text-gray-800 truncate flex-1">{leadName(c.case_members)}</span>
                          <span className="text-xs text-red-600 shrink-0">Due {c.due ? fmtDate(c.due) : '—'}</span>
                          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Payments to confirm (not overdue) */}
              {paymentPendingCount > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 12a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V12zm-12 0h.008v.008H6V12z" />
                    </svg>
                    <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Payment to Confirm</p>
                    <span className="text-[10px] text-gray-500">{paymentPendingCount}</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {(paymentPending as unknown as ActionCase[]).slice(0, 4).map(c => (
                      <li key={c.id}>
                        <Link href={`/admin/cases/${c.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                          <span className="text-xs font-mono text-gray-400 shrink-0">{c.case_number}</span>
                          <span className="text-sm text-gray-800 truncate flex-1">{leadName(c.case_members)}</span>
                          <span className="text-xs text-gray-500 shrink-0">
                            {fmtDate(c.travel_start_date)} – {fmtDate(c.travel_end_date)}
                          </span>
                          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pricing finalize needed */}
              {pricingNeededCount > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                    </svg>
                    <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Pricing to Finalize</p>
                    <span className="text-[10px] text-gray-500">{pricingNeededCount}</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {(pricingNeeded as unknown as ActionCase[]).slice(0, 4).map(c => (
                      <li key={c.id}>
                        <Link href={`/admin/cases/${c.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                          <span className="text-xs font-mono text-gray-400 shrink-0">{c.case_number}</span>
                          <span className="text-sm text-gray-800 truncate flex-1">{leadName(c.case_members)}</span>
                          <span className="text-xs text-gray-500 shrink-0">
                            {fmtDate(c.travel_start_date)} – {fmtDate(c.travel_end_date)}
                          </span>
                          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Schedule upload needed */}
              {scheduleNeededCount > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Schedule Upload Needed</p>
                    <span className="text-[10px] text-gray-500">{scheduleNeededCount}</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {(scheduleNeeded as unknown as ActionCase[]).slice(0, 4).map(c => (
                      <li key={c.id}>
                        <Link href={`/admin/cases/${c.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                          <span className="text-xs font-mono text-gray-400 shrink-0">{c.case_number}</span>
                          <span className="text-sm text-gray-800 truncate flex-1">{leadName(c.case_members)}</span>
                          <span className="text-xs text-gray-500 shrink-0">
                            {fmtDate(c.travel_start_date)} – {fmtDate(c.travel_end_date)}
                          </span>
                          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pending settlements — completed cases not yet paid out to agent */}
              {pendingSettlementCount > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                    </svg>
                    <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Settlement to Process</p>
                    <span className="text-[10px] text-gray-500">{pendingSettlementCount}</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {pendingSettlements.slice(0, 4).map(c => (
                      <li key={c.id}>
                        <Link href={`/admin/cases/${c.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                          <span className="text-xs font-mono text-gray-400 shrink-0">{c.case_number}</span>
                          <span className="text-sm text-gray-800 truncate flex-1">{leadName(c.case_members)}</span>
                          <span className="text-xs text-gray-500 shrink-0">
                            {fmtDate(c.travel_start_date)} – {fmtDate(c.travel_end_date)}
                          </span>
                          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Stuck cases */}
              {stuckCases.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Stuck Cases</p>
                    <span className="text-[10px] text-gray-500">5+ days in same status</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {stuckCases.map(c => (
                      <li key={c.id}>
                        <Link href={`/admin/cases/${c.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                          <span className="text-xs font-mono text-gray-400 shrink-0">{c.case_number}</span>
                          <span className="text-sm text-gray-800 truncate flex-1">{leadName(c.case_members)}</span>
                          <span className="text-xs text-gray-500 shrink-0">{STATUS_LABELS[c.status as keyof typeof STATUS_LABELS] ?? c.status}</span>
                          <span className="text-xs text-orange-600 shrink-0">{c.stuckDays}d</span>
                          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          )}
        </section>

        {/* TOP AGENTS */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Top Agents · This Month</h2>
            <Link href="/admin/agents" className="text-xs text-[#0f4c35] font-medium hover:underline">View all →</Link>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl">
            {topAgents.length > 0 ? (
              <ul className="divide-y divide-gray-50">
                {topAgents.map((agent, i) => (
                  <li key={agent.agent_number} className="flex items-center gap-4 px-5 py-3.5">
                    <span className="w-5 text-sm font-semibold text-gray-300">{i + 1}</span>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{agent.agent_number}</span>
                      <span className="text-sm font-medium text-gray-800">{agent.name}</span>
                    </div>
                    <span className="text-xs text-gray-400">{agent.count} case{agent.count !== 1 ? 's' : ''}</span>
                    <span className="flex flex-col items-end">
                      <span className="text-sm font-semibold text-gray-800 tabular-nums">{fmtUSD(agent.revenue / exchangeRate)}</span>
                      <span className="text-[10px] text-gray-400">{fmtKRW(agent.revenue)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-300 p-6 text-center">No completed cases this month</p>
            )}
          </div>
        </section>

        {/* PERFORMANCE — 6 KPI sparkline cards */}
        <ChartLab monthly={monthly} exchangeRate={exchangeRate} />

        </div>
      </div>
    </div>
  )
}
