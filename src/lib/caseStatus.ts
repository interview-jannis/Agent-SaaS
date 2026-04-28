// Single source of truth for case lifecycle status.
// DB names are forward-looking ("awaiting_X") — match labels 1:1, no translation step.
// Owner column documents whose action moves the case forward.

export type CaseStatus =
  | 'awaiting_info'
  | 'awaiting_schedule'
  | 'reviewing_schedule'
  | 'awaiting_pricing'
  | 'awaiting_payment'
  | 'awaiting_travel'
  | 'completed'
  | 'canceled'

export const ALL_STATUSES: CaseStatus[] = [
  'awaiting_info',
  'awaiting_schedule',
  'reviewing_schedule',
  'awaiting_pricing',
  'awaiting_payment',
  'awaiting_travel',
  'completed',
  'canceled',
]

// Active pipeline order (canceled is terminal/branched, shown separately)
export const PIPELINE_ORDER: CaseStatus[] = [
  'awaiting_info',
  'awaiting_schedule',
  'reviewing_schedule',
  'awaiting_pricing',
  'awaiting_payment',
  'awaiting_travel',
  'completed',
]

export const STATUS_LABELS: Record<CaseStatus, string> = {
  awaiting_info: 'Awaiting Client Info',
  awaiting_schedule: 'Awaiting Schedule',
  reviewing_schedule: 'Reviewing Schedule',
  awaiting_pricing: 'Awaiting Pricing',
  awaiting_payment: 'Awaiting Payment',
  awaiting_travel: 'Awaiting Travel',
  completed: 'Completed',
  canceled: 'Canceled',
}

export const STATUS_STYLES: Record<CaseStatus, string> = {
  awaiting_info: 'bg-gray-100 text-gray-700 border-gray-200',
  awaiting_schedule: 'bg-amber-50 text-amber-700 border-amber-200',
  reviewing_schedule: 'bg-violet-50 text-violet-700 border-violet-200',
  awaiting_pricing: 'bg-blue-50 text-blue-700 border-blue-200',
  awaiting_payment: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  awaiting_travel: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-gray-50 text-gray-500 border-gray-200',
  canceled: 'bg-rose-50 text-rose-700 border-rose-200',
}

// Whose move it is — drives Action Required queue split + chip context.
export const STATUS_OWNER: Record<CaseStatus, 'agent' | 'admin' | 'customer' | 'none'> = {
  awaiting_info: 'agent',
  awaiting_schedule: 'admin',
  reviewing_schedule: 'agent',
  awaiting_pricing: 'admin',
  awaiting_payment: 'agent',  // primary; sub-states (sent/viewed/paid) handled via derived chip
  awaiting_travel: 'none',
  completed: 'admin',         // settlement
  canceled: 'none',
}

// Cases that haven't paid yet — eligible for cancel.
export const CANCELLABLE_STATUSES: CaseStatus[] = [
  'awaiting_info',
  'awaiting_schedule',
  'reviewing_schedule',
  'awaiting_pricing',
  'awaiting_payment',
]

// Cases that count as "active in pipeline" (not terminal).
export const ACTIVE_STATUSES: CaseStatus[] = [
  'awaiting_info',
  'awaiting_schedule',
  'reviewing_schedule',
  'awaiting_pricing',
  'awaiting_payment',
  'awaiting_travel',
]
