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

  // Share with Partner modal
  const [showShare, setShowShare] = useState(false)
  const [shareSelected, setShareSelected] = useState<Set<string>>(new Set())
  const [shareGenerating, setShareGenerating] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [shareToken, setShareToken] = useState('')
  const [shareCopied, setShareCopied] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [shareSending, setShareSending] = useState(false)
  const [shareSent, setShareSent] = useState(false)

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

  async function generateShareLink() {
    if (shareSelected.size === 0) return
    setShareGenerating(true); setShareLink(''); setShareToken(''); setShareSent(false)
    try {
      const res = await fetch('/api/intake/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: Array.from(shareSelected) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed.')
      setShareToken(data.token)
      setShareLink(`${window.location.origin}/partner-view/${data.token}`)
    } catch (e: unknown) {
      alert((e as { message?: string })?.message ?? 'Failed to generate link.')
    } finally {
      setShareGenerating(false)
    }
  }

  async function sendShareEmail() {
    if (!shareToken || !shareEmail.trim()) return
    setShareSending(true); setShareSent(false)
    try {
      const res = await fetch('/api/send-link-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: [shareEmail.trim()], url: shareLink, type: 'partner_view' }),
      })
      if (!res.ok) throw new Error('Failed to send.')
      setShareSent(true)
    } catch (e: unknown) {
      alert((e as { message?: string })?.message ?? 'Failed to send email.')
    } finally {
      setShareSending(false)
    }
  }

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
      <div className="shrink-0 border-b border-gray-100 px-4 md:px-6 py-3 md:py-0 md:h-14 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-gray-900">Clients</h1>
          {!loading && <span className="text-xs text-gray-400">{filtered.length}{filtered.length !== clients.length ? ` of ${clients.length}` : ''}</span>}
        </div>

        <div className="md:ml-auto flex items-center gap-2 flex-wrap">
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search name / #"
            className="flex-1 md:flex-none text-xs border border-gray-200 rounded-lg px-3 py-1.5 md:w-48 min-w-0 text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#0f4c35]">
            <option value="">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button
            onClick={() => { setShareSelected(new Set()); setShareLink(''); setShareToken(''); setShareEmail(''); setShareSent(false); setShowShare(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
            Share with Partner
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-16">No clients match the filter.</p>
        ) : (
          <table className="w-full text-sm whitespace-nowrap tracking-tight">
            <thead className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
              <tr>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left">Client #</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left">Name</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left hidden md:table-cell">Nationality</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left hidden md:table-cell">Gender</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left hidden md:table-cell">DOB</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left">Agent</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-center hidden md:table-cell">Cases</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left">Info</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left hidden md:table-cell">Registered</th>
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
                    <td className="py-3 px-2 md:px-4 font-mono text-xs text-gray-400">{c.client_number ?? '—'}</td>
                    <td className="py-3 px-2 md:px-4 font-medium text-gray-900">{client.name ?? '—'}</td>
                    <td className="py-3 px-2 md:px-4 text-gray-600 hidden md:table-cell">{c.nationality ?? '—'}</td>
                    <td className="py-3 px-2 md:px-4 text-gray-500 capitalize hidden md:table-cell">{c.gender ?? '—'}</td>
                    <td className="py-3 px-2 md:px-4 text-xs text-gray-500 hidden md:table-cell">{c.date_of_birth ?? '—'}</td>
                    <td className="py-3 px-2 md:px-4 text-xs">
                      {a ? (
                        <button onClick={() => router.push(`/admin/agents/${a.id}`)}
                          className="text-[#0f4c35] font-medium hover:underline">
                          {a.name}
                        </button>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-3 px-2 md:px-4 text-gray-500 text-center hidden md:table-cell">{c.case_members?.length ?? 0}</td>
                    <td className="py-3 px-2 md:px-4">
                      {missing.length === 0
                        ? <span className="inline-flex items-center gap-1 text-xs">
                            <span className="text-emerald-600 font-semibold">✓</span>
                            <span className="hidden md:inline text-gray-500">Complete</span>
                          </span>
                        : <span className="inline-flex items-center gap-1 text-xs">
                            <span className="text-amber-500 font-semibold">⋯</span>
                            <span className="text-gray-500"><span className="md:hidden">{missing.length}</span><span className="hidden md:inline">{missing.length} missing</span></span>
                          </span>}
                    </td>
                    <td className="py-3 px-2 md:px-4 text-xs text-gray-500 hidden md:table-cell">{c.created_at.slice(0, 10)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Share with Partner Modal */}
      {showShare && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { if (!shareGenerating && !shareSending) { setShowShare(false) } }}>
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Share with Partner</h3>
              <p className="text-xs text-gray-500 mt-0.5">Select clients — partner will see a read-only profile view.</p>
            </div>

            <div className="p-5 space-y-1.5 max-h-60 overflow-y-auto">
              {clients.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No clients.</p>
              ) : clients.map(c => {
                const client = c as unknown as { name?: string }
                const checked = shareSelected.has(c.id)
                return (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={checked}
                      onChange={() => setShareSelected(prev => {
                        const next = new Set(prev)
                        checked ? next.delete(c.id) : next.add(c.id)
                        return next
                      })}
                      className="accent-[#0f4c35] w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{client.name ?? '—'}</p>
                      <p className="text-[10px] font-mono text-gray-400">{c.client_number ?? ''}</p>
                    </div>
                  </label>
                )
              })}
            </div>

            {shareLink && (
              <div className="px-5 pb-3 space-y-2">
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-gray-600 flex-1 truncate font-mono">{shareLink}</p>
                  <button onClick={() => { navigator.clipboard.writeText(shareLink); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000) }}
                    className={`shrink-0 transition-colors ${shareCopied ? 'text-[#0f4c35]' : 'text-gray-400 hover:text-[#0f4c35]'}`}>
                    {shareCopied
                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    }
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={e => { setShareEmail(e.target.value); setShareSent(false) }}
                    placeholder="Partner's email"
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35]"
                  />
                  <button onClick={sendShareEmail} disabled={shareSending || !shareEmail.trim()}
                    className="shrink-0 px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                    {shareSent ? '✓ Sent' : shareSending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            )}

            <div className="px-5 pb-5 flex items-center justify-end gap-2">
              <button onClick={() => setShowShare(false)} disabled={shareGenerating}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Cancel</button>
              <button onClick={generateShareLink}
                disabled={shareSelected.size === 0 || shareGenerating}
                className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                {shareGenerating ? 'Generating…' : shareLink ? 'Regenerate' : 'Generate Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
