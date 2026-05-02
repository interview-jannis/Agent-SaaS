'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ChangePasswordCard from '@/components/ChangePasswordCard'
import { COUNTRIES, COUNTRY_DATALIST_ID } from '@/lib/countries'

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
}

export default function AgentProfilePage() {
  const [profile, setProfile] = useState<AgentProfile | null>(null)
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

  const [error, setError] = useState('')

  async function fetchProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return
    const { data } = await supabase.from('agents')
      .select('id, agent_number, name, email, phone, country, margin_rate, is_active, stamp_url')
      .eq('auth_user_id', uid).single()
    if (!data) return
    const ag = data as AgentProfile
    setProfile(ag)

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
    setSavingContact(true); setError('')
    try {
      const { error } = await supabase.from('agents')
        .update({ phone: phone.trim() || null, country: country.trim() || null })
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
                  className="text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
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
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Country</label>
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

          <ChangePasswordCard />

        </div>
      </div>
    </div>
  )
}
