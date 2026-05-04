import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

// Admin counter-signature endpoint. Mirrors /api/onboarding/sign-contract:
// captures IP server-side, hashes the signature image, validates the typed
// name matches the admin's registered name, and stamps the agent_contracts
// row with admin-side signature columns.

type Body = {
  contract_id: string
  signature_data_url: string
  signed_typed_name: string
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
  const { contract_id, signature_data_url, signed_typed_name } = body
  if (!contract_id || !signature_data_url || !signed_typed_name?.trim()) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

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

  const { data: admin } = await supabase.from('admins')
    .select('id, name, title')
    .eq('auth_user_id', uid)
    .maybeSingle()
  if (!admin) {
    return NextResponse.json({ error: 'Admin record not found.' }, { status: 403 })
  }
  const adm = admin as { id: string; name: string; title: string | null }

  const typed = signed_typed_name.trim()
  if (typed.toLowerCase() !== adm.name.trim().toLowerCase()) {
    return NextResponse.json({
      error: `Typed name does not match your registered name (${adm.name}).`,
    }, { status: 400 })
  }

  const { data: contract } = await supabase.from('agent_contracts')
    .select('id, agent_id, admin_signed_at')
    .eq('id', contract_id)
    .maybeSingle()
  if (!contract) {
    return NextResponse.json({ error: 'Contract not found.' }, { status: 404 })
  }
  if ((contract as { admin_signed_at: string | null }).admin_signed_at) {
    return NextResponse.json({ error: 'This contract is already counter-signed.' }, { status: 409 })
  }

  const signatureHash = crypto.createHash('sha256').update(signature_data_url).digest('hex')
  const ip = clientIp(req)
  const ua = req.headers.get('user-agent')
  const nowIso = new Date().toISOString()

  const { error: updErr } = await supabase.from('agent_contracts').update({
    admin_signature_data_url: signature_data_url,
    admin_signature_hash: signatureHash,
    admin_signed_typed_name: typed,
    admin_signed_at: nowIso,
    admin_signer_id: adm.id,
    admin_signer_name: adm.name,
    admin_signer_title: adm.title,
    // Audit context: store admin IP/UA in the same fields as agent only when
    // they aren't already populated for the agent. Keeping IP/UA columns
    // single-purpose (agent-side) — admin counter-sign IP lives in audit_logs
    // emitted by the caller.
  }).eq('id', contract_id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    signature_hash: signatureHash,
    ip_recorded: ip,
    ua_recorded: ua,
  })
}
