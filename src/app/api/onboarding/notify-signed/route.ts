import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmailToAdmin } from '@/lib/email'

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
    .select('id, agent_number, name, invited_by_admin_id')
    .eq('id', agent_id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })

  const ag = agent as { agent_number: string | null; name: string | null; invited_by_admin_id: string | null }
  const agentNumber = ag.agent_number ?? 'Agent'
  const agentName = ag.name ?? ''

  // Recipients: invited_by admin + all super admins (deduped)
  const recipientIds = new Set<string>()
  const recipients: Array<{ id: string; auth_user_id: string | null; email: string | null }> = []

  if (ag.invited_by_admin_id) {
    const { data: inviter } = await supabase.from('admins')
      .select('id, auth_user_id, email').eq('id', ag.invited_by_admin_id).maybeSingle()
    if (inviter) {
      const r = inviter as { id: string; auth_user_id: string | null; email: string | null }
      recipientIds.add(r.id)
      recipients.push(r)
    }
  }

  const { data: supers } = await supabase.from('admins')
    .select('id, auth_user_id, email').eq('is_super_admin', true)
  for (const s of (supers ?? []) as Array<{ id: string; auth_user_id: string | null; email: string | null }>) {
    if (!recipientIds.has(s.id)) {
      recipientIds.add(s.id)
      recipients.push(s)
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, count: 0, warning: 'No recipients found.' })
  }

  const label = agentName ? `${agentNumber} (${agentName})` : agentNumber
  const message = `${label} signed contracts — review needed`
  const link_url = '/admin/agents'

  const seen = new Set<string>()
  const rows: Array<Record<string, unknown>> = []
  const emailRecipients: Array<{ email: string }> = []

  for (const r of recipients) {
    if (!r.auth_user_id || seen.has(r.auth_user_id)) continue
    seen.add(r.auth_user_id)
    rows.push({
      auth_user_id: r.auth_user_id,
      target_type: 'admin',
      target_id: r.id,
      message,
      link_url,
      is_read: false,
    })
    if (r.email) emailRecipients.push({ email: r.email })
  }

  if (rows.length === 0) return NextResponse.json({ ok: true, count: 0 })

  const { error: insErr } = await supabase.from('notifications').insert(rows)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  await Promise.all(emailRecipients.map(r => sendEmailToAdmin(r.email, message, link_url)))

  return NextResponse.json({ ok: true, count: rows.length })
}
