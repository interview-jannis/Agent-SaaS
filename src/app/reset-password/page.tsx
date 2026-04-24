'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Supabase delivers the recovery session via URL hash — wait for auth state event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
    // In case the session is already ready when we land
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true) })
    return () => subscription.unsubscribe()
  }, [])

  async function submit() {
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    setSaving(true); setError('')
    try {
      const { error } = await supabase.auth.updateUser({ password: form.password })
      if (error) throw error
      setDone(true)
      setTimeout(() => router.replace('/login'), 1500)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to update password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reset Password</h1>
          <p className="text-sm text-gray-500 mt-1">Choose a new password for your Tiktak account.</p>
        </div>

        {!ready ? (
          <p className="text-sm text-gray-400">Verifying reset link...</p>
        ) : done ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
            Password updated. Redirecting to sign in...
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
              <input type="password" value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="At least 8 characters"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
              <input type="password" value={form.confirm}
                onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button onClick={submit} disabled={saving || !form.password || !form.confirm}
              className="w-full py-3 bg-[#0f4c35] text-white text-sm font-semibold rounded-xl hover:bg-[#0a3828] disabled:opacity-40">
              {saving ? 'Updating...' : 'Update Password'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
