'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SignaturePad from './SignaturePad'
import { notifyAllAdmins } from '@/lib/notifications'
import { logAsCurrentUser } from '@/lib/audit'
import { COUNTRIES, COUNTRY_DATALIST_ID } from '@/lib/countries'
import { nextOnboardingPath } from '@/lib/onboardingFlow'

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

const TEMP_NAME_PREFIX = /^(temp\d+|Invited Agent)$/i

export default function ContractStep({ type, step, nextHref, nextLabel, isFinal = false, collectIdentity = false }: Props) {
  const router = useRouter()
  const [template, setTemplate] = useState<Template | null>(null)
  const [agentName, setAgentName] = useState('')
  const [agentCountry, setAgentCountry] = useState('')
  const [loading, setLoading] = useState(true)
  const [agree, setAgree] = useState(false)
  const [confirmIdentity, setConfirmIdentity] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      // Skip if this contract is already signed (prevents duplicate rows when agent refreshes mid-flow).
      const skipTo = await nextOnboardingPath(type)
      if (skipTo) {
        router.replace(skipTo)
        return
      }
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
  }, [type, router])

  async function submit() {
    if (!template) return
    if (collectIdentity) {
      if (!agentName.trim()) { setError('Please enter your full legal name.'); return }
      if (!agentCountry.trim()) { setError('Please enter your country of residence.'); return }
    }
    if (!agree) { setError('Please confirm you have read and agree to the terms.'); return }
    if (!confirmIdentity) { setError('Please confirm you are the named individual signing this agreement.'); return }
    if (!typedName.trim()) { setError('Please type your full legal name to confirm.'); return }
    if (!signature) { setError('Please sign above.'); return }

    const expectedName = agentName.trim()
    if (typedName.trim().toLowerCase() !== expectedName.toLowerCase()) {
      setError(`The typed name must exactly match "${expectedName}".`)
      return
    }

    setSaving(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid || !session?.access_token) throw new Error('Not signed in.')
      const { data: agent } = await supabase.from('agents').select('id, agent_number').eq('auth_user_id', uid).maybeSingle()
      if (!agent) throw new Error('Agent record not found.')
      const agentRow = agent as { id: string; agent_number: string | null }

      // First contract: persist identity to the agent record BEFORE the
      // server-side sign call so the API can validate typed_name against
      // the just-saved name.
      if (collectIdentity) {
        const { error: uErr } = await supabase.from('agents')
          .update({ name: agentName.trim(), country: agentCountry.trim() })
          .eq('id', agentRow.id)
        if (uErr) throw uErr
      }

      // Server-side sign — captures IP, hashes signature, validates typed
      // name matches stored agent.name, substitutes body tokens server-side.
      const res = await fetch('/api/onboarding/sign-contract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          contract_type: type,
          signature_data_url: signature,
          signed_typed_name: typedName.trim(),
          is_final: !!isFinal,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to sign.')

      if (isFinal) {
        const agentNumber = agentRow.agent_number ?? ''
        // Server-side notify (service role) — more reliable than client-side broadcast.
        try {
          const r2 = await fetch('/api/onboarding/notify-signed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_id: agentRow.id }),
          })
          if (!r2.ok) {
            await notifyAllAdmins(`${agentNumber} signed contracts — review needed`, '/admin/agents')
          }
        } catch {
          await notifyAllAdmins(`${agentNumber} signed contracts — review needed`, '/admin/agents')
        }
        await logAsCurrentUser('agent.contracts_signed', { type: 'agent', id: agentRow.id, label: agentNumber })
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
              <input type="text" list={COUNTRY_DATALIST_ID} value={agentCountry} onChange={e => setAgentCountry(e.target.value)}
                placeholder="United Arab Emirates"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
              <datalist id={COUNTRY_DATALIST_ID}>
                {COUNTRIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
        </section>
      )}

      {template && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#0f4c35] shrink-0" />
              <span className="text-sm text-gray-700">
                I have read this {template.title} <span className="font-semibold text-gray-900">in full</span>, understand its terms,
                and voluntarily agree to be legally bound by them.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={confirmIdentity} onChange={e => setConfirmIdentity(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#0f4c35] shrink-0" />
              <span className="text-sm text-gray-700">
                I confirm I am <span className="font-semibold text-gray-900">{agentName.trim() || 'the named individual'}</span>,
                and that the signature below is mine and is intended as my legal signature on this agreement.
              </span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Type your full legal name to confirm *
            </label>
            <input
              type="text"
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              placeholder={agentName.trim() || 'Your full legal name'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Must exactly match the name above. Recorded as explicit-intent evidence alongside your drawn signature.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Signature *</p>
            <SignaturePad onChange={setSignature} />
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            By signing, you acknowledge that this electronic signature has the same legal effect as a handwritten one
            under Korea&apos;s Electronic Signatures Act. Your IP address, device, and a cryptographic hash of
            your signature image are recorded server-side as audit evidence.
          </p>
        </section>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} disabled={saving}
          className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40 transition-colors">
          Back
        </button>
        <button
          onClick={submit}
          disabled={saving || !template || !agree || !confirmIdentity || !typedName.trim() || !signature}
          className="ml-auto px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {saving ? 'Signing...' : nextLabel}
        </button>
      </div>
    </div>
  )
}
