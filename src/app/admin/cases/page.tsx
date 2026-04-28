'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { type CaseStatus, STATUS_LABELS, STATUS_STYLES, ALL_STATUSES } from '@/lib/caseStatus'

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

// ── Constants ─────────────────────────────────────────────────────────────────

function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminCasesPage() {
  const router = useRouter()
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'all'>('all')
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

  const filteredCases = statusFilter === 'all' ? cases : cases.filter((c) => c.status === statusFilter)

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-gray-900">Cases</h1>
          {!loading && <span className="text-xs text-gray-400">{filteredCases.length}</span>}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CaseStatus | 'all')}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-600 ml-auto"
        >
          <option value="all">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filteredCases.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-24">No cases found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
              <tr>
                {['Case #', 'Agent', 'Lead Client', 'Status', 'Members', 'Travel Period', 'Settlement', 'Total (USD)'].map(h => (
                  <th key={h} className="py-3 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((c) => {
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
                    <td className="py-3.5 px-4">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[c.status]}`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </td>
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
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
