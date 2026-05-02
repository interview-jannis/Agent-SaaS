'use client'

// Reusable case contract renderer — shows body + 3 signature blocks (Agent /
// Client / Admin). Caller controls which (if any) signing mode is active.

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

type Props = {
  contract: CaseContractRow
  signMode?: SignMode
  /** When in client mode, the viewer collects the signer's name (no auth). */
  clientSignerName?: string
  onClientSignerNameChange?: (v: string) => void
  /** Callback fired when user clicks Save with a captured signature. */
  onSubmit?: (signatureDataUrl: string) => Promise<void> | void
  saving?: boolean
  error?: string
  className?: string
}

export default function CaseContractViewer({
  contract,
  signMode = null,
  clientSignerName,
  onClientSignerNameChange,
  onSubmit,
  saving = false,
  error,
  className = '',
}: Props) {
  const [agree, setAgree] = useState(false)
  const [sig, setSig] = useState<string | null>(null)

  async function submit() {
    if (!sig || !agree) return
    if (signMode === 'client' && !(clientSignerName ?? '').trim()) return
    await onSubmit?.(sig)
  }

  const blocks = renderBody(contract.body_snapshot)

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-6 md:p-8 space-y-6 ${className}`}>
      <div className="text-center pb-4 border-b-2 border-gray-800">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Interview Co., Ltd. · Tiktak Platform</p>
        <h1 className="text-xl font-bold text-gray-900 mt-2">{contract.title_snapshot}</h1>
      </div>

      <div className="text-sm text-gray-800 leading-relaxed max-h-[55vh] overflow-y-auto pr-2">
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

      {/* Signatures grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-200">
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
      {signMode && (
        <div className="space-y-3 pt-4 border-t border-dashed border-gray-300">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {signMode === 'agent' ? 'Sign as Agent' : signMode === 'client' ? 'Sign as Client' : 'Sign as Admin'}
          </p>
          {signMode === 'client' && (
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Your full legal name *</label>
              <input
                value={clientSignerName ?? ''}
                onChange={e => onClientSignerNameChange?.(e.target.value)}
                placeholder="As shown on passport"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]"
              />
            </div>
          )}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-[#0f4c35]" />
            <span className="text-sm text-gray-700">I have read and agree to the terms of the {contract.title_snapshot}.</span>
          </label>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Signature *</p>
            <SignaturePad onChange={setSig} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={submit} disabled={saving || !agree || !sig || (signMode === 'client' && !(clientSignerName ?? '').trim())}
            className="px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Signing…' : 'Sign'}
          </button>
        </div>
      )}
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
