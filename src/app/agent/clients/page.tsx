'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type DietaryType = 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'
type PrayerFrequency = 'strict' | 'moderate' | 'flexible'
type PrayerLocation = 'prayer_room' | 'mosque_nearby' | 'quiet_private_space' | 'any_clean_space' | 'no_preference'

type Client = {
  id: string
  client_number: string
  name: string
  nationality: string | null
  gender: string | null
  dietary_restriction: DietaryType | null
  needs_muslim_friendly: boolean
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
  prayer_frequency: PrayerFrequency | null
  prayer_location: PrayerLocation | null
  special_requests: string
}

const DIETARY_LABELS: Record<DietaryType, string> = {
  halal_certified: 'Halal Certified', halal_friendly: 'Halal Friendly',
  muslim_friendly: 'Muslim Friendly', pork_free: 'Pork Free', none: '—',
}

const DIETARY_OPTIONS: { value: DietaryType; label: string }[] = [
  { value: 'halal_certified', label: 'Halal Certified' },
  { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' },
  { value: 'pork_free', label: 'Pork Free' },
  { value: 'none', label: 'None' },
]

const PRAYER_FREQUENCY_OPTIONS: { value: PrayerFrequency; label: string }[] = [
  { value: 'strict', label: 'Strict (5 times on time)' },
  { value: 'moderate', label: 'Moderate (flexible timing)' },
  { value: 'flexible', label: 'Flexible (when possible)' },
]

const PRAYER_LOCATION_OPTIONS: { value: PrayerLocation; label: string }[] = [
  { value: 'prayer_room', label: 'Dedicated prayer room' },
  { value: 'mosque_nearby', label: 'Mosque within walking distance' },
  { value: 'quiet_private_space', label: 'Quiet private space (hotel room, etc.)' },
  { value: 'any_clean_space', label: 'Any clean space' },
  { value: 'no_preference', label: 'No preference' },
]

const DEFAULT_FORM: NewClientForm = {
  name: '', nationality: '', gender: 'male', date_of_birth: '',
  phone: '', email: '', needs_muslim_friendly: false,
  dietary_restriction: 'none', prayer_frequency: null, prayer_location: null,
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

  async function fetchClients(aid: string) {
    const { data } = await supabase
      .from('clients')
      .select('id, client_number, name, nationality, gender, dietary_restriction, needs_muslim_friendly')
      .eq('agent_id', aid)
      .order('created_at', { ascending: false })
    setClients((data as Client[]) ?? [])
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
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    if (!agentId) { setFormError('Agent profile not loaded.'); return }
    setSaving(true)
    setFormError('')
    try {
      const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true })
      const next = (count ?? 0) + 1
      const { error } = await supabase.from('clients').insert({
        client_number: `#CL-${String(next).padStart(3, '0')}`,
        agent_id: agentId,
        ...form,
      })
      if (error) throw error
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
        <button
          onClick={() => { setForm(DEFAULT_FORM); setFormError(''); setShowModal(true) }}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#0f4c35] text-white text-xs font-medium rounded-lg hover:bg-[#0a3828] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Client
        </button>
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
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
              <tr>
                {['Client #', 'Name', 'Nationality', 'Gender', 'Dietary', 'Muslim'].map(h => (
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nationality</label>
                  <input value={form.nationality} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Gender</label>
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
                  <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                  <input type="date" value={form.date_of_birth}
                    onChange={e => setForm(p => ({ ...p, date_of_birth: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
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
                          ...(v ? {} : { dietary_restriction: 'none' as DietaryType, prayer_frequency: null, prayer_location: null }),
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
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Prayer Frequency</label>
                    <select value={form.prayer_frequency ?? ''}
                      onChange={e => setForm(p => ({ ...p, prayer_frequency: (e.target.value || null) as PrayerFrequency | null }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white">
                      <option value="">— Select —</option>
                      {PRAYER_FREQUENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Prayer Location</label>
                    <select value={form.prayer_location ?? ''}
                      onChange={e => setForm(p => ({ ...p, prayer_location: (e.target.value || null) as PrayerLocation | null }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white">
                      <option value="">— Select —</option>
                      {PRAYER_LOCATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
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
    </div>
  )
}
