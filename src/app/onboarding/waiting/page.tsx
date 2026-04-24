'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type ContractRow = {
  id: string
  contract_type: 'nda' | 'partnership'
  title_snapshot: string
  signed_at: string
}

type AgentState = {
  id: string
  onboarding_status: string | null
  rejection_reason: string | null
  rejected_at: string | null
}

export default function OnboardingWaitingPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [agentState, setAgentState] = useState<AgentState | null>(null)
  const [loading, setLoading] = useState(true)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return
      const { data: agent } = await supabase.from('agents')
        .select('id, onboarding_status, rejection_reason, rejected_at')
        .eq('auth_user_id', session.user.id).maybeSingle()
      if (!agent) { setLoading(false); return }
      const a = agent as AgentState
      setAgentState(a)
      const { data } = await supabase.from('agent_contracts')
        .select('id, contract_type, title_snapshot, signed_at')
        .eq('agent_id', a.id)
        .order('contract_type', { ascending: true })
      if (!cancelled) {
        setContracts((data as ContractRow[]) ?? [])
        setLoading(false)
      }
    }

    async function checkStatus() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return
      const { data } = await supabase.from('agents')
        .select('id, onboarding_status, setup_completed_at, rejection_reason, rejected_at')
        .eq('auth_user_id', session.user.id).maybeSingle()
      const row = data as ({ id: string; onboarding_status?: string; setup_completed_at?: string | null; rejection_reason: string | null; rejected_at: string | null }) | null
      if (!row) return
      if (row.onboarding_status === 'approved') {
        router.replace(row.setup_completed_at ? '/agent/home' : '/onboarding/setup')
        return
      }
      // Update reject state live so banner appears without manual refresh
      if (!cancelled) {
        setAgentState({
          id: row.id,
          onboarding_status: row.onboarding_status ?? null,
          rejection_reason: row.rejection_reason,
          rejected_at: row.rejected_at,
        })
      }
    }

    load()
    checkStatus()
    const id = setInterval(checkStatus, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [router])

  async function startOver() {
    if (!agentState) return
    setRestarting(true)
    // Clear the rejection so the agent can re-sign cleanly
    await supabase.from('agents').update({
      rejection_reason: null,
      rejected_at: null,
    }).eq('id', agentState.id)
    router.replace('/onboarding/nda')
  }

  const isRejected = !!agentState?.rejection_reason && agentState?.onboarding_status !== 'awaiting_approval'

  if (loading) {
    return <div className="max-w-md mx-auto py-12 text-center"><p className="text-sm text-gray-400">Loading...</p></div>
  }

  if (isRejected) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="text-center space-y-4 py-8">
          <div className="w-14 h-14 bg-rose-50 rounded-full mx-auto flex items-center justify-center">
            <svg className="w-7 h-7 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Your application needs another look</h1>
            <p className="text-sm text-gray-500 mt-2">An admin has reviewed your signed documents and asked you to sign again.</p>
          </div>
        </div>

        <section className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-rose-800 uppercase tracking-wide mb-2">Reason from Admin</p>
          <p className="text-sm text-rose-900">&quot;{agentState?.rejection_reason}&quot;</p>
          {agentState?.rejected_at && (
            <p className="text-[11px] text-rose-600 mt-2">
              {new Date(agentState.rejected_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}
            </p>
          )}
        </section>

        <button onClick={startOver} disabled={restarting}
          className="w-full py-3 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
          {restarting ? 'Starting over...' : 'Review & Sign Again →'}
        </button>

        <p className="text-[11px] text-gray-500 text-center">
          If you believe this is a mistake, please contact your Tiktak admin directly.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-4 py-8">
        <div className="w-14 h-14 bg-amber-50 rounded-full mx-auto flex items-center justify-center">
          <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Thanks — your signatures have been received</h1>
          <p className="text-sm text-gray-500 mt-2">Your account will be activated by an admin shortly.<br />This page will redirect automatically once your account is ready.</p>
        </div>
      </div>

      {contracts.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Signed Agreements</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Click any agreement to review what you signed.</p>
          </div>
          <div className="space-y-2">
            {contracts.map(c => (
              <button key={c.id}
                onClick={() => router.push(`/onboarding/contract/${c.id}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 border border-gray-100 rounded-xl hover:border-[#0f4c35]/40 hover:bg-gray-50 transition-colors text-left">
                <svg className="w-5 h-5 text-[#0f4c35] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.title_snapshot}</p>
                  <p className="text-[11px] text-gray-500">Signed {new Date(c.signed_at).toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
                </div>
                <span className="text-xs text-[#0f4c35] font-medium shrink-0">View ↗</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
