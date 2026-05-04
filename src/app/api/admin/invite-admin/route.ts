import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

// Super-admin-only: creates an invite link for a new admin.
// A placeholder auth user + admins row backs the session during setup.
// The invitee opens /admin-invite/{token}, signs in via the placeholder,
// then sets their real email + password + name + title.

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured on server.' }, { status: 500 })
  }

  // Auth: verify caller is super admin
  const authHeader = req.headers.get('authorization')
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!accessToken) {
    return NextResponse.json({ error: 'Missing access token.' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken)
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })
  }
  const { data: callerAdmin } = await supabase.from('admins')
    .select('id, name, is_super_admin').eq('auth_user_id', userData.user.id).maybeSingle()
  const caller = callerAdmin as { id: string; name: string | null; is_super_admin?: boolean } | null
  if (!caller || !caller.is_super_admin) {
    return NextResponse.json({ error: 'Super admin access required.' }, { status: 403 })
  }

  // Generate token + placeholder credentials
  const token = randomBytes(24).toString('base64url')
  const placeholderPassword = randomBytes(18).toString('base64url')
  const placeholderEmail = `admin-invite-${token.slice(0, 12).toLowerCase()}@tiktak.temp`

  // Create auth user (auto-confirmed so signInWithPassword works immediately)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: placeholderEmail,
    password: placeholderPassword,
    email_confirm: true,
    user_metadata: { role: 'admin', invited: true },
  })
  if (authError || !authData?.user) {
    return NextResponse.json({ error: authError?.message ?? 'Failed to create auth user.' }, { status: 400 })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // +7 days

  const { error: insertError } = await supabase.from('admins').insert({
    auth_user_id: authData.user.id,
    name: 'Invited Admin',
    email: placeholderEmail,
    is_super_admin: false,
    invite_token: token,
    invite_secret: placeholderPassword,
    invited_at: now.toISOString(),
    invite_expires_at: expiresAt.toISOString(),
  })

  if (insertError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  await supabase.from('audit_logs').insert({
    actor_type: 'admin',
    actor_id: caller.id,
    actor_label: caller.name ?? 'admin',
    action: 'admin.invited',
    target_type: 'admin',
    target_label: placeholderEmail,
    details: { invite_path: `/admin-invite/${token}`, expires_at: expiresAt.toISOString() },
  })

  return NextResponse.json({
    token,
    invite_path: `/admin-invite/${token}`,
    expires_at: expiresAt.toISOString(),
  })
}
