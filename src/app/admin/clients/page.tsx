'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getMissingClientFields, CLIENT_INFO_COLUMNS, type ClientInfo } from '@/lib/clientCompleteness'

type AgentRef = { id: string; name: string; agent_number: string | null }

type ClientRow = ClientInfo & {
  id: string
  client_number: string | null
  nationality: string | null
  gender: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  created_at: string
  agents: AgentRef | AgentRef[] | null
  case_members: { case_id: string }[]
}

function pickAgent(a: AgentRef | AgentRef[] | null | undefined): AgentRef | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

export default function AdminClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [agentFilter, setAgentFilter] = useState('')

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('clients')
      .select(`
        id, client_number, nationality, gender, date_of_birth, phone, email, created_at,
        ${CLIENT_INFO_COLUMNS},
        agents!clients_agent_id_fkey(id, name, agent_number),
        case_members(case_id)
      `)
      .order('created_at', { ascending: false })
    setClients((data as unknown as ClientRow[]) ?? [])
  }, [])

  useEffect(() => {
    async function init() { await fetchData(); setLoading(false) }
    init()
  }, [fetchData])

  const agents = Array.from(
    new Map(
      clients.map(c => { const a = pickAgent(c.agents); return a ? [a.id, a] : null })
        .filter((x): x is [string, AgentRef] => x !== null)
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

  const filtered = clients.filter(c => {
    if (agentFilter && pickAgent(c.agents)?.id !== agentFilter) return false
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      const name = (c as unknown as { name?: string }).name?.toLowerCase() ?? ''
      const num = (c.client_number ?? '').toLowerCase()
      const nat = (c.nationality ?? '').toLowerCase()
      if (!name.includes(q) && !num.includes(q) && !nat.includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-base font-semibold text-gray-900">Clients</h1>
        {!loading && <span className="text-xs text-gray-400">{filtered.length}{filtered.length !== clients.length ? ` of ${clients.length}` : ''}</span>}

        <div className="ml-auto flex items-center gap-2">
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search name / #"
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 w-48 text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#0f4c35]">
            <option value="">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-16">No clients match the filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
              <tr>
                {['Client #', 'Name', 'Nationality', 'Gender', 'DOB', 'Agent', 'Cases', 'Info', 'Registered'].map((h, i) => (
                  <th key={h} className={`py-3 px-4 text-xs font-medium text-gray-400 text-left ${i === 6 ? 'text-center' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const client = c as unknown as ClientInfo & { name?: string }
                const missing = getMissingClientFields(client)
                const a = pickAgent(c.agents)
                return (
                  <tr key={c.id}
                    onClick={(e) => {
                      // don't hijack clicks on the agent name
                      if ((e.target as HTMLElement).closest('button')) return
                      router.push(`/admin/clients/${c.id}`)
                    }}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-400">{c.client_number ?? '—'}</td>
                    <td className="py-3.5 px-4 font-medium text-gray-900">{client.name ?? '—'}</td>
                    <td className="py-3.5 px-4 text-gray-600">{c.nationality ?? '—'}</td>
                    <td className="py-3.5 px-4 text-gray-500 capitalize">{c.gender ?? '—'}</td>
                    <td className="py-3.5 px-4 text-xs text-gray-500">{c.date_of_birth ?? '—'}</td>
                    <td className="py-3.5 px-4 text-xs">
                      {a ? (
                        <button onClick={() => router.push(`/admin/agents/${a.id}`)}
                          className="text-[#0f4c35] font-medium hover:underline">
                          {a.name}
                        </button>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 text-center">{c.case_members?.length ?? 0}</td>
                    <td className="py-3.5 px-4">
                      {missing.length === 0
                        ? <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">Complete</span>
                        : <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">{missing.length} missing</span>}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-500">{c.created_at.slice(0, 10)}</td>
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
