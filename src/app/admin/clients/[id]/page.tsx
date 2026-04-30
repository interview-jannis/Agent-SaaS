'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getMissingClientFields, CLIENT_INFO_COLUMNS, type ClientInfo } from '@/lib/clientCompleteness'

type AgentRef = { id: string; name: string; agent_number: string | null }

type Client = ClientInfo & {
  id: string
  client_number: string
  nationality: string | null
  gender: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  passport_number: string | null
  special_requests: string | null
  created_at: string
  agents: AgentRef | AgentRef[] | null
  case_members: { case_id: string; cases: { id: string; case_number: string; status: string } | null }[]
}

function pickAgent(a: AgentRef | AgentRef[] | null | undefined): AgentRef | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 break-words">
        {value === null || value === undefined || value === '' ? <span className="text-gray-300">—</span> : String(value)}
      </p>
    </div>
  )
}

function Pill({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value ? value.replace(/_/g, ' ') : null
  return (
    <div>
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      {display ? (
        <span className="inline-block text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 capitalize">{display}</span>
      ) : <p className="text-sm text-gray-300">—</p>}
    </div>
  )
}

export default function AdminClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('clients').select(`
      id, client_number, nationality, gender, date_of_birth, phone, email, passport_number, special_requests, created_at,
      ${CLIENT_INFO_COLUMNS},
      agents!clients_agent_id_fkey(id, name, agent_number),
      case_members(case_id, cases(id, case_number, status))
    `).eq('id', id).maybeSingle()
    setClient(data as unknown as Client)
  }, [id])

  useEffect(() => {
    async function init() { await fetchData(); setLoading(false) }
    init()
  }, [fetchData])

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  if (!client) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Client not found.</p></div>

  const agent = pickAgent(client.agents)
  const missing = getMissingClientFields(client as unknown as ClientInfo)
  const cases = client.case_members?.map(m => m.cases).filter((c): c is { id: string; case_number: string; status: string } => !!c) ?? []

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-gray-100">
        <button onClick={() => router.push('/admin/clients')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Clients
        </button>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-900">{(client as unknown as { name: string }).name}</span>
        <span className="text-[10px] font-mono text-gray-400">{client.client_number}</span>
        {missing.length === 0
          ? <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">Info Complete</span>
          : <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">{missing.length} missing</span>}
        <span className="text-xs text-gray-500 ml-auto">
          <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-1.5">Registered</span>
          <span className="font-medium text-gray-700">{client.created_at.slice(0, 10)}</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

          {/* Agent + Cases */}
          <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Owner & Cases</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Agent</p>
                {agent ? (
                  <button onClick={() => router.push(`/admin/agents/${agent.id}`)}
                    className="text-[#0f4c35] font-medium hover:underline">
                    {agent.name} <span className="text-[10px] font-mono text-gray-400 ml-1">{agent.agent_number ?? ''}</span>
                  </button>
                ) : <span className="text-sm text-gray-300">—</span>}
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Cases</p>
                {cases.length === 0 ? <span className="text-sm text-gray-300">No cases yet</span> : (
                  <div className="flex flex-wrap gap-1.5">
                    {cases.map(c => (
                      <button key={c.id} onClick={() => router.push(`/admin/cases/${c.id}`)}
                        className="text-xs font-mono text-[#0f4c35] bg-white border border-gray-200 rounded-full px-2 py-0.5 hover:border-[#0f4c35]">
                        {c.case_number}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Basic */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Basic</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <Row label="Name" value={(client as unknown as { name: string }).name} />
              <Row label="Nationality" value={client.nationality} />
              <Row label="Gender" value={client.gender?.replace(/_/g, ' ')} />
              <Row label="Date of Birth" value={client.date_of_birth} />
              <Row label="Passport Number" value={client.passport_number} />
            </div>
          </section>

          {/* Contact */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <Row label="Phone" value={client.phone} />
              <Row label="Email" value={client.email} />
              <Row label="Preferred Language" value={(client as unknown as { preferred_language: string | null }).preferred_language} />
            </div>
          </section>

          {/* Emergency Contact */}
          {(() => {
            const c = client as unknown as { emergency_contact_name: string | null; emergency_contact_relation: string | null; emergency_contact_phone: string | null }
            return (
              <section className="bg-gray-50 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Emergency Contact</h3>
                <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                  <Row label="Name" value={c.emergency_contact_name} />
                  <Row label="Relation" value={c.emergency_contact_relation} />
                  <Row label="Phone" value={c.emergency_contact_phone} />
                </div>
              </section>
            )
          })()}

          {/* Medical */}
          {(() => {
            const c = client as unknown as {
              blood_type: string | null; allergies: string | null; current_medications: string | null
              health_conditions: string | null; medical_restrictions: string | null
              height_cm: number | null; weight_kg: number | null; mobility_limitations: string | null
              prior_aesthetic_procedures: string | null; recent_health_checkup_notes: string | null
            }
            return (
              <section className="bg-gray-50 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Medical</h3>
                <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                  <Row label="Blood Type" value={c.blood_type} />
                  <Row label="Height (cm)" value={c.height_cm} />
                  <Row label="Weight (kg)" value={c.weight_kg} />
                </div>
                <div className="grid grid-cols-1 gap-y-3">
                  <Row label="Allergies" value={c.allergies} />
                  <Row label="Current Medications" value={c.current_medications} />
                  <Row label="Health Conditions" value={c.health_conditions} />
                  <Row label="Medical Restrictions" value={c.medical_restrictions} />
                  <Row label="Mobility Limitations" value={c.mobility_limitations} />
                  <Row label="Prior Aesthetic Procedures" value={c.prior_aesthetic_procedures} />
                  <Row label="Recent Health Checkup Notes" value={c.recent_health_checkup_notes} />
                </div>
              </section>
            )
          })()}

          {/* Lifestyle */}
          {(() => {
            const c = client as unknown as { smoking_status: string | null; alcohol_status: string | null; pregnancy_status: string | null }
            return (
              <section className="bg-gray-50 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Lifestyle</h3>
                <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                  <Pill label="Smoking" value={c.smoking_status} />
                  <Pill label="Alcohol" value={c.alcohol_status} />
                  {client.gender === 'female' && <Pill label="Pregnancy" value={c.pregnancy_status} />}
                </div>
              </section>
            )
          })()}

          {/* Muslim Preferences */}
          {(client as unknown as { needs_muslim_friendly: boolean }).needs_muslim_friendly && (() => {
            const c = client as unknown as {
              dietary_restriction: string | null; prayer_frequency: string | null; prayer_location: string | null
              same_gender_doctor: string | null; same_gender_therapist: string | null; mixed_gender_activities: string | null
              cultural_religious_notes: string | null
            }
            return (
              <section className="bg-gray-50 rounded-2xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Muslim Preferences</h3>
                <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                  <Pill label="Dietary" value={c.dietary_restriction} />
                  <Pill label="Prayer Frequency" value={c.prayer_frequency} />
                  <Pill label="Prayer Location" value={c.prayer_location} />
                  <Pill label="Same-Gender Doctor" value={c.same_gender_doctor} />
                  <Pill label="Same-Gender Therapist" value={c.same_gender_therapist} />
                  <Pill label="Mixed Gender Activities" value={c.mixed_gender_activities} />
                </div>
                <Row label="Cultural / Religious Notes" value={c.cultural_religious_notes} />
              </section>
            )
          })()}

          {/* Additional Notes */}
          {client.special_requests && (
            <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Additional Notes</h3>
              <Row label="Special Requests" value={client.special_requests} />
            </section>
          )}

          {missing.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide mb-1.5">Missing Info ({missing.length})</p>
              <p className="text-xs text-amber-800">{missing.join(' · ')}</p>
              <p className="text-[11px] text-amber-700 mt-1">The agent is responsible for completing these fields. Admin view is read-only.</p>
            </section>
          )}

        </div>
      </div>
    </div>
  )
}
