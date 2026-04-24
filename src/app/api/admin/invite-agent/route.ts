import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

// Creates an invite link for a new Agent. No credentials to hand off —
// Admin shares the URL and the agent goes straight into onboarding.
// A placeholder auth.users row backs the session during onboarding;
// it gets overwritten with real email/password in the Setup Wizard.

export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured on server.' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Generate random token + random placeholder password
  const token = randomBytes(24).toString('base64url')
  const placeholderPassword = randomBytes(18).toString('base64url')
  const placeholderEmail = `invite-${token.slice(0, 12).toLowerCase()}@tiktak.temp`

  // Compute next agent_number — scan agents + auth.users for used numbers
  const { data: existingAgents } = await supabase.from('agents').select('agent_number')
  const taken = new Set<number>()
  for (const a of existingAgents ?? []) {
    const m = (a as { agent_number: string | null }).agent_number?.match(/^#AG-(\d+)$/)
    if (m) taken.add(Number(m[1]))
  }
  let nextNum = 1
  while (taken.has(nextNum)) nextNum++
  const agentNumber = `#AG-${String(nextNum).padStart(3, '0')}`

  // Create auth user (auto-confirmed so signInWithPassword works immediately)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: placeholderEmail,
    password: placeholderPassword,
    email_confirm: true,
    user_metadata: { role: 'agent', invited: true },
  })
  if (authError || !authData?.user) {
    return NextResponse.json({ error: authError?.message ?? 'Failed to create auth user.' }, { status: 400 })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // +7 days

  const { error: insertError } = await supabase.from('agents').insert({
    auth_user_id: authData.user.id,
    agent_number: agentNumber,
    name: 'Invited Agent',
    email: placeholderEmail,
    onboarding_status: 'pending_onboarding',
    is_active: false,
    invite_token: token,
    invite_secret: placeholderPassword,
    invited_at: now.toISOString(),
    invite_expires_at: expiresAt.toISOString(),
  })

  if (insertError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    agent_number: agentNumber,
    token,
    invite_path: `/invite/${token}`,
    expires_at: expiresAt.toISOString(),
  })
}
