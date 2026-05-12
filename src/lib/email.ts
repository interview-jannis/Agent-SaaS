import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}
const FROM = 'TIKKTAKK <noreply@interviewcorp.co.kr>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tiktak.interviewcorp.co.kr'

function getAdminSubject(message: string): string {
  if (/signed contracts.*review needed/i.test(message)) {
    const m = message.match(/(#AG-\d+)/)
    return m ? `${m[1]} 계약 서명 완료 — 검토 필요` : '계약 서명 완료 — 검토 필요'
  }
  if (/completed account setup/i.test(message)) return '계정 설정 완료'
  if (/new case from/i.test(message)) return '새 케이스 생성'
  if (/3-party contract signed/i.test(message)) return '3자 계약 서명 완료'
  if (/client signed contract/i.test(message)) return '클라이언트 계약 서명'
  if (/agent signed contract/i.test(message)) return '에이전트 계약 서명'
  if (/Schedule.*confirmed.*finalize/i.test(message)) return '스케줄 확정 — 견적 최종화 필요'
  if (/revision requested/i.test(message)) return '스케줄 수정 요청'
  if (/Travel completed/i.test(message)) return '여행 완료'
  if (/client review submitted/i.test(message)) return '클라이언트 리뷰 제출'
  if (/issued by agent/i.test(message)) return '에이전트 서류 발행'
  if (/cancelled by agent/i.test(message)) return '케이스 취소'
  if (/deposit received and info complete/i.test(message)) return '입금 확인 및 정보 완료'
  if (/deposit received/i.test(message)) return '입금 확인'
  if (/ready for schedule/i.test(message)) return '스케줄 작성 가능'
  const m = message.match(/^([\S]+)/)
  return m ? `새 알림 — ${m[1]}` : '새 알림'
}

function getAgentSubject(message: string): string {
  if (/account.*approved|Your account has been approved/i.test(message)) return 'Your account has been approved'
  if (/3-party contract signed.*issue deposit/i.test(message)) return 'Contract signed — issue deposit invoice'
  if (/counter-signed the 3-party/i.test(message)) return 'Contract counter-signed by Interview Co.'
  if (/issued.*please review/i.test(message)) return 'Document issued — please review'
  if (/issued.*please send/i.test(message)) return 'Document issued — please send to client'
  if (/Deposit forward confirmed/i.test(message)) return 'Deposit forward confirmed'
  if (/Balance payment confirmed/i.test(message)) return 'Balance payment confirmed'
  if (/Settlement paid/i.test(message)) return 'Your payout has been sent'
  if (/Schedule.*deleted/i.test(message)) return 'Schedule deleted by admin'
  if (/deposit received.*complete client info/i.test(message)) return 'Deposit received — complete client info'
  if (/Travel complete.*submit.*review/i.test(message)) return 'Travel complete — submit your review'
  if (/Review submitted.*issue.*commission/i.test(message)) return 'Review submitted — issue commission invoice'
  const m = message.match(/^([\S]+)/)
  return m ? `New notification — ${m[1]}` : 'New notification'
}

function buildHtml(message: string, linkUrl: string | null, isAdmin: boolean): string {
  const buttonLabel = isAdmin ? '바로가기' : 'View Now'
  const lines = message.split('\n')
  let body = ''
  let listItems = ''

  for (const line of lines) {
    if (line.startsWith('•')) {
      listItems += `<li style="margin:4px 0;color:#374151">${line.slice(1).trim()}</li>`
    } else {
      if (listItems) {
        body += `<ul style="margin:8px 0;padding-left:20px">${listItems}</ul>`
        listItems = ''
      }
      if (line.trim()) {
        body += `<p style="margin:8px 0;color:#374151">${line}</p>`
      }
    }
  }
  if (listItems) {
    body += `<ul style="margin:8px 0;padding-left:20px">${listItems}</ul>`
  }

  const button = linkUrl
    ? `<a href="${APP_URL}${linkUrl}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:#0f4c35;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">${buttonLabel}</a>`
    : ''

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
          ${body}
          ${button}
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

export async function sendEmailToAgent(agentEmail: string, message: string, linkUrl: string | null) {
  if (!process.env.RESEND_API_KEY) return
  try {
    await getResend().emails.send({
      from: FROM,
      to: agentEmail,
      subject: `[Tiktak] ${getAgentSubject(message)}`,
      html: buildHtml(message, linkUrl, false),
    })
  } catch (e) {
    console.error('[email] failed to send to agent', e)
  }
}

export async function sendEmailToAdmin(adminEmail: string, message: string, linkUrl: string | null) {
  if (!process.env.RESEND_API_KEY) return
  try {
    await getResend().emails.send({
      from: FROM,
      to: adminEmail,
      subject: `[Tiktak] ${getAdminSubject(message)}`,
      html: buildHtml(message, linkUrl, true),
    })
  } catch (e) {
    console.error('[email] failed to send to admin', e)
  }
}

export async function sendIntakeEmailToClient(clientEmail: string, clientName: string, intakeUrl: string) {
  if (!process.env.RESEND_API_KEY) return
  const html = `<!DOCTYPE html>
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
          <p style="margin:0 0 12px;color:#374151">Dear ${clientName},</p>
          <p style="margin:0 0 12px;color:#374151">Your agent has shared a health intake form with you. Please take a moment to fill in your personal and health details before your trip.</p>
          <p style="margin:0 0 24px;color:#374151">This helps us provide you with the best possible care and experience.</p>
          <a href="${intakeUrl}" style="display:inline-block;padding:12px 28px;background:#0f4c35;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Complete Your Profile</a>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af">Tiktak by Interview Co. &middot; This is an automated notification.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  try {
    await getResend().emails.send({
      from: FROM,
      to: clientEmail,
      subject: '[Tiktak] Please complete your health intake form',
      html,
    })
  } catch (e) {
    console.error('[email] failed to send intake email to client', e)
    throw e
  }
}
