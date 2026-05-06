'use client'

// Public client-signing page for case contracts. Anyone with the token can
// view + sign as the Client. After client signs, admin gets notified to
// counter-sign in the admin panel.

import { useEffect, useState, use as useUnwrap } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CaseContractViewer from '@/components/CaseContractViewer'
import {
  getCaseContractByToken,
  tryAdvanceContractSigned,
  type CaseContractRow,
} from '@/lib/caseContracts'
import { notifyAssignedAdmin } from '@/lib/notifications'

export default function CaseContractPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = useUnwrap(params)
  const searchParams = useSearchParams()
  // Print mode: hide sign UI, drop the green "you've signed" banner, fire
  // window.print() once the contract has rendered. Used by Save PDF buttons
  // on agent/admin case pages — opens this view in a new tab.
  const printMode = searchParams.get('print') === '1'
  const [contract, setContract] = useState<CaseContractRow | null>(null)
  const [caseNumber, setCaseNumber] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function load() {
    const c = await getCaseContractByToken(token)
    if (!c) { setDenied(true); setLoading(false); return }
    setContract(c)
    const { data: caseRow } = await supabase.from('cases').select('case_number').eq('id', c.case_id).maybeSingle()
    setCaseNumber((caseRow as { case_number?: string } | null)?.case_number ?? '')
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  // Auto-print once the contract has rendered. Tiny delay so signature images
  // and signature slots are painted before the print dialog opens.
  useEffect(() => {
    if (!printMode || loading || !contract) return
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [printMode, loading, contract])

  async function submit({ signatureDataUrl, typedName }: { signatureDataUrl: string; typedName: string }) {
    if (!contract) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/case-contracts/sign-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_token: token, signature_data_url: signatureDataUrl, signed_typed_name: typedName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to sign.')
      await notifyAssignedAdmin({ case_id: contract.case_id }, `${caseNumber} client signed contract — counter-sign anytime`, `/admin/cases/${contract.case_id}`)
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
  const showSignMode = !printMode && !alreadySigned && !done

  return (
    <div className="min-h-screen bg-gray-50 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto px-4 space-y-4 print:px-0 print:max-w-none">
        <div className="text-center print:hidden">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Tiktak · Case {caseNumber}</p>
          <h1 className="text-xl font-semibold text-gray-900 mt-1">{contract.title_snapshot}</h1>
        </div>

        {!printMode && (done || alreadySigned) && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-800">
            ✓ You&apos;ve signed this contract. Interview Co., Ltd. will counter-sign next.
          </div>
        )}

        <CaseContractViewer
          contract={contract}
          signMode={showSignMode ? 'client' : null}
          onSubmit={submit}
          saving={saving}
          error={error}
        />
      </div>
    </div>
  )
}
