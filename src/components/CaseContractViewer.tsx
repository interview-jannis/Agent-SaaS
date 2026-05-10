'use client'

// Reusable case contract renderer — shows body + 3 signature blocks (Agent /
// Client / Admin). Caller controls which (if any) signing mode is active.
//
// Sign UI mirrors the NDA/Partnership pattern (ContractStep.tsx):
//   - Identity confirm checkbox
//   - Typed full legal name (validated server-side against DB record for
//     agent/admin; recorded as explicit-intent statement for client)
//   - Drawn signature
//   - Korean Electronic Signatures Act notice
// Submit fires onSubmit({ signatureDataUrl, typedName }).

import SignaturePad from './SignaturePad'
import { useState } from 'react'
import type { CaseContractRow } from '@/lib/caseContracts'

type Block =
  | { kind: 'h'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }

function renderInline(text: string): React.ReactNode[] {
  text = text.replace(/\*{3,}/g, '**')
  const parts: React.ReactNode[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(<strong key={key++} className="font-semibold text-gray-900">{match[1]}</strong>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function renderBody(body: string): Block[] {
  const blocks: Block[] = []
  const lines = body.split('\n')
  let pBuf: string[] = []
  let ulBuf: string[] = []
  const flushP = () => {
    if (pBuf.length === 0) return
    const text = pBuf.join(' ').replace(/\s+/g, ' ').trim()
    if (text) blocks.push({ kind: 'p', text })
    pBuf = []
  }
  const flushUl = () => {
    if (ulBuf.length === 0) return
    blocks.push({ kind: 'ul', items: [...ulBuf] })
    ulBuf = []
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('## ')) { flushP(); flushUl(); blocks.push({ kind: 'h', text: line.slice(3).trim() }) }
    else if (line.startsWith('- ')) { flushP(); ulBuf.push(line.slice(2).trim()) }
    else if (line === '') { flushP(); flushUl() }
    else { flushUl(); pBuf.push(line) }
  }
  flushP(); flushUl()
  return blocks
}

type SignMode = 'agent' | 'client' | 'admin' | null

type SignSubmit = { signatureDataUrl: string; typedName: string }

type Props = {
  contract: CaseContractRow
  signMode?: SignMode
  /** Expected typed name for verification (agent or admin). Shown as placeholder
   *  and used in the identity confirm copy. Client mode has no expected name. */
  expectedTypedName?: string | null
  onSubmit?: (payload: SignSubmit) => Promise<void> | void
  saving?: boolean
  error?: string
  className?: string
}

export default function CaseContractViewer({
  contract,
  signMode = null,
  expectedTypedName,
  onSubmit,
  saving = false,
  error,
  className = '',
}: Props) {
  const [agree, setAgree] = useState(false)
  const [confirmIdentity, setConfirmIdentity] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [sig, setSig] = useState<string | null>(null)

  async function submit() {
    if (!sig || !agree || !confirmIdentity) return
    if (!typedName.trim()) return
    await onSubmit?.({ signatureDataUrl: sig, typedName: typedName.trim() })
  }

  const blocks = renderBody(contract.body_snapshot)
  const namePlaceholder = expectedTypedName?.trim() || 'Your full legal name'
  const identityLabel =
    signMode === 'client'
      ? 'I confirm the signature below is mine and is intended as my legal signature on this agreement.'
      : `I confirm I am ${expectedTypedName?.trim() || 'the named individual'}, and that the signature below is mine and is intended as my legal signature on this agreement.`

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-6 md:p-8 space-y-6 ${className}`}>
      <div className="text-center pb-4 border-b-2 border-gray-800">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Interview Co., Ltd. · TikkTakk Platform</p>
        <h1 className="text-xl font-bold text-gray-900 mt-2">{contract.title_snapshot}</h1>
      </div>

      <div className="text-sm text-gray-800 leading-relaxed max-h-[55vh] overflow-y-auto pr-2 print:max-h-none print:overflow-visible print:pr-0">
        {blocks.map((b, i) => {
          if (b.kind === 'h') return <h2 key={i} className="text-base font-bold text-gray-900 mt-6 mb-2 first:mt-0">{renderInline(b.text)}</h2>
          if (b.kind === 'ul') return (
            <ul key={i} className="list-disc pl-6 space-y-1 mb-3">
              {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
            </ul>
          )
          return <p key={i} className="mb-3 last:mb-0">{renderInline(b.text)}</p>
        })}
      </div>

      {/* Signatures grid — force 3 columns in print (md: breakpoint may not
          match the print viewport, so an explicit print: variant is needed). */}
      <div className="grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 gap-6 pt-4 border-t border-gray-200 print:break-inside-avoid">
        <SignatureSlot label="Agent" name={contract.agent_signer_name} signedAt={contract.agent_signed_at} sig={contract.agent_signature_data_url} />
        <SignatureSlot label="Client" name={contract.client_signer_name} signedAt={contract.client_signed_at} sig={contract.client_signature_data_url} />
        <SignatureSlot
          label="Interview Co., Ltd."
          name={contract.admin_signer_name ? `${contract.admin_signer_name}${contract.admin_signer_title ? ` (${contract.admin_signer_title})` : ''}` : null}
          signedAt={contract.admin_signed_at}
          sig={contract.admin_signature_data_url}
        />
      </div>

      {/* Signing UI */}
      {signMode && (() => {
        const tone =
          signMode === 'agent'
            ? { ring: 'ring-emerald-200', bg: 'bg-emerald-50', accent: 'bg-emerald-600', label: 'text-emerald-700', subtitle: 'text-emerald-700/80', heading: 'Signing as Agent', sub: 'You are signing on behalf of yourself as the booking agent.' }
            : signMode === 'client'
              ? { ring: 'ring-sky-200', bg: 'bg-sky-50', accent: 'bg-sky-600', label: 'text-sky-700', subtitle: 'text-sky-700/80', heading: 'Signing as Client', sub: 'The patient/traveler is signing this agreement on this device.' }
              : { ring: 'ring-indigo-200', bg: 'bg-indigo-50', accent: 'bg-indigo-600', label: 'text-indigo-700', subtitle: 'text-indigo-700/80', heading: 'Signing as Interview Co., Ltd.', sub: 'Counter-signing as the platform party.' }
        return (
        <div className={`space-y-4 mt-4 p-5 rounded-2xl ring-1 ${tone.ring} ${tone.bg}`}>
          <div className="flex items-start gap-3">
            <span className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full ${tone.accent} text-white text-sm font-semibold`}>
              {signMode === 'agent' ? 'A' : signMode === 'client' ? 'C' : 'Co'}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${tone.label}`}>{tone.heading}</p>
              <p className={`text-xs ${tone.subtitle} mt-0.5`}>{tone.sub}</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#0f4c35] shrink-0" />
              <span className="text-sm text-gray-700">
                I have read this {contract.title_snapshot} <span className="font-semibold text-gray-900">in full</span>, understand its terms,
                and voluntarily agree to be legally bound by them.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={confirmIdentity} onChange={e => setConfirmIdentity(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#0f4c35] shrink-0" />
              <span className="text-sm text-gray-700">{identityLabel}</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type your full legal name to confirm *</label>
            <input
              type="text"
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              placeholder={namePlaceholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              {signMode === 'client'
                ? 'Recorded as explicit-intent evidence alongside your drawn signature.'
                : 'Must exactly match your registered name. Recorded as explicit-intent evidence alongside your drawn signature.'}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Signature *</p>
            <SignaturePad onChange={setSig} />
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            By signing, you acknowledge that this electronic signature has the same legal effect as a handwritten one
            under Korea&apos;s Electronic Signatures Act. Your IP address, device, and a cryptographic hash of
            your signature image are recorded server-side as audit evidence.
          </p>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button onClick={submit} disabled={saving || !agree || !confirmIdentity || !typedName.trim() || !sig}
            className={`px-5 py-2.5 text-sm font-medium ${tone.accent} text-white rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed`}>
            {saving ? 'Signing…' : `Sign as ${signMode === 'agent' ? 'Agent' : signMode === 'client' ? 'Client' : 'Interview Co.'}`}
          </button>
        </div>
        )
      })()}
    </div>
  )
}

function SignatureSlot({ label, name, signedAt, sig }: { label: string; name: string | null; signedAt: string | null; sig: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      {sig ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sig} alt={`${label} signature`} className="max-h-20 border border-gray-200 rounded bg-white" />
          <p className="text-[11px] text-gray-600 mt-2">{name ?? '—'}</p>
          {signedAt && <p className="text-[10px] text-gray-400">{new Date(signedAt).toLocaleDateString('en-US', { dateStyle: 'long' })}</p>}
        </>
      ) : (
        <div className="h-20 border border-dashed border-gray-300 rounded flex items-center justify-center">
          <p className="text-[11px] text-gray-400 italic">Awaiting signature</p>
        </div>
      )}
    </div>
  )
}
