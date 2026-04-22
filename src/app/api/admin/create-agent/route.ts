import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Creates a new temp Agent account. No input required — auto-generates sequential
// tempNN credentials (email/password identical for easy hand-over). Agent goes
// through onboarding/contract signing, then admin approves and real profile is set up.

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

  // Find next available temp number by counting existing agents (simple, MVP-friendly).
  const { count } = await supabase.from('agents').select('*', { count: 'exact', head: true })
  const nextNum = (count ?? 0) + 1
  const username = `temp${String(nextNum).padStart(2, '0')}`
  const email = `${username}@tiktak.temp`
  const password = username // identical for easy tablet/demo handoff; real creds set after approval

  // Create auth user (auto-confirmed so they can log in immediately)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'agent', temp: true },
  })
  if (authError || !authData?.user) {
    return NextResponse.json({ error: authError?.message ?? 'Failed to create auth user.' }, { status: 400 })
  }

  const agentNumber = `#AG-${String(nextNum).padStart(3, '0')}`

  // Insert agents row with pending_onboarding status; name/email placeholder until real signup.
  const { error: insertError } = await supabase.from('agents').insert({
    auth_user_id: authData.user.id,
    agent_number: agentNumber,
    name: username,          // placeholder; overwritten at approval step
    email,
    onboarding_status: 'pending_onboarding',
    is_active: true,
  })

  if (insertError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    agent_number: agentNumber,
    username,
    email,
    password,
  })
}
