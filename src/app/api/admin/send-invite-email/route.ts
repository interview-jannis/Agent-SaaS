import { NextResponse } from 'next/server'
import { sendInviteEmailToAgent } from '@/lib/email'

export async function POST(req: Request) {
  const { invite_url, recipient_email, expires_at } = await req.json() as {
    invite_url?: string
    recipient_email?: string
    expires_at?: string
  }

  if (!invite_url || !recipient_email?.trim()) {
    return NextResponse.json({ error: 'Missing invite_url or recipient_email.' }, { status: 400 })
  }

  const expiresAt = expires_at ?? new Date(Date.now() + 7 * 86400000).toISOString()

  try {
    await sendInviteEmailToAgent(recipient_email.trim(), invite_url, expiresAt)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as { message?: string })?.message ?? 'Failed to send email.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
