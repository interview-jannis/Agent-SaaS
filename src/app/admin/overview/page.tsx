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
  travel_start_date: string | null
  travel_end_date: string | null
  case_members: CaseMember[]
}

type RecentCase = ActionCase & { status: string }

type AgentCaseRow = {
  agent_id: string | null
  agents: { agent_number: string; name: string } | null
  quotes: { total_price: number }[]
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

const STATUS_EN: Record<string, string> = {
  payment_pending: 'Payment Pending',
  payment_completed: 'Payment Completed',
  schedule_reviewed: 'Schedule Reviewed',
  schedule_confirmed: 'Schedule Confirmed',
  travel_completed: 'Travel Completed',
}

const STATUS_COLOR: Record<string, string> = {
  payment_pending: 'bg-yellow-50 text-yellow-700',
  payment_completed: 'bg-blue-50 text-blue-700',
  schedule_reviewed: 'bg-purple-50 text-purple-700',
  schedule_confirmed: 'bg-indigo-50 text-indigo-700',
  travel_completed: 'bg-green-50 text-[#0f4c35]',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminOverviewPage() {
  const supabase = createServerClient()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const CASE_WITH_LEAD = 'id, case_number, travel_start_date, travel_end_date, case_members(is_lead, clients(name))'

  const [
    { data: paymentPending },
    { data: scheduleNeeded },
    { data: completedThisMonth },
    { data: newClients },
    { data: recentCases },
    { data: agentCaseRows },
    { data: rateRow },
  ] = await Promise.all([
    supabase.from('cases').select(CASE_WITH_LEAD).eq('status', 'payment_pending').order('created_at', { ascending: false }),
    supabase.from('cases').select(CASE_WITH_LEAD).eq('status', 'payment_completed').order('created_at', { ascending: false }),
    supabase.from('cases').select('id, quotes(total_price)').eq('status', 'travel_completed').gte('created_at', monthStart),
    supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('cases').select('id, case_number, status, travel_start_date, travel_end_date, case_members(is_lead, clients(name))').order('created_at', { ascending: false }).limit(5),
    supabase.from('cases').select('agent_id, agents!cases_agent_id_fkey(agent_number, name), quotes(total_price)').eq('status', 'travel_completed').gte('created_at', monthStart),
    supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
  ])

  const exchangeRate = (rateRow?.value as { usd_krw?: number } | null)?.usd_krw ?? 1350

  const monthlyRevenue = (completedThisMonth ?? []).reduce((sum, c) => {
    const quotes = (c.quotes as { total_price: number }[]) ?? []
    return sum + quotes.reduce((s, q) => s + (q.total_price ?? 0), 0)
  }, 0)

  const completedCount = completedThisMonth?.length ?? 0
  const newClientCount = (newClients as unknown as { count: number } | null)?.count ?? 0

  const agentMap = new Map<string, { agent_number: string; name: string; count: number; revenue: number }>()
  for (const row of (agentCaseRows as unknown as AgentCaseRow[]) ?? []) {
    if (!row.agent_id || !row.agents) continue
    const prev = agentMap.get(row.agent_id) ?? { ...row.agents, count: 0, revenue: 0 }
    prev.count += 1
    prev.revenue += (row.quotes ?? []).reduce((s, q) => s + (q.total_price ?? 0), 0)
    agentMap.set(row.agent_id, prev)
  }
  const topAgents = [...agentMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 3)

  return (
    <div className="min-h-screen bg-white">
      <div className="px-12 py-10 space-y-6">

        {/* Header */}
        <h1 className="text-xl font-semibold text-gray-900">Overview</h1>

        {/* ── Action Required ───────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">Action Required</h2>
          </div>

          {/* Awaiting payment confirmation */}
          <div className="px-6 py-4">
            <p className="text-xs font-medium text-gray-400 mb-3">
              Awaiting Payment Confirmation{' '}
              <span className="ml-1 bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5">
                {paymentPending?.length ?? 0}
              </span>
            </p>
            {paymentPending && paymentPending.length > 0 ? (
              <ul className="space-y-1">
                {(paymentPending as unknown as ActionCase[]).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/cases/${c.id}`}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-gray-400">{c.case_number}</span>
                        <span className="text-sm font-medium text-gray-800">{leadName(c.case_members)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          {fmtDate(c.travel_start_date)} – {fmtDate(c.travel_end_date)}
                        </span>
                        <svg className="w-4 h-4 text-gray-300 group-hover:text-[#0f4c35] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-300 py-2">No pending items</p>
            )}
          </div>

          <div className="h-px bg-gray-50 mx-6" />

          {/* Schedule upload needed */}
          <div className="px-6 py-4">
            <p className="text-xs font-medium text-gray-400 mb-3">
              Schedule Upload Required{' '}
              <span className="ml-1 bg-blue-50 text-blue-600 rounded-full px-2 py-0.5">
                {scheduleNeeded?.length ?? 0}
              </span>
            </p>
            {scheduleNeeded && scheduleNeeded.length > 0 ? (
              <ul className="space-y-1">
                {(scheduleNeeded as unknown as ActionCase[]).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/cases/${c.id}`}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-gray-400">{c.case_number}</span>
                        <span className="text-sm font-medium text-gray-800">{leadName(c.case_members)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          {fmtDate(c.travel_start_date)} – {fmtDate(c.travel_end_date)}
                        </span>
                        <svg className="w-4 h-4 text-gray-300 group-hover:text-[#0f4c35] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-300 py-2">No uploads required</p>
            )}
          </div>
        </section>

        {/* ── This Month ────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">This Month</h2>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <div className="px-6 py-5">
              <p className="text-xs text-gray-400 mb-1">Total Revenue</p>
              <p className="text-xl font-semibold text-gray-900">{fmtKRW(monthlyRevenue)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">≈ {fmtUSD(monthlyRevenue / exchangeRate)}</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs text-gray-400 mb-1">Completed Cases</p>
              <p className="text-xl font-semibold text-gray-900">{completedCount}</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs text-gray-400 mb-1">New Clients</p>
              <p className="text-xl font-semibold text-gray-900">{newClientCount}</p>
            </div>
          </div>
        </section>

        {/* ── Top Agents ────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Top Agents This Month</h2>
            <Link href="/admin/agents" className="text-xs text-[#0f4c35] font-medium hover:underline">
              View all →
            </Link>
          </div>
          <div className="px-6 py-4">
            {topAgents.length > 0 ? (
              <ul className="space-y-3">
                {topAgents.map((agent, i) => (
                  <li key={agent.agent_number} className="flex items-center gap-4">
                    <span className="w-5 text-sm font-semibold text-gray-300">{i + 1}</span>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{agent.agent_number}</span>
                      <span className="text-sm font-medium text-gray-800">{agent.name}</span>
                    </div>
                    <span className="text-xs text-gray-400">{agent.count} cases</span>
                    <span className="flex flex-col items-end">
                      <span className="text-sm font-semibold text-gray-800 tabular-nums">{fmtKRW(agent.revenue)}</span>
                      <span className="text-[10px] text-gray-400">≈ {fmtUSD(agent.revenue / exchangeRate)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-300 py-2">No completed cases this month</p>
            )}
          </div>
        </section>

        {/* ── Recent Cases ──────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Cases</h2>
            <Link href="/admin/cases" className="text-xs text-[#0f4c35] font-medium hover:underline">
              View all →
            </Link>
          </div>
          <ul className="divide-y divide-gray-50">
            {recentCases && (recentCases as unknown as RecentCase[]).length > 0 ? (
              (recentCases as unknown as RecentCase[]).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/cases/${c.id}`}
                    className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono text-gray-400 shrink-0">{c.case_number}</span>
                      <span className="text-sm font-medium text-gray-800 truncate">{leadName(c.case_members)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_EN[c.status] ?? c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-gray-400">
                        {fmtDate(c.travel_start_date)} – {fmtDate(c.travel_end_date)}
                      </span>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-[#0f4c35] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </Link>
                </li>
              ))
            ) : (
              <li className="px-6 py-4 text-sm text-gray-300">No cases yet</li>
            )}
          </ul>
        </section>

      </div>
    </div>
  )
}
