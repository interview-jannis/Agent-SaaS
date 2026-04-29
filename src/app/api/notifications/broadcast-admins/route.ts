import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Server-side broadcast to every admin. Uses service role so it bypasses
// any RLS/session edge cases on cross-user INSERTs. Generic counterpart to
// `notifyAllAdmins` in src/lib/notifications.ts — clients call this first
// and fall back to the client-side path on failure.

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })

  const { message, link_url } = await req.json() as { message?: string; link_url?: string | null }
  if (!message || !message.trim()) return NextResponse.json({ error: 'Missing message.' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: admins } = await supabase.from('admins').select('id, auth_user_id')
  if (!admins || admins.length === 0) return NextResponse.json({ ok: true, count: 0 })

  const seen = new Set<string>()
  const rows: Array<Record<string, unknown>> = []
  for (const a of admins as Array<{ id: string; auth_user_id: string | null }>) {
    if (!a.auth_user_id || seen.has(a.auth_user_id)) continue
    seen.add(a.auth_user_id)
    rows.push({
      auth_user_id: a.auth_user_id,
      target_type: 'admin',
      target_id: a.id,
      message,
      link_url: link_url ?? null,
      is_read: false,
    })
  }
  if (rows.length === 0) return NextResponse.json({ ok: true, count: 0 })

  const { error } = await supabase.from('notifications').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: rows.length })
}
