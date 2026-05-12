import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmailToAdmin } from '@/lib/email'

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })

  const body = await req.json() as { agent_id?: string; case_id?: string; message?: string; link_url?: string | null }
  const { message, link_url } = body
  if (!message || !message.trim()) return NextResponse.json({ error: 'Missing message.' }, { status: 400 })
  if (!body.agent_id && !body.case_id) return NextResponse.json({ error: 'Missing agent_id or case_id.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let agentId = body.agent_id ?? null
  if (!agentId && body.case_id) {
    const { data: caseRow } = await supabase.from('cases').select('agent_id').eq('id', body.case_id).maybeSingle()
    agentId = (caseRow as { agent_id: string } | null)?.agent_id ?? null
  }
  if (!agentId) return NextResponse.json({ error: 'Could not resolve agent_id.' }, { status: 400 })

  const { data: agent } = await supabase.from('agents')
    .select('assigned_admin_id')
    .eq('id', agentId).maybeSingle()
  const assignedAdminId = (agent as { assigned_admin_id: string | null } | null)?.assigned_admin_id ?? null

  let recipients: Array<{ id: string; auth_user_id: string | null; email: string | null }> = []
  if (assignedAdminId) {
    const { data: a } = await supabase.from('admins')
      .select('id, auth_user_id, email').eq('id', assignedAdminId).maybeSingle()
    if (a) recipients = [a as { id: string; auth_user_id: string | null; email: string | null }]
  }
  if (recipients.length === 0) {
    const { data: supers } = await supabase.from('admins')
      .select('id, auth_user_id, email').eq('is_super_admin', true)
    recipients = (supers as Array<{ id: string; auth_user_id: string | null; email: string | null }>) ?? []
  }

  const seen = new Set<string>()
  const rows: Array<Record<string, unknown>> = []
  const emailRecipients: string[] = []

  for (const r of recipients) {
    if (!r.auth_user_id || seen.has(r.auth_user_id)) continue
    seen.add(r.auth_user_id)
    rows.push({
      auth_user_id: r.auth_user_id,
      target_type: 'admin',
      target_id: r.id,
      message,
      link_url: link_url ?? null,
      is_read: false,
    })
    if (r.email) emailRecipients.push(r.email)
  }

  if (rows.length === 0) return NextResponse.json({ ok: true, count: 0 })

  const { error } = await supabase.from('notifications').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await Promise.all(emailRecipients.map(email => sendEmailToAdmin(email, message, link_url ?? null)))

  return NextResponse.json({ ok: true, count: rows.length })
}
