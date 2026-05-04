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
    bank?: {
      bank_name?: string
      account_number?: string
      beneficiary?: string
      swift_code?: string
      address?: string
      beneficiary_number?: string
    }
  }

  if (!authUserId || !email || !password) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }
  if (!bank?.bank_name?.trim() || !bank?.account_number?.trim() || !bank?.beneficiary?.trim() || !bank?.swift_code?.trim()) {
    return NextResponse.json({ error: 'Bank Name, Account Number, Beneficiary, and Swift Code are required.' }, { status: 400 })
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

  // Pre-check: is this email already registered to a DIFFERENT auth user?
  // updateUserById returns an opaque "500 Error updating user" on duplicates,
  // so detect it ourselves and surface a clear message before calling.
  try {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) throw listErr
    const wanted = email.trim().toLowerCase()
    const dup = list?.users?.find(u => (u.email ?? '').toLowerCase() === wanted && u.id !== authUserId)
    if (dup) {
      return NextResponse.json({
        error: `The email "${email}" is already registered to another account on Tiktak. Please sign up with a different email.`,
      }, { status: 400 })
    }
  } catch (e: unknown) {
    // Pre-check failure isn't fatal — fall through to the actual update and let it surface its own error.
    console.warn('[agent/setup] email pre-check failed', (e as { message?: string })?.message)
  }

  // Update auth.users (no confirmation email — admin API bypass)
  const { error: authErr } = await supabase.auth.admin.updateUserById(authUserId, {
    email,
    password,
    email_confirm: true,
  })
  if (authErr) {
    console.error('[agent/setup] auth update failed', { authUserId, email, message: authErr.message, status: authErr.status })
    const raw = authErr.message ?? 'Unknown error.'
    const status = authErr.status ?? 0
    const lower = raw.toLowerCase()

    let friendly: string
    if (status === 422 || /already|exists|registered|duplicate|email.*taken/.test(lower)) {
      friendly = `The email "${email}" is already registered to another account on Tiktak. Please sign up with a different email.`
    } else if (/password/.test(lower)) {
      friendly = `Password rejected: ${raw}`
    } else if (/invalid.*email|email.*invalid|email_address_invalid/.test(lower)) {
      friendly = `"${email}" is not a valid email address.`
    } else if (status === 429 || /rate.*limit/.test(lower)) {
      friendly = `Too many attempts. Please wait a minute and try again.`
    } else {
      friendly = `Could not save your login (Supabase ${status || '?'}: "${raw}"). Please contact your Tiktak admin.`
    }
    return NextResponse.json({ error: friendly }, { status: 400 })
  }

  // Update agents record. Keys mirror system_settings.bank_details schema
  // (aligned 2026-05-01) so QuoteDocument's BankDetails type renders both
  // admin- and agent-issued invoices identically.
  const bank_info = {
    bank_name: bank.bank_name!.trim(),
    account_number: bank.account_number!.trim(),
    beneficiary: bank.beneficiary!.trim(),
    swift_code: bank.swift_code!.trim(),
    address: bank.address?.trim() || '',
    beneficiary_number: bank.beneficiary_number?.trim() || '',
  }

  const { error: upErr } = await supabase.from('agents').update({
    email,
    phone: phone?.trim() || null,
    bank_info,
    setup_completed_at: new Date().toISOString(),
    // Invalidate invite token — real credentials are now set
    invite_token: null,
    invite_secret: null,
  }).eq('id', (agent as { id: string }).id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
