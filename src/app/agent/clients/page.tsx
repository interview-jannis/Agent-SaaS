'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logAsCurrentUser } from '@/lib/audit'
import DOBPicker from '@/components/DOBPicker'
import { type ClientInfo, getMissingClientFields, CLIENT_INFO_COLUMNS } from '@/lib/clientCompleteness'

type DietaryType = 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'

type Client = ClientInfo & {
  client_number: string
  nationality: string | null
}

type NewClientForm = {
  name: string
  nationality: string
  gender: 'male' | 'female'
  date_of_birth: string
  phone: string
  email: string
  needs_muslim_friendly: boolean
  dietary_restriction: DietaryType
  special_requests: string
}

const DIETARY_OPTIONS: { value: DietaryType; label: string }[] = [
  { value: 'halal_certified', label: 'Halal Certified' },
  { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' },
  { value: 'pork_free', label: 'Pork Free' },
  { value: 'none', label: 'None' },
]

const DEFAULT_FORM: NewClientForm = {
  name: '', nationality: '', gender: 'male', date_of_birth: '',
  phone: '', email: '', needs_muslim_friendly: false,
  dietary_restriction: 'none',
  special_requests: '',
}

export default function AgentClientsPage() {
  const router = useRouter()
  const [agentId, setAgentId] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add client modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewClientForm>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Intake link modal
  const [showIntake, setShowIntake] = useState(false)
  const [intakeSelected, setIntakeSelected] = useState<Set<string>>(new Set())
  const [intakeGenerating, setIntakeGenerating] = useState(false)
  const [intakeLink, setIntakeLink] = useState('')
  const [intakeToken, setIntakeToken] = useState('')
  const [intakeCopied, setIntakeCopied] = useState(false)
  const [intakeSending, setIntakeSending] = useState(false)
  const [intakeSentResult, setIntakeSentResult] = useState<{ sent: number; skipped: number } | null>(null)

  async function generateIntakeLink() {
    if (intakeSelected.size === 0) return
    setIntakeGenerating(true); setIntakeLink(''); setIntakeToken(''); setIntakeSentResult(null)
    try {
      const res = await fetch('/api/intake/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: Array.from(intakeSelected), agent_id: agentId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate link.')
      setIntakeToken(data.token)
      setIntakeLink(`${window.location.origin}/intake/${data.token}`)
    } catch (e: unknown) {
      alert((e as { message?: string })?.message ?? 'Failed to generate link.')
    } finally {
      setIntakeGenerating(false)
    }
  }

  function copyIntakeLink() {
    if (!intakeLink) return
    navigator.clipboard.writeText(intakeLink).then(() => {
      setIntakeCopied(true)
      setTimeout(() => setIntakeCopied(false), 2000)
    })
  }

  async function sendIntakeEmail() {
    if (!intakeToken || intakeSelected.size === 0) return
    setIntakeSending(true); setIntakeSentResult(null)
    try {
      const res = await fetch('/api/intake/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: intakeToken, client_ids: Array.from(intakeSelected) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send.')
      setIntakeSentResult({ sent: data.sent, skipped: data.skipped })
    } catch (e: unknown) {
      alert((e as { message?: string })?.message ?? 'Failed to send email.')
    } finally {
      setIntakeSending(false)
    }
  }

  async function fetchClients(aid: string) {
    const { data } = await supabase
      .from('clients')
      .select(`client_number, nationality, ${CLIENT_INFO_COLUMNS}`)
      .eq('agent_id', aid)
      .order('created_at', { ascending: false })
    setClients((data as unknown as Client[]) ?? [])
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data: ag } = await supabase.from('agents').select('id').eq('auth_user_id', uid).single()
      const aid = ag?.id ?? ''
      setAgentId(aid)
      if (aid) await fetchClients(aid)
      setLoading(false)
    }
    load()
  }, [])

  async function handleCreate() {
    const missing: string[] = []
    if (!form.name.trim()) missing.push('Name')
    if (!form.nationality.trim()) missing.push('Nationality')
    if (!form.gender) missing.push('Gender')
    if (!form.date_of_birth) missing.push('Date of Birth')
    if (!form.phone.trim()) missing.push('Phone')
    if (!form.email.trim()) missing.push('Email')
    if (missing.length > 0) { setFormError(`Required: ${missing.join(', ')}`); return }
    if (!agentId) { setFormError('Agent profile not loaded.'); return }
    setSaving(true)
    setFormError('')
    try {
      const { data: maxCLRow } = await supabase.from('clients').select('client_number').order('client_number', { ascending: false }).limit(1).maybeSingle()
      const maxCLNum = maxCLRow?.client_number ? (parseInt(maxCLRow.client_number.replace(/\D/g, ''), 10) || 0) : 0
      const clientNumber = `#CL-${String(maxCLNum + 1).padStart(3, '0')}`
      const { data: created, error } = await supabase.from('clients').insert({
        client_number: clientNumber,
        agent_id: agentId,
        name: form.name.trim(),
        nationality: form.nationality.trim(),
        gender: form.gender,
        date_of_birth: form.date_of_birth,
        phone: form.phone.trim(),
        email: form.email.trim(),
        needs_muslim_friendly: form.needs_muslim_friendly,
        dietary_restriction: form.dietary_restriction,
        special_requests: form.special_requests || null,
      }).select('id').single()
      if (error) throw error
      await logAsCurrentUser(
        'client.created',
        { type: 'client', id: (created as { id: string } | null)?.id ?? null, label: `${form.name.trim()} · ${clientNumber}` },
        { nationality: form.nationality.trim() },
      )
      setShowModal(false)
      setForm(DEFAULT_FORM)
      await fetchClients(agentId)
    } catch (e: unknown) {
      setFormError((e as { message?: string })?.message ?? 'Failed to register client.')
    } finally {
      setSaving(false)
    }
  }

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
      <div className="shrink-0 border-b border-gray-100 px-4 md:px-6 py-3 md:py-0 md:h-14 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <h1 className="text-base font-semibold text-gray-900">Clients</h1>
          {!loading && <span className="text-xs text-gray-400">{clients.length}</span>}
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg flex-1 md:flex-none md:w-64">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="flex-1 min-w-0 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400" />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="md:ml-auto flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setIntakeSelected(new Set()); setIntakeLink(''); setShowIntake(true) }}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 flex-1 md:flex-none transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Send Intake Link
          </button>
          <button
            onClick={() => { setForm(DEFAULT_FORM); setFormError(''); setShowModal(true) }}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#0f4c35] text-white text-xs font-medium rounded-lg hover:bg-[#0a3828] flex-1 md:flex-none transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Client
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-sm text-gray-400">{search ? 'No results found.' : 'No clients yet.'}</p>
            {!search && <p className="text-xs text-gray-300 mt-1">Click &quot;Add Client&quot; to register a new client.</p>}
          </div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap tracking-tight">
            <thead className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
              <tr>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left">Client #</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left">Name</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left hidden md:table-cell">Nationality</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left hidden md:table-cell">Gender</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left hidden md:table-cell">Muslim Friendly</th>
                <th className="py-3 px-2 md:px-4 text-xs font-medium text-gray-400 text-left">Info</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const missingCount = getMissingClientFields(c).length
                return (
                  <tr key={c.id} onClick={() => router.push(`/agent/clients/${c.id}`)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="py-3 px-2 md:px-4 font-mono text-xs text-gray-400">{c.client_number}</td>
                    <td className="py-3 px-2 md:px-4 font-medium text-gray-900">{c.name}</td>
                    <td className="py-3 px-2 md:px-4 text-gray-500 hidden md:table-cell">{c.nationality ?? '—'}</td>
                    <td className="py-3 px-2 md:px-4 text-gray-500 capitalize hidden md:table-cell">{c.gender ?? '—'}</td>
                    <td className="py-3 px-2 md:px-4 hidden md:table-cell">
                      {c.needs_muslim_friendly
                        ? <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                            <span className="text-emerald-600 font-semibold">✓</span>
                            <span className="text-gray-500">Yes</span>
                          </span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                    <td className="py-3 px-2 md:px-4">
                      {missingCount === 0
                        ? <span className="inline-flex items-center gap-1 text-xs">
                            <span className="text-emerald-600 font-semibold">✓</span>
                            <span className="hidden md:inline text-gray-500">Complete</span>
                          </span>
                        : <span className="inline-flex items-center gap-1 text-xs">
                            <span className="text-amber-500 font-semibold">⋯</span>
                            <span className="text-gray-500"><span className="md:hidden">{missingCount}</span><span className="hidden md:inline">{missingCount} missing</span></span>
                          </span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">New Client</h2>
              <button onClick={() => !saving && setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nationality *</label>
                  <input value={form.nationality} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Gender *</label>
                  <div className="flex gap-3 pt-1">
                    {(['male', 'female'] as const).map(g => (
                      <label key={g} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={form.gender === g}
                          onChange={() => setForm(p => ({ ...p, gender: g }))}
                          className="accent-[#0f4c35]" />
                        <span className="text-sm text-gray-700 capitalize">{g}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date of Birth *</label>
                  <DOBPicker value={form.date_of_birth} onChange={v => setForm(p => ({ ...p, date_of_birth: v }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone *</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Muslim?</label>
                <div className="flex gap-4">
                  {([true, false] as const).map(v => (
                    <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={form.needs_muslim_friendly === v}
                        onChange={() => setForm(p => ({
                          ...p,
                          needs_muslim_friendly: v,
                          ...(v ? {} : { dietary_restriction: 'none' as DietaryType }),
                        }))}
                        className="accent-[#0f4c35]" />
                      <span className="text-sm text-gray-700">{v ? 'Yes' : 'No'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {form.needs_muslim_friendly && (
                <div className="space-y-3 rounded-xl border border-[#0f4c35]/15 bg-[#0f4c35]/[0.03] p-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dietary Restriction</label>
                    <select value={form.dietary_restriction}
                      onChange={e => setForm(p => ({ ...p, dietary_restriction: e.target.value as DietaryType }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white">
                      {DIETARY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-500">Prayer preferences, medical info, and other details can be added on the client&apos;s detail page.</p>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Special Requests</label>
                <textarea value={form.special_requests}
                  onChange={e => setForm(p => ({ ...p, special_requests: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] resize-none" />
              </div>

              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>

            <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
              <button onClick={() => !saving && setShowModal(false)}
                className="px-4 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="px-4 py-1.5 text-sm bg-[#0f4c35] text-white font-medium rounded-lg hover:bg-[#0a3828] disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Register Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Intake Link Modal */}
      {showIntake && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { if (!intakeGenerating) { setShowIntake(false); setIntakeLink('') } }}>
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Send Intake Link</h3>
              <p className="text-xs text-gray-500 mt-0.5">Select clients — they&apos;ll all be accessible from one shared link.</p>
            </div>

            <div className="p-5 space-y-1.5 max-h-64 overflow-y-auto">
              {clients.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No clients yet.</p>
              ) : clients.map(c => {
                const checked = intakeSelected.has(c.id)
                return (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={checked}
                      onChange={() => setIntakeSelected(prev => {
                        const next = new Set(prev)
                        checked ? next.delete(c.id) : next.add(c.id)
                        return next
                      })}
                      className="accent-[#0f4c35] w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                      <p className="text-[10px] font-mono text-gray-400">{c.client_number}</p>
                    </div>
                  </label>
                )
              })}
            </div>

            {intakeLink && (
              <div className="px-5 pb-3 space-y-2">
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-gray-600 flex-1 truncate font-mono">{intakeLink}</p>
                  <button onClick={copyIntakeLink}
                    className={`shrink-0 transition-colors ${intakeCopied ? 'text-[#0f4c35]' : 'text-gray-400 hover:text-[#0f4c35]'}`}>
                    {intakeCopied
                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    }
                  </button>
                </div>
                <button onClick={sendIntakeEmail} disabled={intakeSending}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#0f4c35] text-[#0f4c35] rounded-xl hover:bg-[#0f4c35]/5 disabled:opacity-40 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  {intakeSending ? 'Sending…' : 'Send via Email'}
                </button>
                {intakeSentResult && (
                  <p className="text-xs text-center text-gray-500">
                    {intakeSentResult.sent > 0 && <span className="text-[#0f4c35] font-medium">Sent to {intakeSentResult.sent} client{intakeSentResult.sent > 1 ? 's' : ''}.</span>}
                    {intakeSentResult.skipped > 0 && <span className="text-gray-400"> {intakeSentResult.skipped} skipped (no email).</span>}
                  </p>
                )}
              </div>
            )}

            <div className="px-5 pb-5 flex items-center justify-end gap-2">
              <button onClick={() => { setShowIntake(false); setIntakeLink(''); setIntakeToken(''); setIntakeSentResult(null) }} disabled={intakeGenerating}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Cancel</button>
              <button onClick={generateIntakeLink}
                disabled={intakeSelected.size === 0 || intakeGenerating}
                className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                {intakeGenerating ? 'Generating…' : intakeLink ? 'Regenerate Link' : 'Generate Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
