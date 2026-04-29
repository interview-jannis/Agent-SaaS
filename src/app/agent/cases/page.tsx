'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { type CaseStatus, STATUS_LABELS, STATUS_STYLES } from '@/lib/caseStatus'

// Display order — most urgent first; Completed splits by settlement state.
type DisplayGroup =
  | 'awaiting_travel'
  | 'awaiting_payment'
  | 'awaiting_pricing'
  | 'reviewing_schedule'
  | 'awaiting_schedule'
  | 'awaiting_info'
  | 'completed_pending'
  | 'completed_settled'
  | 'canceled'

const DISPLAY_ORDER: DisplayGroup[] = [
  'completed_pending',
  'awaiting_travel',
  'awaiting_payment',
  'awaiting_pricing',
  'reviewing_schedule',
  'awaiting_schedule',
  'awaiting_info',
  'completed_settled',
  'canceled',
]

const DISPLAY_LABELS: Record<DisplayGroup, string> = {
  awaiting_travel: STATUS_LABELS.awaiting_travel,
  awaiting_payment: STATUS_LABELS.awaiting_payment,
  awaiting_pricing: STATUS_LABELS.awaiting_pricing,
  reviewing_schedule: STATUS_LABELS.reviewing_schedule,
  awaiting_schedule: STATUS_LABELS.awaiting_schedule,
  awaiting_info: STATUS_LABELS.awaiting_info,
  completed_pending: 'Completed · Awaiting Payout',
  completed_settled: 'Completed · Received',
  canceled: STATUS_LABELS.canceled,
}

const DISPLAY_STYLES: Record<DisplayGroup, string> = {
  awaiting_travel: STATUS_STYLES.awaiting_travel,
  awaiting_payment: STATUS_STYLES.awaiting_payment,
  awaiting_pricing: STATUS_STYLES.awaiting_pricing,
  reviewing_schedule: STATUS_STYLES.reviewing_schedule,
  awaiting_schedule: STATUS_STYLES.awaiting_schedule,
  awaiting_info: STATUS_STYLES.awaiting_info,
  completed_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  completed_settled: STATUS_STYLES.completed,
  canceled: STATUS_STYLES.canceled,
}

type CaseRow = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  travel_end_date: string | null
  created_at: string
  case_members: { is_lead: boolean; clients: { name: string } | null }[]
  quotes: { total_price: number; quote_groups: { member_count: number }[] }[]
}

function sortByTravelImminent(a: CaseRow, b: CaseRow): number {
  const aDate = a.travel_start_date
  const bDate = b.travel_start_date
  if (!aDate && !bDate) return 0
  if (!aDate) return 1
  if (!bDate) return -1
  return aDate.localeCompare(bDate)
}

