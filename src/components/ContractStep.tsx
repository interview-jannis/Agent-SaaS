'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SignaturePad from './SignaturePad'
import { notifyAllAdmins } from '@/lib/notifications'
import { logAsCurrentUser } from '@/lib/audit'

type ContractType = 'nda' | 'partnership'

type Template = {
  contract_type: ContractType
  title: string
  body: string
}

type Props = {
  type: ContractType
  step: { current: number; total: number; label: string }
  nextHref: string
  nextLabel: string
  isFinal?: boolean  // last contract — after this, move agent to awaiting_approval
  collectIdentity?: boolean  // first contract collects Name + Country and saves to agents
}

// Minimal markdown: ## heading, - list items, blank-line paragraphs, **bold**.
type Block =
  | { kind: 'h'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }

// Render a string with **bold** segments to React nodes.
export function renderInline(text: string): React.ReactNode[] {
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
    // Join wrapped lines with a single space for natural flow
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
    if (line.startsWith('## ')) {
      flushP(); flushUl()
      blocks.push({ kind: 'h', text: line.slice(3).trim() })
    } else if (line.startsWith('- ')) {
      flushP()
      ulBuf.push(line.slice(2).trim())
    } else if (line === '') {
      flushP(); flushUl()
    } else {
      flushUl()
      pBuf.push(line)
    }
  }
  flushP(); flushUl()
  return blocks
}

const TEMP_NAME_PREFIX = /^temp\d+$/i

