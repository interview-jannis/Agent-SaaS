'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logAsCurrentUser } from '@/lib/audit'

type BusinessType = 'individual' | 'company'

const LS_KEY = 'tiktak_setup_draft'

function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveDraft(data: object) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch { /* ignore */ }
}

function clearDraft() {
  try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
}

export default function SetupWizardPage() {
  const router = useRouter()
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', phone: '' })
  // Schema aligned with admin system_settings.bank_details (2026-05-01)
  const [bank, setBank] = useState({ bank_name: '', account_number: '', beneficiary: '', swift_code: '', address: '', beneficiary_number: '' })
  // Business registration (optional)
  const [business, setBusiness] = useState<{ type: BusinessType; company_name: string; registration_number: string; doc_url: string }>({
    type: 'individual', company_name: '', registration_number: '', doc_url: '',
  })
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docUploadError, setDocUploadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) { router.replace('/login'); return }
      const { data: agent } = await supabase.from('agents')
        .select('name, country, onboarding_status, setup_completed_at, email, invite_email')
        .eq('auth_user_id', session.user.id).maybeSingle()
      if (!agent) { router.replace('/login'); return }
      const a = agent as { name: string; country: string | null; onboarding_status: string; setup_completed_at: string | null; email: string | null; invite_email: string | null }
      if (a.onboarding_status !== 'approved') { router.replace('/onboarding/waiting'); return }
      if (a.setup_completed_at) { router.replace('/agent/home'); return }
      setAuthUserId(session.user.id)
      setName(a.name ?? '')
      setCountry(a.country ?? '')
      // Pre-fill email: invite_email (admin-provided) → agents.email (agent saved on waiting page)
      const suggestedEmail = a.invite_email || (a.email && !a.email.includes('@tiktak.temp') ? a.email : '')
      if (suggestedEmail) setForm(p => ({ ...p, email: suggestedEmail }))
      // Restore any previously saved draft — overrides the suggestion if agent already typed something
      const draft = loadDraft()
      if (draft) {
        if (draft.form) setForm(p => ({ ...p, email: draft.form.email || suggestedEmail, phone: draft.form.phone ?? '' }))
        if (draft.bank) setBank(draft.bank)
        if (draft.business) setBusiness(draft.business)
      }
      setLoading(false)
    }
    init()
  }, [router])

  // Auto-save draft on every change (password excluded for security)
  useEffect(() => {
    if (!authUserId) return
    saveDraft({ form: { email: form.email, phone: form.phone }, bank, business })
  }, [form.email, form.phone, bank, business, authUserId])

  async function uploadBusinessDoc(file: File) {
    if (!authUserId) return
    setUploadingDoc(true); setDocUploadError('')
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      const path = `agents/${authUserId}/business-reg-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('agent-docs').upload(path, file, { cacheControl: '3600', upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('agent-docs').getPublicUrl(path)
      setBusiness(p => ({ ...p, doc_url: pub.publicUrl }))
    } catch (e: unknown) {
      setDocUploadError((e as { message?: string })?.message ?? 'Upload failed.')
    } finally {
      setUploadingDoc(false)
    }
  }

  async function submit() {
    if (!authUserId) return
    const errs: Record<string, string> = {}
    if (!form.email.trim()) errs.email = 'Email is required.'
    else if (!form.email.includes('@') || form.email.endsWith('@tiktak.temp')) errs.email = 'Enter a valid personal email (not the temp address).'
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters.'
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match.'
    if (!form.phone.trim()) errs.phone = 'Phone number is required.'
    if (!bank.bank_name.trim()) errs.bank_name = 'Required'
    if (!bank.account_number.trim()) errs.account_number = 'Required'
    if (!bank.beneficiary.trim()) errs.beneficiary = 'Required'
    if (!bank.swift_code.trim()) errs.swift_code = 'Required'
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      setError('')
      const firstKey = Object.keys(errs)[0]
      document.getElementById(`sfield-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setFieldErrors({})
    setSaving(true); setError('')
    // Build business_info only if any field is filled
    const business_info = (business.company_name.trim() || business.registration_number.trim() || business.doc_url)
      ? {
          type: business.type,
          company_name: business.company_name.trim() || null,
          registration_number: business.registration_number.trim() || null,
          doc_url: business.doc_url || null,
        }
      : null
    try {
      const res = await fetch('/api/agent/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authUserId,
          email: form.email.trim(),
          password: form.password,
          phone: form.phone.trim(),
          bank,
          business_info,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Setup failed.')
      }
      await logAsCurrentUser('agent.setup_completed', null)
      clearDraft()
      router.replace('/agent/home')
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Setup failed.')
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-12">Loading...</p>

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Welcome to TikkTakk, {name}!</h1>
        <p className="text-sm text-gray-500 mt-2">Your account has been approved. Let&apos;s finish setting it up — replace the temporary login and add your contact info.</p>
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Login Credentials</p>

        <div id="sfield-email">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Email (your sign-in address) *</label>
          <input type="email" value={form.email} onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setFieldErrors(p => { const n = {...p}; delete n.email; return n }) }}
            placeholder="you@example.com"
            className={`w-full border rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none ${fieldErrors.email ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#0f4c35]'}`} />
          {fieldErrors.email
            ? <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>
            : <p className="text-[10px] text-gray-400 mt-1">Replaces the temporary email. Use your real email — you&apos;ll sign in with this from now on.</p>
          }
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div id="sfield-password">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">New Password *</label>
            <input type="password" value={form.password} onChange={e => { setForm(p => ({ ...p, password: e.target.value })); setFieldErrors(p => { const n = {...p}; delete n.password; return n }) }}
              placeholder="At least 8 characters"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none ${fieldErrors.password ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#0f4c35]'}`} />
            {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
          </div>
          <div id="sfield-confirmPassword">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Confirm Password *</label>
            <input type="password" value={form.confirmPassword} onChange={e => { setForm(p => ({ ...p, confirmPassword: e.target.value })); setFieldErrors(p => { const n = {...p}; delete n.confirmPassword; return n }) }}
              className={`w-full border rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none ${fieldErrors.confirmPassword ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#0f4c35]'}`} />
            {fieldErrors.confirmPassword && <p className="text-xs text-red-500 mt-1">{fieldErrors.confirmPassword}</p>}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact Info</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="block text-xs font-medium text-gray-600 mb-1.5">Name</p>
            <p className="text-sm text-gray-800 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">{name}</p>
            <p className="text-[10px] text-gray-400 mt-1">From your signed contract. Contact admin if this needs correction.</p>
          </div>
          <div>
            <p className="block text-xs font-medium text-gray-600 mb-1.5">Country</p>
            <p className="text-sm text-gray-800 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">{country || '—'}</p>
          </div>
        </div>

        <div id="sfield-phone">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Phone *</label>
          <input type="tel" value={form.phone} onChange={e => { setForm(p => ({ ...p, phone: e.target.value })); setFieldErrors(p => { const n = {...p}; delete n.phone; return n }) }}
            placeholder="+971 50 123 4567"
            className={`w-full border rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none ${fieldErrors.phone ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#0f4c35]'}`} />
          {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bank Information</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Required — commissions on completed cases will be sent here.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div id="sfield-bank_name">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Bank Name *</label>
            <input type="text" value={bank.bank_name} onChange={e => { setBank(p => ({ ...p, bank_name: e.target.value })); setFieldErrors(p => { const n = {...p}; delete n.bank_name; return n }) }}
              placeholder="Emirates NBD"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none ${fieldErrors.bank_name ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#0f4c35]'}`} />
            {fieldErrors.bank_name && <p className="text-xs text-red-500 mt-1">{fieldErrors.bank_name}</p>}
          </div>
          <div id="sfield-account_number">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Account Number *</label>
            <input type="text" value={bank.account_number} onChange={e => { setBank(p => ({ ...p, account_number: e.target.value })); setFieldErrors(p => { const n = {...p}; delete n.account_number; return n }) }}
              placeholder="1234567890"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none ${fieldErrors.account_number ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#0f4c35]'}`} />
            {fieldErrors.account_number && <p className="text-xs text-red-500 mt-1">{fieldErrors.account_number}</p>}
          </div>
          <div id="sfield-beneficiary">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Beneficiary *</label>
            <input type="text" value={bank.beneficiary} onChange={e => { setBank(p => ({ ...p, beneficiary: e.target.value })); setFieldErrors(p => { const n = {...p}; delete n.beneficiary; return n }) }}
              placeholder="Full name as registered at the bank"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none ${fieldErrors.beneficiary ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#0f4c35]'}`} />
            {fieldErrors.beneficiary && <p className="text-xs text-red-500 mt-1">{fieldErrors.beneficiary}</p>}
          </div>
          <div id="sfield-swift_code">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Swift Code *</label>
            <input type="text" value={bank.swift_code} onChange={e => { setBank(p => ({ ...p, swift_code: e.target.value.toUpperCase() })); setFieldErrors(p => { const n = {...p}; delete n.swift_code; return n }) }}
              placeholder="EBILAEAD"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 focus:outline-none ${fieldErrors.swift_code ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#0f4c35]'}`} />
            {fieldErrors.swift_code && <p className="text-xs text-red-500 mt-1">{fieldErrors.swift_code}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Beneficiary Number</label>
            <input type="text" value={bank.beneficiary_number} onChange={e => setBank(p => ({ ...p, beneficiary_number: e.target.value }))}
              placeholder="Phone or ID (optional)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Bank Address</label>
            <input type="text" value={bank.address} onChange={e => setBank(p => ({ ...p, address: e.target.value }))}
              placeholder="Optional"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Registration</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Optional — you can also add or update this from your profile later.</p>
        </div>

        {/* Business type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Business Type</label>
          <div className="flex gap-4">
            {([['individual', 'Individual'], ['company', 'Company / Agency']] as const).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={business.type === val} onChange={() => setBusiness(p => ({ ...p, type: val }))}
                  className="accent-[#0f4c35]" />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {business.type === 'company' && (
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Company / Agency Name</label>
              <input type="text" value={business.company_name} onChange={e => setBusiness(p => ({ ...p, company_name: e.target.value }))}
                placeholder="ABC Travel Agency LLC"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Registration Number</label>
            <input type="text" value={business.registration_number} onChange={e => setBusiness(p => ({ ...p, registration_number: e.target.value }))}
              placeholder="e.g. 123-45-67890"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Registration Document</label>
            {business.doc_url ? (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#0f4c35] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <a href={business.doc_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0f4c35] underline truncate">
                  Uploaded ↗
                </a>
                <button onClick={() => setBusiness(p => ({ ...p, doc_url: '' }))} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">Remove</button>
              </div>
            ) : (
              <div>
                <input type="file" accept="image/*,.pdf" disabled={uploadingDoc}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadBusinessDoc(f); e.target.value = '' }}
                  className="block text-xs text-gray-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:text-xs file:font-medium file:cursor-pointer hover:file:bg-gray-200" />
                {uploadingDoc && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
                {docUploadError && <p className="text-xs text-red-500 mt-1">{docUploadError}</p>}
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-1">PDF or image. Max 10 MB.</p>
          </div>
        </div>
      </section>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button onClick={submit} disabled={saving}
        className="w-full py-3 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
        {saving ? 'Setting up...' : 'Complete Setup & Enter TikkTakk →'}
      </button>
    </div>
  )
}
