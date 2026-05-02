'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SparklineCard from '@/components/SparklineCard'
import { type CaseStatus, STATUS_LABELS, STATUS_STYLES, PIPELINE_ORDER, ACTIVE_STATUSES } from '@/lib/caseStatus'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type CaseRow = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  travel_end_date: string | null
  travel_completed_at: string | null
  payment_date: string | null
  created_at: string
  case_members: { is_lead: boolean; clients: { name: string } | null }[]documents: { type: string; total_price: number; agent_margin_rate: number; payment_due_date: string | null; finalized_at: string | null }[]
  schedules: { id: string; status: string; version: number; created_at: string }[]
}


type Settlement = { id: string; amount: number; paid_at: string | null; case_id: string | null }

// Pipeline-specific labels — the "completed" cell here actually shows unsettled-only
const PIPELINE_LABELS: Record<CaseStatus, string> = {
  ...STATUS_LABELS,
  completed: 'Travel Done · Unpaid',
}

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
          .select('id, case_number, status, travel_start_date, travel_end_date, travel_completed_at, payment_date, created_at, case_members(is_lead, clients(name)), documents(type, total_price, agent_margin_rate, payment_due_date, finalized_at), schedules(id, status, version, created_at)')
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

  // Completed pipeline cell shows unsettled only — settled ones belong to "Settlement Paid"
  const settledCaseIds = new Set(settlements.filter(s => s.case_id).map(s => s.case_id!))
  const unsettledCompletedCount = cases.filter(c => (c.status === 'completed' || c.status === 'awaiting_review') && !settledCaseIds.has(c.id)).length

  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Patients from cases marked complete this month (tier is patients/month, not cases).
  const monthlyPatients = cases
    .filter(c => (c.status === 'completed' || c.status === 'awaiting_review') && c.travel_completed_at?.startsWith(monthKey))
    .reduce((sum, c) => sum + (c.case_members?.length ?? 0), 0)

  const thisMonthPaid = settlements
    .filter(s => s.paid_at?.startsWith(monthKey))
    .reduce((s, st) => s + (st.amount ?? 0), 0)

  // 6-month performance for sparklines
  const monthly: { key: string; label: string; cases: number; commission: number; received: number; patients: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthCases = cases.filter(c => c.payment_date?.startsWith(key))
    let commission = 0, patients = 0
    for (const c of monthCases) {
      const q = c.documents?.find(d => d.type === "quotation")
      if (!q) continue
      commission += commissionKrw(q.total_price ?? 0, q.agent_margin_rate ?? 0)
      patients += c.case_members?.length ?? 0
    }
    const received = settlements.filter(s => s.paid_at?.startsWith(key)).reduce((sum, s) => sum + (s.amount ?? 0), 0)
    monthly.push({ key, label: MONTH_SHORT[d.getMonth()], cases: monthCases.length, commission, received, patients })
  }
  const cur = monthly[monthly.length - 1]
  const prv = monthly[monthly.length - 2]
  const sparkLabels = monthly.map(m => m.label)
  const toUsd = (krw: number) => krw / exchangeRate

  // Expected pipeline — commission on active cases (not completed/canceled)
  const activeSet = new Set<CaseStatus>(ACTIVE_STATUSES)
  const expectedKrw = cases
    .filter(c => activeSet.has(c.status))
    .reduce((sum, c) => {
      const q = c.documents?.find(d => d.type === "quotation")
      return sum + (q ? commissionKrw(q.total_price, q.agent_margin_rate) : 0)
    }, 0)

  // Pipeline case chips — group cases by status, excluding settled completed + canceled
  const casesByStatus = new Map<CaseStatus, CaseRow[]>()
  for (const s of PIPELINE_ORDER) casesByStatus.set(s, [])
  for (const c of cases) {
    if ((c.status === 'completed' || c.status === 'awaiting_review') && settledCaseIds.has(c.id)) continue
    if (c.status === 'canceled') continue
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
    const q = c.documents?.find(d => d.type === "quotation")
    const totalUsd = q ? q.total_price / exchangeRate : null
    const commUsd = q ? commissionKrw(q.total_price, q.agent_margin_rate) / exchangeRate : null

    switch (c.status) {
      case 'awaiting_info': {
        // Agent must finish client/trip info before admin can upload schedule
        return { line: 'Fill client + trip info', urgency: 'warn' }
      }
      case 'awaiting_contract': {
        // 3-party contract pending
        return { line: 'Send contract for signing', urgency: 'warn' }
      }
      case 'awaiting_deposit': {
        // Deposit + info collection in parallel
        return { line: 'Collect deposit + client info', urgency: 'warn' }
      }
      case 'awaiting_schedule': {
        // Info complete, admin building schedule
        const parts: string[] = []
        if (totalUsd != null) parts.push(fmtUsdShort(totalUsd))
        parts.push('Admin preparing schedule')
        return { line: parts.join(' · '), urgency: 'normal' }
      }
      case 'reviewing_schedule': {
        // Schedule uploaded, agent must confirm or request revision
        return { line: 'Pending your review', urgency: 'warn' }
      }
      case 'awaiting_pricing': {
        // Admin needs to finalize prices and issue invoice
        return { line: 'Admin finalizing invoice', urgency: 'normal' }
      }
      case 'awaiting_payment': {
        // Invoice ready (or sent) — waiting on client payment
        const due = q?.payment_due_date
        const overdue = !!due && due < todayISO
        const soon = !!due && !overdue && due <= threeDaysFromNow
        const parts: string[] = []
        const action = q?.finalized_at ? 'Send invoice' : 'Awaiting invoice'
        parts.push(action)
        if (due) parts.push(overdue ? `Overdue ${fmtDateShort(due)}` : `Due ${fmtDateShort(due)}`)
        if (totalUsd != null) parts.push(fmtUsdShort(totalUsd))
        return { line: parts.join(' · '), urgency: overdue ? 'alert' : soon ? 'warn' : 'normal' }
      }
      case 'awaiting_travel': {
        // Paid, travel pending or just ended
        const start = c.travel_start_date
        const soon = !!start && start >= todayISO && start <= weekFromNow
        const ended = !!c.travel_end_date && c.travel_end_date < todayISO
        return {
          line: start ? `Travel ${fmtDateShort(start)}` : '',
          // trip ended = needs mark complete (alert)
          urgency: ended ? 'alert' : soon ? 'warn' : 'normal',
        }
      }
      case 'awaiting_review': {
        // Travel done, agent needs to submit client review/survey
        return { line: 'Submit client review', urgency: 'warn' }
      }
      case 'completed': {
        const end = c.travel_end_date
        const parts: string[] = []
        if (end) parts.push(`Ended ${fmtDateShort(end)}`)
        if (commUsd != null) parts.push(fmtUsdShort(commUsd))
        return { line: parts.join(' · '), urgency: 'normal' }
      }
      case 'canceled': {
        return { line: 'Canceled', urgency: 'normal' }
      }
    }
  }


  const tierInfo = nextTierInfo(monthlyPatients)

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-100 px-4 md:px-6 py-3 md:py-0 md:h-14 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-semibold text-gray-900 shrink-0">Dashboard</h1>
          {agentName && <span className="text-xs text-gray-500 truncate">{agentName}</span>}
          {agentNumber && <span className="text-[10px] font-mono text-gray-400 shrink-0">{agentNumber}</span>}
        </div>
        <div className="md:ml-auto flex items-center gap-2">
          <button onClick={() => router.push('/agent/clients')}
            className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50">
            <span className="text-sm leading-none">+</span> Add Client
          </button>
          <button onClick={() => router.push('/agent/home')}
            className="flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828]">
            <span className="text-sm leading-none">+</span> Create Quote
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-12 py-6 md:py-8 space-y-6">

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
                    <p className="text-3xl md:text-5xl font-bold text-gray-900 tracking-tight leading-none">{fmtUSD(thisMonthPaid / exchangeRate)}</p>
                    <p className="text-sm text-gray-500 mt-3">
                      <span className="font-semibold text-gray-700">{monthlyPatients}</span> client{monthlyPatients !== 1 ? 's' : ''} · margin{' '}
                      <span className="font-semibold text-[#0f4c35]">{marginRate != null ? `${(marginRate * 100).toFixed(0)}%` : '—'}</span>
                    </p>
                  </div>

                  {/* Right: Expected Pipeline */}
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Expected Pipeline</p>
                    <p className="text-xl md:text-2xl font-bold text-blue-700 tracking-tight leading-none">{fmtUSD(expectedKrw / exchangeRate)}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {cases.filter(c => activeSet.has(c.status)).length} in-progress case{cases.filter(c => activeSet.has(c.status)).length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Full-width tier progress */}
                <div className="mt-6">
                  {tierInfo.remaining != null && tierInfo.next != null && tierInfo.nextRate != null ? (
                    <>
                      <div className="flex items-baseline justify-between mb-2">
                        <p className="text-xs text-gray-500">
                          <span className="font-semibold text-gray-900">{tierInfo.remaining} more client{tierInfo.remaining !== 1 ? 's' : ''}</span>
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

              {/* Performance — 6 month sparklines */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Performance · Last 6 Months</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <SparklineCard label="Commission" color="#0f4c35" kind="money"
                    value={toUsd(cur.commission)} prev={toUsd(prv?.commission ?? 0)}
                    values={monthly.map(m => toUsd(m.commission))} labels={sparkLabels} />
                  <SparklineCard label="Received" color="#0f4c35" kind="money"
                    value={toUsd(cur.received)} prev={toUsd(prv?.received ?? 0)}
                    values={monthly.map(m => toUsd(m.received))} labels={sparkLabels} />
                  <SparklineCard label="Paying Clients" color="#374151" kind="count"
                    value={cur.patients} prev={prv?.patients ?? 0}
                    values={monthly.map(m => m.patients)} labels={sparkLabels} />
                </div>
              </section>

              {/* PIPELINE — Kanban-style mini columns per status */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pipeline</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2">
                  {PIPELINE_ORDER.map(s => {
                    const rawCount = statusCounts.get(s) ?? 0
                    const count = s === 'completed' ? unsettledCompletedCount : rawCount
                    const active = count > 0
                    const list = casesByStatus.get(s) ?? []
                    const visible = list.slice(0, 4)
                    const extra = Math.max(0, list.length - visible.length)
                    return (
                      <div key={s}
                        className={`rounded-2xl border border-gray-200 bg-white flex flex-col overflow-hidden min-h-[130px] md:min-h-[180px]`}>
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
                                    <span className={`text-[10px] ${infoColor} tabular-nums tracking-tight mt-0.5`}>{info.line}</span>
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
