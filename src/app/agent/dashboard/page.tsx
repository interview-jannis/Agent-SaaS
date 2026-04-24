'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type CaseStatus = 'payment_pending' | 'payment_completed' | 'schedule_reviewed' | 'schedule_confirmed' | 'travel_completed'

type CaseRow = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  travel_end_date: string | null
  travel_completed_at: string | null
  created_at: string
  case_members: { is_lead: boolean; clients: { name: string } | null }[]
  quotes: { total_price: number; agent_margin_rate: number }[]
  schedules: { id: string; status: string; version: number; created_at: string }[]
}

type Settlement = { id: string; amount: number; paid_at: string | null; case_id: string | null }

const STATUS_LABELS: Record<CaseStatus, string> = {
  payment_pending: 'Awaiting Payment', payment_completed: 'Payment Confirmed',
  schedule_reviewed: 'Schedule Reviewed', schedule_confirmed: 'Schedule Confirmed', travel_completed: 'Travel Completed',
}

// Pipeline-specific labels (when the Travel Completed cell means "unsettled only")
const PIPELINE_LABELS: Record<CaseStatus, string> = {
  ...STATUS_LABELS,
  travel_completed: 'Travel Done · Unpaid',
}
const STATUS_STYLES: Record<CaseStatus, string> = {
  payment_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  payment_completed: 'bg-blue-50 text-blue-700 border-blue-200',
  schedule_reviewed: 'bg-violet-50 text-violet-700 border-violet-200',
  schedule_confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  travel_completed: 'bg-gray-50 text-gray-500 border-gray-200',
}
const ORDERED_STATUSES: CaseStatus[] = ['payment_pending', 'payment_completed', 'schedule_reviewed', 'schedule_confirmed', 'travel_completed']

function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function commissionKrw(total: number, margin: number): number {
  if (!margin || margin <= 0) return 0
  return Math.round(total * margin / (1 + margin))
}

// Next tier threshold — patients/month based (0-10: 15%, 10-30: 20%, 30+: 25%)
function nextTierInfo(monthlyPatients: number): { next: number | null; remaining: number | null; nextRate: number | null } {
  if (monthlyPatients < 10) return { next: 10, remaining: 10 - monthlyPatients, nextRate: 0.20 }
  if (monthlyPatients < 30) return { next: 30, remaining: 30 - monthlyPatients, nextRate: 0.25 }
  return { next: null, remaining: null, nextRate: null }
}

