'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import DOBPicker from '@/components/DOBPicker'
import { supabase } from '@/lib/supabase'
import { COUNTRIES } from '@/lib/countries'

// ── Types ─────────────────────────────────────────────────────────────────────

type DietaryType = 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'
type PrayerFrequency = 'all_five_daily' | 'flexible' | 'not_applicable'
type PrayerLocation = 'hotel' | 'vehicle' | 'external_prayer_room' | 'mosque' | 'not_applicable'
type PregnancyStatus = 'not_applicable' | 'none' | 'pregnant' | 'unknown'
type SmokingStatus = 'non_smoker' | 'occasional' | 'regular' | 'former' | 'not_applicable'
type AlcoholStatus = 'none' | 'occasional' | 'regular' | 'not_applicable'
type GenderPref = 'required' | 'preferred' | 'no_preference' | 'not_applicable'
type MixedGenderPref = 'comfortable' | 'prefer_to_limit' | 'not_comfortable' | 'not_applicable'

type ClientData = {
  id: string
  name: string
  client_number: string
  nationality: string | null
  gender: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  passport_image_url: string | null
  needs_muslim_friendly: boolean
  dietary_restriction: DietaryType | null
  prayer_frequency: PrayerFrequency | null
  prayer_location: PrayerLocation | null
  special_requests: string | null
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

type FormState = {
  nationality: string; gender: string; date_of_birth: string
  phone: string; email: string; passport_image_url: string
  needs_muslim_friendly: boolean
  dietary_restriction: DietaryType; prayer_frequency: PrayerFrequency | null; prayer_location: PrayerLocation | null
  special_requests: string
  emergency_contact_name: string; emergency_contact_relation: string; emergency_contact_phone: string
  blood_type: string; allergies: string; current_medications: string
  health_conditions: string; medical_restrictions: string
  height_cm: string; weight_kg: string
  pregnancy_status: PregnancyStatus | null; smoking_status: SmokingStatus | null; alcohol_status: AlcoholStatus | null
  preferred_language: string; mobility_limitations: string
  same_gender_doctor: GenderPref | null; same_gender_therapist: GenderPref | null
  mixed_gender_activities: MixedGenderPref | null; cultural_religious_notes: string
  prior_aesthetic_procedures: string; recent_health_checkup_notes: string
}

// ── Options ───────────────────────────────────────────────────────────────────

const DIETARY_OPTIONS: { value: DietaryType; label: string }[] = [
  { value: 'halal_certified', label: 'Halal Certified' }, { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' }, { value: 'pork_free', label: 'Pork Free' },
  { value: 'none', label: 'None' },
]
const PRAYER_FREQUENCY_OPTIONS: { value: PrayerFrequency; label: string }[] = [
  { value: 'all_five_daily', label: 'All 5 daily prayers' },
  { value: 'flexible', label: 'Flexible depending on travel schedule' },
  { value: 'not_applicable', label: 'Not applicable' },
]
const PRAYER_LOCATION_OPTIONS: { value: PrayerLocation; label: string }[] = [
  { value: 'hotel', label: 'Hotel' }, { value: 'vehicle', label: 'Vehicle (halal-certified limousine)' },
  { value: 'external_prayer_room', label: 'External Prayer Room' },
  { value: 'mosque', label: 'Mosque' }, { value: 'not_applicable', label: 'Not applicable' },
]
const PREGNANCY_OPTIONS: { value: PregnancyStatus; label: string }[] = [
  { value: 'none', label: 'Not pregnant' }, { value: 'pregnant', label: 'Pregnant' },
  { value: 'unknown', label: 'Unknown' }, { value: 'not_applicable', label: 'Not applicable' },
]
const SMOKING_OPTIONS: { value: SmokingStatus; label: string }[] = [
  { value: 'non_smoker', label: 'Non-smoker' }, { value: 'occasional', label: 'Occasional' },
  { value: 'regular', label: 'Regular' }, { value: 'former', label: 'Former smoker' },
  { value: 'not_applicable', label: 'Not applicable' },
]
const ALCOHOL_OPTIONS: { value: AlcoholStatus; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'occasional', label: 'Occasional' },
  { value: 'regular', label: 'Regular' }, { value: 'not_applicable', label: 'Not applicable' },
]
const GENDER_PREF_OPTIONS: { value: GenderPref; label: string }[] = [
  { value: 'required', label: 'Required' }, { value: 'preferred', label: 'Preferred' },
  { value: 'no_preference', label: 'No preference' }, { value: 'not_applicable', label: 'Not applicable' },
]
const MIXED_GENDER_OPTIONS: { value: MixedGenderPref; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' }, { value: 'prefer_to_limit', label: 'Prefer to limit' },
  { value: 'not_comfortable', label: 'Not comfortable' }, { value: 'not_applicable', label: 'Not applicable' },
]

// ── UI helpers ────────────────────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white'
const inputErrCls = 'w-full border border-red-400 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-red-500 bg-white'

function Field({ label, required, colSpan, id, children }: { label: string; required?: boolean; colSpan?: boolean; id?: string; children: React.ReactNode }) {
  return (
    <div id={id} className={colSpan ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function TI({ label, value, onChange, type = 'text', placeholder, required, error, fieldId }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean; error?: string; fieldId?: string
}) {
  return (
    <Field label={label} required={required} id={fieldId}>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'N/A if none'} className={error ? inputErrCls : inputCls} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </Field>
  )
}

function TA({ label, value, onChange, rows = 2, required, error, fieldId }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; required?: boolean; error?: string; fieldId?: string
}) {
  return (
    <Field label={label} required={required} colSpan id={fieldId}>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
        placeholder="N/A if none" className={`${error ? inputErrCls : inputCls} resize-none`} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </Field>
  )
}

function SI<T extends string>({ label, value, onChange, options, required, error, fieldId }: {
  label: string; value: T | null; onChange: (v: T | null) => void; options: { value: T; label: string }[]; required?: boolean; error?: string; fieldId?: string
}) {
  return (
    <Field label={label} required={required} id={fieldId}>
      <select value={value ?? ''} onChange={e => onChange((e.target.value || null) as T | null)} className={error ? inputErrCls : inputCls}>
        <option value="">— Select —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </Field>
  )
}

function Section({ title, green, children }: { title: string; green?: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl p-5 space-y-4 ${green ? 'border border-[#0f4c35]/15 bg-[#0f4c35]/[0.03]' : 'bg-gray-50'}`}>
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${green ? 'text-[#0f4c35]' : 'text-gray-400'}`}>{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </section>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toForm(c: ClientData): FormState {
  return {
    nationality: c.nationality ?? '', gender: c.gender ?? 'male',
    date_of_birth: c.date_of_birth ?? '', phone: c.phone ?? '',
    email: c.email ?? '', passport_image_url: c.passport_image_url ?? '',
    needs_muslim_friendly: c.needs_muslim_friendly,
    dietary_restriction: c.dietary_restriction ?? 'none',
    prayer_frequency: c.prayer_frequency, prayer_location: c.prayer_location,
    special_requests: c.special_requests ?? '',
    emergency_contact_name: c.emergency_contact_name ?? '',
    emergency_contact_relation: c.emergency_contact_relation ?? '',
    emergency_contact_phone: c.emergency_contact_phone ?? '',
    blood_type: c.blood_type ?? '', allergies: c.allergies ?? '',
    current_medications: c.current_medications ?? '',
    health_conditions: c.health_conditions ?? '',
    medical_restrictions: c.medical_restrictions ?? '',
    height_cm: c.height_cm != null ? String(c.height_cm) : '',
    weight_kg: c.weight_kg != null ? String(c.weight_kg) : '',
    pregnancy_status: c.pregnancy_status, smoking_status: c.smoking_status,
    alcohol_status: c.alcohol_status, preferred_language: c.preferred_language ?? '',
    mobility_limitations: c.mobility_limitations ?? '',
    same_gender_doctor: c.same_gender_doctor, same_gender_therapist: c.same_gender_therapist,
    mixed_gender_activities: c.mixed_gender_activities,
    cultural_religious_notes: c.cultural_religious_notes ?? '',
    prior_aesthetic_procedures: c.prior_aesthetic_procedures ?? '',
    recent_health_checkup_notes: c.recent_health_checkup_notes ?? '',
  }
}

// ── Client form (single person) ───────────────────────────────────────────────

function validateIntakeForm(form: FormState): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!form.preferred_language.trim()) errs.preferred_language = 'Required'
  if (!form.emergency_contact_name.trim()) errs.emergency_contact_name = 'Required'
  if (!form.emergency_contact_relation.trim()) errs.emergency_contact_relation = 'Required'
  if (!form.emergency_contact_phone.trim()) errs.emergency_contact_phone = 'Required'
  if (!form.blood_type.trim()) errs.blood_type = 'Required'
  if (!form.height_cm.trim()) errs.height_cm = 'Required'
  if (!form.weight_kg.trim()) errs.weight_kg = 'Required'
  if (!form.mobility_limitations.trim()) errs.mobility_limitations = 'Required'
  if (!form.allergies.trim()) errs.allergies = 'Required'
  if (!form.current_medications.trim()) errs.current_medications = 'Required'
  if (!form.health_conditions.trim()) errs.health_conditions = 'Required'
  if (!form.medical_restrictions.trim()) errs.medical_restrictions = 'Required'
  if (!form.smoking_status) errs.smoking_status = 'Required'
  if (!form.alcohol_status) errs.alcohol_status = 'Required'
  if (form.gender === 'female' && !form.pregnancy_status) errs.pregnancy_status = 'Required'
  if (form.needs_muslim_friendly) {
    if (!form.prayer_frequency) errs.prayer_frequency = 'Required'
    if (!form.prayer_location) errs.prayer_location = 'Required'
    if (!form.same_gender_doctor) errs.same_gender_doctor = 'Required'
    if (!form.same_gender_therapist) errs.same_gender_therapist = 'Required'
    if (!form.mixed_gender_activities) errs.mixed_gender_activities = 'Required'
    if (!form.cultural_religious_notes.trim()) errs.cultural_religious_notes = 'Required'
  }
  return errs
}

function ClientForm({ token, client, onSaved }: {
  token: string
  client: ClientData
  onSaved: (updated: ClientData) => void
}) {
  const [form, setForm] = useState<FormState>(() => toForm(client))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [passportUploading, setPassportUploading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Reset form when client changes (tab switch)
  useEffect(() => { setForm(toForm(client)); setError(''); setSaved(false); setFieldErrors({}) }, [client.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(p => ({ ...p, [key]: value }))
    setSaved(false)
    setFieldErrors(p => { const n = {...p}; delete n[key as string]; return n })
  }

  async function handleSave() {
    const errs = validateIntakeForm(form)
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      const firstKey = Object.keys(errs)[0]
      document.getElementById(`ifield-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setFieldErrors({})
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch(`/api/intake/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, client_id: client.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to save.')
      // Refresh this client's data
      const refreshRes = await fetch(`/api/intake/${token}`)
      if (refreshRes.ok) {
        const { clients } = await refreshRes.json()
        const updated = (clients as ClientData[]).find(c => c.id === client.id)
        if (updated) { onSaved(updated); setForm(toForm(updated)) }
      }
      setSaved(true)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const isMuslim = form.needs_muslim_friendly

  return (
    <div className="space-y-5">
      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 font-medium">
          Saved successfully.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <Section title="Basic Information">
        <Field label="Nationality">
          <select value={form.nationality} onChange={e => set('nationality', e.target.value)}
            className={`${inputCls} ${!form.nationality ? 'text-gray-400' : ''}`}>
            <option value="">Select country...</option>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Gender">
          <select value={form.gender} onChange={e => set('gender', e.target.value)} className={inputCls}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </Field>
        <Field label="Date of Birth">
          <DOBPicker value={form.date_of_birth} onChange={v => set('date_of_birth', v)} />
        </Field>
        <Field label="Passport Copy" required colSpan>
          <label className={`flex flex-col items-center justify-center gap-1.5 w-full rounded-lg border-2 border-dashed px-3 py-4 cursor-pointer transition-colors ${passportUploading ? 'opacity-50 pointer-events-none' : 'hover:border-[#0f4c35] hover:bg-green-50'} ${form.passport_image_url ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
            <input type="file" accept="image/*,application/pdf" className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0]
                if (!file) return
                setPassportUploading(true)
                setError('')
                const rawExt = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'jpg'
                const ext = rawExt === 'heic' ? 'jpg' : rawExt
                const path = `${client.id}/passport.${ext}`
                const { error: uploadError } = await supabase.storage.from('client-passports').upload(path, file, { upsert: true })
                if (uploadError) {
                  setError(`Upload failed: ${uploadError.message}`)
                } else {
                  const { data: { publicUrl } } = supabase.storage.from('client-passports').getPublicUrl(path)
                  set('passport_image_url', publicUrl)
                }
                setPassportUploading(false)
              }} />
            {passportUploading ? (
              <span className="text-sm text-gray-400">Uploading…</span>
            ) : form.passport_image_url ? (
              form.passport_image_url.toLowerCase().includes('.pdf') ? (
                <div className="flex flex-col items-center gap-1.5">
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="text-xs text-green-700 font-medium">PDF uploaded — tap to replace</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 w-full">
                  <img src={form.passport_image_url} alt="Passport" className="max-h-40 max-w-full rounded-md object-contain border border-gray-200" />
                  <span className="text-xs text-green-700 font-medium">Tap to replace</span>
                </div>
              )
            ) : (
              <>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-sm text-gray-500">Tap to upload passport copy</span>
                <span className="text-xs text-gray-400">Photo or PDF accepted</span>
              </>
            )}
          </label>
        </Field>
        <div className="col-span-2">
          <Field label="Muslim?">
            <div className="flex gap-6 mt-0.5">
              {([true, false] as const).map(v => (
                <label key={String(v)} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={form.needs_muslim_friendly === v}
                    onChange={() => set('needs_muslim_friendly', v)} className="accent-[#0f4c35]" />
                  <span className="text-sm text-gray-700">{v ? 'Yes' : 'No'}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Contact">
        <TI label="Phone" value={form.phone} onChange={v => set('phone', v)} type="tel" />
        <TI label="Email" value={form.email} onChange={v => set('email', v)} type="email" />
        <TI label="Preferred Language" value={form.preferred_language} onChange={v => set('preferred_language', v)} placeholder="e.g. English, Arabic" required error={fieldErrors.preferred_language} fieldId="ifield-preferred_language" />
      </Section>

      <Section title="Emergency Contact">
        <TI label="Name" value={form.emergency_contact_name} onChange={v => set('emergency_contact_name', v)} required error={fieldErrors.emergency_contact_name} fieldId="ifield-emergency_contact_name" />
        <TI label="Relation" value={form.emergency_contact_relation} onChange={v => set('emergency_contact_relation', v)} placeholder="e.g. Spouse" required error={fieldErrors.emergency_contact_relation} fieldId="ifield-emergency_contact_relation" />
        <TI label="Phone" value={form.emergency_contact_phone} onChange={v => set('emergency_contact_phone', v)} required error={fieldErrors.emergency_contact_phone} fieldId="ifield-emergency_contact_phone" />
      </Section>

      <Section title="Medical Information">
        <TI label="Blood Type" value={form.blood_type} onChange={v => set('blood_type', v)} placeholder="e.g. A+, O-" required error={fieldErrors.blood_type} fieldId="ifield-blood_type" />
        <TI label="Height (cm)" value={form.height_cm} onChange={v => set('height_cm', v)} type="number" required error={fieldErrors.height_cm} fieldId="ifield-height_cm" />
        <TI label="Weight (kg)" value={form.weight_kg} onChange={v => set('weight_kg', v)} type="number" required error={fieldErrors.weight_kg} fieldId="ifield-weight_kg" />
        <TI label="Mobility Limitations" value={form.mobility_limitations} onChange={v => set('mobility_limitations', v)} required error={fieldErrors.mobility_limitations} fieldId="ifield-mobility_limitations" />
        <TA label="Allergies & Adverse Reactions" value={form.allergies} onChange={v => set('allergies', v)} required error={fieldErrors.allergies} fieldId="ifield-allergies" />
        <TA label="Current Medications" value={form.current_medications} onChange={v => set('current_medications', v)} required error={fieldErrors.current_medications} fieldId="ifield-current_medications" />
        <TA label="Health Conditions" value={form.health_conditions} onChange={v => set('health_conditions', v)} required error={fieldErrors.health_conditions} fieldId="ifield-health_conditions" />
        <TA label="Medical Restrictions" value={form.medical_restrictions} onChange={v => set('medical_restrictions', v)} required error={fieldErrors.medical_restrictions} fieldId="ifield-medical_restrictions" />
        <TA label="Prior Aesthetic Procedures (optional)" value={form.prior_aesthetic_procedures} onChange={v => set('prior_aesthetic_procedures', v)} />
        <TA label="Recent Health Checkup Notes (optional)" value={form.recent_health_checkup_notes} onChange={v => set('recent_health_checkup_notes', v)} />
      </Section>

      <Section title="Lifestyle">
        <SI label="Smoking" value={form.smoking_status} onChange={v => set('smoking_status', v)} options={SMOKING_OPTIONS} required error={fieldErrors.smoking_status} fieldId="ifield-smoking_status" />
        <SI label="Alcohol" value={form.alcohol_status} onChange={v => set('alcohol_status', v)} options={ALCOHOL_OPTIONS} required error={fieldErrors.alcohol_status} fieldId="ifield-alcohol_status" />
        {form.gender === 'female' && (
          <SI label="Pregnancy Status" value={form.pregnancy_status} onChange={v => set('pregnancy_status', v)} options={PREGNANCY_OPTIONS} required error={fieldErrors.pregnancy_status} fieldId="ifield-pregnancy_status" />
        )}
      </Section>

      {isMuslim && (
        <Section title="Muslim Preferences" green>
          <SI label="Dietary Restriction" value={form.dietary_restriction} onChange={v => set('dietary_restriction', (v ?? 'none') as DietaryType)} options={DIETARY_OPTIONS} required />
          <SI label="Prayer Frequency" value={form.prayer_frequency} onChange={v => set('prayer_frequency', v)} options={PRAYER_FREQUENCY_OPTIONS} required error={fieldErrors.prayer_frequency} fieldId="ifield-prayer_frequency" />
          <SI label="Prayer Location" value={form.prayer_location} onChange={v => set('prayer_location', v)} options={PRAYER_LOCATION_OPTIONS} required error={fieldErrors.prayer_location} fieldId="ifield-prayer_location" />
          <SI label="Same-gender Doctor" value={form.same_gender_doctor} onChange={v => set('same_gender_doctor', v)} options={GENDER_PREF_OPTIONS} required error={fieldErrors.same_gender_doctor} fieldId="ifield-same_gender_doctor" />
          <SI label="Same-gender Therapist" value={form.same_gender_therapist} onChange={v => set('same_gender_therapist', v)} options={GENDER_PREF_OPTIONS} required error={fieldErrors.same_gender_therapist} fieldId="ifield-same_gender_therapist" />
          <SI label="Mixed-gender Activities" value={form.mixed_gender_activities} onChange={v => set('mixed_gender_activities', v)} options={MIXED_GENDER_OPTIONS} required error={fieldErrors.mixed_gender_activities} fieldId="ifield-mixed_gender_activities" />
          <TA label="Cultural / Religious Notes" value={form.cultural_religious_notes} onChange={v => set('cultural_religious_notes', v)} required error={fieldErrors.cultural_religious_notes} fieldId="ifield-cultural_religious_notes" />
        </Section>
      )}

      <Section title="Additional Notes">
        <TA label="Special Requests" value={form.special_requests} onChange={v => set('special_requests', v)} rows={3} />
      </Section>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex justify-end pb-2">
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntakePage() {
  const { token } = useParams<{ token: string }>()
  const [clients, setClients] = useState<ClientData[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/intake/${token}`)
      if (!res.ok) { setNotFound(true); setLoading(false); return }
      const { clients: data } = await res.json()
      setClients(data ?? [])
      setLoading(false)
    }
    load()
  }, [token])

  function handleSaved(updated: ClientData) {
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (notFound || clients.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-gray-700">This link is no longer valid.</p>
          <p className="text-xs text-gray-400">Please contact your agent for a new link.</p>
        </div>
      </div>
    )
  }

  const activeClient = clients[activeIdx]

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <span className="text-base font-semibold tracking-tight text-[#0f4c35]">TikkTakk</span>
        <span className="text-gray-200">|</span>
        <span className="text-sm text-gray-500">Health & Travel Profile</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {clients.length === 1 ? `Hi, ${clients[0].name}` : 'Health & Travel Profiles'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Please fill in the information below. You can return to this page anytime to update it.
          </p>
        </div>

        {/* Tabs — only shown when multiple clients */}
        {clients.length > 1 && (
          <div className="flex gap-1 border-b border-gray-100 overflow-x-auto">
            {clients.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setActiveIdx(i)}
                className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  i === activeIdx
                    ? 'border-[#0f4c35] text-[#0f4c35]'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <ClientForm
          key={activeClient.id}
          token={token}
          client={activeClient}
          onSaved={handleSaved}
        />
      </div>
    </div>
  )
}
