import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendIntakeEmailToClient } from '@/lib/email'

// POST /api/intake/send-email
// Sends the intake link to each selected client's email.
// Skips clients with no email and reports the count.

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })

  const { token, client_ids } = await req.json() as { token?: string; client_ids?: string[] }
  if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 })
  if (!client_ids || client_ids.length === 0) return NextResponse.json({ error: 'No clients selected.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tiktak.interviewcorp.co.kr'
  const intakeUrl = `${appUrl}/intake/${token}`

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, email')
    .in('id', client_ids)

  let sent = 0
  let skipped = 0
  for (const c of (clients ?? []) as { id: string; name: string; email: string | null }[]) {
    if (!c.email) { skipped++; continue }
    try {
      await sendIntakeEmailToClient(c.email, c.name, intakeUrl)
      sent++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ sent, skipped })
}
