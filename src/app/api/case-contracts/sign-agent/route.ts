import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

// Server-side 3-party contract sign endpoint — agent side.
// Mirrors /api/onboarding/sign-contract: validates typed name vs agent.name,
// captures IP/UA, hashes signature image, writes evidence columns.

type Body = {
  contract_id: string
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
  const { contract_id, signature_data_url, signed_typed_name } = body
  if (!contract_id || !signature_data_url || !signed_typed_name?.trim()) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const auth = req.headers.get('authorization') ?? ''
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!accessToken) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken)
  if (userErr || !userData?.user?.id) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })
  const uid = userData.user.id

  const { data: agent } = await supabase.from('agents').select('id, name').eq('auth_user_id', uid).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agent record not found.' }, { status: 404 })
  const a = agent as { id: string; name: string }

  const typed = signed_typed_name.trim()
  if (typed.toLowerCase() !== a.name.trim().toLowerCase()) {
    return NextResponse.json({ error: `Typed name does not match your registered name (${a.name}).` }, { status: 400 })
  }

  // Verify the contract belongs to a case owned by this agent.
  const { data: contract } = await supabase.from('case_contracts')
    .select('id, case_id, agent_signed_at, cases:case_id(agent_id)')
    .eq('id', contract_id).maybeSingle()
  if (!contract) return NextResponse.json({ error: 'Contract not found.' }, { status: 404 })
  const c = contract as unknown as { id: string; case_id: string; agent_signed_at: string | null; cases: { agent_id: string } | null }
  if (!c.cases || c.cases.agent_id !== a.id) {
    return NextResponse.json({ error: 'Not authorized for this contract.' }, { status: 403 })
  }
  if (c.agent_signed_at) return NextResponse.json({ error: 'Already signed.' }, { status: 409 })

  const signatureHash = crypto.createHash('sha256').update(signature_data_url).digest('hex')
  const ip = clientIp(req)
  const ua = req.headers.get('user-agent')
  const nowIso = new Date().toISOString()

  const { error: updErr } = await supabase.from('case_contracts').update({
    agent_signature_data_url: signature_data_url,
    agent_signature_hash: signatureHash,
    agent_signed_typed_name: typed,
    agent_signer_name: a.name,
    agent_signed_at: nowIso,
    agent_ip_address: ip,
    agent_user_agent: ua,
  }).eq('id', contract_id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, signature_hash: signatureHash })
}
