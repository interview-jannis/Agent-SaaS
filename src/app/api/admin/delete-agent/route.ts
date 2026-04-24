import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Hard-delete an agent and their auth.users row.
// Blocked if the agent has any cases — preserves data integrity for historical work.

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
    .select('id, auth_user_id')
    .eq('id', agent_id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })

  const a = agent as { id: string; auth_user_id: string | null }

  // Block if any cases exist (preserve operational history)
  const { count: caseCount } = await supabase.from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', a.id)
  if ((caseCount ?? 0) > 0) {
    return NextResponse.json({ error: 'Cannot delete — this agent has existing cases. Deactivate instead.' }, { status: 409 })
  }

  // Delete contracts (no FK cascade assumed)
  await supabase.from('agent_contracts').delete().eq('agent_id', a.id)
  // Delete any clients the agent owns (should be empty if no cases, but cover edge)
  await supabase.from('clients').delete().eq('agent_id', a.id)
  // Delete agents row
  const { error: delErr } = await supabase.from('agents').delete().eq('id', a.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Delete auth.users
  if (a.auth_user_id) {
    await supabase.auth.admin.deleteUser(a.auth_user_id)
  }

  return NextResponse.json({ ok: true })
}