export default function ContractStep({ type, step, nextHref, nextLabel, isFinal = false, collectIdentity = false }: Props) {
  const router = useRouter()
  const [template, setTemplate] = useState<Template | null>(null)
  const [agentName, setAgentName] = useState('')
  const [agentCountry, setAgentCountry] = useState('')
  const [loading, setLoading] = useState(true)
  const [agree, setAgree] = useState(false)
  const [signature, setSignature] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const [tplRes, sessRes] = await Promise.all([
        supabase.from('contract_templates').select('contract_type, title, body').eq('contract_type', type).maybeSingle(),
        supabase.auth.getSession(),
      ])
      setTemplate(tplRes.data as Template | null)
      const uid = sessRes.data.session?.user?.id
      if (uid) {
        const { data: agent } = await supabase.from('agents').select('name, country').eq('auth_user_id', uid).maybeSingle()
        const a = agent as { name: string | null; country: string | null } | null
        setAgentName(a?.name && !TEMP_NAME_PREFIX.test(a.name) ? a.name : '')
        setAgentCountry(a?.country ?? '')
      }
      setLoading(false)
    }
    load()
  }, [type])

  async function submit() {
    if (!template) return
    if (collectIdentity) {
      if (!agentName.trim()) { setError('Please enter your full legal name.'); return }
      if (!agentCountry.trim()) { setError('Please enter your country of residence.'); return }
    }
    if (!agree || !signature) { setError('Please agree to the terms and sign above.'); return }
    setSaving(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) throw new Error('Not signed in.')
      const { data: agent } = await supabase.from('agents').select('id, name, country, agent_number').eq('auth_user_id', uid).maybeSingle()
      if (!agent) throw new Error('Agent record not found.')

      // First contract: persist identity to the agent record
      if (collectIdentity) {
        const { error: uErr } = await supabase.from('agents')
          .update({ name: agentName.trim(), country: agentCountry.trim() })
          .eq('id', (agent as { id: string }).id)
        if (uErr) throw uErr
      }

      const agentNumber = (agent as { agent_number: string | null }).agent_number ?? ''
      const finalName = collectIdentity ? agentName.trim() : ((agent as { name: string }).name)
      const finalCountry = collectIdentity ? agentCountry.trim() : ((agent as { country: string | null }).country ?? '')

      // Substitute identity tokens at sign-time so the body_snapshot is the contract-as-signed.
      // Handle both bare and **wrapped** forms of the name token so templates don't double-up stars.
      const substitutedBody = template.body
        .replace(/\*\*\{\{AGENT_NAME\}\}\*\*/g, `**${finalName}**`)
        .replace(/\{\{AGENT_NAME\}\}/g, `**${finalName}**`)
        .replace(/\{\{AGENT_COUNTRY\}\}/g, finalCountry)

      const { error: insErr } = await supabase.from('agent_contracts').insert({
        agent_id: (agent as { id: string }).id,
        contract_type: type,
        title_snapshot: template.title,
        body_snapshot: substitutedBody,
        ot_acknowledged_at: new Date().toISOString(),
        signature_data_url: signature,
        signed_at: new Date().toISOString(),
        ip_address: null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
      if (insErr) throw insErr

      if (isFinal) {
        await supabase.from('agents').update({ onboarding_status: 'awaiting_approval' })
          .eq('id', (agent as { id: string }).id)
        await notifyAllAdmins(`${agentNumber} signed contracts — review needed`, '/admin/agents')
        await logAsCurrentUser('agent.contracts_signed', { type: 'agent', id: (agent as { id: string }).id, label: agentNumber })
      }

      router.push(nextHref)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Step {step.current} of {step.total}</span>
        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-[#0f4c35]" style={{ width: `${(step.current / step.total) * 100}%` }} />
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{step.label}</h1>
        <p className="text-sm text-gray-500 mt-1">Review the agreement carefully, then agree and sign below.</p>
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : !template ? (
          <p className="text-sm text-amber-700">Agreement not available. Contact your Tiktak admin.</p>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900">{template.title}</h2>
            {!collectIdentity && agentName && (
              <p className="text-xs text-gray-500">Signing as <span className="font-medium text-gray-800">{agentName}</span>{agentCountry ? ` · ${agentCountry}` : ''}</p>
            )}
            <div className="max-h-[50vh] overflow-y-auto pr-2">
              {(() => {
                // Substitute tokens for live preview so agent sees real name/country.
                const previewBody = template.body
                  .replace(/\*\*\{\{AGENT_NAME\}\}\*\*/g, agentName.trim() ? `**${agentName.trim()}**` : '[Your name]')
                  .replace(/\{\{AGENT_NAME\}\}/g, agentName.trim() ? `**${agentName.trim()}**` : '[Your name]')
                  .replace(/\{\{AGENT_COUNTRY\}\}/g, agentCountry.trim() || '[Your country]')
                return renderBody(previewBody).map((b, i) => {
                  if (b.kind === 'h') return <h3 key={i} className="text-base font-semibold text-gray-900 mt-6 mb-1.5 first:mt-0">{renderInline(b.text)}</h3>
                  if (b.kind === 'ul') return (
                    <ul key={i} className="list-disc pl-5 space-y-1 mb-3">
                      {b.items.map((it, j) => <li key={j} className="text-sm text-gray-700 leading-relaxed">{renderInline(it)}</li>)}
                    </ul>
                  )
                  return <p key={i} className="text-sm text-gray-700 leading-relaxed mb-3 last:mb-0">{renderInline(b.text)}</p>
                })
              })()}
            </div>
          </>
        )}
      </section>

      {template && collectIdentity && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Information</p>
          <p className="text-[11px] text-gray-500">Used in the &quot;Parties&quot; section of this and the next agreement.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Legal Name *</label>
              <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)}
                placeholder="e.g. Ahmed Al-Rashid"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Country of Residence *</label>
              <input type="text" value={agentCountry} onChange={e => setAgentCountry(e.target.value)}
                placeholder="United Arab Emirates"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>
          </div>
        </section>
      )}

      {template && (
        <>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-[#0f4c35]" />
            <span className="text-sm text-gray-700">I have read and agree to the terms of the {template.title}.</span>
          </label>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Signature *</p>
            <SignaturePad onChange={setSignature} />
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} disabled={saving}
          className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40 transition-colors">
          Back
        </button>
        <button
          onClick={submit}
          disabled={saving || !template || !agree || !signature}
          className="ml-auto px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {saving ? 'Signing...' : nextLabel}
        </button>
      </div>
    </div>
  )
}
