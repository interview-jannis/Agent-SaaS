import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Hard-delete an agent, all their cases and related data, and their auth.users row.

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

  // Gather all case IDs for this agent (needed for sub-table cleanup)
  const { data: caseRows } = await supabase.from('cases')
    .select('id').eq('agent_id', a.id)
  const caseIds = (caseRows ?? []).map((r: { id: string }) => r.id)

  if (caseIds.length > 0) {
    // Delete case sub-tables in dependency order (deepest children first).
    // documents.case_id has ON DELETE CASCADE → handles document_groups, document_items, document_group_members.
    // case_members.case_id deleted before clients (case_members refs client_id).
    await supabase.from('settlements').delete().in('case_id', caseIds)
    await supabase.from('partner_payments').delete().in('case_id', caseIds)
    await supabase.from('case_contracts').delete().in('case_id', caseIds)
    await supabase.from('schedules').delete().in('case_id', caseIds)
    await supabase.from('documents').delete().in('case_id', caseIds)
    await supabase.from('case_members').delete().in('case_id', caseIds)
    await supabase.from('cases').delete().eq('agent_id', a.id)
  }

  // Delete agent-level rows
  await supabase.from('agent_contracts').delete().eq('agent_id', a.id)
  await supabase.from('clients').delete().eq('agent_id', a.id)

  const { error: delErr } = await supabase.from('agents').delete().eq('id', a.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Delete auth.users
  if (a.auth_user_id) {
    await supabase.auth.admin.deleteUser(a.auth_user_id)
  }

  return NextResponse.json({ ok: true })
}
