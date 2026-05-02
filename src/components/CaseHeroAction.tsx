'use client'

import { type CaseStatus } from '@/lib/caseStatus'

// ── Shared bits ──────────────────────────────────────────────────────────────

type Tone = 'amber' | 'violet' | 'blue' | 'cyan' | 'emerald' | 'gray' | 'indigo' | 'orange' | 'teal'

const TONE: Record<Tone, { wrap: string; eyebrow: string; primaryBtn: string; ghostBtn: string; icon: string }> = {
  amber:   { wrap: 'border-amber-200 bg-amber-50',     eyebrow: 'text-amber-700',   primaryBtn: 'bg-amber-600 hover:bg-amber-700 text-white',     ghostBtn: 'text-amber-700 hover:bg-amber-100', icon: 'text-amber-500' },
  violet:  { wrap: 'border-violet-200 bg-violet-50',   eyebrow: 'text-violet-700',  primaryBtn: 'bg-violet-600 hover:bg-violet-700 text-white',   ghostBtn: 'text-violet-700 hover:bg-violet-100', icon: 'text-violet-500' },
  blue:    { wrap: 'border-blue-200 bg-blue-50',       eyebrow: 'text-blue-700',    primaryBtn: 'bg-blue-600 hover:bg-blue-700 text-white',       ghostBtn: 'text-blue-700 hover:bg-blue-100', icon: 'text-blue-500' },
  cyan:    { wrap: 'border-cyan-200 bg-cyan-50',       eyebrow: 'text-cyan-700',    primaryBtn: 'bg-[#0f4c35] hover:bg-[#0a3828] text-white',     ghostBtn: 'text-cyan-700 hover:bg-cyan-100', icon: 'text-cyan-500' },
  emerald: { wrap: 'border-emerald-200 bg-emerald-50', eyebrow: 'text-emerald-700', primaryBtn: 'bg-[#0f4c35] hover:bg-[#0a3828] text-white',     ghostBtn: 'text-emerald-700 hover:bg-emerald-100', icon: 'text-emerald-500' },
  gray:    { wrap: 'border-gray-200 bg-gray-50',       eyebrow: 'text-gray-500',    primaryBtn: 'bg-gray-700 hover:bg-gray-800 text-white',       ghostBtn: 'text-gray-700 hover:bg-gray-100', icon: 'text-gray-400' },
  indigo:  { wrap: 'border-indigo-200 bg-indigo-50',   eyebrow: 'text-indigo-700',  primaryBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',   ghostBtn: 'text-indigo-700 hover:bg-indigo-100', icon: 'text-indigo-500' },
  orange:  { wrap: 'border-orange-200 bg-orange-50',   eyebrow: 'text-orange-700',  primaryBtn: 'bg-orange-600 hover:bg-orange-700 text-white',   ghostBtn: 'text-orange-700 hover:bg-orange-100', icon: 'text-orange-500' },
  teal:    { wrap: 'border-teal-200 bg-teal-50',       eyebrow: 'text-teal-700',    primaryBtn: 'bg-teal-600 hover:bg-teal-700 text-white',       ghostBtn: 'text-teal-700 hover:bg-teal-100', icon: 'text-teal-500' },
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
  // deposit (new SOP) — both legs of the money flow
  depositInvoiceIssued?: boolean
  depositPaid?: boolean             // client → agent leg paid
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
          tone="indigo"
          eyebrow="Action needed"
          headline="Send 3-party contract for signing"
          subline={<span>Once client + you + admin all sign the contract, the deposit invoice can be issued.</span>}
        >
          <button onClick={p.onSendContract ?? (() => document.getElementById('case-contract')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}
            className={`text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 ${TONE.indigo.primaryBtn}`}>
            {p.copied ? <><CheckIcon /> Copied!</> : p.onSendContract ? <><CopyIcon /> Send Contract</> : <>Send Contract</>}
          </button>
        </HeroShell>
      )

    case 'awaiting_deposit': {
      // SOP: deposit phase is ONLY about deposit settlement. Info collection
      // happens in the next state (awaiting_info). Two legs:
      //   1. Client → Agent paid
      //   2. Agent → Admin (deposit settlement) paid
      const subBits: string[] = []
      subBits.push(p.depositInvoiceIssued ? 'Deposit invoice issued ✓' : 'Issue deposit invoice')
      subBits.push(p.depositPaid ? 'Client paid agent ✓' : 'Awaiting client payment')
      subBits.push(p.depositSettlementPaid ? 'Agent paid admin ✓' : 'Awaiting agent forward')
      const headline = !p.depositInvoiceIssued
        ? 'Issue deposit invoice to client'
        : !p.depositPaid
          ? 'Awaiting client deposit'
          : !p.depositSettlementPaid
            ? 'Forward deposit to admin'
            : 'Deposit settled — moving to info phase'
      return (
        <HeroShell
          tone="orange"
          eyebrow="Action needed"
          headline={headline}
          subline={<span>{subBits.join(' · ')}.</span>}
        >
          {p.onScrollToDocuments && (
            <button onClick={p.onScrollToDocuments}
              className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.orange.primaryBtn}`}>
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
          tone="amber"
          eyebrow="Action needed"
          headline="Complete client & trip info"
          subline={
            issues.length > 0
              ? <span>Missing: {issues.join(' · ')}. Schedule starts once everything is filled.</span>
              : <span>All set — schedule will start as soon as save propagates.</span>
          }
        >
          <button onClick={primary} className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.amber.primaryBtn}`}>
            Resolve
          </button>
        </HeroShell>
      )
    }

    case 'awaiting_schedule':
      return (
        <HeroShell
          tone="blue"
          eyebrow="In progress"
          headline="Tiktak is preparing your schedule"
          subline={<span>You&apos;ll be notified once the schedule PDF is ready to review.</span>}
        />
      )

    case 'reviewing_schedule':
      return (
        <HeroShell
          tone="violet"
          eyebrow="Action needed"
          headline={`Review Schedule v${p.scheduleVersion ?? '?'}`}
          subline={<span>Confirm with the client, or request a revision with notes.</span>}
        >
          <button onClick={p.onRequestRevision} disabled={p.busy}
            className={`text-xs font-medium px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40`}>
            Request Revision
          </button>
          <button onClick={p.onConfirmSchedule} disabled={p.busy}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.violet.primaryBtn} disabled:opacity-40`}>
            {p.busy ? 'Confirming…' : 'Confirm Schedule'}
          </button>
        </HeroShell>
      )

    case 'awaiting_pricing':
      return (
        <HeroShell
          tone="blue"
          eyebrow="In progress"
          headline="Final invoice in preparation"
          subline={<span>Schedule confirmed. Tiktak is finalizing the pricing — you&apos;ll be notified once the invoice is ready to send.</span>}
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
        <HeroShell tone={overdue ? 'amber' : 'cyan'} eyebrow="Action needed" headline="Send invoice link to client" subline={sub}>
          {onSend && (
            <button onClick={onSend}
              className={`text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 ${overdue ? TONE.amber.primaryBtn : TONE.cyan.primaryBtn}`}>
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
        <HeroShell tone="emerald" eyebrow="Confirmed" headline="Payment received · trip locked in" subline={sub} />
      )
    }

    case 'awaiting_review':
      return (
        <HeroShell
          tone="teal"
          eyebrow="Action needed"
          headline="Submit client review"
          subline={<span>Trip wrapped up. Fill in the survey below to finalize the case and unlock commission claim.</span>}
        >
          <button onClick={() => document.getElementById('survey')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.teal.primaryBtn}`}>
            Go to Review
          </button>
        </HeroShell>
      )

    case 'completed':
      if (!p.travelCompletedAt) {
        return (
          <HeroShell
            tone="emerald"
            eyebrow="Action needed"
            headline="Mark travel complete"
            subline={<span>Once you confirm the trip ended, you&apos;ll submit a review and settlement enters the queue.</span>}
          >
            <button onClick={p.onMarkTravelComplete} disabled={p.busy}
              className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.emerald.primaryBtn} disabled:opacity-40`}>
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
  depositPaid?: boolean             // client → agent leg paid
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
          tone="indigo"
          eyebrow="Action needed"
          headline="3-party contract pending signature"
          subline={<span>Counter-sign once agent + client both sign. Status advances to deposit phase automatically.</span>}
        >
          <button onClick={() => document.getElementById('case-contract')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.indigo.primaryBtn}`}>
            Go to Contract
          </button>
        </HeroShell>
      )

    case 'awaiting_deposit':
      return (
        <HeroShell
          tone="orange"
          eyebrow="Waiting on agent"
          headline="Deposit settlement in progress"
          subline={
            <span>
              Client → Agent {p.depositPaid ? '✓' : '✗'} ·
              Agent → Admin {p.depositSettlementPaid ? '✓' : '✗'}
              {' '}— info collection starts once both legs are paid.
            </span>
          }
        />
      )

    case 'awaiting_info':
      return (
        <HeroShell
          tone="amber"
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
          tone="blue"
          eyebrow="Action needed"
          headline="Upload schedule PDF"
          subline={p.scheduleReady
            ? <span>Case info is complete — drop in the schedule PDF below.</span>
            : <span>Waiting for agent to finish prerequisites first.</span>}
        >
          <button onClick={p.onScrollToScheduleUpload} disabled={!p.scheduleReady}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.blue.primaryBtn} disabled:opacity-40`}>
            Go to Upload
          </button>
        </HeroShell>
      )

    case 'reviewing_schedule':
      return (
        <HeroShell
          tone="violet"
          eyebrow="Waiting on agent"
          headline={`Agent reviewing Schedule v${p.scheduleVersion ?? '?'}`}
          subline={p.scheduleStatus === 'revision_requested'
            ? <span>Revision requested — upload a new version below.</span>
            : <span>Pending agent confirmation. They&apos;ll either confirm or request a revision.</span>}
        >
          {p.scheduleStatus === 'revision_requested' && (
            <button onClick={p.onScrollToScheduleUpload}
              className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.violet.primaryBtn}`}>
              Upload New Version
            </button>
          )}
        </HeroShell>
      )

    case 'awaiting_pricing':
      return (
        <HeroShell
          tone="violet"
          eyebrow="Action needed"
          headline="Finalize pricing & issue invoice"
          subline={<span>Schedule confirmed. Set final line-item prices and the payment due date.</span>}
        >
          <button onClick={p.onScrollToPricing}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${TONE.violet.primaryBtn}`}>
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
        <HeroShell tone={overdue ? 'amber' : 'cyan'} eyebrow="Action needed" headline="Confirm payment received" subline={sub}>
          <button onClick={p.onScrollToConfirmPayment}
            className={`text-xs font-medium px-3 py-2 rounded-lg ${overdue ? TONE.amber.primaryBtn : TONE.cyan.primaryBtn}`}>
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
      return <HeroShell tone="emerald" eyebrow="On track" headline="Payment confirmed · trip booked" subline={sub} />
    }

    case 'awaiting_review':
      return (
        <HeroShell
          tone="teal"
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
