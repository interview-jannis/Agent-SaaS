'use client'

import { type CaseStatus } from '@/lib/caseStatus'

// ── Shared bits ──────────────────────────────────────────────────────────────

// 3-tone scheme: green = my turn to act, amber = overdue/urgent, gray = waiting/done
type Tone = 'green' | 'amber' | 'gray'

const TONE: Record<Tone, { wrap: string; eyebrow: string; primaryBtn: string; ghostBtn: string; icon: string }> = {
  green: { wrap: 'border-2 border-[#0f4c35] bg-white',  eyebrow: 'text-[#0f4c35]',  primaryBtn: 'bg-[#0f4c35] hover:bg-[#0a3828] text-white', ghostBtn: 'text-[#0f4c35] hover:bg-gray-100', icon: 'text-[#0f4c35]' },
  amber: { wrap: 'border-2 border-amber-500 bg-white',   eyebrow: 'text-amber-700',  primaryBtn: 'bg-amber-600 hover:bg-amber-700 text-white',  ghostBtn: 'text-amber-700 hover:bg-amber-50',  icon: 'text-amber-500' },
  gray:  { wrap: 'border-2 border-[#0f4c35] bg-white',   eyebrow: 'text-gray-500',   primaryBtn: 'bg-gray-700 hover:bg-gray-800 text-white',    ghostBtn: 'text-gray-600 hover:bg-gray-100',   icon: 'text-gray-400' },
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function HeroShell({
  tone, eyebrow, headline, subline, children,
}: {
  tone: Tone
  eyebrow: string
  headline: string
  subline?: React.ReactNode
  children?: React.ReactNode
}) {
  const t = TONE[tone]
  return (
    <section className={`border rounded-2xl px-5 py-4 ${t.wrap}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.eyebrow}`}>Next · {eyebrow}</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{headline}</p>
          {subline && <div className="text-xs text-gray-600 mt-1">{subline}</div>}
        </div>
        {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
      </div>
    </section>
  )
}

// ── Agent variant ────────────────────────────────────────────────────────────

export type AgentHeroProps = {
  status: CaseStatus
  // readiness flags
  caseInfoComplete: boolean
  missingCaseFields: string[]
  clientsMissingCount: number   // clients with incomplete info
  membersShortfall: number      // expectedMembers - currentMembers
  groupsIncomplete: boolean
  // schedule
  scheduleVersion: number | null
  scheduleStatus: 'pending' | 'confirmed' | 'revision_requested' | null
  // financials
  hasInvoice: boolean
  paymentDueDate: string | null
  // deposit (new SOP) — admin → agent settlement only
  depositSettlementPaid?: boolean   // agent → admin leg paid
  // travel
  travelStartDate: string | null
  travelCompletedAt: string | null
  // handlers
  onScrollToTrip: () => void
  onScrollToMembers: () => void
  onScrollToSchedule: () => void
  onScrollToFinancials: () => void
  onSendQuotation?: () => void
  onSendInvoice?: () => void
  onSendContract?: () => void   // copies /case-contract/[token] URL when agent has signed
  onConfirmSchedule?: () => void
  onRequestRevision?: () => void
  onMarkTravelComplete?: () => void
  onMarkReviewSubmitted?: () => void   // temp until 3차 surveys
  onScrollToDocuments?: () => void
  // ui state
  copied?: boolean
  busy?: boolean
}

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000)
}

