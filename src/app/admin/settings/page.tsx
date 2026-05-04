'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logAsCurrentUser } from '@/lib/audit'
import ChangePasswordCard from '@/components/ChangePasswordCard'

type BankDetails = {
  bank_name: string
  account_number: string
  address: string
  swift_code: string
  beneficiary: string
  beneficiary_number: string
}

const DEFAULT_BANK: BankDetails = {
  bank_name: '', account_number: '', address: '',
  swift_code: '', beneficiary: '', beneficiary_number: '',
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)

  // Inline edit state — only one section editable at a time
  type EditTarget = 'profile' | 'rate' | 'margin' | 'bank' | 'deposit' | 'stamp' | null
  const [editing, setEditing] = useState<EditTarget>(null)

  // My Display Info (per-admin, used as signer on invoices I finalize)
  const [adminId, setAdminId] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileTitle, setProfileTitle] = useState('')
  const [profileNameOriginal, setProfileNameOriginal] = useState('')
  const [profileTitleOriginal, setProfileTitleOriginal] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState('')

  // Exchange rate
  const [rate, setRate] = useState('')
  const [rateOriginal, setRateOriginal] = useState('')
  const [savingRate, setSavingRate] = useState(false)
  const [rateSaved, setRateSaved] = useState(false)
  const [rateError, setRateError] = useState('')

  // Company margin
  const [companyMargin, setCompanyMargin] = useState('')
  const [companyMarginOriginal, setCompanyMarginOriginal] = useState('')
  const [savingMargin, setSavingMargin] = useState(false)
  const [marginSaved, setMarginSaved] = useState(false)
  const [marginError, setMarginError] = useState('')

  // Bank details
  const [bank, setBank] = useState<BankDetails>(DEFAULT_BANK)
  const [bankOriginal, setBankOriginal] = useState<BankDetails>(DEFAULT_BANK)
  const [savingBank, setSavingBank] = useState(false)
  const [bankSaved, setBankSaved] = useState(false)
  const [bankError, setBankError] = useState('')

  // Deposit %
  const [depositPct, setDepositPct] = useState('')
  const [depositPctOriginal, setDepositPctOriginal] = useState('')
  const [savingDeposit, setSavingDeposit] = useState(false)
  const [depositSaved, setDepositSaved] = useState(false)
  const [depositError, setDepositError] = useState('')

  // Company stamp
  const [stampUrl, setStampUrl] = useState<string | null>(null)
  const [stampUrlOriginal, setStampUrlOriginal] = useState<string | null>(null)
  const [uploadingStamp, setUploadingStamp] = useState(false)
  const [stampSaved, setStampSaved] = useState(false)
  const [stampError, setStampError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id ?? null
      const [rateRes, marginRes, bankRes, depositRes, stampRes, adminRes] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
        supabase.from('system_settings').select('value').eq('key', 'company_margin_rate').single(),
        supabase.from('system_settings').select('value').eq('key', 'bank_details').single(),
        supabase.from('system_settings').select('value').eq('key', 'deposit_percentage').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'company_stamp').maybeSingle(),
        uid ? supabase.from('admins').select('id, name, title, is_super_admin').eq('auth_user_id', uid).maybeSingle() : Promise.resolve({ data: null }),
      ])

      const admin = adminRes.data as { id: string; name: string | null; title: string | null; is_super_admin: boolean | null } | null
      if (admin) {
        setAdminId(admin.id)
        setIsSuperAdmin(!!admin.is_super_admin)
        setProfileName(admin.name ?? '')
        setProfileTitle(admin.title ?? '')
        setProfileNameOriginal(admin.name ?? '')
        setProfileTitleOriginal(admin.title ?? '')
      }

      const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (r) { setRate(String(r)); setRateOriginal(String(r)) }

      const m = (marginRes.data?.value as { rate?: number } | null)?.rate
      if (m !== undefined) {
        const pct = String(Math.round(m * 100))
        setCompanyMargin(pct); setCompanyMarginOriginal(pct)
      }

      const b = bankRes.data?.value as BankDetails | null
      if (b) {
        const merged = { ...DEFAULT_BANK, ...b }
        setBank(merged); setBankOriginal(merged)
      }

      const d = (depositRes.data?.value as { percentage?: number } | null)?.percentage
      if (d !== undefined) {
        const pct = String(d)
        setDepositPct(pct); setDepositPctOriginal(pct)
      }

      const s = (stampRes.data?.value as { url?: string | null } | null)?.url ?? null
      setStampUrl(s); setStampUrlOriginal(s)

      setLoading(false)
    }
    load()
  }, [])

  async function saveRate() {
    if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
      setRateError('Please enter a valid exchange rate.')
      return
    }
    setSavingRate(true)
    setRateError('')
    setRateSaved(false)
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'exchange_rate', value: { usd_krw: Number(rate) } }, { onConflict: 'key' })
    if (error) { setRateError(error.message) }
    else {
      await logAsCurrentUser('settings.updated', { type: 'system_setting', label: 'exchange_rate' }, { from: rateOriginal, to: rate })
      setRateOriginal(rate)
      setEditing(null)
      setRateSaved(true); setTimeout(() => setRateSaved(false), 3000)
    }
    setSavingRate(false)
  }

  async function saveMargin() {
    const pct = Number(companyMargin)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setMarginError('Please enter a value between 0 and 100.')
      return
    }
    setSavingMargin(true)
    setMarginError('')
    setMarginSaved(false)
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'company_margin_rate', value: { rate: pct / 100 } }, { onConflict: 'key' })
    if (error) { setMarginError(error.message) }
    else {
      await logAsCurrentUser('settings.updated', { type: 'system_setting', label: 'company_margin_rate' }, { from: companyMarginOriginal, to: companyMargin })
      setCompanyMarginOriginal(companyMargin)
      setEditing(null)
      setMarginSaved(true); setTimeout(() => setMarginSaved(false), 3000)
    }
    setSavingMargin(false)
  }

  async function saveBank() {
    setSavingBank(true)
    setBankError('')
    setBankSaved(false)
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'bank_details', value: bank }, { onConflict: 'key' })
    if (error) { setBankError(error.message) }
    else {
      // Diff which bank fields changed for the audit detail
      const changed: string[] = []
      const oldBank = bankOriginal as Record<string, string>
      const newBank = bank as Record<string, string>
      for (const k of new Set([...Object.keys(oldBank), ...Object.keys(newBank)])) {
        if (oldBank[k] !== newBank[k]) changed.push(k)
      }
      await logAsCurrentUser('settings.updated', { type: 'system_setting', label: 'bank_details' }, { fields_changed: changed })
      setBankOriginal(bank)
      setEditing(null)
      setBankSaved(true); setTimeout(() => setBankSaved(false), 3000)
    }
    setSavingBank(false)
  }

  async function saveDeposit() {
    const pct = Number(depositPct)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setDepositError('Please enter a value between 0 and 100.')
      return
    }
    setSavingDeposit(true); setDepositError(''); setDepositSaved(false)
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'deposit_percentage', value: { percentage: pct } }, { onConflict: 'key' })
    if (error) { setDepositError(error.message) }
    else {
      await logAsCurrentUser('settings.updated', { type: 'system_setting', label: 'deposit_percentage' }, { from: depositPctOriginal, to: depositPct })
      setDepositPctOriginal(depositPct)
      setEditing(null)
      setDepositSaved(true); setTimeout(() => setDepositSaved(false), 3000)
    }
    setSavingDeposit(false)
  }

  async function uploadStamp(file: File) {
    setUploadingStamp(true); setStampError(''); setStampSaved(false)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const path = `company/stamp-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('stamps').upload(path, file, { cacheControl: '3600', upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('stamps').getPublicUrl(path)
      const url = pub.publicUrl
      const { error: dbErr } = await supabase
        .from('system_settings')
        .upsert({ key: 'company_stamp', value: { url } }, { onConflict: 'key' })
      if (dbErr) throw dbErr
      await logAsCurrentUser('settings.updated', { type: 'system_setting', label: 'company_stamp' }, { action: 'uploaded', file_name: file.name })
      setStampUrl(url); setStampUrlOriginal(url)
      setEditing(null)
      setStampSaved(true); setTimeout(() => setStampSaved(false), 3000)
    } catch (e: unknown) {
      setStampError((e as { message?: string })?.message ?? 'Failed to upload stamp.')
    } finally {
      setUploadingStamp(false)
    }
  }

  async function clearStamp() {
    if (!window.confirm('Remove company stamp from invoices?')) return
    setUploadingStamp(true); setStampError('')
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'company_stamp', value: { url: null } }, { onConflict: 'key' })
    if (error) { setStampError(error.message) }
    else {
      await logAsCurrentUser('settings.updated', { type: 'system_setting', label: 'company_stamp' }, { action: 'cleared' })
      setStampUrl(null); setStampUrlOriginal(null)
      setStampSaved(true); setTimeout(() => setStampSaved(false), 3000)
    }
    setUploadingStamp(false)
  }

  async function saveProfile() {
    if (!adminId) { setProfileError('Admin record not found.'); return }
    if (!profileName.trim()) { setProfileError('Name is required.'); return }
    setSavingProfile(true)
    setProfileError('')
    setProfileSaved(false)
    const { error } = await supabase.from('admins')
      .update({ name: profileName.trim(), title: profileTitle.trim() || null })
      .eq('id', adminId)
    if (error) { setProfileError(error.message) }
    else {
      setProfileNameOriginal(profileName.trim())
      setProfileTitleOriginal(profileTitle.trim())
      setEditing(null)
      setProfileSaved(true); setTimeout(() => setProfileSaved(false), 3000)
    }
    setSavingProfile(false)
  }

  function startEdit(target: Exclude<EditTarget, null>) {
    setRateError(''); setMarginError(''); setBankError(''); setProfileError(''); setDepositError(''); setStampError('')
    setEditing(target)
  }
  function cancelEdit() {
    setRate(rateOriginal)
    setCompanyMargin(companyMarginOriginal)
    setBank(bankOriginal)
    setProfileName(profileNameOriginal)
    setProfileTitle(profileTitleOriginal)
    setDepositPct(depositPctOriginal)
    setRateError(''); setMarginError(''); setBankError(''); setProfileError(''); setDepositError(''); setStampError('')
    setEditing(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-base font-semibold text-gray-900">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Settings list — inline edit pattern */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">

          {/* My Display Info row — per-admin signer info on invoices */}
          {adminId && (
          <div className="px-6 py-5">
            {editing !== 'profile' ? (
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900">My Display Info</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Used as the signer on invoices you finalize.</p>
                  <div className="mt-2 text-sm text-gray-800">
                    {profileNameOriginal ? (
                      <>
                        <p className="font-medium">{profileNameOriginal}</p>
                        {profileTitleOriginal && <p className="text-xs text-gray-500 mt-0.5">{profileTitleOriginal}</p>}
                      </>
                    ) : (
                      <p className="text-gray-400">Not set</p>
                    )}
                  </div>
                  {profileSaved && <p className="text-xs text-[#0f4c35] mt-1">Saved.</p>}
                </div>
                <button onClick={() => startEdit('profile')}
                  className="shrink-0 text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">My Display Info</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Used as the signer on invoices you finalize.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Name *</label>
                    <input autoFocus type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)}
                      placeholder="e.g. Ji-su Lee"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Title</label>
                    <input type="text" value={profileTitle} onChange={(e) => setProfileTitle(e.target.value)}
                      placeholder="e.g. Account Manager"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] transition-all" />
                  </div>
                </div>
                {profileError && <p className="text-xs text-red-500">{profileError}</p>}
                <div className="flex items-center gap-2">
                  <button onClick={saveProfile} disabled={savingProfile}
                    className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                    {savingProfile ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={cancelEdit} disabled={savingProfile}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Cancel</button>
                </div>
              </div>
            )}
          </div>
          )}

          {/* System rows — all admins can view, super admin only can edit */}
          {/* Exchange Rate row */}
          <div className="px-6 py-5">
            {editing !== 'rate' ? (
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900">Exchange Rate</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Used to convert product prices from KRW to USD.</p>
                  <p className="text-sm text-gray-800 mt-2 tabular-nums">
                    {rateOriginal ? `1 USD = ₩${Number(rateOriginal).toLocaleString()}` : <span className="text-gray-400">Not set</span>}
                  </p>
                  {rateSaved && <p className="text-xs text-[#0f4c35] mt-1">Saved.</p>}
                </div>
                {isSuperAdmin && (
                  <button onClick={() => startEdit('rate')}
                    className="shrink-0 text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Exchange Rate</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Used to convert product prices from KRW to USD.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">1 USD = ? KRW</label>
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#0f4c35] transition-all w-fit">
                    <span className="px-3 py-2 text-sm text-gray-600 bg-gray-50 border-r border-gray-200">₩</span>
                    <input autoFocus type="number" value={rate} onChange={(e) => setRate(e.target.value)}
                      placeholder="1350" min={1}
                      className="w-32 px-3 py-2 text-sm text-gray-900 focus:outline-none bg-white" />
                  </div>
                  {rate && !isNaN(Number(rate)) && Number(rate) > 0 && (
                    <p className="text-xs text-gray-500 mt-1.5">$1,000 = ₩{(1000 * Number(rate)).toLocaleString()}</p>
                  )}
                </div>
                {rateError && <p className="text-xs text-red-500">{rateError}</p>}
                <div className="flex items-center gap-2">
                  <button onClick={saveRate} disabled={savingRate}
                    className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                    {savingRate ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={cancelEdit} disabled={savingRate}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Company Margin row */}
          <div className="px-6 py-5">
            {editing !== 'margin' ? (
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900">Company Margin Rate</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Applied on top of product base price before the agent margin is added.</p>
                  <p className="text-sm text-gray-800 mt-2 tabular-nums">
                    {companyMarginOriginal ? `${companyMarginOriginal}%` : <span className="text-gray-400">Not set</span>}
                  </p>
                  {marginSaved && <p className="text-xs text-[#0f4c35] mt-1">Saved.</p>}
                </div>
                {isSuperAdmin && (
                  <button onClick={() => startEdit('margin')}
                    className="shrink-0 text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Company Margin Rate</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Applied on top of product base price before the agent margin is added.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Company Margin (%)</label>
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#0f4c35] transition-all w-32">
                    <input autoFocus type="number" value={companyMargin} onChange={(e) => setCompanyMargin(e.target.value)}
                      placeholder="20" min={0} max={100}
                      className="flex-1 w-full px-3 py-2 text-sm text-gray-900 focus:outline-none bg-white" />
                    <span className="px-3 py-2 text-sm text-gray-600 bg-gray-50 border-l border-gray-200">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    Customer price = base × (1 + {companyMargin || '?'}%) × (1 + agent margin%)
                  </p>
                </div>
                {marginError && <p className="text-xs text-red-500">{marginError}</p>}
                <div className="flex items-center gap-2">
                  <button onClick={saveMargin} disabled={savingMargin}
                    className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                    {savingMargin ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={cancelEdit} disabled={savingMargin}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Bank Account row */}
          <div className="px-6 py-5">
            {editing !== 'bank' ? (
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900">Bank Account Details</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Displayed on Commercial Invoice (quote page) sent to agents.</p>
                  {bankOriginal.bank_name || bankOriginal.account_number || bankOriginal.beneficiary ? (
                    <div className="mt-2 space-y-0.5 text-sm text-gray-800">
                      <p>{[bankOriginal.bank_name, bankOriginal.account_number].filter(Boolean).join(' · ') || <span className="text-gray-400">—</span>}</p>
                      <p className="text-xs text-gray-500">{[bankOriginal.swift_code, bankOriginal.beneficiary].filter(Boolean).join(' · ')}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 mt-2">Not set</p>
                  )}
                  {bankSaved && <p className="text-xs text-[#0f4c35] mt-1">Saved.</p>}
                </div>
                {isSuperAdmin && (
                  <button onClick={() => startEdit('bank')}
                    className="shrink-0 text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Bank Account Details</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Displayed on Commercial Invoice (quote page) sent to agents.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { label: 'Bank Name', key: 'bank_name', placeholder: 'SHINHAN BANK' },
                    { label: 'Account Number', key: 'account_number', placeholder: '180 039 209697' },
                    { label: 'Swift Code', key: 'swift_code', placeholder: 'SHBKKRSE' },
                    { label: 'Beneficiary', key: 'beneficiary', placeholder: 'INTERVIEW CO LTD' },
                    { label: 'Beneficiary Number', key: 'beneficiary_number', placeholder: '+82 10 2396 0469' },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
                      <input type="text" value={bank[key as keyof BankDetails]}
                        onChange={(e) => setBank((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] transition-all" />
                    </div>
                  ))}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Bank Address</label>
                    <input type="text" value={bank.address}
                      onChange={(e) => setBank((p) => ({ ...p, address: e.target.value }))}
                      placeholder="20, SEJONG-DAERO 9-GIL, JUNG-GU, SOUTH KOREA"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] transition-all" />
                  </div>
                </div>
                {bankError && <p className="text-xs text-red-500">{bankError}</p>}
                <div className="flex items-center gap-2">
                  <button onClick={saveBank} disabled={savingBank}
                    className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                    {savingBank ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={cancelEdit} disabled={savingBank}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Deposit % row */}
          <div className="px-6 py-5">
            {editing !== 'deposit' ? (
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900">Deposit Percentage</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Default deposit % used when agent issues a deposit invoice. Editable per-case.</p>
                  <p className="text-sm text-gray-800 mt-2 tabular-nums">
                    {depositPctOriginal ? `${depositPctOriginal}%` : <span className="text-gray-400">Not set</span>}
                  </p>
                  {depositSaved && <p className="text-xs text-[#0f4c35] mt-1">Saved.</p>}
                </div>
                {isSuperAdmin && (
                  <button onClick={() => startEdit('deposit')}
                    className="shrink-0 text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Deposit Percentage</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Default deposit % used when agent issues a deposit invoice.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Deposit (%)</label>
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-[#0f4c35] transition-all w-32">
                    <input autoFocus type="number" value={depositPct} onChange={(e) => setDepositPct(e.target.value)}
                      placeholder="50" min={0} max={100}
                      className="flex-1 w-full px-3 py-2 text-sm text-gray-900 focus:outline-none bg-white" />
                    <span className="px-3 py-2 text-sm text-gray-600 bg-gray-50 border-l border-gray-200">%</span>
                  </div>
                </div>
                {depositError && <p className="text-xs text-red-500">{depositError}</p>}
                <div className="flex items-center gap-2">
                  <button onClick={saveDeposit} disabled={savingDeposit}
                    className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                    {savingDeposit ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={cancelEdit} disabled={savingDeposit}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Company Stamp row */}
          <div className="px-6 py-5">
            {editing !== 'stamp' ? (
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900">Company Stamp</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Imprinted on all company-issued invoices (Balance, Additional, Deposit Settlement).</p>
                  <div className="mt-2">
                    {stampUrlOriginal ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={stampUrlOriginal} alt="Company stamp" className="h-20 w-auto object-contain" />
                    ) : (
                      <p className="text-sm text-gray-400">Not uploaded</p>
                    )}
                  </div>
                  {stampSaved && <p className="text-xs text-[#0f4c35] mt-1">Saved.</p>}
                </div>
                {isSuperAdmin && (
                  <button onClick={() => startEdit('stamp')}
                    className="shrink-0 text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Company Stamp</h2>
                  <p className="text-xs text-gray-500 mt-0.5">PNG with transparent background recommended (200×200px+).</p>
                </div>
                {stampUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={stampUrl} alt="Company stamp" className="h-24 w-auto object-contain border border-gray-200 rounded-lg p-2 bg-white" />
                )}
                <input type="file" accept="image/png,image/jpeg" disabled={uploadingStamp}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadStamp(f) }}
                  className="block text-xs text-gray-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[#0f4c35] file:text-white file:text-xs file:font-medium file:cursor-pointer hover:file:bg-[#0a3828]" />
                {stampError && <p className="text-xs text-red-500">{stampError}</p>}
                <div className="flex items-center gap-2">
                  {stampUrl && (
                    <button onClick={clearStamp} disabled={uploadingStamp}
                      className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40">Remove</button>
                  )}
                  <button onClick={cancelEdit} disabled={uploadingStamp}
                    className="ml-auto px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Done</button>
                </div>
              </div>
            )}
          </div>

        </section>

        <ChangePasswordCard />

        </div>
      </div>
    </div>
  )
}
