import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

// Server-side contract sign endpoint. Captures evidentiary metadata that
// can't be trusted from the client:
//   - request IP (x-forwarded-for chain or platform-specific headers)
//   - SHA-256 hash of the signature image bytes (proves the row hasn't
//     been swapped after the fact — admin updating signature_data_url
//     would change the hash; comparing them at audit time exposes
//     tampering)
//   - signed_at timestamp (server clock — client clock is untrusted)
// Identity tokens in body_snapshot are also substituted server-side so
// the agent can't ship a mutated body claiming someone else signed.

type Body = {
  contract_type: 'nda' | 'partnership'
  signature_data_url: string
  signed_typed_name: string
  is_final?: boolean
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? null
}

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })
  }

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const { contract_type, signature_data_url, signed_typed_name, is_final } = body
  if (!contract_type || !signature_data_url || !signed_typed_name?.trim()) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  if (contract_type !== 'nda' && contract_type !== 'partnership') {
    return NextResponse.json({ error: 'Invalid contract_type.' }, { status: 400 })
  }

  // Validate session via Authorization: Bearer header (sent by browser supabase client).
  const auth = req.headers.get('authorization') ?? ''
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!accessToken) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken)
  if (userErr || !userData?.user?.id) {
    return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })
  }
  const uid = userData.user.id

  const { data: agent } = await supabase.from('agents')
    .select('id, name, country, agent_number')
    .eq('auth_user_id', uid)
    .maybeSingle()
  if (!agent) {
    return NextResponse.json({ error: 'Agent record not found.' }, { status: 404 })
  }
  const a = agent as { id: string; name: string; country: string | null; agent_number: string | null }

  // Verify typed name matches the agent's stored name (case-insensitive, whitespace-trimmed).
  // This is the explicit-intent check: agent must type their own legal name.
  const typed = signed_typed_name.trim()
  if (typed.toLowerCase() !== a.name.trim().toLowerCase()) {
    return NextResponse.json({
      error: `Typed name does not match your registered name (${a.name}).`,
    }, { status: 400 })
  }

  const { data: tpl } = await supabase.from('contract_templates')
    .select('title, body')
    .eq('contract_type', contract_type)
    .maybeSingle()
  if (!tpl) {
    return NextResponse.json({ error: 'Contract template not found.' }, { status: 404 })
  }
  const t = tpl as { title: string; body: string }

  // Substitute identity tokens server-side — body_snapshot reflects the
  // contract-as-signed and the agent can't tamper with it from the client.
  const finalCountry = a.country ?? ''
  const substitutedBody = t.body
    .replace(/\*\*\{\{AGENT_NAME\}\}\*\*/g, `**${a.name}**`)
    .replace(/\{\{AGENT_NAME\}\}/g, `**${a.name}**`)
    .replace(/\{\{AGENT_COUNTRY\}\}/g, finalCountry)

  // SHA-256 of the signature data URL (entire string, including the data: prefix
  // and base64 payload). Stored alongside so any later mutation of the image is
  // detectable by recomputing the hash.
  const signatureHash = crypto.createHash('sha256').update(signature_data_url).digest('hex')

  const ip = clientIp(req)
  const ua = req.headers.get('user-agent')
  const nowIso = new Date().toISOString()

  const { error: insErr } = await supabase.from('agent_contracts').insert({
    agent_id: a.id,
    contract_type,
    title_snapshot: t.title,
    body_snapshot: substitutedBody,
    ot_acknowledged_at: nowIso,
    signature_data_url,
    signature_hash: signatureHash,
    signed_typed_name: typed,
    signed_at: nowIso,
    ip_address: ip,
    user_agent: ua,
  })
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  if (is_final) {
    await supabase.from('agents').update({
      onboarding_status: 'awaiting_approval',
      rejection_reason: null,
      rejected_at: null,
    }).eq('id', a.id)
  }

  return NextResponse.json({ ok: true, signature_hash: signatureHash })
}
