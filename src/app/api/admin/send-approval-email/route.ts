import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendApprovalEmailToAgent } from '@/lib/email'

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
    .select('email, invite_email')
    .eq('id', agent_id).maybeSingle()

  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })

  const { email, invite_email } = agent as { email: string | null; invite_email: string | null }
  const recipientEmail = invite_email || (email && !email.includes('@tiktak.temp') ? email : null)

  if (!recipientEmail) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'No email on record.' })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tiktak.interviewcorp.co.kr'
  await sendApprovalEmailToAgent(recipientEmail, `${appUrl}/onboarding/setup`)

  return NextResponse.json({ ok: true })
}
