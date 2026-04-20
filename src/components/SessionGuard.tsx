'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * Listens for Supabase auth state changes globally.
 * When the session is signed out (including due to refresh token expiry/invalidity),
 * automatically redirects to /login.
 */
export default function SessionGuard() {
  const router = useRouter()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return null
}
