'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { nextOnboardingPath } from '@/lib/onboardingFlow'

type Status = 'pending_onboarding' | 'awaiting_approval' | 'approved'

export default function OnboardingEntryPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return
      const { data } = await supabase.from('agents')
        .select('onboarding_status, rejection_reason')
        .eq('auth_user_id', session.user.id).maybeSingle()
      const row = data as { onboarding_status?: Status; rejection_reason?: string | null } | null
      // If rejected (reason present and not yet re-signed), show the reason screen first.
      if (row?.rejection_reason) {
        router.replace('/onboarding/waiting')
        return
      }
      // Skip steps the agent has already completed (prevents duplicate signatures on refresh).
      const skipTo = await nextOnboardingPath('entry')
      if (skipTo) {
        router.replace(skipTo)
        return
      }
      setReady(true)
    }
    load()
  }, [router])

  if (!ready) return null

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Welcome to Tiktak</h1>
        <p className="text-sm text-gray-500 mt-2">Before you can start bringing in clients, we need to walk through a short onboarding.</p>
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">What to expect</p>
          <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
            <li>Brief orientation covering Tiktak&apos;s platform and commission structure</li>
            <li>Non-Disclosure Agreement (NDA) — provide your name, country, then sign</li>
            <li>Partnership Agreement — review and sign</li>
            <li>Wait for admin approval, then start using Tiktak</li>
          </ol>
        </div>
        <p className="text-xs text-gray-400">Estimated time: 10–15 minutes.</p>
      </section>

      <button
        onClick={() => router.push('/onboarding/orientation')}
        className="w-full py-3 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] transition-colors">
        Get Started →
      </button>
    </div>
  )
}
