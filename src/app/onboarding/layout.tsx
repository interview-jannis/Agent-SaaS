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
    <div className="min-h-screen bg-gray-50">
      <header className="h-14 bg-white border-b border-gray-100 flex items-center px-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#0f4c35] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-900">Tiktak</span>
          <span className="text-xs text-gray-400 ml-3">Agent Onboarding</span>
        </div>
        <button onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}
          className="ml-auto text-xs text-gray-400 hover:text-gray-700 transition-colors">Sign out</button>
      </header>
      <main className="px-6 py-10">
        {children}
      </main>
    </div>
  )
}
