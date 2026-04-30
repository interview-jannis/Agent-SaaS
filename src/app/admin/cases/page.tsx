'use client'

import { Fragment, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { type CaseStatus, STATUS_LABELS, STATUS_STYLES } from '@/lib/caseStatus'

// Display order — most urgent first (closest to travel), terminal at bottom.
// `completed` is split: pending settlement stays high, fully settled drops to bottom.
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
  completed_pending: 'Completed · Pending Settlement',
  completed_settled: 'Completed · Settled',
  canceled: STATUS_LABELS.canceled,
}

// Compact labels for the JUMP toolbar — drop "Awaiting"/"Completed ·" prefixes.
// Full labels stay on section headers (tooltip on chips preserves them).
const SHORT_LABELS: Record<DisplayGroup, string> = {
  awaiting_travel: 'Travel',
  awaiting_payment: 'Payment',
  awaiting_pricing: 'Pricing',
  reviewing_schedule: 'Schedule Review',
  awaiting_schedule: 'Schedule Prep',
  awaiting_info: 'Client Info',
  completed_pending: 'Pending Payout',
  completed_settled: 'Settled',
  canceled: 'Canceled',
}

// Small monochrome icons for section headers — visual variety without color.
const GROUP_ICON_PATHS: Record<DisplayGroup, string> = {
  awaiting_info:      'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  awaiting_schedule:  'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
  reviewing_schedule: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  awaiting_pricing:   'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z',
  awaiting_payment:   'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
  awaiting_travel:    'M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5',
  completed_pending:  'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z',
  completed_settled:  'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  canceled:           'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
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

// ── Types ─────────────────────────────────────────────────────────────────────

type CaseMember = {
  id: string
  is_lead: boolean
  clients: { id: string; client_number: string; name: string } | null
}

type Quote = {
  id: string
  total_price: number
  quote_groups: {
    member_count: number
    quote_items: { products: { partner_name: string | null } | null }[]
  }[]
}

type Agent = { id: string; agent_number: string; name: string }

type Case = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  travel_end_date: string | null
  created_at: string
  agents: Agent | Agent[] | null
  case_members: CaseMember[]
  quotes: Quote[]
}

