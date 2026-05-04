'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Contract = {
  id: string
  agent_id: string
  contract_type: 'nda' | 'partnership'
  title_snapshot: string
  body_snapshot: string
  signature_data_url: string | null
  signature_hash: string | null
  signed_typed_name: string | null
  signed_at: string
  ip_address: string | null
  user_agent: string | null
  admin_signature_data_url: string | null
  admin_signature_hash: string | null
  admin_signed_typed_name: string | null
  admin_signed_at: string | null
  admin_signer_name: string | null
  admin_signer_title: string | null
}

type Agent = {
  agent_number: string | null
  name: string
  country: string | null
}

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

export default function AgentContractViewerPage() {
  const { contractId } = useParams<{ contractId: string }>()
  const router = useRouter()
  const [contract, setContract] = useState<Contract | null>(null)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) { router.replace('/login'); return }
      const { data: agentRow } = await supabase.from('agents')
        .select('id, agent_number, name, country').eq('auth_user_id', session.user.id).maybeSingle()
      if (!agentRow) { router.replace('/login'); return }

      const { data: c } = await supabase.from('agent_contracts').select('*').eq('id', contractId).maybeSingle()
      if (!c || (c as Contract).agent_id !== (agentRow as { id: string }).id) {
        setDenied(true); setLoading(false); return
      }
      setContract(c as Contract)
      setAgent(agentRow as Agent)
      setLoading(false)
    }
    load()
  }, [contractId, router])

  if (loading) return <p className="text-sm text-gray-400 text-center py-12">Loading...</p>
  if (denied || !contract || !agent) return <p className="text-sm text-gray-500 text-center py-12">Contract not found.</p>

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3 print:hidden">
        <button onClick={() => router.push('/onboarding/waiting')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
        <button onClick={() => window.print()}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828]">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
          </svg>
          Print / Save PDF
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <div className="text-center mb-6 pb-4 border-b-2 border-gray-800">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Interview Co., Ltd. · Tiktak Platform</p>
          <h1 className="text-xl font-bold text-gray-900 mt-2">{contract.title_snapshot}</h1>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs text-gray-700 mb-6">
          <div>
            <p className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1">Agent</p>
            <p className="font-medium">{agent.name}</p>
            {agent.country && <p className="text-gray-500">{agent.country}</p>}
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1">Signed On</p>
            <p className="font-medium">{new Date(contract.signed_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</p>
          </div>
        </div>

        <div className="text-sm text-gray-800 leading-relaxed">
          {renderBody(contract.body_snapshot).map((b, i) => {
            if (b.kind === 'h') return <h2 key={i} className="text-base font-bold text-gray-900 mt-8 mb-2 first:mt-0">{renderInline(b.text)}</h2>
            if (b.kind === 'ul') return (
              <ul key={i} className="list-disc pl-6 space-y-1 mb-3">
                {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
              </ul>
            )
            return <p key={i} className="mb-3 last:mb-0">{renderInline(b.text)}</p>
          })}
        </div>

        <div className="mt-10 pt-4 border-t border-gray-300 grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6 print:gap-4 print:break-inside-avoid">
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Signature</p>
            {contract.signature_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={contract.signature_data_url} alt="Your signature"
                className="h-32 w-full object-contain border border-gray-200 rounded bg-white" />
            ) : (
              <p className="text-xs text-gray-400 italic">No signature captured.</p>
            )}
            <div className="mt-3 text-[11px] text-gray-600 space-y-0.5">
              <p><span className="font-semibold text-gray-500">Name:</span> {agent.name}</p>
              {contract.signed_typed_name && (
                <p><span className="font-semibold text-gray-500">Typed Confirmation:</span> {contract.signed_typed_name}</p>
              )}
              <p><span className="font-semibold text-gray-500">Date:</span> {new Date(contract.signed_at).toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Interview Co., Ltd. Counter-signature</p>
            {contract.admin_signature_data_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={contract.admin_signature_data_url} alt="Interview Co. signature"
                  className="h-32 w-full object-contain border border-gray-200 rounded bg-white" />
                <div className="mt-3 text-[11px] text-gray-600 space-y-0.5">
                  <p><span className="font-semibold text-gray-500">Name:</span> {contract.admin_signer_name ?? '—'}{contract.admin_signer_title ? ` (${contract.admin_signer_title})` : ''}</p>
                  {contract.admin_signed_typed_name && (
                    <p><span className="font-semibold text-gray-500">Typed Confirmation:</span> {contract.admin_signed_typed_name}</p>
                  )}
                  <p><span className="font-semibold text-gray-500">Date:</span> {contract.admin_signed_at ? new Date(contract.admin_signed_at).toLocaleDateString('en-US', { dateStyle: 'long' }) : '—'}</p>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400 italic">Awaiting counter-signature.</p>
            )}
          </div>
        </div>

        {/* Audit footer — small print, evidentiary metadata */}
        <div className="mt-10 pt-4 border-t border-gray-100 text-[10px] text-gray-400 space-y-0.5">
          <p>Document ID: {contract.id}</p>
          {contract.ip_address && <p>Signing IP Address: {contract.ip_address}</p>}
          {contract.signature_hash && <p className="break-all">Your Signature SHA-256: {contract.signature_hash}</p>}
          {contract.admin_signature_hash && <p className="break-all">Counter-signature SHA-256: {contract.admin_signature_hash}</p>}
          {contract.user_agent && <p className="break-all">User Agent: {contract.user_agent}</p>}
          <p className="pt-1 text-gray-400">
            Signed electronically under Korea&apos;s Electronic Signatures Act (Article 3, general electronic signature).
            The hashes above let you verify after the fact that the stored signature image has not been altered.
          </p>
        </div>
      </div>
    </div>
  )
}
