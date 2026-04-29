'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DOBPicker from '@/components/DOBPicker'
import {
  type DietaryType, type PrayerFrequency, type PrayerLocation,
  type PregnancyStatus, type SmokingStatus, type AlcoholStatus,
  type GenderPref, type MixedGenderPref,
  getMissingClientFields, CLIENT_INFO_COLUMNS,
} from '@/lib/clientCompleteness'
import { type CaseStatus, STATUS_LABELS, STATUS_STYLES } from '@/lib/caseStatus'
import { notifyCaseInfoChanged } from '@/lib/caseTransitions'

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

  emergency_contact_name: string | null
  emergency_contact_relation: string | null
  emergency_contact_phone: string | null
  blood_type: string | null
  allergies: string | null
  current_medications: string | null
  health_conditions: string | null
  medical_restrictions: string | null
  height_cm: number | null
  weight_kg: number | null
  pregnancy_status: PregnancyStatus | null
  smoking_status: SmokingStatus | null
  alcohol_status: AlcoholStatus | null
  preferred_language: string | null
  mobility_limitations: string | null
  same_gender_doctor: GenderPref | null
  same_gender_therapist: GenderPref | null
  mixed_gender_activities: MixedGenderPref | null
  cultural_religious_notes: string | null
  prior_aesthetic_procedures: string | null
  recent_health_checkup_notes: string | null
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

  emergency_contact_name: string
  emergency_contact_relation: string
  emergency_contact_phone: string
  blood_type: string
  allergies: string
  current_medications: string
  health_conditions: string
  medical_restrictions: string
  height_cm: string
  weight_kg: string
  pregnancy_status: PregnancyStatus | null
  smoking_status: SmokingStatus | null
  alcohol_status: AlcoholStatus | null
  preferred_language: string
  mobility_limitations: string
  same_gender_doctor: GenderPref | null
  same_gender_therapist: GenderPref | null
  mixed_gender_activities: MixedGenderPref | null
  cultural_religious_notes: string
  prior_aesthetic_procedures: string
  recent_health_checkup_notes: string
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

// ── Option constants ──────────────────────────────────────────────────────────

const DIETARY_OPTIONS: { value: DietaryType; label: string }[] = [
  { value: 'halal_certified', label: 'Halal Certified' },
  { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' },
  { value: 'pork_free', label: 'Pork Free' },
  { value: 'none', label: 'None' },
]
const PRAYER_FREQUENCY_OPTIONS: { value: PrayerFrequency; label: string }[] = [
  { value: 'all_five_daily', label: 'All 5 daily prayers' },
  { value: 'flexible', label: 'Flexible depending on travel schedule' },
  { value: 'not_applicable', label: 'Not applicable' },
]
const PRAYER_LOCATION_OPTIONS: { value: PrayerLocation; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'vehicle', label: 'Vehicle (halal-certified limousine)' },
  { value: 'external_prayer_room', label: 'External Prayer Room' },
  { value: 'mosque', label: 'Mosque' },
  { value: 'not_applicable', label: 'Not applicable' },
]
const PREGNANCY_OPTIONS: { value: PregnancyStatus; label: string }[] = [
  { value: 'none', label: 'Not pregnant' },
  { value: 'pregnant', label: 'Pregnant' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'not_applicable', label: 'Not applicable' },
]
const SMOKING_OPTIONS: { value: SmokingStatus; label: string }[] = [
  { value: 'non_smoker', label: 'Non-smoker' },
  { value: 'occasional', label: 'Occasional' },
  { value: 'regular', label: 'Regular' },
  { value: 'former', label: 'Former smoker' },
  { value: 'not_applicable', label: 'Not applicable' },
]
const ALCOHOL_OPTIONS: { value: AlcoholStatus; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'occasional', label: 'Occasional' },
  { value: 'regular', label: 'Regular' },
  { value: 'not_applicable', label: 'Not applicable' },
]
const GENDER_PREF_OPTIONS: { value: GenderPref; label: string }[] = [
  { value: 'required', label: 'Required' },
  { value: 'preferred', label: 'Preferred' },
  { value: 'no_preference', label: 'No preference' },
  { value: 'not_applicable', label: 'Not applicable' },
]
const MIXED_GENDER_OPTIONS: { value: MixedGenderPref; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'prefer_to_limit', label: 'Prefer to limit' },
  { value: 'not_comfortable', label: 'Not comfortable' },
  { value: 'not_applicable', label: 'Not applicable' },
]

