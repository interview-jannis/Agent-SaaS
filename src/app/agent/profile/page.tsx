'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ChangePasswordCard from '@/components/ChangePasswordCard'

type BankInfo = {
  bank_name?: string
  account_number?: string
  account_holder?: string
  swift_code?: string
  bank_address?: string
}

type AgentProfile = {
  id: string
  agent_number: string | null
  name: string
  email: string | null
  phone: string | null
  country: string | null
  margin_rate: number | null
  monthly_completed: number | null
  is_active: boolean
  bank_info: BankInfo | null
}

const BANK_FIELDS: Array<[keyof BankInfo, string, string]> = [
  ['bank_name', 'Bank Name', 'e.g. Emirates NBD'],
  ['account_number', 'Account Number', ''],
  ['account_holder', 'Account Holder', 'Full name as on account'],
  ['swift_code', 'SWIFT Code', 'e.g. EBILAEAD'],
  ['bank_address', 'Bank Address', 'Branch or bank address'],
]

export default function AgentProfilePage() {
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Contact edit
  const [editContact, setEditContact] = useState(false)
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('')
  const [savingContact, setSavingContact] = useState(false)

  // Bank edit
  const [editBank, setEditBank] = useState(false)
  const [bankForm, setBankForm] = useState<BankInfo>({})
  const [savingBank, setSavingBank] = useState(false)

  const [error, setError] = useState('')

  async function fetchProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return
    const { data } = await supabase.from('agents')
      .select('id, agent_number, name, email, phone, country, margin_rate, monthly_completed, is_active, bank_info')
      .eq('auth_user_id', uid).single()
    if (data) setProfile(data as AgentProfile)
  }

  useEffect(() => {
    async function init() { await fetchProfile(); setLoading(false) }
    init()
  }, [])

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

  async function saveBank() {
    if (!profile) return
    setSavingBank(true); setError('')
    try {
      // Trim empty fields
      const cleaned: BankInfo = {}
      for (const [k] of BANK_FIELDS) {
        const v = (bankForm[k] ?? '').trim()
        if (v) cleaned[k] = v
      }
      const { error } = await supabase.from('agents')
        .update({ bank_info: Object.keys(cleaned).length > 0 ? cleaned : null })
        .eq('id', profile.id)
      if (error) throw error
      await fetchProfile()
      setEditBank(false)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save.')
    } finally {
      setSavingBank(false)
    }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  if (!profile) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Profile not found.</p></div>

  const bankConfigured = profile.bank_info && Object.keys(profile.bank_info).length > 0

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-900">Profile</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">

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
                <p className="text-[10px] text-gray-400">{profile.monthly_completed ?? 0} completed this month</p>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Basic Info (read-only) */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Basic Information</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
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
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
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
                  <input value={country} onChange={e => setCountry(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
              </div>
            )}
          </section>

          {/* Bank Information for Settlement */}
          <section className={`rounded-2xl p-5 ${bankConfigured ? 'bg-gray-50' : 'bg-amber-50 border border-amber-200'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bank Information</h3>
                {!bankConfigured && <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Required</span>}
              </div>
              {!editBank ? (
                <button onClick={() => { setEditBank(true); setBankForm(profile.bank_info ?? {}); setError('') }}
                  className="text-xs font-medium text-[#0f4c35] hover:underline">
                  {bankConfigured ? 'Edit' : 'Add info'}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <button onClick={() => { setEditBank(false); setError('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  <button onClick={saveBank} disabled={savingBank}
                    className="text-xs font-medium text-[#0f4c35] hover:underline disabled:opacity-40">
                    {savingBank ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            {!bankConfigured && !editBank && (
              <p className="text-xs text-amber-800 mb-3">
                Admin needs your bank details to send commission payouts. Please add them.
              </p>
            )}

            {!editBank ? (
              <div className="grid grid-cols-1 gap-y-3 text-sm">
                {BANK_FIELDS.map(([key, label]) => (
                  <div key={key} className="flex justify-between items-start">
                    <p className="text-[11px] text-gray-500">{label}</p>
                    <p className="text-gray-800 font-mono text-xs text-right max-w-[60%] break-all">
                      {profile.bank_info?.[key] || <span className="text-gray-300">—</span>}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {BANK_FIELDS.map(([key, label, placeholder]) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input value={bankForm[key] ?? ''}
                      onChange={e => setBankForm(p => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                ))}
              </div>
            )}
          </section>

          <ChangePasswordCard />

        </div>
      </div>
    </div>
  )
}
