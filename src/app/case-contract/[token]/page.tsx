'use client'

// Public client-signing page for case contracts. Anyone with the token can
// view + sign as the Client. After client signs, admin gets notified to
// counter-sign in the admin panel.

import { useEffect, useState, use as useUnwrap } from 'react'
import { supabase } from '@/lib/supabase'
import CaseContractViewer from '@/components/CaseContractViewer'
import {
  getCaseContractByToken,
  signAsClient,
  tryAdvanceContractSigned,
  type CaseContractRow,
} from '@/lib/caseContracts'
import { notifyAssignedAdmin } from '@/lib/notifications'

export default function CaseContractPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = useUnwrap(params)
  const [contract, setContract] = useState<CaseContractRow | null>(null)
  const [caseNumber, setCaseNumber] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [clientName, setClientName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function load() {
    const c = await getCaseContractByToken(token)
    if (!c) { setDenied(true); setLoading(false); return }
    setContract(c)
    if (c.client_signer_name) setClientName(c.client_signer_name)
    const { data: caseRow } = await supabase.from('cases').select('case_number').eq('id', c.case_id).maybeSingle()
    setCaseNumber((caseRow as { case_number?: string } | null)?.case_number ?? '')
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  async function submit(sig: string) {
    if (!contract) return
    if (!clientName.trim()) { setError('Please enter your full legal name.'); return }
    setSaving(true); setError('')
    try {
      await signAsClient(contract.id, sig, clientName.trim())
      // Notify admins so they know to counter-sign
      await notifyAssignedAdmin({ case_id: contract.case_id }, `${caseNumber} client signed contract — admin counter-signature needed`, `/admin/cases/${contract.case_id}`)
      // Try to auto-advance (won't fire — admin still hasn't signed)
      await tryAdvanceContractSigned(contract.case_id)
      setDone(true)
      await load()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to sign.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-sm text-gray-400">Loading...</p></div>
  if (denied) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-sm text-gray-500">Contract link not found or expired.</p></div>
  if (!contract) return null

  const alreadySigned = !!contract.client_signed_at
  const showSignMode = !alreadySigned && !done

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-4">
        <div className="text-center">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Tiktak · Case {caseNumber}</p>
          <h1 className="text-xl font-semibold text-gray-900 mt-1">{contract.title_snapshot}</h1>
        </div>

        {(done || alreadySigned) && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-800">
            ✓ You&apos;ve signed this contract. Interview Co., Ltd. will counter-sign next.
          </div>
        )}

        <CaseContractViewer
          contract={contract}
          signMode={showSignMode ? 'client' : null}
          clientSignerName={clientName}
          onClientSignerNameChange={setClientName}
          onSubmit={submit}
          saving={saving}
          error={error}
        />
      </div>
    </div>
  )
}
