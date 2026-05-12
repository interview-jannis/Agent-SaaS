import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmailToAgent } from '@/lib/email'

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })

  const { agent_id, message, link_url } = await req.json() as { agent_id?: string; message?: string; link_url?: string | null }
  if (!agent_id) return NextResponse.json({ error: 'Missing agent_id.' }, { status: 400 })
  if (!message || !message.trim()) return NextResponse.json({ error: 'Missing message.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: agent } = await supabase.from('agents').select('auth_user_id, email').eq('id', agent_id).single()
  const authUserId = (agent as { auth_user_id: string | null; email: string | null } | null)?.auth_user_id
  if (!authUserId) return NextResponse.json({ error: 'Agent has no auth user.' }, { status: 404 })

  const { error } = await supabase.from('notifications').insert({
    auth_user_id: authUserId,
    target_type: 'agent',
    target_id: agent_id,
    message,
    link_url: link_url ?? null,
    is_read: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const agentEmail = (agent as { auth_user_id: string | null; email: string | null } | null)?.email
  if (agentEmail && !agentEmail.includes('@tiktak.temp')) {
    await sendEmailToAgent(agentEmail, message, link_url ?? null)
  }

  return NextResponse.json({ ok: true })
}
