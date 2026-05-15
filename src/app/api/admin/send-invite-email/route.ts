import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendInviteEmailToAgent } from '@/lib/email'

export async function POST(req: Request) {
  const { invite_url, recipient_email, expires_at, agent_id, personal_message } = await req.json() as {
    invite_url?: string
    recipient_email?: string
    expires_at?: string
    agent_id?: string
    personal_message?: string
  }

  if (!invite_url || !recipient_email?.trim()) {
    return NextResponse.json({ error: 'Missing invite_url or recipient_email.' }, { status: 400 })
  }

  const expiresAt = expires_at ?? new Date(Date.now() + 7 * 86400000).toISOString()

  try {
    await sendInviteEmailToAgent(recipient_email.trim(), invite_url, expiresAt, personal_message)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as { message?: string })?.message ?? 'Failed to send email.' }, { status: 500 })
  }

  // Persist so the detail page can pre-fill the input next visit
  if (agent_id) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (serviceKey) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      await supabase.from('agents').update({ invite_email: recipient_email.trim() }).eq('id', agent_id)
    }
  }

  return NextResponse.json({ ok: true })
}