export function AgentCaseHero(p: AgentHeroProps) {
  switch (p.status) {
    case 'canceled':
      return null

    case 'awaiting_contract':
      return (
        <HeroShell
          tone="green"
          eyebrow="Action needed"
          headline="Send 3-party contract for signing"
          subline={<span>Once client + you + admin all sign the contract, the deposit invoice can be issued.</span>}
        >
          <button onClick={p.onSendContract ?? (() => document.getElementById('case-contract')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}
            className={`text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 ${TONE.green.primaryBtn}`}>
            {p.copied ? <><CheckIcon /> Copied!</> : p.onSendContract ? <><CopyIcon /> Send Contract</> : <>Send Contract</>}
          </button>
        </HeroShell>
      )

    case 'awaiting_deposit': {
      // SOP: admin issues a settlement invoice to the agent. Agent collects
      // deposit from client off-platform, then forwards to admin. Once the
      // settlement is marked paid, status advances to the info phase.
      const headline = p.depositSettlementPaid
        ? 'Deposit settled — moving to info phase'
        : 'Forward deposit to admin'
      return (
        <HeroShell
          tone="green"
          eyebrow="Action needed"
          headline={headline}
          subline={<span>{p.depositSettlementPaid ? 'Settlement received by admin ✓' : 'Awaiting deposit settlement to admin'}.</span>}
        >
          {p.onScrollToDocuments && (
            <button onClick={p.onScrollToDocuments}
              className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.green.primaryBtn}`}>
              Go to Invoices
            </button>
          )}
        </HeroShell>
      )
    }

    case 'awaiting_info': {
      // SOP: deposit done, now collect client/trip info before admin schedules.
      const issues: string[] = []
      if (!p.caseInfoComplete) issues.push(`Trip info (${p.missingCaseFields.length})`)
      if (p.membersShortfall > 0) issues.push(`${p.membersShortfall} member${p.membersShortfall > 1 ? 's' : ''} to add`)
      if (p.clientsMissingCount > 0) issues.push(`${p.clientsMissingCount} client${p.clientsMissingCount > 1 ? 's' : ''} incomplete`)
      if (p.groupsIncomplete) issues.push('groups not assigned')
      const primary = !p.caseInfoComplete ? p.onScrollToTrip : p.onScrollToMembers
      return (
        <HeroShell
          tone="green"
          eyebrow="Action needed"
          headline="Complete client & trip info"
          subline={
            issues.length > 0
              ? <span>Missing: {issues.join(' · ')}. Schedule starts once everything is filled.</span>
              : <span>All set — schedule will start as soon as save propagates.</span>
          }
        >
          <button onClick={primary} className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.green.primaryBtn}`}>
            Resolve
          </button>
        </HeroShell>
      )
    }

    case 'awaiting_schedule':
      return (
        <HeroShell
          tone="gray"
          eyebrow="In progress"
          headline="TikkTakk is preparing your schedule"
          subline={<span>You&apos;ll be notified once the schedule is ready to review.</span>}
        />
      )

    case 'reviewing_schedule':
      return (
        <HeroShell
          tone="green"
          eyebrow="Action needed"
          headline={`Review Schedule v${p.scheduleVersion ?? '?'}`}
          subline={<span>Confirm with the client, or request a revision with notes.</span>}
        >
          <button onClick={p.onScrollToSchedule}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            View Schedule
          </button>
          <button onClick={p.onRequestRevision} disabled={p.busy}
            className={`text-xs font-medium px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40`}>
            Request Revision
          </button>
          <button onClick={p.onConfirmSchedule} disabled={p.busy}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.green.primaryBtn} disabled:opacity-40`}>
            {p.busy ? 'Confirming…' : 'Confirm Schedule'}
          </button>
        </HeroShell>
      )

    case 'awaiting_pricing':
      return (
        <HeroShell
          tone="gray"
          eyebrow="In progress"
          headline="Final invoice in preparation"
          subline={<span>Schedule confirmed. TikkTakk is finalizing the pricing — you&apos;ll be notified once the invoice is ready to send.</span>}
        />
      )

    case 'awaiting_payment': {
      const overdue = p.paymentDueDate ? new Date(p.paymentDueDate) < new Date() : false
      const days = p.paymentDueDate ? daysUntil(p.paymentDueDate) : null
      const sub = p.paymentDueDate
        ? overdue
          ? <span className="text-red-600 font-medium">Overdue since {p.paymentDueDate}</span>
          : <span>Due {p.paymentDueDate}{days !== null && days <= 14 ? ` · ${days} day${days === 1 ? '' : 's'} left` : ''}</span>
        : <span>Send the invoice link to your client.</span>
      const onSend = p.hasInvoice ? p.onSendInvoice : p.onSendQuotation
      const label = p.hasInvoice ? 'Send Invoice' : 'Send Quotation'
      return (
        <HeroShell tone={overdue ? 'amber' : 'green'} eyebrow="Action needed" headline="Send invoice link to client" subline={sub}>
          {onSend && (
            <button onClick={onSend}
              className={`text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 ${overdue ? TONE.amber.primaryBtn : TONE.green.primaryBtn}`}>
              {p.copied ? <><CheckIcon /> Copied!</> : <><CopyIcon /> {label}</>}
            </button>
          )}
        </HeroShell>
      )
    }

    case 'awaiting_travel': {
      const days = p.travelStartDate ? daysUntil(p.travelStartDate) : null
      const sub = days === null
        ? <span>Travel dates pending.</span>
        : days > 0
          ? <span>Travel begins in {days} day{days === 1 ? '' : 's'} ({p.travelStartDate}).</span>
          : days === 0
            ? <span>Travel begins today.</span>
            : <span>Travel underway. Mark complete after the trip ends.</span>
      return (
        <HeroShell tone="gray" eyebrow="Confirmed" headline="Payment received · trip locked in" subline={sub} />
      )
    }

    case 'awaiting_review':
      return (
        <HeroShell
          tone="green"
          eyebrow="Action needed"
          headline="Submit client review"
          subline={<span>Trip wrapped up. Fill in the survey below to finalize the case and unlock commission claim.</span>}
        >
          <button onClick={() => document.getElementById('survey')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.green.primaryBtn}`}>
            Go to Review
          </button>
        </HeroShell>
      )

    case 'completed':
      if (!p.travelCompletedAt) {
        return (
          <HeroShell
            tone="green"
            eyebrow="Action needed"
            headline="Mark travel complete"
            subline={<span>Once you confirm the trip ended, you&apos;ll submit a review and settlement enters the queue.</span>}
          >
            <button onClick={p.onMarkTravelComplete} disabled={p.busy}
              className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.green.primaryBtn} disabled:opacity-40`}>
              {p.busy ? 'Updating…' : 'Mark Travel Complete'}
            </button>
          </HeroShell>
        )
      }
      return (
        <HeroShell tone="gray" eyebrow="Done" headline="Case completed · awaiting commission settlement"
          subline={<span>Your commission is queued for payout. Payouts tab tracks status.</span>} />
      )

    default:
      return null
  }
}

// ── Admin variant ────────────────────────────────────────────────────────────

export type AdminHeroProps = {
  status: CaseStatus
  // readiness
  caseInfoComplete: boolean
  allClientsComplete: boolean
  groupsComplete: boolean
  // schedule
  scheduleVersion: number | null
  scheduleStatus: 'pending' | 'confirmed' | 'revision_requested' | null
  scheduleReady: boolean
  // pricing
  hasInvoice: boolean
  paymentDueDate: string | null
  // deposit (new SOP) — both legs
  depositSettlementPaid?: boolean   // agent → admin leg paid
  // travel
  travelStartDate: string | null
  // handlers — admin actions live in their own sections; hero scrolls to them
  onScrollToScheduleUpload: () => void
  onScrollToPricing: () => void
  onScrollToConfirmPayment: () => void
  onMarkContractSigned?: () => void   // temp until 2차 case_contracts feature
  busy?: boolean
}

export function AdminCaseHero(p: AdminHeroProps) {
  switch (p.status) {
    case 'canceled':
      return null

    case 'awaiting_contract':
      return (
        <HeroShell
          tone="green"
          eyebrow="Action needed"
          headline="3-party contract pending signature"
          subline={<span>Counter-sign once agent + client both sign. Status advances to deposit phase automatically.</span>}
        >
          <button onClick={() => document.getElementById('case-contract')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.green.primaryBtn}`}>
            Go to Contract
          </button>
        </HeroShell>
      )

    case 'awaiting_deposit':
      return (
        <HeroShell
          tone="gray"
          eyebrow="Waiting on agent"
          headline="Deposit settlement in progress"
          subline={
            <span>
              Agent → Admin {p.depositSettlementPaid ? '✓' : '✗'}
              {' '}— info collection starts once settlement is paid.
            </span>
          }
        />
      )

    case 'awaiting_info':
      return (
        <HeroShell
          tone="gray"
          eyebrow="Waiting on agent"
          headline="Agent is collecting client + trip info"
          subline={
            <span>
              Trip info {p.caseInfoComplete ? '✓' : '✗'} ·
              Clients {p.allClientsComplete ? '✓' : '✗'} ·
              Groups {p.groupsComplete ? '✓' : '✗'}
              {' '}— schedule work starts when all are checked.
            </span>
          }
        />
      )

    case 'awaiting_schedule':
      return (
        <HeroShell
          tone={p.scheduleReady ? 'green' : 'gray'}
          eyebrow="Action needed"
          headline="Upload schedule PDF"
          subline={p.scheduleReady
            ? <span>Case info is complete — drop in the schedule PDF below.</span>
            : <span>Waiting for agent to finish prerequisites first.</span>}
        >
          <button onClick={p.onScrollToScheduleUpload} disabled={!p.scheduleReady}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.green.primaryBtn} disabled:opacity-40`}>
            Go to Upload
          </button>
        </HeroShell>
      )

    case 'reviewing_schedule':
      return (
        <HeroShell
          tone={p.scheduleStatus === 'revision_requested' ? 'green' : 'gray'}
          eyebrow={p.scheduleStatus === 'revision_requested' ? 'Action needed' : 'Waiting on agent'}
          headline={`Agent reviewing Schedule v${p.scheduleVersion ?? '?'}`}
          subline={p.scheduleStatus === 'revision_requested'
            ? <span>Revision requested — upload a new version below.</span>
            : <span>Pending agent confirmation. They&apos;ll either confirm or request a revision.</span>}
        >
          <button onClick={() => document.getElementById('schedule-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            View Schedule
          </button>
          {p.scheduleStatus === 'revision_requested' && (
            <button onClick={p.onScrollToScheduleUpload}
              className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.green.primaryBtn}`}>
              Upload New Version
            </button>
          )}
        </HeroShell>
      )

    case 'awaiting_pricing':
      return (
        <HeroShell
          tone="green"
          eyebrow="Action needed"
          headline="Finalize pricing & issue invoice"
          subline={<span>Schedule confirmed. Set final line-item prices and the payment due date.</span>}
        >
          <button onClick={p.onScrollToPricing}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.green.primaryBtn}`}>
            Go to Pricing
          </button>
        </HeroShell>
      )

    case 'awaiting_payment': {
      const overdue = p.paymentDueDate ? new Date(p.paymentDueDate) < new Date() : false
      const sub = p.paymentDueDate
        ? overdue
          ? <span className="text-red-600 font-medium">Payment overdue since {p.paymentDueDate}</span>
          : <span>Invoice issued · due {p.paymentDueDate}. Confirm once funds arrive.</span>
        : <span>Confirm once funds arrive in the company account.</span>
      return (
        <HeroShell tone={overdue ? 'amber' : 'green'} eyebrow="Action needed" headline="Confirm payment received" subline={sub}>
          <button onClick={p.onScrollToConfirmPayment}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${overdue ? TONE.amber.primaryBtn : TONE.green.primaryBtn}`}>
            Go to Confirm
          </button>
        </HeroShell>
      )
    }

    case 'awaiting_travel': {
      const days = p.travelStartDate ? daysUntil(p.travelStartDate) : null
      const sub = days === null
        ? <span>Travel dates pending.</span>
        : days > 0
          ? <span>Travel begins in {days} day{days === 1 ? '' : 's'} ({p.travelStartDate}). Agent marks complete after the trip.</span>
          : <span>Travel in progress. Agent will mark complete after the trip ends.</span>
      return <HeroShell tone="gray" eyebrow="On track" headline="Payment confirmed · trip booked" subline={sub} />
    }

    case 'awaiting_review':
      return (
        <HeroShell
          tone="gray"
          eyebrow="Waiting on agent"
          headline="Travel done · agent submitting client review"
          subline={<span>Settlement is queued and partner payouts are unlocked. Commission claim becomes available once review is submitted.</span>}
        />
      )

    case 'completed':
      return (
        <HeroShell
          tone="gray"
          eyebrow="Settlement queue"
          headline="Case completed · process payout"
          subline={<span>Pay partners and the agent commission. Track in Settlement and Partner Payouts sections.</span>}
        />
      )

    default:
      return null
  }
}
