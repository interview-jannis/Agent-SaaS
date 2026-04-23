'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * Guards /agent/* routes: if the signed-in user is an agent whose onboarding_status
 * is not 'approved', redirects them to /onboarding. Approved agents pass through.
 */
export default function AgentOnboardingGuard() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data } = await supabase
        .from('agents')
        .select('onboarding_status, setup_completed_at')
        .eq('auth_user_id', uid)
        .maybeSingle()
      if (cancelled) return
      const row = data as { onboarding_status?: string; setup_completed_at?: string | null } | null
      const status = row?.onboarding_status
      if (status && status !== 'approved') {
        router.replace('/onboarding')
      } else if (status === 'approved' && !row?.setup_completed_at) {
        router.replace('/onboarding/setup')
      }
    }
    check()
    return () => { cancelled = true }
  }, [router])

  return null
}
