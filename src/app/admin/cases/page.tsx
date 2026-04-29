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
  clients: { id: string; name: string } | null
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
          case_members(id, is_lead, clients(id, name)),
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
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-gray-900">Cases</h1>
          {!loading && <span className="text-xs text-gray-400">{filtered.length}</span>}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by case #, agent, or client name"
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-900 placeholder-gray-400 ml-auto w-72"
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-24">No cases found.</p>
        ) : (
          <div className="px-12 py-8 space-y-6">
            {/* Status jump pills (sticky) */}
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
                    {['Case #', 'Agent', 'Lead Client', 'Members', 'Travel Period', 'Settlement', 'Total (USD)'].map(h => (
                      <th key={h} className="py-3 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
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
                          const caseLead = c.case_members?.find((m) => m.is_lead)
                          const quote = c.quotes?.[0]
                          const memberCount = quote?.quote_groups?.reduce((s, g) => s + (g.member_count ?? 0), 0) ?? 0
                          return (
                            <tr key={c.id} onClick={() => router.push(`/admin/cases/${c.id}`)}
                              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                              <td className="py-3.5 px-4 font-mono text-xs text-gray-400">{c.case_number}</td>
                              <td className="py-3.5 px-4">
                                <p className="text-gray-800 font-medium">{getAgent(c)?.name ?? '—'}</p>
                                <p className="text-[10px] font-mono text-gray-400">{getAgent(c)?.agent_number}</p>
                              </td>
                              <td className="py-3.5 px-4 font-medium text-gray-900">{caseLead?.clients?.name ?? '—'}</td>
                              <td className="py-3.5 px-4 text-gray-500 text-center">{memberCount}</td>
                              <td className="py-3.5 px-4 text-gray-500 text-xs">
                                {c.travel_start_date || c.travel_end_date
                                  ? `${c.travel_start_date ?? '—'} ~ ${c.travel_end_date ?? '—'}`
                                  : '—'}
                              </td>
                              <td className="py-3.5 px-4">
                                {(() => {
                                  const ps = partnerStatusFor(c)
                                  const agentDone = settledCaseIds.has(c.id)
                                  const dot = (state: 'done' | 'pending' | 'na') =>
                                    state === 'done' ? 'bg-emerald-500'
                                      : state === 'pending' ? 'bg-amber-400'
                                      : 'bg-gray-200'
                                  return (
                                    <div className="flex items-center gap-2 text-[10px]">
                                      <span className="flex items-center gap-1" title={`Partner ${ps}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${dot(ps)}`} />
                                        <span className="text-gray-500">P</span>
                                      </span>
                                      <span className="flex items-center gap-1" title={`Agent ${agentDone ? 'done' : 'pending'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${dot(agentDone ? 'done' : 'pending')}`} />
                                        <span className="text-gray-500">A</span>
                                      </span>
                                    </div>
                                  )
                                })()}
                              </td>
                              <td className="py-3.5 px-4 font-medium text-gray-900">
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
