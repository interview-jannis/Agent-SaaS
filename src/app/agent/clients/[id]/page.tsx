'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type DietaryType = 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'
type PrayerFrequency = 'strict' | 'moderate' | 'flexible'
type PrayerLocation = 'prayer_room' | 'mosque_nearby' | 'quiet_private_space' | 'any_clean_space' | 'no_preference'
type CaseStatus = 'payment_pending' | 'payment_completed' | 'schedule_reviewed' | 'schedule_confirmed' | 'travel_completed'

type Client = {
  id: string
  client_number: string
  name: string
  nationality: string | null
  gender: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  passport_number: string | null
  needs_muslim_friendly: boolean
  dietary_restriction: DietaryType | null
  prayer_frequency: PrayerFrequency | null
  prayer_location: PrayerLocation | null
  special_requests: string | null
  created_at: string
}

type EditForm = {
  nationality: string
  gender: string
  date_of_birth: string
  phone: string
  email: string
  passport_number: string
  needs_muslim_friendly: boolean
  dietary_restriction: DietaryType
  prayer_frequency: PrayerFrequency | null
  prayer_location: PrayerLocation | null
  special_requests: string
}

type ClientCase = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  travel_end_date: string | null
  is_lead: boolean
  quotes: { total_price: number }[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DIETARY_LABELS: Record<DietaryType, string> = {
  halal_certified: 'Halal Certified', halal_friendly: 'Halal Friendly',
  muslim_friendly: 'Muslim Friendly', pork_free: 'Pork Free', none: 'None',
}
const DIETARY_OPTIONS: { value: DietaryType; label: string }[] = [
  { value: 'halal_certified', label: 'Halal Certified' }, { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' }, { value: 'pork_free', label: 'Pork Free' }, { value: 'none', label: 'None' },
]
const PRAYER_FREQUENCY_OPTIONS: { value: PrayerFrequency; label: string }[] = [
  { value: 'strict', label: 'Strict (5 times on time)' },
  { value: 'moderate', label: 'Moderate (flexible timing)' },
  { value: 'flexible', label: 'Flexible (when possible)' },
]
const PRAYER_LOCATION_OPTIONS: { value: PrayerLocation; label: string }[] = [
  { value: 'prayer_room', label: 'Dedicated prayer room' },
  { value: 'mosque_nearby', label: 'Mosque within walking distance' },
  { value: 'quiet_private_space', label: 'Quiet private space' },
  { value: 'any_clean_space', label: 'Any clean space' },
  { value: 'no_preference', label: 'No preference' },
]
const PRAYER_FREQ_LABELS: Record<PrayerFrequency, string> = Object.fromEntries(
  PRAYER_FREQUENCY_OPTIONS.map((o) => [o.value, o.label])
) as Record<PrayerFrequency, string>
const PRAYER_LOC_LABELS: Record<PrayerLocation, string> = Object.fromEntries(
  PRAYER_LOCATION_OPTIONS.map((o) => [o.value, o.label])
) as Record<PrayerLocation, string>
const STATUS_LABELS: Record<CaseStatus, string> = {
  payment_pending: 'Awaiting Payment', payment_completed: 'Payment Confirmed',
  schedule_reviewed: 'Schedule Reviewed', schedule_confirmed: 'Schedule Confirmed', travel_completed: 'Travel Completed',
}
const STATUS_STYLES: Record<CaseStatus, string> = {
  payment_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  payment_completed: 'bg-blue-50 text-blue-700 border-blue-200',
  schedule_reviewed: 'bg-violet-50 text-violet-700 border-violet-200',
  schedule_confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  travel_completed: 'bg-gray-50 text-gray-500 border-gray-200',
}

function toEditForm(c: Client): EditForm {
  return {
    nationality: c.nationality ?? '', gender: c.gender ?? 'male',
    date_of_birth: c.date_of_birth ?? '', phone: c.phone ?? '',
    email: c.email ?? '', passport_number: c.passport_number ?? '',
    needs_muslim_friendly: c.needs_muslim_friendly,
    dietary_restriction: c.dietary_restriction ?? 'none',
    prayer_frequency: c.prayer_frequency,
    prayer_location: c.prayer_location,
    special_requests: c.special_requests ?? '',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [client, setClient] = useState<Client | null>(null)
  const [cases, setCases] = useState<ClientCase[]>([])
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fetchData = useCallback(async () => {
    const [{ data: cl }, { data: cm }] = await Promise.all([
      supabase.from('clients')
        .select('id, client_number, name, nationality, gender, date_of_birth, phone, email, passport_number, needs_muslim_friendly, dietary_restriction, prayer_frequency, prayer_location, special_requests, created_at')
        .eq('id', id).single(),
      supabase.from('case_members')
        .select('is_lead, cases(id, case_number, status, travel_start_date, travel_end_date, quotes(total_price))')
        .eq('client_id', id),
    ])
    setClient(cl as Client)
    const rows = (cm as unknown as { is_lead: boolean; cases: Omit<ClientCase, 'is_lead'> }[]) ?? []
    setCases(rows.map(r => ({ ...r.cases, is_lead: r.is_lead })))
  }, [id])

  useEffect(() => {
    async function load() {
      const { data: ss } = await supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single()
      const rate = (ss?.value as { usd_krw?: number } | null)?.usd_krw
      if (typeof rate === 'number' && rate > 0) setExchangeRate(rate)
      await fetchData()
      setLoading(false)
    }
    load()
  }, [fetchData])

  async function handleSave() {
    if (!client || !editForm) return
    setSaving(true); setSaveError('')
    try {
      const isMuslim = editForm.needs_muslim_friendly
      const { error } = await supabase.from('clients').update({
        nationality: editForm.nationality || null,
        gender: editForm.gender || null,
        date_of_birth: editForm.date_of_birth || null,
        phone: editForm.phone || null,
        email: editForm.email || null,
        passport_number: editForm.passport_number || null,
        needs_muslim_friendly: editForm.needs_muslim_friendly,
        dietary_restriction: isMuslim ? editForm.dietary_restriction : 'none',
        prayer_frequency: isMuslim ? editForm.prayer_frequency : null,
        prayer_location: isMuslim ? editForm.prayer_location : null,
        special_requests: editForm.special_requests || null,
      }).eq('id', id)
      if (error) throw error
      await fetchData()
      setEditing(false)
    } catch (e: unknown) {
      setSaveError((e as { message?: string })?.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  if (!client) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Client not found.</p></div>

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-gray-100 bg-white">
        <button onClick={() => router.push('/agent/clients')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Clients
        </button>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-900">{client.name}</span>
        <span className="text-[10px] font-mono text-gray-400">{client.client_number}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              {client.needs_muslim_friendly && (
                <span className="inline-block mb-1.5 text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                  Muslim Friendly
                </span>
              )}
              <h2 className="text-xl font-semibold text-gray-900">{client.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">Registered {client.created_at.slice(0, 10)}</p>
            </div>
            {!editing ? (
              <button onClick={() => { setEditing(true); setEditForm(toEditForm(client)); setSaveError('') }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditing(false); setSaveError('') }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {saveError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>}

          {/* Personal Info — View */}
          {!editing && (
            <section className="bg-gray-50 rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Personal Information</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                {([
                  ['Nationality', client.nationality, false, false],
                  ['Gender', client.gender, true, false],
                  ['Date of Birth', client.date_of_birth, false, false],
                  ['Passport Number', client.passport_number, false, true],
                  ['Phone', client.phone, false, false],
                  ['Email', client.email, false, false],
                  ['Muslim', client.needs_muslim_friendly ? 'Yes' : 'No', false, false],
                  ...(client.needs_muslim_friendly ? [
                    ['Dietary Restriction', client.dietary_restriction ? DIETARY_LABELS[client.dietary_restriction] : null, false, false],
                    ['Prayer Frequency', client.prayer_frequency ? PRAYER_FREQ_LABELS[client.prayer_frequency] : null, false, false],
                    ['Prayer Location', client.prayer_location ? PRAYER_LOC_LABELS[client.prayer_location] : null, false, false],
                  ] : []),
                ] as [string, string | null | boolean, boolean, boolean][]).map(([label, value, cap, mono]) => (
                  <div key={String(label)}>
                    <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                    <p className={`text-gray-800 ${cap ? 'capitalize' : ''} ${mono ? 'font-mono' : ''}`}>
                      {String(value) || '—'}
                    </p>
                  </div>
                ))}
                {client.special_requests && (
                  <div className="col-span-2 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-0.5">Special Requests</p>
                    <p className="text-gray-800">{client.special_requests}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Personal Info — Edit (static fields only, no travel info) */}
          {editing && editForm && (
            <section className="bg-gray-50 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Edit Personal Information</h3>
              <div className="grid grid-cols-2 gap-3">
                {([['Nationality', 'nationality', 'text'], ['Date of Birth', 'date_of_birth', 'date'], ['Phone', 'phone', 'text'], ['Email', 'email', 'email'], ['Passport Number', 'passport_number', 'text']] as const).map(([label, field, type]) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input type={type} value={(editForm as unknown as Record<string, string>)[field]}
                      onChange={e => setEditForm(p => p && ({ ...p, [field]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Gender</label>
                  <select value={editForm.gender} onChange={e => setEditForm(p => p && ({ ...p, gender: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Muslim?</label>
                  <div className="flex gap-4">
                    {([true, false] as const).map((v) => (
                      <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={editForm.needs_muslim_friendly === v}
                          onChange={() => setEditForm((p) => p && ({
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
                {editForm.needs_muslim_friendly && (
                  <div className="col-span-2 space-y-3 rounded-xl border border-[#0f4c35]/15 bg-[#0f4c35]/[0.03] p-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Dietary Restriction</label>
                      <select value={editForm.dietary_restriction}
                        onChange={e => setEditForm(p => p && ({ ...p, dietary_restriction: e.target.value as DietaryType }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                        {DIETARY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Prayer Frequency</label>
                      <select value={editForm.prayer_frequency ?? ''}
                        onChange={e => setEditForm(p => p && ({ ...p, prayer_frequency: (e.target.value || null) as PrayerFrequency | null }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                        <option value="">— Select —</option>
                        {PRAYER_FREQUENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Prayer Location</label>
                      <select value={editForm.prayer_location ?? ''}
                        onChange={e => setEditForm(p => p && ({ ...p, prayer_location: (e.target.value || null) as PrayerLocation | null }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                        <option value="">— Select —</option>
                        {PRAYER_LOCATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Special Requests</label>
                  <textarea value={editForm.special_requests}
                    onChange={e => setEditForm(p => p && ({ ...p, special_requests: e.target.value }))}
                    rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] resize-none" />
                </div>
              </div>
            </section>
          )}

          {/* Cases */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cases ({cases.length})</h3>
            {cases.length === 0 ? (
              <div className="bg-gray-50 rounded-2xl px-5 py-8 text-center">
                <p className="text-sm text-gray-400">No cases linked to this client.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cases.map(c => {
                  const quote = c.quotes?.[0]
                  const amountUsd = quote ? quote.total_price / exchangeRate : null
                  return (
                    <button key={c.id} onClick={() => router.push(`/agent/cases/${c.id}`)}
                      className="w-full text-left flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 hover:border-gray-200 hover:bg-gray-100 transition-all">
                      <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                        <span className="text-xs font-mono text-gray-400 shrink-0">{c.case_number}</span>
                        {c.is_lead && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#0f4c35]/10 text-[#0f4c35] rounded-full font-medium shrink-0">Lead</span>
                        )}
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${STATUS_STYLES[c.status]}`}>
                          {STATUS_LABELS[c.status]}
                        </span>
                        {(c.travel_start_date || c.travel_end_date) && (
                          <span className="text-xs text-gray-400">{c.travel_start_date ?? '—'} ~ {c.travel_end_date ?? '—'}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {amountUsd !== null && (
                          <span className="text-sm font-semibold text-gray-800">${amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        )}
                        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}
