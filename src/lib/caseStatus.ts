// Single source of truth for case lifecycle status.
// DB names are forward-looking ("awaiting_X") — match labels 1:1, no translation step.
// Owner column documents whose action moves the case forward.

export type CaseStatus =
  | 'awaiting_info'         // legacy initial — new cases enter awaiting_contract
  | 'awaiting_contract'     // quote sent, 3-party contract pending
  | 'awaiting_deposit'      // contract signed, deposit + info pending (parallel)
  | 'awaiting_schedule'     // deposit paid + info complete, admin scheduling
  | 'reviewing_schedule'    // agent reviewing uploaded schedule
  | 'awaiting_pricing'      // schedule confirmed, admin finalizing pricing
  | 'awaiting_payment'      // balance invoice pending payment (deposit already paid)
  | 'awaiting_travel'       // balance paid, travel pending
  | 'awaiting_review'       // travel done, review/survey pending
  | 'completed'             // review submitted (or legacy travel-done cases)
  | 'canceled'

export const ALL_STATUSES: CaseStatus[] = [
  'awaiting_info',
  'awaiting_contract',
  'awaiting_deposit',
  'awaiting_schedule',
  'reviewing_schedule',
  'awaiting_pricing',
  'awaiting_payment',
  'awaiting_travel',
  'awaiting_review',
  'completed',
  'canceled',
]

// Active pipeline order (canceled is terminal/branched, shown separately)
export const PIPELINE_ORDER: CaseStatus[] = [
  'awaiting_info',
  'awaiting_contract',
  'awaiting_deposit',
  'awaiting_schedule',
  'reviewing_schedule',
  'awaiting_pricing',
  'awaiting_payment',
  'awaiting_travel',
  'awaiting_review',
  'completed',
]

export const STATUS_LABELS: Record<CaseStatus, string> = {
  awaiting_info: 'Awaiting Client Info',
  awaiting_contract: 'Awaiting Contract',
  awaiting_deposit: 'Awaiting Deposit',
  awaiting_schedule: 'Awaiting Schedule',
  reviewing_schedule: 'Reviewing Schedule',
  awaiting_pricing: 'Awaiting Final Pricing',
  awaiting_payment: 'Awaiting Balance Payment',
  awaiting_travel: 'Awaiting Travel',
  awaiting_review: 'Awaiting Review',
  completed: 'Completed',
  canceled: 'Canceled',
}

export const STATUS_STYLES: Record<CaseStatus, string> = {
  awaiting_info: 'bg-gray-100 text-gray-700 border-gray-200',
  awaiting_contract: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  awaiting_deposit: 'bg-orange-50 text-orange-700 border-orange-200',
  awaiting_schedule: 'bg-amber-50 text-amber-700 border-amber-200',
  reviewing_schedule: 'bg-violet-50 text-violet-700 border-violet-200',
  awaiting_pricing: 'bg-blue-50 text-blue-700 border-blue-200',
  awaiting_payment: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  awaiting_travel: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  awaiting_review: 'bg-teal-50 text-teal-700 border-teal-200',
  completed: 'bg-gray-50 text-gray-500 border-gray-200',
  canceled: 'bg-rose-50 text-rose-700 border-rose-200',
}

// Whose move it is — drives Action Required queue split + chip context.
export const STATUS_OWNER: Record<CaseStatus, 'agent' | 'admin' | 'customer' | 'none'> = {
  awaiting_info: 'agent',
  awaiting_contract: 'agent',     // agent drives client/admin signing
  awaiting_deposit: 'agent',      // agent collects deposit + info from client
  awaiting_schedule: 'admin',
  reviewing_schedule: 'agent',
  awaiting_pricing: 'admin',
  awaiting_payment: 'agent',      // agent sends balance invoice / admin confirms
  awaiting_travel: 'none',
  awaiting_review: 'agent',       // agent submits review/survey on behalf of client
  completed: 'admin',             // settlement / commission payout
  canceled: 'none',
}

// Cases that haven't paid balance yet — eligible for cancel.
// Note: deposit may already be paid in awaiting_deposit / awaiting_schedule /
// reviewing_schedule / awaiting_pricing / awaiting_payment. Refund policy is
// handled out-of-band (admin manual) per 4/30 SOP "no refunds in principle".
export const CANCELLABLE_STATUSES: CaseStatus[] = [
  'awaiting_info',
  'awaiting_contract',
  'awaiting_deposit',
  'awaiting_schedule',
  'reviewing_schedule',
  'awaiting_pricing',
  'awaiting_payment',
]

// Cases that count as "active in pipeline" (not terminal).
export const ACTIVE_STATUSES: CaseStatus[] = [
  'awaiting_info',
  'awaiting_contract',
  'awaiting_deposit',
  'awaiting_schedule',
  'reviewing_schedule',
  'awaiting_pricing',
  'awaiting_payment',
  'awaiting_travel',
  'awaiting_review',
]

// Statuses where the trip has physically ended (Mark Travel Complete pressed).
// Use this anywhere code currently uses `status === 'completed'` with
// "travel-done" semantics — it must include `awaiting_review` so cases in
// review-pending stage still show up in settlement queues, payouts, etc.
export const TRAVEL_DONE_STATUSES: CaseStatus[] = ['awaiting_review', 'completed']

export function isTravelDone(status: string): boolean {
  return status === 'awaiting_review' || status === 'completed'
}
