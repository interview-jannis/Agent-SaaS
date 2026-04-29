import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Finalises an invited admin's account. Called from /admin-invite/[token].
// Updates auth.users (real email + password) + admins row (real name/email/title)
// and invalidates the invite token.

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })

  const { authUserId, name, email, password, title } = await req.json() as {
    authUserId?: string; name?: string; email?: string; password?: string; title?: string
  }

  if (!authUserId || !name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify this auth user is an admin with an active invite token
  const { data: admin } = await supabase.from('admins')
    .select('id, invite_token').eq('auth_user_id', authUserId).maybeSingle()
  if (!admin) return NextResponse.json({ error: 'Admin record not found.' }, { status: 404 })
  if (!(admin as { invite_token: string | null }).invite_token) {
    return NextResponse.json({ error: 'This invite has already been used.' }, { status: 410 })
  }

  // Reject duplicate email (excluding self)
  const cleanEmail = email.trim().toLowerCase()
  const { data: dupes } = await supabase.from('admins').select('id').eq('email', cleanEmail)
  if ((dupes as { id: string }[] | null)?.some(d => d.id !== (admin as { id: string }).id)) {
    return NextResponse.json({ error: 'An admin with this email already exists.' }, { status: 409 })
  }

  // Update auth.users (no confirmation email — admin API bypass)
  const { error: authErr } = await supabase.auth.admin.updateUserById(authUserId, {
    email: cleanEmail,
    password,
    email_confirm: true,
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  const { error: upErr } = await supabase.from('admins').update({
    name: name.trim(),
    email: cleanEmail,
    title: title?.trim() || null,
    invite_token: null,
    invite_secret: null,
  }).eq('id', (admin as { id: string }).id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
