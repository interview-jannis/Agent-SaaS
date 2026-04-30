'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AdminInviteSetupPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()

  const [phase, setPhase] = useState<'claiming' | 'form' | 'error'>('claiming')
  const [error, setError] = useState('')
  const [authUserId, setAuthUserId] = useState<string | null>(null)

  // Setup form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function claim() {
      const token = params?.token
      if (!token) { setPhase('error'); setError('Invalid invite link.'); return }

      await supabase.auth.signOut()

      const res = await fetch('/api/admin/claim-admin-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (!cancelled) { setPhase('error'); setError(data.error ?? 'Invalid or expired invite.') }
        return
      }

      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })
      if (signInErr || !signInData?.user) {
        if (!cancelled) { setPhase('error'); setError(signInErr?.message ?? 'Sign-in failed.') }
        return
      }
      if (!cancelled) {
        setAuthUserId(signInData.user.id)
        setPhase('form')
      }
    }
    claim()
    return () => { cancelled = true }
  }, [params])

  async function submit() {
    setError('')
    if (!name.trim()) { setError('Name is required.'); return }
    if (!email.trim()) { setError('Email is required.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (!authUserId) { setError('Session not ready. Please refresh.'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authUserId,
          name: name.trim(),
          email: email.trim(),
          title: title.trim() || undefined,
          password,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Setup failed.')

      // Refresh session so the new email is reflected
      await supabase.auth.refreshSession()
      router.replace('/admin/overview')
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Setup failed.')
    } finally {
      setSaving(false)
    }
  }

  if (phase === 'claiming') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-sm text-gray-500">Setting up your invite…</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold text-gray-900">Invite unavailable</h1>
          <p className="text-sm text-gray-500">{error}</p>
          <p className="text-xs text-gray-400">Contact your super admin for a new invite link.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tiktak-logo-short.png" alt="Tiktak" className="h-24 w-auto mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-gray-900">Welcome to Tiktak</h1>
          <p className="text-sm text-gray-500 mt-1">Set up your admin account.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Full Name *</label>
              <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Ji-su Lee"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Account Manager"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@interviewcorp.co.kr"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            <p className="text-[11px] text-gray-400 mt-1">Use your work email. You&apos;ll sign in with this.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Confirm Password *</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="pt-2">
            <button onClick={submit} disabled={saving || !name.trim() || !email.trim() || password.length < 8 || password !== confirmPassword}
              className="w-full px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
              {saving ? 'Setting up…' : 'Complete Setup & Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
