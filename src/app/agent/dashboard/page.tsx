'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SparklineCard from '@/components/SparklineCard'
import { type CaseStatus, ACTIVE_STATUSES } from '@/lib/caseStatus'

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
        supabase.from('system_settings').select('value').eq('key', 'product_price_rate').single(),
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


            </>
          )}
        </div>
      </div>
    </div>
  )
}
