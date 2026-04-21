'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type DietaryType = 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'

type Client = {
  id: string
  client_number: string
  name: string
  nationality: string | null
  gender: string | null
  dietary_restriction: DietaryType | null
  needs_muslim_friendly: boolean
}

const DIETARY_LABELS: Record<DietaryType, string> = {
  halal_certified: 'Halal Certified', halal_friendly: 'Halal Friendly',
  muslim_friendly: 'Muslim Friendly', pork_free: 'Pork Free', none: '—',
}

export default function AgentClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data: ag } = await supabase.from('agents').select('id').eq('auth_user_id', uid).single()
      const aid = ag?.id ?? ''
      if (aid) {
        const { data } = await supabase
          .from('clients')
          .select('id, client_number, name, nationality, gender, dietary_restriction, needs_muslim_friendly')
          .eq('agent_id', aid)
          .order('created_at', { ascending: false })
        setClients((data as Client[]) ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const filtered = search.trim()
    ? clients.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.nationality?.toLowerCase().includes(search.toLowerCase()) ||
        c.client_number.toLowerCase().includes(search.toLowerCase())
      )
    : clients

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-gray-900">Clients</h1>
          {!loading && <span className="text-xs text-gray-400">{clients.length}</span>}
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg w-64">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400" />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-sm text-gray-400">{search ? 'No results found.' : 'No clients yet.'}</p>
            {!search && <p className="text-xs text-gray-300 mt-1">Clients are added when creating a case.</p>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
              <tr>
                {['Client #', 'Name', 'Nationality', 'Gender', 'Dietary', 'Muslim Friendly'].map(h => (
                  <th key={h} className="py-3 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => router.push(`/agent/clients/${c.id}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                  <td className="py-3.5 px-4 font-mono text-xs text-gray-400">{c.client_number}</td>
                  <td className="py-3.5 px-4 font-medium text-gray-900">{c.name}</td>
                  <td className="py-3.5 px-4 text-gray-500">{c.nationality ?? '—'}</td>
                  <td className="py-3.5 px-4 text-gray-500 capitalize">{c.gender ?? '—'}</td>
                  <td className="py-3.5 px-4 text-gray-500">
                    {c.dietary_restriction && c.dietary_restriction !== 'none' ? DIETARY_LABELS[c.dietary_restriction] : '—'}
                  </td>
                  <td className="py-3.5 px-4">
                    {c.needs_muslim_friendly
                      ? <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">Yes</span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
