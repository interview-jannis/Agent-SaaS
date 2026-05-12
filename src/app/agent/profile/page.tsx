'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ChangePasswordCard from '@/components/ChangePasswordCard'
import { COUNTRIES, COUNTRY_DATALIST_ID } from '@/lib/countries'

type BusinessInfo = {
  type: 'individual' | 'company'
  company_name?: string | null
  registration_number?: string | null
  doc_url?: string | null
}

type AgentProfile = {
  id: string
  agent_number: string | null
  name: string
  email: string | null
  phone: string | null
  country: string | null
  margin_rate: number | null
  is_active: boolean
  stamp_url: string | null
  business_info: BusinessInfo | null
}

type AgentContract = {
  id: string
  contract_type: 'nda' | 'partnership'
  title_snapshot: string
  signed_at: string
  admin_signed_at: string | null
}

export default function AgentProfilePage() {
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [contracts, setContracts] = useState<AgentContract[]>([])
  const [monthlyPatients, setMonthlyPatients] = useState(0)
  const [loading, setLoading] = useState(true)

  // Contact edit
  const [editContact, setEditContact] = useState(false)
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('')
  const [savingContact, setSavingContact] = useState(false)

  // Stamp upload
  const [uploadingStamp, setUploadingStamp] = useState(false)
  const [stampError, setStampError] = useState('')

  // Business registration
  const [editBusiness, setEditBusiness] = useState(false)
  const [businessDraft, setBusinessDraft] = useState<BusinessInfo>({ type: 'individual', company_name: '', registration_number: '', doc_url: '' })
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [uploadingBusinessDoc, setUploadingBusinessDoc] = useState(false)
  const [businessDocError, setBusinessDocError] = useState('')

  const [error, setError] = useState('')

  async function fetchProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return
    const { data } = await supabase.from('agents')
      .select('id, agent_number, name, email, phone, country, margin_rate, is_active, stamp_url, business_info')
      .eq('auth_user_id', uid).single()
    if (!data) return
    const ag = data as AgentProfile
    setProfile(ag)

    // Signed contracts
    const { data: contractRows } = await supabase.from('agent_contracts')
      .select('id, contract_type, title_snapshot, signed_at, admin_signed_at')
      .eq('agent_id', ag.id)
      .order('signed_at', { ascending: true })
    setContracts((contractRows as AgentContract[]) ?? [])

    // Tier basis: patients on completed cases this month (case_members count)
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const { data: caseRows } = await supabase.from('cases')
      .select('travel_completed_at, case_members(id)')
      .eq('agent_id', ag.id)
      .in('status', ['awaiting_review', 'completed'])
    const rows = (caseRows as { travel_completed_at: string | null; case_members: { id: string }[] }[] | null) ?? []
    const patients = rows
      .filter(r => r.travel_completed_at?.startsWith(monthKey))
      .reduce((sum, r) => sum + (r.case_members?.length ?? 0), 0)
    setMonthlyPatients(patients)
  }

  useEffect(() => {
    async function init() { await fetchProfile(); setLoading(false) }
    init()
  }, [])

  async function uploadStamp(file: File) {
    if (!profile) return
    setUploadingStamp(true); setStampError('')
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const path = `agents/${profile.id}/stamp-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('stamps').upload(path, file, { cacheControl: '3600', upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('stamps').getPublicUrl(path)
      const { error: dbErr } = await supabase.from('agents').update({ stamp_url: pub.publicUrl }).eq('id', profile.id)
      if (dbErr) throw dbErr
      await fetchProfile()
    } catch (e: unknown) {
      setStampError((e as { message?: string })?.message ?? 'Failed to upload stamp.')
    } finally {
      setUploadingStamp(false)
    }
  }

  async function clearStamp() {
    if (!profile) return
    if (!window.confirm('Remove your stamp from invoices?')) return
    setUploadingStamp(true); setStampError('')
    const { error } = await supabase.from('agents').update({ stamp_url: null }).eq('id', profile.id)
    if (error) setStampError(error.message)
    else await fetchProfile()
    setUploadingStamp(false)
  }

  async function saveContact() {
    if (!profile) return
    if (!phone.trim()) { setError('Phone is required.'); return }
    if (!country.trim()) { setError('Country is required.'); return }
    setSavingContact(true); setError('')
    try {
      const { error } = await supabase.from('agents')
        .update({ phone: phone.trim(), country: country.trim() })
        .eq('id', profile.id)
      if (error) throw error
      await fetchProfile()
      setEditContact(false)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save.')
    } finally {
      setSavingContact(false)
    }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  if (!profile) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Profile not found.</p></div>

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-base font-semibold text-gray-900">Profile</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

          {/* Header info */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{profile.name}</h2>
              <p className="text-xs font-mono text-gray-400 mt-0.5">{profile.agent_number ?? ''}</p>
            </div>
            {profile.margin_rate != null && (
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Current Margin Rate</p>
                <p className="text-lg font-bold text-[#0f4c35]">{(profile.margin_rate * 100).toFixed(0)}%</p>
                <p className="text-[10px] text-gray-400">{monthlyPatients} patients this month</p>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Basic Info (read-only) */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Email</p>
                <p className="text-gray-800 break-all">{profile.email ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Status</p>
                <p className="text-gray-800">{profile.is_active ? 'Active' : 'Inactive'}</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-3">Email and account settings are managed by admin.</p>
          </section>

          {/* Contact Info */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact</h3>
              {!editContact ? (
                <button onClick={() => { setEditContact(true); setPhone(profile.phone ?? ''); setCountry(profile.country ?? ''); setError('') }}
                  className="text-xs font-semibold bg-green-700 text-white hover:bg-green-800 px-2.5 py-1 rounded-lg transition-colors">Edit</button>
              ) : (
                <div className="flex items-center gap-3">
                  <button onClick={() => { setEditContact(false); setError('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  <button onClick={saveContact} disabled={savingContact}
                    className="text-xs font-medium text-[#0f4c35] hover:underline disabled:opacity-40">
                    {savingContact ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            {!editContact ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Phone</p>
                  <p className="text-gray-800">{profile.phone ?? <span className="text-gray-300">—</span>}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Country</p>
                  <p className="text-gray-800">{profile.country ?? <span className="text-gray-300">—</span>}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone *</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Country *</label>
                  <input list={COUNTRY_DATALIST_ID} value={country} onChange={e => setCountry(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                  <datalist id={COUNTRY_DATALIST_ID}>
                    {COUNTRIES.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>
            )}
          </section>

          {/* Stamp / Seal */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Stamp / Seal</h3>
              {profile.stamp_url && (
                <button onClick={clearStamp} disabled={uploadingStamp}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">Remove</button>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-3">Imprinted on Deposit and Commission invoices you issue. PNG with transparent background recommended.</p>
            <div className="flex items-center gap-4">
              {profile.stamp_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.stamp_url} alt="Your stamp" className="h-24 w-auto object-contain border border-gray-200 rounded-lg p-2 bg-white" />
              ) : (
                <div className="h-24 w-24 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-400">No stamp</div>
              )}
              <div className="flex-1">
                <input type="file" accept="image/png,image/jpeg" disabled={uploadingStamp}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadStamp(f); e.target.value = '' }}
                  className="block text-xs text-gray-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[#0f4c35] file:text-white file:text-xs file:font-medium file:cursor-pointer hover:file:bg-[#0a3828]" />
                {uploadingStamp && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
                {stampError && <p className="text-xs text-red-500 mt-1">{stampError}</p>}
              </div>
            </div>
          </section>

          {/* Business Registration */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Business Registration</h3>
              {!editBusiness ? (
                <button onClick={() => {
                  setEditBusiness(true)
                  setBusinessDraft({
                    type: profile.business_info?.type ?? 'individual',
                    company_name: profile.business_info?.company_name ?? '',
                    registration_number: profile.business_info?.registration_number ?? '',
                    doc_url: profile.business_info?.doc_url ?? '',
                  })
                  setBusinessDocError('')
                }} className="text-xs font-semibold bg-green-700 text-white hover:bg-green-800 px-2.5 py-1 rounded-lg transition-colors">Edit</button>
              ) : (
                <div className="flex items-center gap-3">
                  <button onClick={() => { setEditBusiness(false); setBusinessDocError('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  <button disabled={savingBusiness} onClick={async () => {
                    if (!profile) return
                    setSavingBusiness(true); setError('')
                    try {
                      const payload: BusinessInfo | null = (businessDraft.company_name?.trim() || businessDraft.registration_number?.trim() || businessDraft.doc_url)
                        ? {
                            type: businessDraft.type,
                            company_name: businessDraft.company_name?.trim() || null,
                            registration_number: businessDraft.registration_number?.trim() || null,
                            doc_url: businessDraft.doc_url || null,
                          }
                        : null
                      const { error: upErr } = await supabase.from('agents').update({ business_info: payload }).eq('id', profile.id)
                      if (upErr) throw upErr
                      await fetchProfile()
                      setEditBusiness(false)
                    } catch (e: unknown) {
                      setError((e as { message?: string })?.message ?? 'Failed to save.')
                    } finally {
                      setSavingBusiness(false)
                    }
                  }} className="text-xs font-medium text-[#0f4c35] hover:underline disabled:opacity-40">
                    {savingBusiness ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            {!editBusiness ? (
              profile.business_info ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Business Type</p>
                    <p className="text-gray-800 capitalize">{profile.business_info.type}</p>
                  </div>
                  {profile.business_info.company_name && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-0.5">Company / Agency Name</p>
                      <p className="text-gray-800">{profile.business_info.company_name}</p>
                    </div>
                  )}
                  {profile.business_info.registration_number && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-0.5">Registration Number</p>
                      <p className="text-gray-800 font-mono">{profile.business_info.registration_number}</p>
                    </div>
                  )}
                  {profile.business_info.doc_url && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-0.5">Registration Document</p>
                      <a href={profile.business_info.doc_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-[#0f4c35] underline hover:no-underline">View Document ↗</a>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Not provided yet.</p>
              )
            ) : (
              <div className="space-y-3">
                {/* Type */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Business Type</label>
                  <div className="flex gap-4">
                    {([['individual', 'Individual'], ['company', 'Company / Agency']] as const).map(([val, label]) => (
                      <label key={val} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={businessDraft.type === val} onChange={() => setBusinessDraft(p => ({ ...p, type: val }))}
                          className="accent-[#0f4c35]" />
                        <span className="text-sm text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {businessDraft.type === 'company' && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Company / Agency Name</label>
                      <input value={businessDraft.company_name ?? ''} onChange={e => setBusinessDraft(p => ({ ...p, company_name: e.target.value }))}
                        placeholder="ABC Travel Agency LLC"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Registration Number</label>
                    <input value={businessDraft.registration_number ?? ''} onChange={e => setBusinessDraft(p => ({ ...p, registration_number: e.target.value }))}
                      placeholder="e.g. 123-45-67890"
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Registration Document</label>
                    {businessDraft.doc_url ? (
                      <div className="flex items-center gap-2 mt-1">
                        <svg className="w-4 h-4 text-[#0f4c35] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <a href={businessDraft.doc_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0f4c35] underline truncate">
                          Uploaded ↗
                        </a>
                        <button onClick={() => setBusinessDraft(p => ({ ...p, doc_url: '' }))} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">Remove</button>
                      </div>
                    ) : (
                      <div>
                        <input type="file" accept="image/*,.pdf" disabled={uploadingBusinessDoc}
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file || !profile) return
                            setUploadingBusinessDoc(true); setBusinessDocError('')
                            try {
                              const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
                              const path = `agents/${profile.id}/business-reg-${Date.now()}.${ext}`
                              const { error: upErr } = await supabase.storage.from('agent-docs').upload(path, file, { cacheControl: '3600', upsert: true })
                              if (upErr) throw upErr
                              const { data: pub } = supabase.storage.from('agent-docs').getPublicUrl(path)
                              setBusinessDraft(p => ({ ...p, doc_url: pub.publicUrl }))
                            } catch (err: unknown) {
                              setBusinessDocError((err as { message?: string })?.message ?? 'Upload failed.')
                            } finally {
                              setUploadingBusinessDoc(false)
                              e.target.value = ''
                            }
                          }}
                          className="block text-xs text-gray-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:text-xs file:font-medium file:cursor-pointer hover:file:bg-gray-200" />
                        {uploadingBusinessDoc && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
                        {businessDocError && <p className="text-xs text-red-500 mt-1">{businessDocError}</p>}
                        <p className="text-[10px] text-gray-400 mt-1">PDF or image. Max 10 MB.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Signed Contracts */}
          {contracts.length > 0 && (
            <section className="bg-gray-50 rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Signed Contracts</h3>
              <ul className="space-y-2">
                {contracts.map(c => (
                  <li key={c.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.title_snapshot}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Signed {new Date(c.signed_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                        {c.admin_signed_at
                          ? ` · Counter-signed ${new Date(c.admin_signed_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}`
                          : ' · Awaiting counter-signature'}
                      </p>
                    </div>
                    <a href={`/onboarding/contract/${c.id}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-medium text-[#0f4c35] hover:underline shrink-0">
                      View ↗
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ChangePasswordCard />

        </div>
      </div>
    </div>
  )
}
