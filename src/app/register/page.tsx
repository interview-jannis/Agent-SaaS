'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all'

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('')

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== passwordConfirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    // 1. Create auth user
    const { data, error: authError } = await supabase.auth.signUp({ email, password })

    if (authError || !data.user) {
      setError(authError?.message ?? 'Failed to create account.')
      setLoading(false)
      return
    }

    const authUserId = data.user.id

    // 2. Generate agent number
    const { data: agentNumber, error: rpcError } = await supabase.rpc('generate_agent_number')

    if (rpcError || !agentNumber) {
      setError('Failed to generate agent number. Please try again.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    // 3. Insert into agents table
    const { error: insertError } = await supabase.from('agents').insert({
      auth_user_id: authUserId,
      agent_number: agentNumber,
      name,
      email,
      phone,
      country,
      is_active: false,
    })

    if (insertError) {
      setError('Failed to save your profile. Please try again.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    // 4. Sign out and redirect to login
    await supabase.auth.signOut()
    router.push('/login?registered=1')
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-10">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#0f4c35] mb-6">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Create an account</h1>
          <p className="text-sm text-gray-400 mt-1">Apply to become an Interview agent</p>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 chars"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+82 10-0000-0000"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
            <input
              type="text"
              required
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="South Korea"
              className={inputClass}
            />
          </div>

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
                Creating account...
              </span>
            ) : 'Create account'}
          </button>

          <p className="text-xs text-gray-400 text-center leading-relaxed">
            Your account will be activated after admin approval.
          </p>
        </form>

        {/* Back to login */}
        <p className="text-sm text-gray-400 text-center mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-[#0f4c35] font-medium hover:underline">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  )
}