function labelFor<T extends string>(opts: { value: T; label: string }[], v: T | null | undefined): string {
  if (!v) return '—'
  return opts.find(o => o.value === v)?.label ?? v
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
    emergency_contact_name: c.emergency_contact_name ?? '',
    emergency_contact_relation: c.emergency_contact_relation ?? '',
    emergency_contact_phone: c.emergency_contact_phone ?? '',
    blood_type: c.blood_type ?? '',
    allergies: c.allergies ?? '',
    current_medications: c.current_medications ?? '',
    health_conditions: c.health_conditions ?? '',
    medical_restrictions: c.medical_restrictions ?? '',
    height_cm: c.height_cm != null ? String(c.height_cm) : '',
    weight_kg: c.weight_kg != null ? String(c.weight_kg) : '',
    pregnancy_status: c.pregnancy_status,
    smoking_status: c.smoking_status,
    alcohol_status: c.alcohol_status,
    preferred_language: c.preferred_language ?? '',
    mobility_limitations: c.mobility_limitations ?? '',
    same_gender_doctor: c.same_gender_doctor,
    same_gender_therapist: c.same_gender_therapist,
    mixed_gender_activities: c.mixed_gender_activities,
    cultural_religious_notes: c.cultural_religious_notes ?? '',
    prior_aesthetic_procedures: c.prior_aesthetic_procedures ?? '',
    recent_health_checkup_notes: c.recent_health_checkup_notes ?? '',
  }
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function ViewField({ label, value, mono }: { label: string; value: string | number | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-800 ${mono ? 'font-mono' : ''} break-words`}>
        {value != null && value !== '' ? String(value) : <span className="text-gray-300">—</span>}
      </p>
    </div>
  )
}

function TextInput({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'N/A if none'}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
    </div>
  )
}

function TextAreaInput({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div className="col-span-2">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
        placeholder="N/A if none"
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] resize-none" />
    </div>
  )
}

function SelectInput<T extends string>({ label, value, onChange, options, placeholder = '— Select —' }: {
  label: string; value: T | null; onChange: (v: T | null) => void; options: { value: T; label: string }[]; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select value={value ?? ''} onChange={e => onChange((e.target.value || null) as T | null)}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
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
        .select(`${CLIENT_INFO_COLUMNS}, client_number, nationality, date_of_birth, phone, email, special_requests, created_at, prior_aesthetic_procedures, recent_health_checkup_notes`)
        .eq('id', id).single(),
      supabase.from('case_members')
        .select('is_lead, cases(id, case_number, status, travel_start_date, travel_end_date, quotes(total_price))')
        .eq('client_id', id),
    ])
    setClient(cl as unknown as Client)
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
      const height = editForm.height_cm.trim() === '' ? null : Number(editForm.height_cm)
      const weight = editForm.weight_kg.trim() === '' ? null : Number(editForm.weight_kg)
      if (height != null && (Number.isNaN(height) || height <= 0)) throw new Error('Height must be a positive number')
      if (weight != null && (Number.isNaN(weight) || weight <= 0)) throw new Error('Weight must be a positive number')

      // For male clients, auto-set pregnancy_status to not_applicable
      const pregnancy = editForm.gender === 'female' ? editForm.pregnancy_status : 'not_applicable' as PregnancyStatus

      // ── Block clearing previously-set required fields ────────────────────────
      // Once a required field is filled, it can be changed but not erased.
      // (Toggling needs_muslim_friendly off auto-clears Muslim-only fields — allowed.)
      const cleared: string[] = []
      const wasText = (v: string | null | undefined) => typeof v === 'string' && v.trim().length > 0
      const nowText = (v: string) => v.trim().length > 0
      const checkText = (label: string, oldV: string | null | undefined, newV: string) => {
        if (wasText(oldV) && !nowText(newV)) cleared.push(label)
      }
      checkText('Passport', client.passport_number, editForm.passport_number)
      checkText('Emergency Contact Name', client.emergency_contact_name, editForm.emergency_contact_name)
      checkText('Emergency Contact Relation', client.emergency_contact_relation, editForm.emergency_contact_relation)
      checkText('Emergency Contact Phone', client.emergency_contact_phone, editForm.emergency_contact_phone)
      checkText('Blood Type', client.blood_type, editForm.blood_type)
      checkText('Allergies', client.allergies, editForm.allergies)
      checkText('Current Medications', client.current_medications, editForm.current_medications)
      checkText('Health Conditions', client.health_conditions, editForm.health_conditions)
      checkText('Medical Restrictions', client.medical_restrictions, editForm.medical_restrictions)
      checkText('Preferred Language', client.preferred_language, editForm.preferred_language)
      checkText('Mobility', client.mobility_limitations, editForm.mobility_limitations)
      if (client.height_cm != null && height == null) cleared.push('Height')
      if (client.weight_kg != null && weight == null) cleared.push('Weight')
      if (client.smoking_status && !editForm.smoking_status) cleared.push('Smoking Status')
      if (client.alcohol_status && !editForm.alcohol_status) cleared.push('Alcohol Status')
      if (editForm.gender === 'female' && client.pregnancy_status && !editForm.pregnancy_status) cleared.push('Pregnancy Status')
      // Muslim-only — only enforce if the toggle is still ON (turning off intentionally clears)
      if (isMuslim && client.needs_muslim_friendly) {
        if (client.prayer_frequency && !editForm.prayer_frequency) cleared.push('Prayer Frequency')
        if (client.prayer_location && !editForm.prayer_location) cleared.push('Prayer Location')
        if (client.dietary_restriction && client.dietary_restriction !== 'none' && (!editForm.dietary_restriction || editForm.dietary_restriction === 'none')) cleared.push('Dietary Restriction')
        if (client.same_gender_doctor && !editForm.same_gender_doctor) cleared.push('Same-gender Doctor')
        if (client.same_gender_therapist && !editForm.same_gender_therapist) cleared.push('Same-gender Therapist')
        if (client.mixed_gender_activities && !editForm.mixed_gender_activities) cleared.push('Mixed-gender Activities')
        checkText('Cultural/Religious Notes', client.cultural_religious_notes, editForm.cultural_religious_notes)
      }
      if (cleared.length > 0) {
        throw new Error(`Cannot clear required fields once set: ${cleared.join(', ')}. Update the value instead.`)
      }

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
        emergency_contact_name: editForm.emergency_contact_name || null,
        emergency_contact_relation: editForm.emergency_contact_relation || null,
        emergency_contact_phone: editForm.emergency_contact_phone || null,
        blood_type: editForm.blood_type || null,
        allergies: editForm.allergies || null,
        current_medications: editForm.current_medications || null,
        health_conditions: editForm.health_conditions || null,
        medical_restrictions: editForm.medical_restrictions || null,
        height_cm: height,
        weight_kg: weight,
        pregnancy_status: pregnancy,
        smoking_status: editForm.smoking_status,
        alcohol_status: editForm.alcohol_status,
        preferred_language: editForm.preferred_language || null,
        mobility_limitations: editForm.mobility_limitations || null,
        same_gender_doctor: isMuslim ? editForm.same_gender_doctor : null,
        same_gender_therapist: isMuslim ? editForm.same_gender_therapist : null,
        mixed_gender_activities: isMuslim ? editForm.mixed_gender_activities : null,
        cultural_religious_notes: isMuslim ? (editForm.cultural_religious_notes || null) : null,
        prior_aesthetic_procedures: editForm.prior_aesthetic_procedures || null,
        recent_health_checkup_notes: editForm.recent_health_checkup_notes || null,
      }).eq('id', id)
      if (error) throw error

      // Build change summary for admin notification — categorized field labels.
      const norm = (v: string | number | null | undefined) =>
        v == null ? null : (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v)
      const diff = (label: string, oldV: unknown, newV: unknown) =>
        norm(oldV as string | number | null | undefined) !== norm(newV as string | number | null | undefined) ? label : null
      const changedFields = [
        diff('Nationality', client.nationality, editForm.nationality),
        diff('Gender', client.gender, editForm.gender),
        diff('Date of birth', client.date_of_birth, editForm.date_of_birth),
        diff('Phone', client.phone, editForm.phone),
        diff('Email', client.email, editForm.email),
        diff('Passport', client.passport_number, editForm.passport_number),
        (client.emergency_contact_name !== (editForm.emergency_contact_name || null)
          || client.emergency_contact_relation !== (editForm.emergency_contact_relation || null)
          || client.emergency_contact_phone !== (editForm.emergency_contact_phone || null)) ? 'Emergency contact' : null,
        diff('Blood type', client.blood_type, editForm.blood_type),
        diff('Allergies', client.allergies, editForm.allergies),
        diff('Medications', client.current_medications, editForm.current_medications),
        diff('Health conditions', client.health_conditions, editForm.health_conditions),
        diff('Medical restrictions', client.medical_restrictions, editForm.medical_restrictions),
        diff('Height', client.height_cm, height),
        diff('Weight', client.weight_kg, weight),
        diff('Pregnancy status', client.pregnancy_status, pregnancy),
        diff('Smoking', client.smoking_status, editForm.smoking_status),
        diff('Alcohol', client.alcohol_status, editForm.alcohol_status),
        diff('Preferred language', client.preferred_language, editForm.preferred_language),
        diff('Mobility', client.mobility_limitations, editForm.mobility_limitations),
        client.needs_muslim_friendly !== editForm.needs_muslim_friendly ? 'Muslim-friendly toggle' : null,
        (isMuslim && (
          client.dietary_restriction !== editForm.dietary_restriction
          || client.prayer_frequency !== editForm.prayer_frequency
          || client.prayer_location !== editForm.prayer_location
          || client.same_gender_doctor !== editForm.same_gender_doctor
          || client.same_gender_therapist !== editForm.same_gender_therapist
          || client.mixed_gender_activities !== editForm.mixed_gender_activities
          || (client.cultural_religious_notes ?? null) !== (editForm.cultural_religious_notes || null)
        )) ? 'Muslim preferences' : null,
        diff('Special requests', client.special_requests, editForm.special_requests),
        diff('Prior aesthetic procedures', client.prior_aesthetic_procedures, editForm.prior_aesthetic_procedures),
        diff('Recent health checkup', client.recent_health_checkup_notes, editForm.recent_health_checkup_notes),
      ].filter((x): x is string => !!x)

      // Re-evaluate every non-terminal case this client belongs to:
      // promotes if awaiting_info+complete, or sends "info updated" if past that point.
      const clientName = client.name
      const change = changedFields.length > 0
        ? { header: `Client info updated: ${clientName}`, items: changedFields }
        : undefined
      const targetCaseIds = cases
        .filter(c => c.status !== 'completed' && c.status !== 'canceled')
        .map(c => c.id)
      await Promise.all(targetCaseIds.map(cid => notifyCaseInfoChanged(cid, change)))
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

  const missing = getMissingClientFields(client)
  const isMuslim = editing ? editForm?.needs_muslim_friendly : client.needs_muslim_friendly
  const gender = editing ? editForm?.gender : client.gender

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
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                {client.needs_muslim_friendly && (
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                    Muslim Friendly
                  </span>
                )}
                {missing.length > 0 ? (
                  <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
                    Incomplete ({missing.length} missing)
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                    Info Complete
                  </span>
                )}
              </div>
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
              <button onClick={() => { setEditing(false); setSaveError('') }}
                className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            )}
          </div>

          {saveError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>}

          {/* Missing fields summary (view mode only) */}
          {!editing && missing.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1.5">Missing Info</p>
              <p className="text-xs text-amber-800">
                {missing.join(' · ')}
              </p>
              <p className="text-[11px] text-amber-700 mt-2">Schedule upload is blocked until all required fields are filled. Use &quot;N/A&quot; if a field does not apply.</p>
            </div>
          )}

          {/* ═══ VIEW MODE ═══ */}
          {!editing && (
            <>
              {/* Basic */}
              <section className="bg-gray-50 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Basic Information</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <ViewField label="Nationality" value={client.nationality} />
                  <ViewField label="Gender" value={client.gender} />
                  <ViewField label="Date of Birth" value={client.date_of_birth} />
                  <ViewField label="Passport Number *" value={client.passport_number} mono />
                  <ViewField label="Muslim" value={client.needs_muslim_friendly ? 'Yes' : 'No'} />
                </div>
              </section>

              {/* Contact */}
              <section className="bg-gray-50 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Contact</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <ViewField label="Phone" value={client.phone} />
                  <ViewField label="Email" value={client.email} />
                  <ViewField label="Preferred Language *" value={client.preferred_language} />
                </div>
              </section>

              {/* Emergency Contact */}
              <section className="bg-gray-50 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Emergency Contact *</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <ViewField label="Name" value={client.emergency_contact_name} />
                  <ViewField label="Relation" value={client.emergency_contact_relation} />
                  <ViewField label="Phone" value={client.emergency_contact_phone} />
                </div>
              </section>

              {/* Medical */}
              <section className="bg-gray-50 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Medical Information</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <ViewField label="Blood Type *" value={client.blood_type} />
                  <ViewField label="Height (cm) *" value={client.height_cm} />
                  <ViewField label="Weight (kg) *" value={client.weight_kg} />
                  <ViewField label="Mobility Limitations *" value={client.mobility_limitations} />
                  <div className="col-span-2"><ViewField label="Allergies & Adverse Reactions *" value={client.allergies} /></div>
                  <div className="col-span-2"><ViewField label="Current Medications *" value={client.current_medications} /></div>
                  <div className="col-span-2"><ViewField label="Health Conditions *" value={client.health_conditions} /></div>
                  <div className="col-span-2"><ViewField label="Medical Restrictions *" value={client.medical_restrictions} /></div>
                  <div className="col-span-2"><ViewField label="Prior Aesthetic Procedures" value={client.prior_aesthetic_procedures} /></div>
                  <div className="col-span-2"><ViewField label="Recent Health Checkup Notes" value={client.recent_health_checkup_notes} /></div>
                </div>
              </section>

              {/* Lifestyle */}
              <section className="bg-gray-50 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Lifestyle</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <ViewField label="Smoking *" value={labelFor(SMOKING_OPTIONS, client.smoking_status)} />
                  <ViewField label="Alcohol *" value={labelFor(ALCOHOL_OPTIONS, client.alcohol_status)} />
                  {gender === 'female' && (
                    <ViewField label="Pregnancy Status *" value={labelFor(PREGNANCY_OPTIONS, client.pregnancy_status)} />
                  )}
                </div>
              </section>

              {/* Muslim Preferences */}
              {isMuslim && (
                <section className="rounded-2xl p-5 border border-[#0f4c35]/15 bg-[#0f4c35]/[0.03]">
                  <h3 className="text-xs font-semibold text-[#0f4c35] uppercase tracking-wide mb-4">Muslim Preferences</h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <ViewField label="Dietary Restriction *" value={labelFor(DIETARY_OPTIONS, client.dietary_restriction)} />
                    <ViewField label="Prayer Frequency *" value={labelFor(PRAYER_FREQUENCY_OPTIONS, client.prayer_frequency)} />
                    <ViewField label="Prayer Location *" value={labelFor(PRAYER_LOCATION_OPTIONS, client.prayer_location)} />
                    <ViewField label="Same-gender Doctor *" value={labelFor(GENDER_PREF_OPTIONS, client.same_gender_doctor)} />
                    <ViewField label="Same-gender Therapist *" value={labelFor(GENDER_PREF_OPTIONS, client.same_gender_therapist)} />
                    <ViewField label="Mixed-gender Activities *" value={labelFor(MIXED_GENDER_OPTIONS, client.mixed_gender_activities)} />
                    <div className="col-span-2"><ViewField label="Cultural/Religious Notes *" value={client.cultural_religious_notes} /></div>
                  </div>
                </section>
              )}

              {/* Additional */}
              {client.special_requests && (
                <section className="bg-gray-50 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Additional Notes</h3>
                  <p className="text-sm text-gray-800 whitespace-pre-line">{client.special_requests}</p>
                </section>
              )}
            </>
          )}

          {/* ═══ EDIT MODE ═══ */}
          {editing && editForm && (
            <>
              {/* Basic */}
              <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Basic Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="Nationality" value={editForm.nationality} onChange={v => setEditForm(p => p && ({ ...p, nationality: v }))} />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Gender</label>
                    <select value={editForm.gender} onChange={e => setEditForm(p => p && ({ ...p, gender: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                    <DOBPicker value={editForm.date_of_birth} onChange={v => setEditForm(p => p && ({ ...p, date_of_birth: v }))} />
                  </div>
                  <TextInput label="Passport Number *" value={editForm.passport_number} onChange={v => setEditForm(p => p && ({ ...p, passport_number: v }))} />
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Muslim?</label>
                    <div className="flex gap-4">
                      {([true, false] as const).map((v) => (
                        <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={editForm.needs_muslim_friendly === v}
                            onChange={() => setEditForm((p) => p && ({
                              ...p,
                              needs_muslim_friendly: v,
                              ...(v ? {} : { dietary_restriction: 'none' as DietaryType, prayer_frequency: null, prayer_location: null, same_gender_doctor: null, same_gender_therapist: null, mixed_gender_activities: null, cultural_religious_notes: '' }),
                            }))}
                            className="accent-[#0f4c35]" />
                          <span className="text-sm text-gray-700">{v ? 'Yes' : 'No'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Contact */}
              <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact</h3>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="Phone" value={editForm.phone} onChange={v => setEditForm(p => p && ({ ...p, phone: v }))} />
                  <TextInput label="Email" value={editForm.email} onChange={v => setEditForm(p => p && ({ ...p, email: v }))} type="email" />
                  <TextInput label="Preferred Language *" value={editForm.preferred_language} onChange={v => setEditForm(p => p && ({ ...p, preferred_language: v }))} placeholder="e.g. English, Arabic" />
                </div>
              </section>

              {/* Emergency Contact */}
              <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Emergency Contact *</h3>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="Name" value={editForm.emergency_contact_name} onChange={v => setEditForm(p => p && ({ ...p, emergency_contact_name: v }))} />
                  <TextInput label="Relation" value={editForm.emergency_contact_relation} onChange={v => setEditForm(p => p && ({ ...p, emergency_contact_relation: v }))} placeholder="e.g. Spouse" />
                  <TextInput label="Phone" value={editForm.emergency_contact_phone} onChange={v => setEditForm(p => p && ({ ...p, emergency_contact_phone: v }))} />
                </div>
              </section>

              {/* Medical */}
              <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Medical Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="Blood Type *" value={editForm.blood_type} onChange={v => setEditForm(p => p && ({ ...p, blood_type: v }))} placeholder="e.g. A+, O-" />
                  <TextInput label="Height (cm) *" value={editForm.height_cm} onChange={v => setEditForm(p => p && ({ ...p, height_cm: v }))} type="number" />
                  <TextInput label="Weight (kg) *" value={editForm.weight_kg} onChange={v => setEditForm(p => p && ({ ...p, weight_kg: v }))} type="number" />
                  <TextInput label="Mobility Limitations *" value={editForm.mobility_limitations} onChange={v => setEditForm(p => p && ({ ...p, mobility_limitations: v }))} />
                  <TextAreaInput label="Allergies & Adverse Reactions *" value={editForm.allergies} onChange={v => setEditForm(p => p && ({ ...p, allergies: v }))} />
                  <TextAreaInput label="Current Medications *" value={editForm.current_medications} onChange={v => setEditForm(p => p && ({ ...p, current_medications: v }))} />
                  <TextAreaInput label="Health Conditions *" value={editForm.health_conditions} onChange={v => setEditForm(p => p && ({ ...p, health_conditions: v }))} />
                  <TextAreaInput label="Medical Restrictions *" value={editForm.medical_restrictions} onChange={v => setEditForm(p => p && ({ ...p, medical_restrictions: v }))} />
                  <TextAreaInput label="Prior Aesthetic Procedures (optional)" value={editForm.prior_aesthetic_procedures} onChange={v => setEditForm(p => p && ({ ...p, prior_aesthetic_procedures: v }))} />
                  <TextAreaInput label="Recent Health Checkup Notes (optional)" value={editForm.recent_health_checkup_notes} onChange={v => setEditForm(p => p && ({ ...p, recent_health_checkup_notes: v }))} />
                </div>
              </section>

              {/* Lifestyle */}
              <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Lifestyle</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SelectInput label="Smoking *" value={editForm.smoking_status} onChange={v => setEditForm(p => p && ({ ...p, smoking_status: v }))} options={SMOKING_OPTIONS} />
                  <SelectInput label="Alcohol *" value={editForm.alcohol_status} onChange={v => setEditForm(p => p && ({ ...p, alcohol_status: v }))} options={ALCOHOL_OPTIONS} />
                  {editForm.gender === 'female' && (
                    <SelectInput label="Pregnancy Status *" value={editForm.pregnancy_status} onChange={v => setEditForm(p => p && ({ ...p, pregnancy_status: v }))} options={PREGNANCY_OPTIONS} />
                  )}
                </div>
              </section>

              {/* Muslim Preferences */}
              {editForm.needs_muslim_friendly && (
                <section className="rounded-2xl p-5 space-y-3 border border-[#0f4c35]/15 bg-[#0f4c35]/[0.03]">
                  <h3 className="text-xs font-semibold text-[#0f4c35] uppercase tracking-wide">Muslim Preferences</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectInput label="Dietary Restriction *" value={editForm.dietary_restriction} onChange={v => setEditForm(p => p && ({ ...p, dietary_restriction: (v ?? 'none') as DietaryType }))} options={DIETARY_OPTIONS} />
                    <SelectInput label="Prayer Frequency *" value={editForm.prayer_frequency} onChange={v => setEditForm(p => p && ({ ...p, prayer_frequency: v }))} options={PRAYER_FREQUENCY_OPTIONS} />
                    <SelectInput label="Prayer Location *" value={editForm.prayer_location} onChange={v => setEditForm(p => p && ({ ...p, prayer_location: v }))} options={PRAYER_LOCATION_OPTIONS} />
                    <SelectInput label="Same-gender Doctor *" value={editForm.same_gender_doctor} onChange={v => setEditForm(p => p && ({ ...p, same_gender_doctor: v }))} options={GENDER_PREF_OPTIONS} />
                    <SelectInput label="Same-gender Therapist *" value={editForm.same_gender_therapist} onChange={v => setEditForm(p => p && ({ ...p, same_gender_therapist: v }))} options={GENDER_PREF_OPTIONS} />
                    <SelectInput label="Mixed-gender Activities *" value={editForm.mixed_gender_activities} onChange={v => setEditForm(p => p && ({ ...p, mixed_gender_activities: v }))} options={MIXED_GENDER_OPTIONS} />
                    <TextAreaInput label="Cultural/Religious Notes *" value={editForm.cultural_religious_notes} onChange={v => setEditForm(p => p && ({ ...p, cultural_religious_notes: v }))} />
                  </div>
                </section>
              )}

              {/* Additional */}
              <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Additional Notes</h3>
                <div className="grid grid-cols-2 gap-3">
                  <TextAreaInput label="Special Requests" value={editForm.special_requests} onChange={v => setEditForm(p => p && ({ ...p, special_requests: v }))} rows={3} />
                </div>
              </section>

              {/* Save bar (bottom) */}
              <div className="flex items-center gap-2 justify-end pt-2 border-t border-gray-200">
                <button onClick={() => { setEditing(false); setSaveError('') }} disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 text-sm font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
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
                          <span className="text-xs text-gray-400">{c.travel_start_date ?? '—'} – {c.travel_end_date ?? '—'}</span>
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
