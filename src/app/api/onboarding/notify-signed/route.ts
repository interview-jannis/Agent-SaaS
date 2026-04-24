import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Server-side admin broadcast for "contracts signed — review needed".
// Uses service role so it bypasses any client session edge cases, and
// returns a count so the client can surface a failure if zero admins got it.

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })

  const { agent_id } = await req.json() as { agent_id?: string }
  if (!agent_id) return NextResponse.json({ error: 'Missing agent_id.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: agent } = await supabase.from('agents')
    .select('id, agent_number')
    .eq('id', agent_id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })
  const agentNumber = (agent as { agent_number: string | null }).agent_number ?? 'Agent'

  const { data: admins } = await supabase.from('admins').select('id, auth_user_id')
  if (!admins || admins.length === 0) {
    return NextResponse.json({ ok: true, count: 0, warning: 'No admins in the system.' })
  }

  const seen = new Set<string>()
  const rows: Array<Record<string, unknown>> = []
  for (const a of admins as Array<{ id: string; auth_user_id: string | null }>) {
    if (!a.auth_user_id) continue
    if (seen.has(a.auth_user_id)) continue
    seen.add(a.auth_user_id)
    rows.push({
      auth_user_id: a.auth_user_id,
      target_type: 'admin',
      target_id: a.id,
      message: `${agentNumber} signed contracts — review needed`,
      link_url: '/admin/agents',
      is_read: false,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, count: 0, warning: 'No admins with auth_user_id.' })
  }

  const { error: insErr } = await supabase.from('notifications').insert(rows)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, count: rows.length })
}