export default function AgentDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [agentName, setAgentName] = useState('')
  const [agentNumber, setAgentNumber] = useState('')
  const [marginRate, setMarginRate] = useState<number | null>(null)
  const [monthlyCompleted, setMonthlyCompleted] = useState(0)
  const [cases, setCases] = useState<CaseRow[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [exchangeRate, setExchangeRate] = useState(1350)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data: ag } = await supabase.from('agents')
        .select('id, agent_number, name, margin_rate, monthly_completed')
        .eq('auth_user_id', uid).single()
      if (!ag) { setLoading(false); return }
      setAgentName(ag.name)
      setAgentNumber(ag.agent_number ?? '')
      setMarginRate(ag.margin_rate ?? null)
      setMonthlyCompleted(ag.monthly_completed ?? 0)

      const [casesRes, settlementsRes, rateRes] = await Promise.all([
        supabase.from('cases')
          .select('id, case_number, status, travel_start_date, travel_end_date, travel_completed_at, created_at, case_members(is_lead, clients(name)), quotes(total_price, agent_margin_rate), schedules(id, status, version, created_at)')
          .eq('agent_id', ag.id)
          .order('created_at', { ascending: false }),
        supabase.from('settlements').select('id, amount, paid_at, case_id').eq('agent_id', ag.id),
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
      ])
      setCases((casesRes.data as unknown as CaseRow[]) ?? [])
      setSettlements((settlementsRes.data as Settlement[]) ?? [])
      const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (r) setExchangeRate(r)
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived ─────────────────────────────────────────────────────────────

  const statusCounts = new Map<CaseStatus, number>()
  for (const c of cases) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1)

  // Travel Completed pipeline cell shows unsettled only — settled ones belong to "Settlement Paid"
  const settledCaseIds = new Set(settlements.filter(s => s.case_id).map(s => s.case_id!))
  const unsettledCompletedCount = cases.filter(c => c.status === 'travel_completed' && !settledCaseIds.has(c.id)).length

  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Patients from cases marked complete this month (tier is patients/month, not cases).
  const monthlyPatients = cases
    .filter(c => c.status === 'travel_completed' && c.travel_completed_at?.startsWith(monthKey))
    .reduce((sum, c) => sum + (c.case_members?.length ?? 0), 0)

  const thisMonthPaid = settlements
    .filter(s => s.paid_at?.startsWith(monthKey))
    .reduce((s, st) => s + (st.amount ?? 0), 0)

  // Action-needed: cases where agent needs to act now
  // - schedule_reviewed with schedule.status === 'pending' → needs Confirm or Request Revision
  // - schedule_confirmed → can Mark Travel Complete
  const actionNeeded = cases.filter(c => {
    const latestSched = c.schedules?.slice().sort((a, b) => b.version - a.version)[0]
    if (c.status === 'schedule_reviewed' && latestSched?.status === 'pending') return true
    if (c.status === 'schedule_confirmed') return true
    return false
  })

  const recentCases = cases.slice(0, 5)
  const upcomingTravel = cases
    .filter(c => c.travel_start_date && c.status !== 'travel_completed')
    .sort((a, b) => (a.travel_start_date ?? '').localeCompare(b.travel_start_date ?? ''))
    .slice(0, 5)

  const tierInfo = nextTierInfo(monthlyPatients)

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-900">Dashboard</h1>
        {agentName && <span className="text-xs text-gray-500">{agentName}</span>}
        {agentNumber && <span className="text-[10px] font-mono text-gray-400">{agentNumber}</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-12 py-8 space-y-6">

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
          ) : (
            <>
              {/* Action needed — top when present */}
              {actionNeeded.length > 0 && (
                <section className="border border-amber-200 bg-amber-50 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-amber-100 flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z" />
                    </svg>
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">{actionNeeded.length} case{actionNeeded.length > 1 ? 's' : ''} need your attention</p>
                  </div>
                  <div className="divide-y divide-amber-100">
                    {actionNeeded.map(c => {
                      const lead = c.case_members?.find(m => m.is_lead)
                      const hint = c.status === 'schedule_reviewed' ? 'Review new schedule' : 'Mark travel complete'
                      return (
                        <button key={c.id} onClick={() => router.push(`/agent/cases/${c.id}`)}
                          className="w-full flex items-center gap-3 py-3 px-4 hover:bg-amber-100/50 transition-colors text-left">
                          <span className="text-xs font-mono text-amber-700">{c.case_number}</span>
                          <span className="text-sm font-medium text-gray-800 flex-1 truncate">{lead?.clients?.name ?? '—'}</span>
                          <span className="text-xs text-amber-700">{hint}</span>
                          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Hero: This Month + Next Tier */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* This Month card */}
                <section className="bg-gray-50 rounded-2xl p-5">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">This Month</p>
                  <p className="text-3xl font-bold text-gray-900">{fmtUSD(thisMonthPaid / exchangeRate)}</p>
                  <p className="text-xs text-gray-500 mt-1">received in settlements</p>
                  <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-200">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Margin</p>
                      <p className="text-sm font-semibold text-[#0f4c35]">{marginRate != null ? `${(marginRate * 100).toFixed(0)}%` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Patients</p>
                      <p className="text-sm font-semibold text-gray-900">{monthlyPatients}</p>
                    </div>
                  </div>
                </section>

                {/* Next Tier card */}
                <section className="bg-gray-50 rounded-2xl p-5">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Next Tier</p>
                  {tierInfo.remaining != null && tierInfo.next != null && tierInfo.nextRate != null ? (
                    <>
                      <p className="text-3xl font-bold text-gray-900">
                        {tierInfo.remaining} <span className="text-base font-medium text-gray-500">more</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">to reach {(tierInfo.nextRate * 100).toFixed(0)}% margin</p>
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="absolute inset-y-0 left-0 bg-[#0f4c35] transition-all"
                            style={{ width: `${Math.min(100, (monthlyPatients / tierInfo.next) * 100)}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">{monthlyPatients} / {tierInfo.next} patients this month</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-3xl font-bold text-[#0f4c35]">Max</p>
                      <p className="text-xs text-gray-500 mt-1">you&apos;re at the top tier (25%)</p>
                    </>
                  )}
                </section>
              </div>

              {/* Left: Recent+Upcoming stacked  |  Right: Pipeline 6 cells horizontal */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Left column (1/3) — Recent Cases on top, Upcoming Travel below */}
                <div className="space-y-3">
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recent Cases</h3>
                    <button onClick={() => router.push('/agent/cases')}
                      className="text-xs text-[#0f4c35] hover:underline font-medium">View all →</button>
                  </div>
                  {recentCases.length === 0 ? (
                    <div className="bg-gray-50 rounded-2xl p-6 text-center">
                      <p className="text-sm text-gray-400">No cases yet.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden">
                      {recentCases.map((c, idx) => {
                        const lead = c.case_members?.find(m => m.is_lead)
                        const q = c.quotes?.[0]
                        const memberCount = c.case_members?.length ?? 0
                        const travel = c.travel_start_date || c.travel_end_date
                          ? `${c.travel_start_date ?? '—'} ~ ${c.travel_end_date ?? '—'}`
                          : null
                        return (
                          <button key={c.id} onClick={() => router.push(`/agent/cases/${c.id}`)}
                            className={`w-full flex flex-col gap-1 py-2.5 px-3 text-left hover:bg-gray-50 transition-colors ${idx > 0 ? 'border-t border-gray-50' : ''}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-gray-400 shrink-0">{c.case_number}</span>
                              <span className="text-sm font-medium text-gray-800 truncate">{lead?.clients?.name ?? '—'}</span>
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ml-auto ${STATUS_STYLES[c.status]}`}>
                                {STATUS_LABELS[c.status]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-gray-500 pl-[3.5rem]">
                              {travel && <span>{travel}</span>}
                              {memberCount > 0 && <span>· {memberCount} pax</span>}
                              {q && <span className="ml-auto font-medium text-gray-700">{fmtUSD(q.total_price / exchangeRate)}</span>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Upcoming Travel</h3>
                  {upcomingTravel.length === 0 ? (
                    <div className="bg-gray-50 rounded-2xl p-6 text-center">
                      <p className="text-sm text-gray-400">No upcoming travel.</p>
                    </div>
                  ) : (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden">
                      {upcomingTravel.map((c, idx) => {
                        const lead = c.case_members?.find(m => m.is_lead)
                        const memberCount = c.case_members?.length ?? 0
                        const startDate = c.travel_start_date
                        const daysLeft = startDate
                          ? Math.ceil((new Date(startDate).getTime() - Date.now()) / 86400000)
                          : null
                        const daysLabel = daysLeft == null ? null
                          : daysLeft < 0 ? 'ongoing'
                          : daysLeft === 0 ? 'today'
                          : daysLeft === 1 ? 'tomorrow'
                          : `in ${daysLeft} days`
                        return (
                          <button key={c.id} onClick={() => router.push(`/agent/cases/${c.id}`)}
                            className={`w-full flex flex-col gap-1 py-2.5 px-3 text-left hover:bg-gray-50 transition-colors ${idx > 0 ? 'border-t border-gray-50' : ''}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-800 truncate">{lead?.clients?.name ?? '—'}</span>
                              {daysLabel && (
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ml-auto shrink-0 ${daysLeft !== null && daysLeft <= 7 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-600'}`}>
                                  {daysLabel}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-gray-500">
                              <span>{startDate ?? '—'}{c.travel_end_date ? ` ~ ${c.travel_end_date}` : ''}</span>
                              {memberCount > 0 && <span>· {memberCount} pax</span>}
                              <span className="ml-auto font-mono text-gray-400">{c.case_number}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </section>
                </div>

                {/* Right column (2/3) — Pipeline 6 cells horizontal, timeline style */}
                <section className="lg:col-span-2 space-y-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pipeline</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {ORDERED_STATUSES.map(s => {
                      // travel_completed cell counts ONLY unsettled ones; settled ones go in Settlement Paid
                      const rawCount = statusCounts.get(s) ?? 0
                      const count = s === 'travel_completed' ? unsettledCompletedCount : rawCount
                      const active = count > 0
                      return (
                        <button key={s} onClick={() => router.push('/agent/cases')}
                          className={`rounded-2xl px-4 py-6 text-left border transition-colors ${active ? STATUS_STYLES[s] : 'bg-gray-50 border-gray-100 text-gray-400'} hover:brightness-95`}>
                          <p className="text-4xl font-bold leading-tight">{count}</p>
                          <p className="text-[10px] uppercase tracking-wide mt-2 truncate">{PIPELINE_LABELS[s]}</p>
                        </button>
                      )
                    })}
                    {/* Settlement Paid — final stage, derived from settlements with paid_at */}
                    {(() => {
                      const paidCount = settlements.filter(st => st.paid_at).length
                      const active = paidCount > 0
                      return (
                        <button onClick={() => router.push('/agent/payouts')}
                          className={`rounded-2xl px-4 py-6 text-left border transition-colors ${active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 border-gray-100 text-gray-400'} hover:brightness-95`}>
                          <p className="text-4xl font-bold leading-tight">{paidCount}</p>
                          <p className="text-[10px] uppercase tracking-wide mt-2 truncate">Settlement Paid</p>
                        </button>
                      )
                    })()}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
