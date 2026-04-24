import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Claim an invite token: validate it and return the placeholder credentials
// so the client can signInWithPassword and enter onboarding.
// The token stays valid until the Setup Wizard completes (setup_completed_at),
// so an agent can close and reopen the invite link during onboarding.

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

  const { data: agent } = await supabase.from('agents')
    .select('email, invite_secret, invite_expires_at, setup_completed_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!agent) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })

  const a = agent as {
    email: string
    invite_secret: string | null
    invite_expires_at: string | null
    setup_completed_at: string | null
  }

  if (a.setup_completed_at) {
    return NextResponse.json({ error: 'This invite has already been used. Please sign in with your real credentials.' }, { status: 410 })
  }
  if (a.invite_expires_at && new Date(a.invite_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired. Contact your Tiktak admin for a new link.' }, { status: 410 })
  }
  if (!a.invite_secret) {
    return NextResponse.json({ error: 'Invite is no longer valid.' }, { status: 410 })
  }

  return NextResponse.json({ email: a.email, password: a.invite_secret })
}
