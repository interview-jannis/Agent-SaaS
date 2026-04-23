'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SetupWizardPage() {
  const router = useRouter()
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', phone: '' })
  const [bank, setBank] = useState({ bank_name: '', account_number: '', account_holder: '', swift_code: '', bank_address: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) { router.replace('/login'); return }
      const { data: agent } = await supabase.from('agents')
        .select('name, country, onboarding_status, setup_completed_at')
        .eq('auth_user_id', session.user.id).maybeSingle()
      if (!agent) { router.replace('/login'); return }
      const a = agent as { name: string; country: string | null; onboarding_status: string; setup_completed_at: string | null }
      if (a.onboarding_status !== 'approved') { router.replace('/onboarding/waiting'); return }
      if (a.setup_completed_at) { router.replace('/agent/home'); return }
      setAuthUserId(session.user.id)
      setName(a.name ?? '')
      setCountry(a.country ?? '')
      setLoading(false)
    }
    init()
  }, [router])

  async function submit() {
    if (!authUserId) return
    if (!form.email.trim()) { setError('Email is required.'); return }
    if (!form.email.includes('@') || form.email.endsWith('@tiktak.temp')) { setError('Enter a valid personal email (not the temp address).'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return }
    if (!bank.bank_name.trim() || !bank.account_number.trim() || !bank.account_holder.trim() || !bank.swift_code.trim()) {
      setError('Bank Name, Account Number, Beneficiary, and Swift Code are required so we can pay your commissions.'); return
    }
    setSaving(true); setError('')
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
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Setup failed.')
      }
      // Refresh the session so subsequent requests use the new email/password context
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
        <h1 className="text-2xl font-semibold text-gray-900">Welcome to Tiktak, {name}!</h1>
        <p className="text-sm text-gray-500 mt-2">Your account has been approved. Let&apos;s finish setting it up — replace the temporary login and add your contact info.</p>
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Login Credentials</p>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Email (your sign-in address) *</label>
          <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            placeholder="you@example.com"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          <p className="text-[10px] text-gray-400 mt-1">Replaces the temporary email. Use your real email — you&apos;ll sign in with this from now on.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">New Password *</label>
            <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder="At least 8 characters"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Confirm Password *</label>
            <input type="password" value={form.confirmPassword} onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
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

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Phone</label>
          <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            placeholder="+971 50 123 4567"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          <p className="text-[10px] text-gray-400 mt-1">Optional.</p>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bank Information</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Required — commissions on completed cases will be sent here.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Bank Name *</label>
            <input type="text" value={bank.bank_name} onChange={e => setBank(p => ({ ...p, bank_name: e.target.value }))}
              placeholder="Emirates NBD"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Account Number *</label>
            <input type="text" value={bank.account_number} onChange={e => setBank(p => ({ ...p, account_number: e.target.value }))}
              placeholder="1234567890"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Beneficiary (Account Holder) *</label>
            <input type="text" value={bank.account_holder} onChange={e => setBank(p => ({ ...p, account_holder: e.target.value }))}
              placeholder="Full name as registered at the bank"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Swift Code *</label>
            <input type="text" value={bank.swift_code} onChange={e => setBank(p => ({ ...p, swift_code: e.target.value.toUpperCase() }))}
              placeholder="EBILAEAD"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Bank Address</label>
          <input type="text" value={bank.bank_address} onChange={e => setBank(p => ({ ...p, bank_address: e.target.value }))}
            placeholder="Optional"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
        </div>
      </section>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button onClick={submit} disabled={saving}
        className="w-full py-3 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
        {saving ? 'Setting up...' : 'Complete Setup & Enter Tiktak →'}
      </button>
    </div>
  )
}
