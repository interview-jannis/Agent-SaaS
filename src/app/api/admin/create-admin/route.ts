import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Super-admin-only: creates a new admin auth user + admins table row.
// Caller passes name + email + temp password (+ optional title). The new admin
// uses these credentials to sign in, then changes their password in Settings.

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
    .select('is_super_admin').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!callerAdmin || !(callerAdmin as { is_super_admin?: boolean }).is_super_admin) {
    return NextResponse.json({ error: 'Super admin access required.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as
    | { name?: string; email?: string; password?: string; title?: string }
    | null
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

  const name = body.name?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password
  const title = body.title?.trim() || null

  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 })
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  // Reject duplicate email in admins table
  const { data: existing } = await supabase.from('admins').select('id').eq('email', email).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'An admin with this email already exists.' }, { status: 409 })
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'admin' },
  })
  if (authError || !authData?.user) {
    return NextResponse.json({ error: authError?.message ?? 'Failed to create auth user.' }, { status: 400 })
  }

  // Insert admins row
  const { error: insertError } = await supabase.from('admins').insert({
    auth_user_id: authData.user.id,
    name,
    email,
    title,
    is_super_admin: false,
  })

  if (insertError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ name, email, title })
}
