import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Validate an admin invite token and return the placeholder credentials,
// so the client can signInWithPassword and proceed to the setup form.
// Token is invalidated once the admin completes setup (cleared along with secret).

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })
  }

  const { token } = await req.json() as { token?: string }
  if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: admin } = await supabase.from('admins')
    .select('email, invite_secret, invite_expires_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!admin) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })

  const a = admin as {
    email: string
    invite_secret: string | null
    invite_expires_at: string | null
  }

  if (a.invite_expires_at && new Date(a.invite_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired. Contact your super admin for a new link.' }, { status: 410 })
  }
  if (!a.invite_secret) {
    return NextResponse.json({ error: 'This invite has already been used. Please sign in with your real credentials.' }, { status: 410 })
  }

  return NextResponse.json({ email: a.email, password: a.invite_secret })
}
