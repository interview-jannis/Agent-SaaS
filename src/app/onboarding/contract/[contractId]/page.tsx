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
  signed_at: string
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
      <button onClick={() => router.push('/onboarding/waiting')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back
      </button>

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

        {contract.signature_data_url && (
          <div className="mt-10 pt-4 border-t border-gray-300">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Signature</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={contract.signature_data_url} alt="Signature"
              className="max-h-28 border border-gray-200 rounded bg-white" />
          </div>
        )}
      </div>
    </div>
  )
}
