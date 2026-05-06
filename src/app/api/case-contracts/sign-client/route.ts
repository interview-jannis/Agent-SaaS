import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

// Public 3-party contract sign endpoint — client side.
// No session required; the contract's client_token is the auth (anyone with
// the link can sign as the client). Captures IP/UA/hash for evidence.
// Typed name is freely chosen by the client (no DB record to match against)
// but is recorded as their explicit-intent statement of identity.

type Body = {
  client_token: string
  signature_data_url: string
  signed_typed_name: string
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? null
}

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })

  let body: Body
  try { body = await req.json() as Body } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  const { client_token, signature_data_url, signed_typed_name } = body
  if (!client_token || !signature_data_url || !signed_typed_name?.trim()) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: contract } = await supabase.from('case_contracts')
    .select('id, client_signed_at')
    .eq('client_token', client_token).maybeSingle()
  if (!contract) return NextResponse.json({ error: 'Contract not found or link expired.' }, { status: 404 })
  const c = contract as { id: string; client_signed_at: string | null }
  if (c.client_signed_at) return NextResponse.json({ error: 'Already signed.' }, { status: 409 })

  const typed = signed_typed_name.trim()
  const signatureHash = crypto.createHash('sha256').update(signature_data_url).digest('hex')
  const ip = clientIp(req)
  const ua = req.headers.get('user-agent')
  const nowIso = new Date().toISOString()

  const { error: updErr } = await supabase.from('case_contracts').update({
    client_signature_data_url: signature_data_url,
    client_signature_hash: signatureHash,
    client_signed_typed_name: typed,
    client_signer_name: typed,
    client_signed_at: nowIso,
    client_ip_address: ip,
    client_user_agent: ua,
  }).eq('id', c.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, signature_hash: signatureHash, contract_id: c.id })
}
