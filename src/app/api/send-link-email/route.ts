import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const FROM = 'TIKKTAKK <noreply@interviewcorp.co.kr>'

const SUBJECTS: Record<string, string> = {
  quotation: '[Tiktak] Your quotation is ready',
  invoice: '[Tiktak] Your invoice is ready',
  schedule: '[Tiktak] Your travel schedule is ready',
  contract: '[Tiktak] Your contract is ready to sign',
  partner_view: '[TIKKTAKK] Client information shared with you',
}

const BODY_LINES: Record<string, { heading: string; body: string; cta: string }> = {
  quotation: {
    heading: 'Your quotation is ready',
    body: 'Please review your travel quotation at the link below. If you have any questions, reach out to your agent.',
    cta: 'View Quotation',
  },
  invoice: {
    heading: 'Your invoice is ready',
    body: 'Your invoice has been issued. Please review the details and proceed with payment as instructed.',
    cta: 'View Invoice',
  },
  schedule: {
    heading: 'Your travel schedule is ready',
    body: 'Your itinerary has been prepared. Please review your travel schedule at the link below.',
    cta: 'View Schedule',
  },
  contract: {
    heading: 'Your contract is ready to sign',
    body: 'Please review and sign the 3-party contract at the link below. Your signature is required to proceed.',
    cta: 'Review & Sign Contract',
  },
  partner_view: {
    heading: 'Client information has been shared with you',
    body: 'TIKKTAKK has shared client profile information with you for reference. Please review the details at the link below.',
    cta: 'View Client Information',
  },
}

function buildHtml(url: string, type: string): string {
  const content = BODY_LINES[type] ?? BODY_LINES.quotation
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%">
        <tr><td style="background:#0f4c35;padding:20px 32px">
          <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">Tiktak</span>
        </td></tr>
        <tr><td style="padding:32px;font-size:15px;line-height:1.7">
          <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111827">${content.heading}</p>
          <p style="margin:0 0 24px;color:#374151">${content.body}</p>
          <a href="${url}" style="display:inline-block;padding:12px 28px;background:#0f4c35;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">${content.cta}</a>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af">Tiktak by Interview Co. &middot; This is an automated notification.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function POST(req: Request) {
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'Email not configured.' }, { status: 500 })

  const { emails, url, type } = await req.json() as { emails?: string[]; url?: string; type?: string }
  if (!emails || emails.length === 0) return NextResponse.json({ error: 'No recipients.' }, { status: 400 })
  if (!url) return NextResponse.json({ error: 'Missing url.' }, { status: 400 })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const subject = SUBJECTS[type ?? ''] ?? '[Tiktak] A document is ready for you'
  const html = buildHtml(url, type ?? 'quotation')

  let sent = 0
  for (const email of emails) {
    try {
      await resend.emails.send({ from: FROM, to: email, subject, html })
      sent++
    } catch (e) {
      console.error('[send-link-email] failed for', email, e)
    }
  }

  return NextResponse.json({ sent })
}
