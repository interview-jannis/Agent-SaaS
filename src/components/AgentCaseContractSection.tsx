'use client'

// Agent-side case contract management. Lives on agent case detail page.
// Handles: generate contract from template → agent signs → copies client link
// → waits for client + admin sigs.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CaseContractViewer from './CaseContractViewer'
import {
  createCaseContract,
  getCaseContract,
  tryAdvanceContractSigned,
  type CaseContractRow,
} from '@/lib/caseContracts'
import { logAsCurrentUser } from '@/lib/audit'
import { notifyAssignedAdmin } from '@/lib/notifications'
import { useCaseRealtime } from '@/hooks/useCaseRealtime'

type Props = {
  caseId: string
  caseNumber: string
  agentName: string
  agentCountry: string | null
  clientName: string | null
  quoteNumber: string | null
  totalKrw: number | null
  caseStatus: string
  onChanged?: () => Promise<void> | void
}

export default function AgentCaseContractSection({
  caseId, caseNumber, agentName, agentCountry, clientName,
  quoteNumber, totalKrw, caseStatus, onChanged,
}: Props) {
  const [contract, setContract] = useState<CaseContractRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [signing, setSigning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  // Offline signing — when client is physically present and the agent collects
  // the signature on this device instead of sending the link.
  const [clientSignMode, setClientSignMode] = useState(false)
  const [depositPctDefault, setDepositPctDefault] = useState('50')
  // Collapsible — auto-collapse when fully signed (no action needed) so the
  // long contract body doesn't dominate the case detail page.
  const [expanded, setExpanded] = useState<boolean | null>(null)

  async function load() {
    const c = await getCaseContract(caseId, 'three_party')
    setContract(c)
    setLoading(false)
  }

  // Realtime: keep this section's contract row fresh when admin/client signs.
  useCaseRealtime(caseId, load)

  useEffect(() => {
    load()
    supabase.from('system_settings').select('value').eq('key', 'deposit_percentage').maybeSingle()
      .then(({ data }) => {
        const pct = (data?.value as { percentage?: number } | null)?.percentage
        if (pct !== undefined) setDepositPctDefault(String(pct))
      })
  }, [caseId])

  async function generate() {
    setCreating(true); setError('')
    try {
      const total = totalKrw ? `₩${totalKrw.toLocaleString('ko-KR')}` : '[Total]'
      const c = await createCaseContract(caseId, 'three_party', {
        AGENT_NAME: agentName,
        AGENT_COUNTRY: agentCountry ?? '',
        CLIENT_NAME: clientName ?? '',
        CASE_NUMBER: caseNumber,
        QUOTE_NUMBER: quoteNumber ?? '',
        TOTAL_AMOUNT: total,
        DEPOSIT_PERCENTAGE: depositPctDefault,
      })
      setContract(c)
      await logAsCurrentUser('case_contract.created', { type: 'case', id: caseId, label: caseNumber }, { contract_type: 'three_party' })
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to generate contract.')
    } finally {
      setCreating(false)
    }
  }

  async function submitAgentSig({ signatureDataUrl, typedName }: { signatureDataUrl: string; typedName: string }) {
    if (!contract) return
    setSaving(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not signed in.')
      const res = await fetch('/api/case-contracts/sign-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ contract_id: contract.id, signature_data_url: signatureDataUrl, signed_typed_name: typedName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to sign.')
      await logAsCurrentUser('case_contract.signed_agent', { type: 'case', id: caseId, label: caseNumber })
      await notifyAssignedAdmin({ case_id: caseId }, `${caseNumber} agent signed contract — counter-sign anytime`, `/admin/cases/${caseId}`)
      await tryAdvanceContractSigned(caseId)
      setSigning(false)
      await load()
      await onChanged?.()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to sign.')
    } finally {
      setSaving(false)
    }
  }

  async function submitClientSig({ signatureDataUrl, typedName }: { signatureDataUrl: string; typedName: string }) {
    if (!contract?.client_token) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/case-contracts/sign-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_token: contract.client_token, signature_data_url: signatureDataUrl, signed_typed_name: typedName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to sign.')
      await logAsCurrentUser('case_contract.signed_client', { type: 'case', id: caseId, label: caseNumber }, { mode: 'on_device' })
      await tryAdvanceContractSigned(caseId)
      setClientSignMode(false)
      await load()
      await onChanged?.()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to sign.')
    } finally {
      setSaving(false)
    }
  }

  async function copyClientLink() {
    if (!contract?.client_token) return
    const url = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/case-contract/${contract.client_token}`
    await navigator.clipboard.writeText(url)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // After admin signs, this section may still be visible briefly — try advance.
  useEffect(() => {
    if (contract?.agent_signed_at && contract?.client_signed_at && contract?.admin_signed_at && caseStatus === 'awaiting_contract') {
      tryAdvanceContractSigned(caseId).then(({ advanced }) => { if (advanced) onChanged?.() })
    }
  }, [contract, caseId, caseStatus, onChanged])

  if (loading) return null

  // Default expand state: collapse when fully signed (case has moved on);
  // expand when action is needed.
  const fullySigned = !!(contract?.agent_signed_at && contract?.client_signed_at && contract?.admin_signed_at)
  const isExpanded = expanded ?? !fullySigned

  return (
    <section id="case-contract" className={`scroll-mt-20 rounded-2xl overflow-hidden ${caseStatus === 'awaiting_contract' ? 'bg-white border-2 border-[#0f4c35]' : 'bg-gray-50 border border-gray-200'}`}>
      <div className={`flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-2.5 border-b ${caseStatus === 'awaiting_contract' ? 'bg-green-50 border-green-200' : 'bg-gray-100 border-gray-200'}`}>
        <div className="flex-1 min-w-0">
          <h3 className={`text-xs font-semibold uppercase tracking-wide ${caseStatus === 'awaiting_contract' ? 'text-[#0f4c35]' : 'text-gray-700'}`}>3-Party Contract</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {fullySigned && contract && contract.client_token && (
            <button onClick={() => window.open(`/case-contract/${contract.client_token}?print=1`, '_blank', 'noopener')}
              className="flex-1 sm:flex-none text-[11px] font-medium text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
              ⤓ Save PDF
            </button>
          )}
          {contract && contract.client_token && !contract.client_signed_at && (
            <>
              <button onClick={copyClientLink}
                className="flex-1 sm:flex-none text-xs font-medium px-3 py-1.5 rounded-lg bg-[#0f4c35] text-white hover:bg-[#0a3828]">
                {copied ? '✓ Copied!' : 'Copy Client Link'}
              </button>
              <button onClick={() => { setClientSignMode(v => !v); setError('') }}
                className="flex-1 sm:flex-none text-xs font-medium px-3 py-1.5 rounded-lg border border-[#0f4c35] text-[#0f4c35] hover:bg-[#0f4c35]/5">
                {clientSignMode ? 'Cancel' : 'Sign on this device'}
              </button>
            </>
          )}
          {contract && (
            <button onClick={() => setExpanded(!isExpanded)}
              className="flex-1 sm:flex-none text-[11px] font-medium text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
              {isExpanded ? '▲ Collapse' : '▼ Expand'}
            </button>
          )}
        </div>
      </div>
      <div className="p-5 space-y-4">
      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {!contract ? (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 text-center space-y-3">
          <p className="text-sm font-medium text-indigo-900">No contract generated yet.</p>
          <p className="text-xs text-indigo-700">Click below to generate the 3-party agreement using the company template, then sign it as the agent and send the link to your client.</p>
          <button onClick={generate} disabled={creating}
            className="px-4 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
            {creating ? 'Generating...' : 'Generate Contract'}
          </button>
        </div>
      ) : isExpanded ? (
        clientSignMode && !contract.client_signed_at ? (
          <CaseContractViewer
            key="sign-client"
            contract={contract}
            signMode="client"
            onSubmit={submitClientSig}
            saving={saving}
            error={error}
          />
        ) : (
          <CaseContractViewer
            key={!contract.agent_signed_at || signing ? 'sign-agent' : 'view'}
            contract={contract}
            signMode={!contract.agent_signed_at ? 'agent' : (signing ? 'agent' : null)}
            expectedTypedName={agentName}
            onSubmit={submitAgentSig}
            saving={saving}
            error={error}
          />
        )
      ) : null}

      {/* Status hints — always visible (compact summary even when collapsed) */}
      {contract && (
        <div className="text-xs text-gray-500 space-y-0.5 pl-1">
          <p>{contract.agent_signed_at ? '✓' : '○'} Agent {contract.agent_signed_at ? `signed ${new Date(contract.agent_signed_at).toLocaleDateString()}` : 'not signed'}</p>
          <p>{contract.client_signed_at ? '✓' : '○'} Client {contract.client_signed_at ? `signed ${new Date(contract.client_signed_at).toLocaleDateString()}` : 'not signed'}</p>
          <p>{contract.admin_signed_at ? '✓' : '○'} Admin {contract.admin_signed_at ? `signed ${new Date(contract.admin_signed_at).toLocaleDateString()}` : 'not signed'}</p>
        </div>
      )}
      </div>{/* /p-5 content wrapper */}
    </section>
  )
}
