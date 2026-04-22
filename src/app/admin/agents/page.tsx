'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Agent = {
  id: string
  agent_number: string | null
  name: string
  email: string | null
  country: string | null
  margin_rate: number | null
  monthly_completed: number | null
  is_active: boolean
  created_at: string
}

type CaseRow = {
  id: string
  agent_id: string
  status: string
  quotes: { total_price: number; agent_margin_rate: number }[]
}

type ClientRow = { id: string; agent_id: string }

type SettlementRow = { id: string; agent_id: string; case_id: string | null; amount: number }

function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function commissionKrw(totalKrw: number, margin: number): number {
  if (!margin || margin <= 0) return 0
  return Math.round(totalKrw * margin / (1 + margin))
}

export default function AdminAgentsPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [cases, setCases] = useState<CaseRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [settlements, setSettlements] = useState<SettlementRow[]>([])
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  useEffect(() => {
    async function init() {
      const [agentsRes, casesRes, clientsRes, settlementsRes, rateRes] = await Promise.all([
        supabase.from('agents')
          .select('id, agent_number, name, email, country, margin_rate, monthly_completed, is_active, created_at')
          .order('created_at', { ascending: false }),
        supabase.from('cases').select('id, agent_id, status, quotes(total_price, agent_margin_rate)'),
        supabase.from('clients').select('id, agent_id'),
        supabase.from('settlements').select('id, agent_id, case_id, amount'),
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
      ])
      setAgents((agentsRes.data as Agent[]) ?? [])
      setCases((casesRes.data as unknown as CaseRow[]) ?? [])
      setClients((clientsRes.data as ClientRow[]) ?? [])
      setSettlements((settlementsRes.data as SettlementRow[]) ?? [])
      const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (r) setExchangeRate(r)
      setLoading(false)
    }
    init()
  }, [])

  // Per-agent aggregates
  const agentMetrics = new Map<string, { cases: number; clients: number; unsettledKrw: number }>()
  for (const a of agents) agentMetrics.set(a.id, { cases: 0, clients: 0, unsettledKrw: 0 })
  for (const c of cases) {
    const m = agentMetrics.get(c.agent_id)
    if (m) m.cases++
  }
  for (const cl of clients) {
    const m = agentMetrics.get(cl.agent_id)
    if (m) m.clients++
  }
  const settledCaseIds = new Set(settlements.filter(s => s.case_id).map(s => s.case_id!))
  for (const c of cases) {
    if (c.status !== 'travel_completed') continue
    if (settledCaseIds.has(c.id)) continue
    const q = c.quotes?.[0]
    if (!q) continue
    const m = agentMetrics.get(c.agent_id)
    if (m) m.unsettledKrw += commissionKrw(q.total_price, q.agent_margin_rate)
  }

  const filtered = agents.filter(a => {
    if (statusFilter === 'active' && !a.is_active) return false
    if (statusFilter === 'inactive' && a.is_active) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (a.name?.toLowerCase().includes(q) || a.agent_number?.toLowerCase().includes(q) || a.country?.toLowerCase().includes(q))
  })

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-gray-900">Agents</h1>
          {!loading && <span className="text-xs text-gray-400">{filtered.length}</span>}
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg w-64">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-600 ml-auto">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-24">{search ? 'No results.' : 'No agents yet.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
              <tr>
                {['Agent #', 'Name', 'Country', 'Margin', 'Cases', 'Clients', 'Unsettled', 'Status'].map(h => (
                  <th key={h} className="py-3 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const m = agentMetrics.get(a.id) ?? { cases: 0, clients: 0, unsettledKrw: 0 }
                return (
                  <tr key={a.id} onClick={() => router.push(`/admin/agents/${a.id}`)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-400">{a.agent_number ?? '—'}</td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-gray-900">{a.name}</p>
                      <p className="text-[10px] text-gray-400">{a.email ?? ''}</p>
                    </td>
                    <td className="py-3.5 px-4 text-gray-500">{a.country ?? '—'}</td>
                    <td className="py-3.5 px-4 text-gray-700">{a.margin_rate != null ? `${(a.margin_rate * 100).toFixed(0)}%` : '—'}</td>
                    <td className="py-3.5 px-4 text-gray-500 text-center">{m.cases}</td>
                    <td className="py-3.5 px-4 text-gray-500 text-center">{m.clients}</td>
                    <td className="py-3.5 px-4 font-medium text-gray-900">{fmtUSD(m.unsettledKrw / exchangeRate)}</td>
                    <td className="py-3.5 px-4">
                      {a.is_active
                        ? <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">Active</span>
                        : <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200">Inactive</span>
                      }
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
