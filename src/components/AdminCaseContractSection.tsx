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
  signAsAdmin,
  tryAdvanceContractSigned,
  type CaseContractRow,
} from '@/lib/caseContracts'
import { logAsCurrentUser } from '@/lib/audit'

type Props = {
  caseId: string
  caseNumber: string
  caseStatus: string
  onChanged?: () => Promise<void> | void
}

export default function AdminCaseContractSection({ caseId, caseNumber, caseStatus, onChanged }: Props) {
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

  async function submitSig(sig: string) {
    if (!contract || !adminProfile) return
    setSaving(true); setError('')
    try {
      await signAsAdmin(contract.id, sig, adminProfile)
      await logAsCurrentUser('case_contract.signed_admin', { type: 'case', id: caseId, label: caseNumber })
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
      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">3-Party Contract</p>
        <p className="text-xs text-amber-800">Agent has not generated the contract yet.</p>
      </section>
    )
  }

  const canAdminSign = !!contract.agent_signed_at && !!contract.client_signed_at && !contract.admin_signed_at
  const showSignMode = canAdminSign && (signing || !contract.admin_signed_at) ? 'admin' : null
  const fullySigned = !!contract.admin_signed_at
  // Auto-collapse when fully signed; stay expanded when admin needs to sign.
  const isExpanded = expanded ?? !fullySigned

  return (
    <section id="case-contract" className="scroll-mt-20 bg-gray-50 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">3-Party Contract</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {contract.admin_signed_at
              ? 'Fully signed.'
              : canAdminSign
                ? 'Agent + Client signed — counter-sign below to advance to deposit phase.'
                : `Awaiting ${!contract.agent_signed_at ? 'agent' : 'client'} signature.`}
          </p>
        </div>
        <button onClick={() => setExpanded(!isExpanded)}
          className="text-[11px] font-medium text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 shrink-0">
          {isExpanded ? '▲ Collapse' : '▼ Expand'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {isExpanded && (
        <CaseContractViewer
          contract={contract}
          signMode={showSignMode}
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
    </section>
  )
}
