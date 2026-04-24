import Link from 'next/link'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

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

  const [
    { data: paymentPending },
    { data: scheduleNeeded },
    { data: allInProgressCases },
    { data: paidCasesThisMonth },
    { data: settlementsThisMonth },
    { data: newClients },
    { data: agentCaseRows },
    { data: pendingAgents },
    { data: rateRow },
  ] = await Promise.all([
    supabase.from('cases').select(CASE_WITH_ALL).eq('status', 'payment_pending').order('created_at', { ascending: false }),
    supabase.from('cases').select(CASE_WITH_ALL).eq('status', 'payment_completed').order('created_at', { ascending: false }),
    // All in-progress cases — used for "stuck" detection
    supabase.from('cases').select('id, case_number, status, created_at, case_members(is_lead, clients(name))').neq('status', 'travel_completed'),
    // Cases whose payment landed this month (money IN basis — what client actually paid)
    supabase.from('cases').select('id, payment_date, quotes(total_price, company_margin_rate, agent_margin_rate)').gte('payment_date', monthStartDate),
    // Settlements paid this month (money OUT — agent payouts)
    supabase.from('settlements').select('id, amount, paid_at').gte('paid_at', monthStartDate),
    supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('cases').select('agent_id, agents!cases_agent_id_fkey(agent_number, name), quotes(total_price)').eq('status', 'travel_completed').gte('created_at', monthStart),
    // Pending agent approvals
    supabase.from('agents').select('id, agent_number, name, onboarding_status').eq('onboarding_status', 'awaiting_approval'),
    supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
  ])

  const exchangeRate = (rateRow?.value as { usd_krw?: number } | null)?.usd_krw ?? 1350

  // Compute 4 financial metrics from cases paid this month
  // total_price = base × (1+co) × (1+agent)  →  base = total / ((1+co)(1+agent))
  //   Revenue       = total_price (gross received from client)
  //   Partner cost  = base (paid to hospital/partner)
  //   Company earn  = base × company_margin (our actual slice)
  //   Agent share*  = base × (1+co) × agent_margin (owed to agent; not necessarily paid this month)
  let revenueKrw = 0
  let partnerCostKrw = 0
  let companyEarningsKrw = 0
  const paidCases = (paidCasesThisMonth as unknown as { id: string; payment_date: string | null; quotes: { total_price: number; company_margin_rate: number | null; agent_margin_rate: number | null }[] }[]) ?? []
  for (const c of paidCases) {
    const q = c.quotes?.[0]
    if (!q) continue
    const total = q.total_price ?? 0
    const co = q.company_margin_rate ?? 0
    const ag = q.agent_margin_rate ?? 0
    const denom = (1 + co) * (1 + ag)
    const base = denom > 0 ? total / denom : 0
    revenueKrw += total
    partnerCostKrw += base
    companyEarningsKrw += base * co
  }

  // Actual agent payouts this month (cash out)
  const agentPayoutsKrw = (settlementsThisMonth ?? [])
    .filter(s => s.paid_at && s.paid_at >= monthStartDate)
    .reduce((sum, s) => sum + (s.amount ?? 0), 0)

  const newClientCount = (newClients as unknown as { count: number } | null)?.count ?? 0
  const paidCaseCount = paidCases.length

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

  // Overdue payments — payment_pending with payment_due_date past
  const overduePayments = ((paymentPending as unknown as ActionCase[]) ?? [])
    .map(c => ({ ...c, due: c.quotes?.[0]?.payment_due_date ?? null }))
    .filter(c => c.due && c.due < todayISO)

  const pendingAgentCount = pendingAgents?.length ?? 0
  const paymentPendingCount = paymentPending?.length ?? 0
  const scheduleNeededCount = scheduleNeeded?.length ?? 0

  const totalActionCount = pendingAgentCount + paymentPendingCount + scheduleNeededCount + stuckCases.length

  const STATUS_LABELS_KR: Record<string, string> = {
    payment_pending: 'Awaiting Payment',
    payment_completed: 'Payment Confirmed',
    schedule_reviewed: 'Schedule Reviewed',
    schedule_confirmed: 'Schedule Confirmed',
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-12 py-10 space-y-6">

        <h1 className="text-xl font-semibold text-gray-900">Overview</h1>

        {/* HERO — This Month financials */}
        <section className="bg-gray-50 rounded-2xl p-6">
          {/* Top row: Revenue + Earnings (primary, big) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Revenue · This Month</p>
              <p className="text-4xl font-bold text-gray-900 tracking-tight leading-none">{fmtUSD(revenueKrw / exchangeRate)}</p>
              <p className="text-xs text-gray-500 mt-2 tabular-nums">{fmtKRW(revenueKrw)}</p>
              <p className="text-[11px] text-gray-500 mt-1">
                from {paidCaseCount} paid case{paidCaseCount !== 1 ? 's' : ''}
                {newClientCount > 0 && ` · ${newClientCount} new client${newClientCount !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="md:border-l md:border-gray-200 md:pl-6">
              <p className="text-[10px] text-emerald-700 uppercase tracking-wide mb-2">Earnings · This Month</p>
              <p className="text-4xl font-bold text-emerald-700 tracking-tight leading-none">{fmtUSD(companyEarningsKrw / exchangeRate)}</p>
              <p className="text-xs text-emerald-600 mt-2 tabular-nums">{fmtKRW(companyEarningsKrw)}</p>
              <p className="text-[11px] text-gray-500 mt-1">company margin only (our actual take)</p>
            </div>
          </div>

          {/* Bottom row: Partner Costs + Agent Payouts (secondary) */}
          <div className="mt-5 pt-5 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Partner Costs · This Month</p>
              <p className="text-xl font-semibold text-gray-700 tracking-tight">{fmtUSD(partnerCostKrw / exchangeRate)}</p>
              <p className="text-[11px] text-gray-500 mt-1 tabular-nums">{fmtKRW(partnerCostKrw)} · paid to hospitals/partners</p>
            </div>
            <div className="md:border-l md:border-gray-200 md:pl-6">
              <p className="text-[10px] text-amber-700 uppercase tracking-wide mb-1">Agent Payouts · This Month</p>
              <p className="text-xl font-semibold text-amber-700 tracking-tight">{fmtUSD(agentPayoutsKrw / exchangeRate)}</p>
              <p className="text-[11px] text-gray-500 mt-1 tabular-nums">{fmtKRW(agentPayoutsKrw)} · settlements sent</p>
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
                  className="flex items-center gap-3 bg-white border border-violet-200 rounded-2xl px-4 py-3 hover:bg-violet-50/50 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {pendingAgentCount} agent{pendingAgentCount !== 1 ? 's' : ''} awaiting approval
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {(pendingAgents as PendingAgent[] | null)?.slice(0, 3).map(a => `${a.agent_number ?? ''} ${a.name}`).join(' · ') ?? ''}
                      {pendingAgentCount > 3 && ` · +${pendingAgentCount - 3} more`}
                    </p>
                  </div>
                  <span className="text-xs text-violet-700 shrink-0">Review →</span>
                </Link>
              )}

              {/* Overdue payments (subset of payment_pending) */}
              {overduePayments.length > 0 && (
                <div className="bg-white border border-red-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-red-100 flex items-center gap-2 bg-red-50">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
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
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
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

              {/* Schedule upload needed */}
              {scheduleNeededCount > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
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

              {/* Stuck cases */}
              {stuckCases.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
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
                          <span className="text-xs text-gray-500 shrink-0">{STATUS_LABELS_KR[c.status] ?? c.status}</span>
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

      </div>
    </div>
  )
}
