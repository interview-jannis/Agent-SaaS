'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function InviteClaimPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function claim() {
      const token = params?.token
      if (!token) { setError('Invalid invite link.'); return }

      // Sign out any existing session first so we don't double-up
      await supabase.auth.signOut()

      const res = await fetch('/api/onboarding/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { if (!cancelled) setError(data.error ?? 'Invalid or expired invite.'); return }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })
      if (signInErr) { if (!cancelled) setError(signInErr.message); return }
      if (!cancelled) router.replace('/onboarding')
    }
    claim()
    return () => { cancelled = true }
  }, [params, router])

  return (
    <div className="max-w-md mx-auto py-16 text-center">
      {error ? (
        <>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Invite unavailable</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Welcome to Tiktak</h1>
          <p className="text-sm text-gray-500">Setting up your onboarding session…</p>
        </>
      )}
    </div>
  )
}
