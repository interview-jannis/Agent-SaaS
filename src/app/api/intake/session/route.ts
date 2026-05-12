import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/intake/session
// Creates an intake session for the given client_ids, returns the session_token.
// Called by the agent when generating a "Send Intake Link".

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })

  const { client_ids, agent_id } = await req.json() as { client_ids?: string[]; agent_id?: string }
  if (!client_ids || client_ids.length === 0) return NextResponse.json({ error: 'No clients selected.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: session, error: sErr } = await supabase
    .from('intake_sessions')
    .insert({ agent_id: agent_id ?? null })
    .select('id, session_token')
    .single()
  if (sErr || !session) return NextResponse.json({ error: sErr?.message ?? 'Failed to create session.' }, { status: 500 })

  const members = client_ids.map((cid, i) => ({
    session_id: session.id,
    client_id: cid,
    sort_order: i,
  }))
  const { error: mErr } = await supabase.from('intake_session_clients').insert(members)
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  return NextResponse.json({ token: session.session_token })
}
