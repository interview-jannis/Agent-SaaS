'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justRegistered = searchParams.get('registered') === '1'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSending, setForgotSending] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState('')

  async function sendReset() {
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) { setForgotError('Enter a valid email.'); return }
    setForgotSending(true); setForgotError('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setForgotSent(true)
    } catch (e: unknown) {
      setForgotError((e as { message?: string })?.message ?? 'Failed to send reset email.')
    } finally {
      setForgotSending(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !data.user) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    const userId = data.user.id

    const [{ data: admin }, { data: agent }] = await Promise.all([
      supabase.from('admins').select('id').eq('auth_user_id', userId).maybeSingle(),
      supabase.from('agents').select('id, onboarding_status, setup_completed_at').eq('auth_user_id', userId).maybeSingle(),
    ])

    if (admin) {
      router.push('/admin/overview')
    } else if (agent) {
      const a = agent as { onboarding_status?: string; setup_completed_at?: string | null }
      if (a.onboarding_status === 'pending_onboarding' || a.onboarding_status === 'awaiting_approval') {
        router.push('/onboarding')
      } else if (a.onboarding_status === 'approved' && !a.setup_completed_at) {
        router.push('/onboarding/setup')
      } else {
        router.push('/agent/home')
      }
    } else {
      setError('Access denied. Please contact your administrator.')
      await supabase.auth.signOut()
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-10 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tiktak-logo-short.png" alt="Tiktak" className="h-32 w-auto mx-auto mb-6" />
          <h1 className="text-2xl font-semibold text-gray-900">Welcome back</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to your Tiktak account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin1@google.com / agent1@google.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <button type="button" onClick={() => setShowForgot(true)}
                className="text-xs text-[#0f4c35] hover:underline">
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="12341234"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all"
            />
          </div>

          {justRegistered && (
            <div className="flex items-center gap-2 bg-[#0f4c35]/8 border border-[#0f4c35]/20 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-[#0f4c35] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-[#0f4c35]">Account created. You can sign in now.</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1.5">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#0f4c35] text-white text-sm font-semibold rounded-xl hover:bg-[#0a3828] disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-2"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Signing in...
              </span>
            ) : 'Sign in'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          Agent accounts are provisioned by Tiktak staff.
        </p>

      </div>

      {/* Forgot Password modal */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { if (!forgotSending) setShowForgot(false) }}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Reset Password</h3>
              <p className="text-xs text-gray-500 mt-1">We&apos;ll send a reset link to your email. Follow it to choose a new password.</p>
            </div>
            {forgotSent ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
                Reset email sent. Check your inbox (and spam folder) for the link.
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Email</label>
                  <input type="email" value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                {forgotError && <p className="text-xs text-red-500">{forgotError}</p>}
              </>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); setForgotError('') }}
                disabled={forgotSending}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">
                Close
              </button>
              {!forgotSent && (
                <button onClick={sendReset} disabled={forgotSending}
                  className="px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                  {forgotSending ? 'Sending...' : 'Send Reset Link'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
