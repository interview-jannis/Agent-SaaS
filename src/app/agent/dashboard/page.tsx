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
  quotes: { total_price: number; agent_margin_rate: number; payment_due_date: string | null }[]
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

// Compact USD: $12.7K / $1.5M / $500
function fmtUsdShort(n: number): string {
  if (n === 0) return '$0'
  if (Math.abs(n) >= 1_000_000) {
    const v = n / 1_000_000
    return `$${v.toFixed(v < 10 ? 1 : 0).replace(/\.0$/, '')}M`
  }
  if (Math.abs(n) >= 1000) {
    const v = n / 1000
    return `$${v.toFixed(v < 10 ? 1 : 0).replace(/\.0$/, '')}K`
  }
  return `$${Math.round(n)}`
}

// Short date: Apr 27
function fmtDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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
  const [cases, setCases] = useState<CaseRow[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [exchangeRate, setExchangeRate] = useState(1350)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data: ag } = await supabase.from('agents')
        .select('id, agent_number, name, margin_rate')
        .eq('auth_user_id', uid).single()
      if (!ag) { setLoading(false); return }
      setAgentName(ag.name)
      setAgentNumber(ag.agent_number ?? '')
      setMarginRate(ag.margin_rate ?? null)

      const [casesRes, settlementsRes, rateRes] = await Promise.all([
        supabase.from('cases')
          .select('id, case_number, status, travel_start_date, travel_end_date, travel_completed_at, created_at, case_members(is_lead, clients(name)), quotes(total_price, agent_margin_rate, payment_due_date), schedules(id, status, version, created_at)')
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

  // Expected pipeline — commission on cases not yet travel-completed
  const expectedKrw = cases
    .filter(c => c.status !== 'travel_completed')
    .reduce((sum, c) => {
      const q = c.quotes?.[0]
      return sum + (q ? commissionKrw(q.total_price, q.agent_margin_rate) : 0)
    }, 0)

  // Pipeline case chips — group cases by status, excluding settled travel_completed
  const casesByStatus = new Map<CaseStatus, CaseRow[]>()
  for (const s of ORDERED_STATUSES) casesByStatus.set(s, [])
  for (const c of cases) {
    if (c.status === 'travel_completed' && settledCaseIds.has(c.id)) continue
    casesByStatus.get(c.status)?.push(c)
  }
  // Settled case list for the "Settlement Paid" cell
  const settledCasesList = settlements
    .filter(s => s.paid_at && s.case_id)
    .map(s => cases.find(c => c.id === s.case_id))
    .filter((c): c is CaseRow => !!c)

  // Per-case secondary info line for pipeline chip (status-specific + urgency color)
  const todayISO = now.toISOString().slice(0, 10)
  const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  type CaseInfo = { line: string; urgency: 'normal' | 'warn' | 'alert' }
  function caseInfoFor(c: CaseRow): CaseInfo {
    const q = c.quotes?.[0]
    const totalUsd = q ? q.total_price / exchangeRate : null
    const commUsd = q ? commissionKrw(q.total_price, q.agent_margin_rate) / exchangeRate : null

    switch (c.status) {
      case 'payment_pending': {
        const due = q?.payment_due_date
        const overdue = !!due && due < todayISO
        const soon = !!due && !overdue && due <= threeDaysFromNow
        const parts: string[] = []
        if (due) parts.push(overdue ? `Overdue ${fmtDateShort(due)}` : `Due ${fmtDateShort(due)}`)
        if (totalUsd != null) parts.push(fmtUsdShort(totalUsd))
        return { line: parts.join(' · '), urgency: overdue ? 'alert' : soon ? 'warn' : 'normal' }
      }
      case 'payment_completed':
      case 'schedule_reviewed':
      case 'schedule_confirmed': {
        const start = c.travel_start_date
        const soon = !!start && start >= todayISO && start <= weekFromNow
        const ended = !!c.travel_end_date && c.travel_end_date < todayISO
        return {
          line: start ? `Travel ${fmtDateShort(start)}` : '',
          // schedule_confirmed + trip ended = needs mark complete (alert)
          urgency: c.status === 'schedule_confirmed' && ended ? 'alert' : soon ? 'warn' : 'normal',
        }
      }
      case 'travel_completed': {
        const end = c.travel_end_date
        const parts: string[] = []
        if (end) parts.push(`Ended ${fmtDateShort(end)}`)
        if (commUsd != null) parts.push(fmtUsdShort(commUsd))
        return { line: parts.join(' · '), urgency: 'normal' }
      }
    }
  }


  const tierInfo = nextTierInfo(monthlyPatients)

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-900">Dashboard</h1>
        {agentName && <span className="text-xs text-gray-500">{agentName}</span>}
        {agentNumber && <span className="text-[10px] font-mono text-gray-400">{agentNumber}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => router.push('/agent/clients')}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50">
            <span className="text-sm leading-none">+</span> Add Client
          </button>
          <button onClick={() => router.push('/agent/home')}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828]">
            <span className="text-sm leading-none">+</span> Create Quote
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-12 py-8 space-y-6">

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
          ) : (
            <>
              {/* HERO — Top row (This Month left, Expected right) · Bottom: tier progress full width */}
              <section className="bg-gray-50 rounded-2xl p-6">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  {/* Left: This Month */}
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">This Month</p>
                    <p className="text-5xl font-bold text-gray-900 tracking-tight leading-none">{fmtUSD(thisMonthPaid / exchangeRate)}</p>
                    <p className="text-sm text-gray-500 mt-3">
                      <span className="font-semibold text-gray-700">{monthlyPatients}</span> patient{monthlyPatients !== 1 ? 's' : ''} · margin{' '}
                      <span className="font-semibold text-[#0f4c35]">{marginRate != null ? `${(marginRate * 100).toFixed(0)}%` : '—'}</span>
                    </p>
                  </div>

                  {/* Right: Expected Pipeline */}
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Expected Pipeline</p>
                    <p className="text-2xl font-bold text-blue-700 tracking-tight leading-none">{fmtUSD(expectedKrw / exchangeRate)}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {cases.filter(c => c.status !== 'travel_completed').length} in-progress case{cases.filter(c => c.status !== 'travel_completed').length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Full-width tier progress */}
                <div className="mt-6">
                  {tierInfo.remaining != null && tierInfo.next != null && tierInfo.nextRate != null ? (
                    <>
                      <div className="flex items-baseline justify-between mb-2">
                        <p className="text-xs text-gray-500">
                          <span className="font-semibold text-gray-900">{tierInfo.remaining} more patient{tierInfo.remaining !== 1 ? 's' : ''}</span>
                          {' '}to reach <span className="font-semibold text-[#0f4c35]">{(tierInfo.nextRate * 100).toFixed(0)}%</span> margin
                        </p>
                        <p className="text-[10px] text-gray-400 tabular-nums">{monthlyPatients} / {tierInfo.next}</p>
                      </div>
                      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-[#0f4c35] transition-all"
                          style={{ width: `${Math.min(100, (monthlyPatients / tierInfo.next) * 100)}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-[#0f4c35] font-medium">🎉 Top tier reached (25% margin)</p>
                  )}
                </div>
              </section>

              {/* PIPELINE — Kanban-style mini columns per status */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pipeline</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
                  {ORDERED_STATUSES.map(s => {
                    const rawCount = statusCounts.get(s) ?? 0
                    const count = s === 'travel_completed' ? unsettledCompletedCount : rawCount
                    const active = count > 0
                    const list = casesByStatus.get(s) ?? []
                    const visible = list.slice(0, 4)
                    const extra = Math.max(0, list.length - visible.length)
                    return (
                      <div key={s}
                        className={`rounded-2xl border border-gray-200 bg-white flex flex-col overflow-hidden min-h-[180px]`}>
                        {/* Header: tinted bar with label + count */}
                        <div className={`px-3 py-2.5 flex items-center justify-between border-b ${active ? STATUS_STYLES[s] : 'bg-gray-50 border-gray-100'}`}>
                          <p className={`text-[10px] font-semibold uppercase tracking-wide truncate ${active ? '' : 'text-gray-400'}`}>{PIPELINE_LABELS[s]}</p>
                          <span className={`text-sm font-bold tabular-nums ${active ? '' : 'text-gray-300'}`}>{count}</span>
                        </div>
                        {/* Body: clean white, case rows as subtle items */}
                        <div className="flex-1 p-2 space-y-0.5">
                          {visible.length === 0 ? (
                            <p className="text-[10px] text-gray-300 text-center py-4">—</p>
                          ) : (
                            visible.map(c => {
                              const lead = c.case_members?.find(m => m.is_lead)
                              const info = caseInfoFor(c)
                              const infoColor = info.urgency === 'alert' ? 'text-red-600' : info.urgency === 'warn' ? 'text-amber-700' : 'text-gray-400'
                              return (
                                <button key={c.id}
                                  onClick={() => router.push(`/agent/cases/${c.id}`)}
                                  className="w-full flex flex-col px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors text-left">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-mono text-gray-400 shrink-0">{c.case_number}</span>
                                    <span className="text-[11px] text-gray-800 truncate flex-1">{lead?.clients?.name ?? '—'}</span>
                                  </div>
                                  {info.line && (
                                    <span className={`text-[10px] ${infoColor} tabular-nums mt-0.5`}>{info.line}</span>
                                  )}
                                </button>
                              )
                            })
                          )}
                          {extra > 0 && (
                            <button onClick={() => router.push('/agent/cases')}
                              className="w-full text-[10px] text-gray-500 hover:text-gray-700 py-1 transition-colors">
                              + {extra} more
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {(() => {
                    const paidSettlements = settlements.filter(st => st.paid_at)
                    const paidCount = paidSettlements.length
                    const active = paidCount > 0
                    // Pair each settlement with its case; keep most recent first
                    const pairs = paidSettlements
                      .map(s => ({ settlement: s, case: cases.find(c => c.id === s.case_id) }))
                      .filter((p): p is { settlement: Settlement; case: CaseRow } => !!p.case)
                      .sort((a, b) => (b.settlement.paid_at ?? '').localeCompare(a.settlement.paid_at ?? ''))
                    const visible = pairs.slice(0, 4)
                    const extra = Math.max(0, pairs.length - visible.length)
                    return (
                      <div
                        className={`rounded-2xl border border-gray-200 bg-white flex flex-col overflow-hidden min-h-[180px]`}>
                        <div className={`px-3 py-2.5 flex items-center justify-between border-b ${active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-100'}`}>
                          <p className={`text-[10px] font-semibold uppercase tracking-wide truncate ${active ? '' : 'text-gray-400'}`}>Settlement Paid</p>
                          <span className={`text-sm font-bold tabular-nums ${active ? '' : 'text-gray-300'}`}>{paidCount}</span>
                        </div>
                        <div className="flex-1 p-2 space-y-0.5">
                          {visible.length === 0 ? (
                            <p className="text-[10px] text-gray-300 text-center py-4">—</p>
                          ) : (
                            visible.map(({ case: c, settlement }) => {
                              const lead = c.case_members?.find(m => m.is_lead)
                              const amtUsd = (settlement.amount ?? 0) / exchangeRate
                              const paidAt = settlement.paid_at
                              return (
                                <button key={c.id}
                                  onClick={() => router.push(`/agent/cases/${c.id}`)}
                                  className="w-full flex flex-col px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors text-left">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-mono text-gray-400 shrink-0">{c.case_number}</span>
                                    <span className="text-[11px] text-gray-800 truncate flex-1">{lead?.clients?.name ?? '—'}</span>
                                  </div>
                                  <span className="text-[10px] text-emerald-700 tabular-nums mt-0.5">
                                    {paidAt ? `Paid ${fmtDateShort(paidAt)}` : ''}{paidAt && amtUsd ? ' · ' : ''}{amtUsd ? fmtUsdShort(amtUsd) : ''}
                                  </span>
                                </button>
                              )
                            })
                          )}
                          {extra > 0 && (
                            <button onClick={() => router.push('/agent/payouts')}
                              className="w-full text-[10px] text-gray-500 hover:text-gray-700 py-1 transition-colors">
                              + {extra} more
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </section>

            </>
          )}
        </div>
      </div>
    </div>
  )
}
