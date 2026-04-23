import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Called from the post-approval setup wizard. Uses the service role to update
// auth.users (email + password) without triggering a confirmation flow, then
// stamps the agent record so future logins skip the wizard.

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })

  const { authUserId, email, password, phone, bank } = await req.json() as {
    authUserId?: string; email?: string; password?: string; phone?: string
    bank?: { bank_name?: string; account_number?: string; account_holder?: string; swift_code?: string; bank_address?: string }
  }

  if (!authUserId || !email || !password) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }
  if (!bank?.bank_name?.trim() || !bank?.account_number?.trim() || !bank?.account_holder?.trim() || !bank?.swift_code?.trim()) {
    return NextResponse.json({ error: 'All bank fields are required except Bank Address.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify this auth user is actually an agent (defence in depth)
  const { data: agent } = await supabase.from('agents')
    .select('id, onboarding_status')
    .eq('auth_user_id', authUserId).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 })
  if ((agent as { onboarding_status: string }).onboarding_status !== 'approved') {
    return NextResponse.json({ error: 'Agent is not approved yet.' }, { status: 403 })
  }

  // Update auth.users (no confirmation email — admin API bypass)
  const { error: authErr } = await supabase.auth.admin.updateUserById(authUserId, {
    email,
    password,
    email_confirm: true,
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  // Update agents record
  const bank_info = {
    bank_name: bank.bank_name!.trim(),
    account_number: bank.account_number!.trim(),
    account_holder: bank.account_holder!.trim(),
    swift_code: bank.swift_code!.trim(),
    bank_address: bank.bank_address?.trim() || '',
  }

  const { error: upErr } = await supabase.from('agents').update({
    email,
    phone: phone?.trim() || null,
    bank_info,
    setup_completed_at: new Date().toISOString(),
  }).eq('id', (agent as { id: string }).id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
