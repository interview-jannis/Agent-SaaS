'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ChangePasswordCard() {
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function save() {
    setError(''); setSuccess(false)
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: form.password })
      if (error) throw error
      setForm({ password: '', confirm: '' })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to update password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-gray-50 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Change Password</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">You will remain signed in on this device after changing.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">New Password</label>
          <input type="password" value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            placeholder="At least 8 characters"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-[#0f4c35]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Confirm New Password</label>
          <input type="password" value={form.confirm}
            onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-[#0f4c35]" />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-[#0f4c35]">Password updated.</p>}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving || !form.password || !form.confirm}
          className="px-4 py-2 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
          {saving ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </section>
  )
}
