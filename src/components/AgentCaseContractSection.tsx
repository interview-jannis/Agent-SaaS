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
  signAsAgent,
  signAsClient,
  tryAdvanceContractSigned,
  type CaseContractRow,
} from '@/lib/caseContracts'
import { logAsCurrentUser } from '@/lib/audit'
import { notifyAssignedAdmin } from '@/lib/notifications'

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
  const [clientSignerName, setClientSignerName] = useState('')
  const [depositPctDefault, setDepositPctDefault] = useState('50')
  // Collapsible — auto-collapse when fully signed (no action needed) so the
  // long contract body doesn't dominate the case detail page.
  const [expanded, setExpanded] = useState<boolean | null>(null)

  async function load() {
    const c = await getCaseContract(caseId, 'three_party')
    setContract(c)
    setLoading(false)
  }

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

  async function submitAgentSig(sig: string) {
    if (!contract) return
    setSaving(true); setError('')
    try {
      await signAsAgent(contract.id, sig, agentName)
      await logAsCurrentUser('case_contract.signed_agent', { type: 'case', id: caseId, label: caseNumber })
      // Notify admin (informational — they can prepare to counter-sign once client signs)
      await notifyAssignedAdmin({ case_id: caseId }, `${caseNumber} agent signed contract — awaiting client signature`, `/admin/cases/${caseId}`)
      setSigning(false)
      await load()
      await onChanged?.()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to sign.')
    } finally {
      setSaving(false)
    }
  }

  async function submitClientSig(sig: string) {
    if (!contract) return
    if (!clientSignerName.trim()) { setError('Please enter the client\'s full legal name.'); return }
    setSaving(true); setError('')
    try {
      await signAsClient(contract.id, sig, clientSignerName.trim())
      await logAsCurrentUser('case_contract.signed_client', { type: 'case', id: caseId, label: caseNumber }, { mode: 'on_device' })
      // Try advance — won't fire (admin still hasn't signed), but harmless.
      await tryAdvanceContractSigned(caseId)
      setClientSignMode(false)
      setClientSignerName('')
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
    const url = `${window.location.origin}/case-contract/${contract.client_token}`
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
    <section id="case-contract" className="scroll-mt-20 bg-gray-50 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">3-Party Contract</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {fullySigned ? 'Fully signed.' : 'All 3 signatures unlock the deposit phase.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {contract && contract.agent_signed_at && contract.client_token && !contract.client_signed_at && (
            <>
              <button onClick={copyClientLink}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#0f4c35] text-white hover:bg-[#0a3828]">
                {copied ? '✓ Copied!' : 'Copy Client Link'}
              </button>
              <button onClick={() => { setClientSignMode(v => !v); setError('') }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#0f4c35] text-[#0f4c35] hover:bg-[#0f4c35]/5">
                {clientSignMode ? 'Cancel' : 'Sign on this device'}
              </button>
            </>
          )}
          {contract && (
            <button onClick={() => setExpanded(!isExpanded)}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50">
              {isExpanded ? '▲ Collapse' : '▼ Expand'}
            </button>
          )}
        </div>
      </div>

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
        clientSignMode && contract.agent_signed_at && !contract.client_signed_at ? (
          <CaseContractViewer
            contract={contract}
            signMode="client"
            clientSignerName={clientSignerName}
            onClientSignerNameChange={setClientSignerName}
            onSubmit={submitClientSig}
            saving={saving}
            error={error}
          />
        ) : (
          <CaseContractViewer
            contract={contract}
            signMode={!contract.agent_signed_at ? 'agent' : (signing ? 'agent' : null)}
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
    </section>
  )
}