function getAgent(c: { agents: Agent | Agent[] | null } | null | undefined): Agent | null {
  const a = c?.agents
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

// Sort cases by travel imminence: nearest travel_start_date first, nulls last.
function sortByTravelImminent(a: Case, b: Case): number {
  const aDate = a.travel_start_date
  const bDate = b.travel_start_date
  if (!aDate && !bDate) return 0
  if (!aDate) return 1
  if (!bDate) return -1
  return aDate.localeCompare(bDate)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminCasesPage() {
  const router = useRouter()
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [partnerPaidByCase, setPartnerPaidByCase] = useState<Record<string, Set<string>>>({})
  const [settledCaseIds, setSettledCaseIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function init() {
      const [casesRes, rateRes, partnerRes, settleRes] = await Promise.all([
        supabase.from('cases').select(`
          id, case_number, status, travel_start_date, travel_end_date, created_at,
          agents!cases_agent_id_fkey(id, agent_number, name),
          case_members(id, is_lead, clients(id, client_number, name)),
          quotes(id, total_price, quote_groups(member_count, quote_items(products(partner_name))))
        `).order('created_at', { ascending: false }),
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
        supabase.from('partner_payments').select('case_id, partner_name'),
        supabase.from('settlements').select('case_id').not('paid_at', 'is', null),
      ])
      if (casesRes.error) console.error('[cases] fetch error:', casesRes.error)
      setCases((casesRes.data as unknown as Case[]) ?? [])
      const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (r) setExchangeRate(r)

      const ppMap: Record<string, Set<string>> = {}
      for (const row of (partnerRes.data as { case_id: string; partner_name: string }[] | null) ?? []) {
        if (!ppMap[row.case_id]) ppMap[row.case_id] = new Set()
        ppMap[row.case_id].add(row.partner_name)
      }
      setPartnerPaidByCase(ppMap)
      setSettledCaseIds(new Set(((settleRes.data as { case_id: string | null }[] | null) ?? []).map(s => s.case_id).filter((x): x is string => !!x)))

      setLoading(false)
    }
    init()
  }, [])

  function partnerStatusFor(c: Case): 'done' | 'pending' | 'na' {
    const partners = new Set<string>()
    for (const g of c.quotes?.[0]?.quote_groups ?? []) {
      for (const item of g.quote_items ?? []) {
        const name = item.products?.partner_name?.trim()
        if (name) partners.add(name)
      }
    }
    if (partners.size === 0) return 'na'
    const paid = partnerPaidByCase[c.id] ?? new Set<string>()
    return [...partners].every(p => paid.has(p)) ? 'done' : 'pending'
  }

  // Search across case#, agent name, lead client name
  const searchLower = search.trim().toLowerCase()
  const filtered = !searchLower ? cases : cases.filter((c) => {
    if (c.case_number.toLowerCase().includes(searchLower)) return true
    const agent = getAgent(c)
    if (agent?.name.toLowerCase().includes(searchLower)) return true
    if (agent?.agent_number?.toLowerCase().includes(searchLower)) return true
    const lead = c.case_members?.find((m) => m.is_lead)?.clients?.name
    if (lead?.toLowerCase().includes(searchLower)) return true
    return false
  })

  // Map a case to its display group (splits 'completed' by settlement state)
  function getDisplayGroup(c: Case): DisplayGroup {
    if (c.status === 'completed') {
      const partnerOk = partnerStatusFor(c) !== 'pending'
      const agentOk = settledCaseIds.has(c.id)
      return partnerOk && agentOk ? 'completed_settled' : 'completed_pending'
    }
    return c.status as DisplayGroup
  }

  // Group by display group (in DISPLAY_ORDER), sorted by travel imminence within each group
  const groupedByDisplay = new Map<DisplayGroup, Case[]>()
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
      <div className="shrink-0 border-b border-gray-100 px-4 md:px-6 py-3 md:py-0 md:h-14 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <h1 className="text-base font-semibold text-gray-900">Cases</h1>
            {!loading && <span className="text-xs text-gray-400">{filtered.length}</span>}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="md:hidden flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-900 placeholder-gray-400"
          />
        </div>
        {!loading && filtered.length > 0 && (
          <div className="flex-1 min-w-0 flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 flex-wrap md:flex-nowrap md:overflow-x-auto md:no-scrollbar">
            <span className="shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wider pr-1.5 mr-0.5 border-r border-gray-200">Jump</span>
            {DISPLAY_ORDER.map((g) => {
              const count = groupedByDisplay.get(g)?.length ?? 0
              const empty = count === 0
              return (
                <button
                  key={g}
                  onClick={() => !empty && scrollToGroup(g)}
                  disabled={empty}
                  className={`shrink-0 px-2 py-0.5 rounded text-[11px] transition-colors ${
                    empty
                      ? 'text-gray-300 cursor-default'
                      : 'text-gray-700 hover:bg-white hover:text-[#0f4c35] cursor-pointer'
                  }`}
                  title={empty ? `${DISPLAY_LABELS[g]} — no cases` : `Jump to ${DISPLAY_LABELS[g]}`}
                >
                  {SHORT_LABELS[g]}
                  <span className={`ml-1 font-medium ${empty ? 'text-gray-300' : 'text-gray-400'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by case #, agent, or client name"
          className="hidden md:block shrink-0 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-900 placeholder-gray-400 ml-auto w-72"
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-24">No cases found.</p>
        ) : (
          <div className="px-4 md:px-12 py-6 md:py-8 space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm border-collapse whitespace-nowrap tracking-tight">
                <thead className="border-b border-gray-100 bg-gray-50/60">
                  <tr>
                    <th className="py-3 px-1.5 md:px-4 text-xs font-medium text-gray-400 text-left">Case</th>
                    <th className="py-3 px-1.5 md:px-4 text-xs font-medium text-gray-400 text-left hidden md:table-cell">Agent</th>
                    <th className="py-3 px-1.5 md:px-4 text-xs font-medium text-gray-400 text-left">Lead Client</th>
                    <th className="py-3 px-1.5 md:px-4 text-xs font-medium text-gray-400 text-left hidden md:table-cell">Members</th>
                    <th className="py-3 px-1.5 md:px-4 text-xs font-medium text-gray-400 text-left">Travel</th>
                    <th className="py-3 px-1.5 md:px-4 text-xs font-medium text-gray-400 text-center md:text-left">Settlement</th>
                    <th className="py-3 px-1.5 md:px-4 text-xs font-medium text-gray-400 text-left">Total (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {DISPLAY_ORDER.map((group) => {
                    const items = groupedByDisplay.get(group) ?? []
                    const empty = items.length === 0
                    return (
                      <Fragment key={group}>
                        <tr id={`status-section-${group}`} className="scroll-mt-20 bg-gray-100">
                          <td colSpan={7} className={`px-6 border-b border-gray-200 ${empty ? 'py-1' : 'py-2'}`}>
                            <div className="flex items-center gap-2">
                              <svg className={`w-3.5 h-3.5 shrink-0 ${empty ? 'text-gray-300' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={GROUP_ICON_PATHS[group]} />
                              </svg>
                              <span className={`text-[10px] uppercase tracking-wide ${empty ? 'text-gray-400' : 'text-gray-800 font-semibold'}`}>
                                {DISPLAY_LABELS[group]}
                              </span>
                              <span className={`text-[10px] tabular-nums ${empty ? 'text-gray-300' : 'text-gray-500'}`}>{items.length}</span>
                            </div>
                          </td>
                        </tr>
                        {items.map((c) => {
                          const caseLead = c.case_members?.find((m) => m.is_lead)
                          const quote = c.quotes?.[0]
                          const memberCount = quote?.quote_groups?.reduce((s, g) => s + (g.member_count ?? 0), 0) ?? 0
                          return (
                            <tr key={c.id} onClick={() => router.push(`/admin/cases/${c.id}`)}
                              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                              <td className="py-3 px-1.5 md:px-4 font-mono text-xs text-gray-400">{c.case_number}</td>
                              <td className="py-3 px-1.5 md:px-4 hidden md:table-cell">
                                <p className="text-gray-800 font-medium">{getAgent(c)?.name ?? '—'}</p>
                                <p className="text-[10px] font-mono text-gray-400">{getAgent(c)?.agent_number}</p>
                              </td>
                              <td className="py-3 px-1.5 md:px-4">
                                <p className="text-gray-900 font-medium">{caseLead?.clients?.name ?? '—'}</p>
                                {caseLead?.clients?.client_number && (
                                  <p className="text-[10px] font-mono text-gray-400">{caseLead.clients.client_number}</p>
                                )}
                              </td>
                              <td className="py-3 px-1.5 md:px-4 text-gray-500 hidden md:table-cell">{memberCount}</td>
                              <td className="py-3 px-1.5 md:px-4 text-gray-500 text-xs text-left align-middle">
                                {c.travel_start_date || c.travel_end_date ? (
                                  <>
                                    <span className="block md:inline">
                                      <span className="md:hidden">{c.travel_start_date?.slice(2) ?? '—'}</span>
                                      <span className="hidden md:inline">{c.travel_start_date ?? '—'}</span>
                                    </span>
                                    <span className="hidden md:inline"> – </span>
                                    <span className="block md:inline">
                                      <span className="md:hidden">{c.travel_end_date?.slice(2) ?? '—'}</span>
                                      <span className="hidden md:inline">{c.travel_end_date ?? '—'}</span>
                                    </span>
                                  </>
                                ) : '—'}
                              </td>
                              <td className="py-3 px-1.5 md:px-4 text-center md:text-left">
                                {(() => {
                                  const ps = partnerStatusFor(c)
                                  const agentDone = settledCaseIds.has(c.id)
                                  const part = (label: string, state: 'done' | 'pending' | 'na', tip: string) => {
                                    const markCls = state === 'done' ? 'text-emerald-600' : state === 'pending' ? 'text-amber-500' : 'text-gray-300'
                                    const mark = state === 'done' ? '✓' : state === 'pending' ? '⋯' : '—'
                                    return (
                                      <span title={tip} className="inline-flex items-center gap-1">
                                        {/* Mobile: show first letter so P✓ / A⋯ stays distinguishable in icon-only view. */}
                                        <span className="md:hidden text-[10px] text-gray-400 font-medium">{label[0]}</span>
                                        <span className={`text-xs font-semibold ${markCls}`}>{mark}</span>
                                        <span className="hidden md:inline text-xs text-gray-500">{label}</span>
                                      </span>
                                    )
                                  }
                                  return (
                                    <div className="inline-flex items-center gap-2 md:gap-3">
                                      {part('Partner', ps, ps === 'done' ? 'All partner payouts complete' : ps === 'pending' ? 'Partner payouts pending' : 'No partners on this case')}
                                      {part('Agent', agentDone ? 'done' : 'pending', agentDone ? 'Agent commission paid' : 'Agent commission pending')}
                                    </div>
                                  )
                                })()}
                              </td>
                              <td className="py-3 px-1.5 md:px-4 font-medium text-gray-900">
                                {quote ? fmtUSD(quote.total_price / exchangeRate) : '—'}
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
