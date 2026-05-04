'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  // Guard: allow onboarding flow (pre-approval) + setup wizard (post-approval, pre-setup)
  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { router.replace('/login'); return }
      const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', uid).maybeSingle()
      if (admin) { router.replace('/admin/overview'); return }
      const { data: agent } = await supabase.from('agents').select('onboarding_status, setup_completed_at').eq('auth_user_id', uid).maybeSingle()
      const row = agent as { onboarding_status?: string; setup_completed_at?: string | null } | null
      if (!row) { router.replace('/login'); return }
      // Approved + setup completed → agent app
      if (row.onboarding_status === 'approved' && row.setup_completed_at) { router.replace('/agent/home'); return }
      setReady(true)
    }
    check()
  }, [router])

  if (!ready) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white print:min-h-0">
      <header className="h-14 bg-white border-b border-gray-100 flex items-center px-6 print:hidden">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tiktak-logo-long.png" alt="Tiktak" className="h-11 w-auto -mt-1" />
          <span className="text-xs text-gray-400">Agent Onboarding</span>
        </div>
        <button onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}
          className="ml-auto text-xs text-gray-400 hover:text-gray-700 transition-colors">Sign out</button>
      </header>
      <main className="px-6 py-10 print:p-0">
        {children}
      </main>
    </div>
  )
}
