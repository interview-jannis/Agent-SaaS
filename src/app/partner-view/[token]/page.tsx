'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Client = {
  id: string
  name: string
  client_number: string | null
  nationality: string | null
  gender: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  passport_number: string | null
  needs_muslim_friendly: boolean
  dietary_restriction: string | null
  prayer_frequency: string | null
  prayer_location: string | null
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
  pregnancy_status: string | null
  smoking_status: string | null
  alcohol_status: string | null
  preferred_language: string | null
  mobility_limitations: string | null
  same_gender_doctor: string | null
  same_gender_therapist: string | null
  mixed_gender_activities: string | null
  cultural_religious_notes: string | null
  prior_aesthetic_procedures: string | null
  recent_health_checkup_notes: string | null
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
      <p className="text-xs text-gray-400 w-44 shrink-0 pt-0.5">{label}</p>
      <p className="text-sm text-gray-800 flex-1">{String(value)}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-5 py-2">{children}</div>
    </div>
  )
}

export default function PartnerViewPage() {
  const { token } = useParams<{ token: string }>()
  const [clients, setClients] = useState<Client[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    fetch(`/api/intake/${token}`)
      .then(r => r.json())
      .then(data => {
        if (!data.clients || data.clients.length === 0) { setInvalid(true); return }
        setClients(data.clients)
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  )

  if (invalid) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-400">This link is no longer valid.</p>
    </div>
  )

  const c = clients[activeIdx]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-base font-bold tracking-tight text-[#0f4c35]">TIKKTAKK</span>
          <span className="ml-3 text-xs text-gray-400">Client Information</span>
        </div>
        <span className="text-[10px] text-gray-300 uppercase tracking-widest">Read only</span>
      </div>

      {/* Client tabs */}
      {clients.length > 1 && (
        <div className="bg-white border-b border-gray-100 px-6 flex gap-1 overflow-x-auto">
          {clients.map((cl, i) => (
            <button key={cl.id} onClick={() => setActiveIdx(i)}
              className={`shrink-0 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                i === activeIdx
                  ? 'border-[#0f4c35] text-[#0f4c35]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {cl.name}
            </button>
          ))}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Name + number */}
        <div className="bg-[#0f4c35] rounded-2xl px-6 py-5">
          <p className="text-white/60 text-xs mb-1">{c.client_number ?? ''}</p>
          <p className="text-white text-xl font-semibold">{c.name}</p>
          {c.nationality && <p className="text-white/70 text-sm mt-0.5">{c.nationality}</p>}
        </div>

        {/* Basic info */}
        <Section title="Basic Information">
          <Row label="Gender" value={c.gender} />
          <Row label="Date of Birth" value={c.date_of_birth} />
          <Row label="Phone" value={c.phone} />
          <Row label="Email" value={c.email} />
          <Row label="Passport Number" value={c.passport_number} />
          <Row label="Preferred Language" value={c.preferred_language} />
        </Section>

        {/* Emergency contact */}
        {(c.emergency_contact_name || c.emergency_contact_phone) && (
          <Section title="Emergency Contact">
            <Row label="Name" value={c.emergency_contact_name} />
            <Row label="Relation" value={c.emergency_contact_relation} />
            <Row label="Phone" value={c.emergency_contact_phone} />
          </Section>
        )}

        {/* Health */}
        <Section title="Health & Medical">
          <Row label="Blood Type" value={c.blood_type} />
          <Row label="Height" value={c.height_cm != null ? `${c.height_cm} cm` : null} />
          <Row label="Weight" value={c.weight_kg != null ? `${c.weight_kg} kg` : null} />
          <Row label="Allergies" value={c.allergies} />
          <Row label="Current Medications" value={c.current_medications} />
          <Row label="Health Conditions" value={c.health_conditions} />
          <Row label="Medical Restrictions" value={c.medical_restrictions} />
          <Row label="Mobility Limitations" value={c.mobility_limitations} />
          <Row label="Pregnancy Status" value={c.pregnancy_status} />
          <Row label="Smoking" value={c.smoking_status} />
          <Row label="Alcohol" value={c.alcohol_status} />
        </Section>

        {/* Muslim preferences */}
        {c.needs_muslim_friendly && (
          <Section title="Muslim Preferences">
            <Row label="Dietary Restriction" value={c.dietary_restriction} />
            <Row label="Prayer Frequency" value={c.prayer_frequency} />
            <Row label="Prayer Location" value={c.prayer_location} />
            <Row label="Same-gender Doctor" value={c.same_gender_doctor} />
            <Row label="Same-gender Therapist" value={c.same_gender_therapist} />
            <Row label="Mixed-gender Activities" value={c.mixed_gender_activities} />
            <Row label="Cultural / Religious Notes" value={c.cultural_religious_notes} />
          </Section>
        )}

        {/* Aesthetic & notes */}
        {(c.prior_aesthetic_procedures || c.recent_health_checkup_notes || c.special_requests) && (
          <Section title="Additional Notes">
            <Row label="Prior Aesthetic Procedures" value={c.prior_aesthetic_procedures} />
            <Row label="Recent Health Checkup" value={c.recent_health_checkup_notes} />
            <Row label="Special Requests" value={c.special_requests} />
          </Section>
        )}

      </div>

      <div className="text-center py-8">
        <p className="text-[10px] text-gray-300">Shared by TIKKTAKK · Confidential</p>
      </div>
    </div>
  )
}
