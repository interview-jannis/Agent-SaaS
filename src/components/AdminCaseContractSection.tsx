'use client'

// Admin-side case contract viewer + counter-signature.
// Shows the 3-party contract status; admin can sign once both agent + client
// have signed. After admin signs, the case auto-advances awaiting_contract →
// awaiting_deposit (replacing the temp Mark Contract Signed button).

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CaseContractViewer from './CaseContractViewer'
import {
  getCaseContract,
  tryAdvanceContractSigned,
  type CaseContractRow,
} from '@/lib/caseContracts'
import { logAsCurrentUser } from '@/lib/audit'
import { notifyAgent } from '@/lib/notifications'
import { useCaseRealtime } from '@/hooks/useCaseRealtime'

type Props = {
  caseId: string
  caseNumber: string
  caseStatus: string
  onChanged?: () => Promise<void> | void
  readOnly?: boolean
}

export default function AdminCaseContractSection({ caseId, caseNumber, caseStatus, onChanged, readOnly = false }: Props) {
  const [contract, setContract] = useState<CaseContractRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminProfile, setAdminProfile] = useState<{ id: string; name: string; title: string | null } | null>(null)
  const [signing, setSigning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<boolean | null>(null)

  async function load() {
    const c = await getCaseContract(caseId, 'three_party')
    setContract(c)
    if (!adminProfile) {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (uid) {
        const { data: ad } = await supabase.from('admins').select('id, name, title').eq('auth_user_id', uid).maybeSingle()
        if (ad) setAdminProfile(ad as { id: string; name: string; title: string | null })
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [caseId])

  // Realtime: keep this section's contract row fresh when agent/client signs.
  useCaseRealtime(caseId, load)

  async function submitSig({ signatureDataUrl, typedName }: { signatureDataUrl: string; typedName: string }) {
    if (!contract || !adminProfile) return
    setSaving(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not signed in.')
      const res = await fetch('/api/case-contracts/sign-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ contract_id: contract.id, signature_data_url: signatureDataUrl, signed_typed_name: typedName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to sign.')
      await logAsCurrentUser('case_contract.signed_admin', { type: 'case', id: caseId, label: caseNumber })
      // Notify the agent. tryAdvanceContractSigned only notifies on full sign;
      // when admin signs early (order-independent) the agent should still know.
      const { data: caseRow } = await supabase.from('cases').select('agent_id').eq('id', caseId).maybeSingle()
      const aid = (caseRow as { agent_id: string | null } | null)?.agent_id
      if (aid) {
        await notifyAgent(aid, `${caseNumber} Interview Co. counter-signed the 3-party contract`, `/agent/cases/${caseId}`)
      }
      const { advanced } = await tryAdvanceContractSigned(caseId)
      setSigning(false)
      await load()
      if (advanced) await onChanged?.()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to sign.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null
  if (!contract) {
    return (
      <section className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">3-Party Contract</p>
        <p className="text-xs text-indigo-800">Agent has not generated the contract yet.</p>
      </section>
    )
  }

  // Order-independent: admin can counter-sign at any time. Status only advances
  // once all three sigs are collected (handled by case status checker), so the
  // signing order doesn't affect downstream flow.
  const canAdminSign = !contract.admin_signed_at && !readOnly
  const showSignMode = canAdminSign && (signing || !contract.admin_signed_at) ? 'admin' : null
  const fullySigned = !!contract.admin_signed_at && !!contract.agent_signed_at && !!contract.client_signed_at
  // Auto-collapse when fully signed; stay expanded when admin needs to sign.
  const isExpanded = expanded ?? !fullySigned

  return (
    <section id="case-contract" className="scroll-mt-20 bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 bg-gray-100 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">3-Party Contract</h3>
        <div className="flex items-center gap-2 shrink-0">
          {fullySigned && contract.client_token && (
            <button onClick={() => window.open(`/case-contract/${contract.client_token}?print=1`, '_blank', 'noopener')}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50">
              ⤓ Save PDF
            </button>
          )}
          <button onClick={() => setExpanded(!isExpanded)}
            className="text-[11px] font-medium text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50">
            {isExpanded ? '▲ Collapse' : '▼ Expand'}
          </button>
        </div>
      </div>
      <div className="p-4 space-y-4">
      <p className="text-xs text-gray-500">
        {fullySigned
          ? 'Fully signed.'
          : contract.admin_signed_at
            ? `Awaiting ${!contract.agent_signed_at ? 'agent' : 'client'} signature.`
            : 'Counter-sign below — remaining parties can sign in any order.'}
      </p>

      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {isExpanded && (
        <CaseContractViewer
          contract={contract}
          signMode={showSignMode}
          expectedTypedName={adminProfile?.name ?? null}
          onSubmit={submitSig}
          saving={saving}
          error={error}
        />
      )}

      <div className="text-xs text-gray-500 space-y-0.5 pl-1">
        <p>{contract.agent_signed_at ? '✓' : '○'} Agent {contract.agent_signed_at ? `signed ${new Date(contract.agent_signed_at).toLocaleDateString()}` : 'not signed'}</p>
        <p>{contract.client_signed_at ? '✓' : '○'} Client {contract.client_signed_at ? `signed ${new Date(contract.client_signed_at).toLocaleDateString()}` : 'not signed'}</p>
        <p>{contract.admin_signed_at ? '✓' : '○'} Admin {contract.admin_signed_at ? `signed ${new Date(contract.admin_signed_at).toLocaleDateString()}` : 'not signed'}</p>
      </div>

      {caseStatus === 'awaiting_contract' && contract.admin_signed_at && (
        <p className="text-xs text-gray-400 italic">All sigs collected. Status will advance on refresh.</p>
      )}
      </div>{/* /p-4 content wrapper */}
    </section>
  )
}