export default function AgentCasesPage() {
  const router = useRouter()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [settledCaseIds, setSettledCaseIds] = useState<Set<string>>(new Set())

  const fetchCases = useCallback(async (aid: string) => {
    const [casesRes, settleRes] = await Promise.all([
      supabase.from('cases')
        .select('id, case_number, status, travel_start_date, travel_end_date, created_at, case_members(is_lead, clients(name)), quotes(total_price, quote_groups(member_count))')
        .eq('agent_id', aid)
        .order('created_at', { ascending: false }),
      supabase.from('settlements')
        .select('case_id')
        .eq('agent_id', aid)
        .not('paid_at', 'is', null),
    ])
    setCases((casesRes.data as unknown as CaseRow[]) ?? [])
    setSettledCaseIds(new Set(((settleRes.data as { case_id: string | null }[] | null) ?? []).map(s => s.case_id).filter((x): x is string => !!x)))
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data: ag } = await supabase.from('agents').select('id').eq('auth_user_id', uid).single()
      const aid = ag?.id ?? ''
      const { data: ss } = await supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single()
      const rate = (ss?.value as { usd_krw?: number } | null)?.usd_krw
      if (typeof rate === 'number' && rate > 0) setExchangeRate(rate)
      if (aid) await fetchCases(aid)
      setLoading(false)
    }
    load()
  }, [fetchCases])

  // Search across case# and lead client name
  const searchLower = search.trim().toLowerCase()
  const filtered = !searchLower ? cases : cases.filter((c) => {
    if (c.case_number.toLowerCase().includes(searchLower)) return true
    const lead = c.case_members?.find((m) => m.is_lead)?.clients?.name
    if (lead?.toLowerCase().includes(searchLower)) return true
    return false
  })

  function getDisplayGroup(c: CaseRow): DisplayGroup {
    if (c.status === 'completed') {
      return settledCaseIds.has(c.id) ? 'completed_settled' : 'completed_pending'
    }
    return c.status as DisplayGroup
  }

  const groupedByDisplay = new Map<DisplayGroup, CaseRow[]>()
  for (const g of DISPLAY_ORDER) groupedByDisplay.set(g, [])
  for (const c of filtered) {
    groupedByDisplay.get(getDisplayGroup(c))?.push(c)
  }
  for (const [g, arr] of groupedByDisplay) {
    groupedByDisplay.set(g, [...arr].sort(sortByTravelImminent))
  }

  function scrollToGroup(g: DisplayGroup) {
    const el = document.getElementById(`status-section-${g}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-gray-900">Cases</h1>
          {!loading && <span className="text-xs text-gray-400">{filtered.length}</span>}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by case # or client name"
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-900 placeholder-gray-400 ml-auto w-64"
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : cases.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-sm text-gray-400">No cases yet.</p>
            <p className="text-xs text-gray-300 mt-1">Create a quote from the Home tab to start a case.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-24">No matches.</p>
        ) : (
          <div className="px-12 py-8 space-y-6">
            {/* Status jump pills */}
            <div className="sticky top-0 z-20 bg-[#0f4c35]/[0.04] border border-[#0f4c35]/15 rounded-xl shadow-sm px-4 py-2.5 flex flex-wrap gap-2 backdrop-blur-sm">
              <span className="self-center text-[11px] font-semibold text-[#0f4c35]/70 uppercase tracking-wide mr-1">Jump to</span>
              {DISPLAY_ORDER.map((g) => {
                const count = groupedByDisplay.get(g)?.length ?? 0
                const empty = count === 0
                return (
                  <button
                    key={g}
                    onClick={() => !empty && scrollToGroup(g)}
                    disabled={empty}
                    className={`px-3 py-1.5 rounded-full border text-xs transition-colors shadow-sm ${
                      empty
                        ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-default'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-[#0f4c35] hover:text-[#0f4c35] cursor-pointer'
                    }`}
                  >
                    {DISPLAY_LABELS[g]}
                    <span className={`ml-1.5 ${empty ? 'text-gray-300' : 'text-gray-400'}`}>({count})</span>
                  </button>
                )
              })}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead className="border-b border-gray-100 bg-gray-50/60">
                  <tr>
                    {['Case #', 'Lead Client', 'Members', 'Travel Start', 'Travel End', 'Settlement', 'Amount (USD)'].map((h, i) => (
                      <th key={h} className={`py-3 px-4 text-xs font-medium text-gray-400 ${i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DISPLAY_ORDER.map((group) => {
                    const items = groupedByDisplay.get(group) ?? []
                    const empty = items.length === 0
                    return (
                      <Fragment key={group}>
                        <tr id={`status-section-${group}`} className="scroll-mt-20 bg-gray-100">
                          <td colSpan={7} className="px-6 py-2 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${empty ? 'bg-gray-50 text-gray-300 border-gray-100' : DISPLAY_STYLES[group]}`}>
                                {DISPLAY_LABELS[group]}
                              </span>
                              <span className={`text-xs ${empty ? 'text-gray-300' : 'text-gray-500'}`}>({items.length})</span>
                            </div>
                          </td>
                        </tr>
                        {empty && (
                          <tr>
                            <td colSpan={7} className="px-6 py-3 text-xs text-gray-300 text-center italic">No cases</td>
                          </tr>
                        )}
                        {items.map((c) => {
                          const lead = c.case_members?.find(m => m.is_lead)
                          const quote = c.quotes?.[0]
                          const members = quote?.quote_groups?.reduce((s, g) => s + (g.member_count ?? 0), 0) ?? 0
                          const amountUsd = quote ? quote.total_price / exchangeRate : null
                          return (
                            <tr key={c.id} onClick={() => router.push(`/agent/cases/${c.id}`)}
                              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                              <td className="py-3.5 px-4 font-mono text-xs text-gray-400">{c.case_number}</td>
                              <td className="py-3.5 px-4 font-medium text-gray-900">{lead?.clients?.name ?? '—'}</td>
                              <td className="py-3.5 px-4 text-gray-500">{members}</td>
                              <td className="py-3.5 px-4 text-xs text-gray-500">{c.travel_start_date ?? '—'}</td>
                              <td className="py-3.5 px-4 text-xs text-gray-500">{c.travel_end_date ?? '—'}</td>
                              <td className="py-3.5 px-4">
                                {c.status === 'completed' ? (
                                  settledCaseIds.has(c.id) ? (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Received</span>
                                  ) : (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Pending</span>
                                  )
                                ) : (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-transparent text-gray-300">—</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right font-medium text-gray-900">
                                {amountUsd !== null ? `$${amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
