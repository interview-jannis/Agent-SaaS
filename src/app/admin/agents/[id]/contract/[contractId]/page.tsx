'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SignaturePad from '@/components/SignaturePad'
import { logAsCurrentUser } from '@/lib/audit'

type Contract = {
  id: string
  agent_id: string
  contract_type: 'nda' | 'partnership'
  title_snapshot: string
  body_snapshot: string
  signature_data_url: string | null
  signed_at: string
  ip_address: string | null
  user_agent: string | null
  approved_at: string | null
  // Admin countersignature (added 2026-05-02)
  admin_signature_data_url: string | null
  admin_signed_at: string | null
  admin_signer_id: string | null
  admin_signer_name: string | null
  admin_signer_title: string | null
}

type Agent = {
  agent_number: string | null
  name: string
  email: string | null
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

export default function ContractViewerPage() {
  const { id, contractId } = useParams<{ id: string; contractId: string }>()
  const router = useRouter()
  const [contract, setContract] = useState<Contract | null>(null)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)

  // Admin sign state
  const [signing, setSigning] = useState(false)
  const [adminSig, setAdminSig] = useState<string | null>(null)
  const [savingSig, setSavingSig] = useState(false)
  const [sigError, setSigError] = useState('')
  const [adminProfile, setAdminProfile] = useState<{ id: string; name: string; title: string | null } | null>(null)

  async function load() {
    const [cRes, aRes, sessRes] = await Promise.all([
      supabase.from('agent_contracts').select('*').eq('id', contractId).maybeSingle(),
      supabase.from('agents').select('agent_number, name, email, country').eq('id', id).maybeSingle(),
      supabase.auth.getSession(),
    ])
    setContract((cRes.data as Contract) ?? null)
    setAgent((aRes.data as Agent) ?? null)

    const uid = sessRes.data.session?.user?.id
    if (uid) {
      const { data: ad } = await supabase.from('admins').select('id, name, title').eq('auth_user_id', uid).maybeSingle()
      if (ad) setAdminProfile(ad as { id: string; name: string; title: string | null })
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id, contractId])

  async function submitSignature() {
    if (!contract || !adminProfile || !adminSig) {
      setSigError('Please sign above.'); return
    }
    setSavingSig(true); setSigError('')
    try {
      const { error } = await supabase.from('agent_contracts').update({
        admin_signature_data_url: adminSig,
        admin_signed_at: new Date().toISOString(),
        admin_signer_id: adminProfile.id,
        admin_signer_name: adminProfile.name,
        admin_signer_title: adminProfile.title,
      }).eq('id', contract.id)
      if (error) throw error
      await logAsCurrentUser('agent_contract.countersigned', {
        type: 'agent', id: contract.agent_id, label: agent?.name ?? '',
      }, { contract_type: contract.contract_type })
      setSigning(false); setAdminSig(null)
      await load()
    } catch (e: unknown) {
      setSigError((e as { message?: string })?.message ?? 'Failed to save signature.')
    } finally {
      setSavingSig(false)
    }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  if (!contract || !agent) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Contract not found.</p></div>

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar — hidden when printing */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-gray-100 print:hidden">
        <button onClick={() => router.push(`/admin/agents/${id}`)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Agent
        </button>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-900">{contract.title_snapshot}</span>
        <button onClick={() => window.print()}
          className="print:hidden ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828]">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
          </svg>
          Print / Save PDF
        </button>
      </div>

      {/* Document */}
      <div className="flex-1 overflow-y-auto print:overflow-visible">
        <div className="max-w-[750px] mx-auto px-12 py-10 print:p-0 print:max-w-none">
          {/* Header */}
          <div className="text-center mb-8 pb-6 border-b-2 border-gray-800">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Interview Co., Ltd. · Tiktak Platform</p>
            <h1 className="text-2xl font-bold text-gray-900 mt-3">{contract.title_snapshot}</h1>
          </div>

          {/* Parties meta */}
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-700 mb-8">
            <div>
              <p className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1">Agent</p>
              <p className="font-medium">{agent.name}</p>
              {agent.country && <p className="text-gray-500">{agent.country}</p>}
              {agent.agent_number && <p className="text-gray-500 font-mono text-[11px]">{agent.agent_number}</p>}
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1">Signed On</p>
              <p className="font-medium">{new Date(contract.signed_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</p>
              {contract.approved_at && (
                <p className="text-gray-500 text-[11px] mt-1">Approved {new Date(contract.approved_at).toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
              )}
            </div>
          </div>

          {/* Body */}
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

          {/* Signature block — Agent + Admin */}
          <div className="mt-12 pt-6 border-t border-gray-300 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Agent signature */}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Agent Signature</p>
              {contract.signature_data_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={contract.signature_data_url} alt="Agent signature"
                  className="max-h-32 border border-gray-200 rounded bg-white" />
              ) : (
                <p className="text-xs text-gray-400 italic">No signature captured.</p>
              )}
              <div className="mt-3 text-[11px] text-gray-600 space-y-0.5">
                <p><span className="font-semibold text-gray-500">Name:</span> {agent.name}</p>
                <p><span className="font-semibold text-gray-500">Date:</span> {new Date(contract.signed_at).toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
              </div>
            </div>

            {/* Admin countersignature */}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Admin Counter-signature (Interview Co., Ltd.)</p>
              {contract.admin_signature_data_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={contract.admin_signature_data_url} alt="Admin signature"
                    className="max-h-32 border border-gray-200 rounded bg-white" />
                  <div className="mt-3 text-[11px] text-gray-600 space-y-0.5">
                    <p><span className="font-semibold text-gray-500">Name:</span> {contract.admin_signer_name ?? '—'}{contract.admin_signer_title ? ` (${contract.admin_signer_title})` : ''}</p>
                    <p><span className="font-semibold text-gray-500">Date:</span> {contract.admin_signed_at ? new Date(contract.admin_signed_at).toLocaleDateString('en-US', { dateStyle: 'long' }) : '—'}</p>
                  </div>
                </>
              ) : signing ? (
                <div className="space-y-2 print:hidden">
                  <SignaturePad onChange={setAdminSig} />
                  {sigError && <p className="text-xs text-red-500">{sigError}</p>}
                  <div className="flex gap-2">
                    <button onClick={submitSignature} disabled={savingSig || !adminSig}
                      className="px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                      {savingSig ? 'Saving...' : 'Save Signature'}
                    </button>
                    <button onClick={() => { setSigning(false); setAdminSig(null); setSigError('') }}
                      disabled={savingSig}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="print:hidden">
                  <p className="text-xs text-gray-400 italic mb-2">Awaiting admin counter-signature.</p>
                  {adminProfile && (
                    <button onClick={() => setSigning(true)}
                      className="px-3 py-1.5 text-xs font-medium border border-[#0f4c35] text-[#0f4c35] rounded-lg hover:bg-[#0f4c35]/5">
                      Sign as {adminProfile.name}{adminProfile.title ? ` (${adminProfile.title})` : ''}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Audit footer — small print */}
          <div className="mt-10 pt-4 border-t border-gray-100 text-[10px] text-gray-400 space-y-0.5">
            <p>Document ID: {contract.id}</p>
            {contract.ip_address && <p>IP Address: {contract.ip_address}</p>}
            {contract.user_agent && <p className="break-all">User Agent: {contract.user_agent}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
