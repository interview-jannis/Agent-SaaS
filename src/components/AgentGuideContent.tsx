'use client'

import { useState } from 'react'

// ─── Screenshot URLs ──────────────────────────────────────────────────────────
const SS = 'https://tknucfjnqapriadgiwuv.supabase.co/storage/v1/object/public/guide/screenshots'

// Case-step screenshots (agent perspective)
const CASE_SS: Record<string, string> = {
  awaiting_contract:   `${SS}/case-agent-awaiting_contract.png`,
  awaiting_deposit:    `${SS}/case-agent-awaiting_deposit.png`,
  awaiting_schedule:   `${SS}/case-agent-awaiting_schedule.png`,
  reviewing_schedule:  `${SS}/case-agent-reviewing_schedule.png`,
  awaiting_pricing:    `${SS}/case-agent-awaiting_pricing.png`,
  awaiting_payment:    `${SS}/case-agent-awaiting_payment.png`,
  awaiting_travel:     `${SS}/case-agent-awaiting_travel.png`,
  awaiting_review:     `${SS}/case-agent-awaiting_review.png`,
  awaiting_settlement: `${SS}/case-agent-awaiting_settlement.png`,
  completed:           `${SS}/case-agent-completed.png`,
}
const SCREENSHOTS: Record<string, string> = {
  home:      `${SS}/agent-home.png`,
  cases:     `${SS}/agent-cases.png`,
  clients:   `${SS}/agent-clients.png`,
  payouts:   `${SS}/agent-payouts.png`,
  dashboard: `${SS}/agent-dashboard.png`,
  profile:   `${SS}/agent-profile.png`,
}

// ─── Case pipeline ────────────────────────────────────────────────────────────
const CASE_STEPS = [
  {
    status: 'awaiting_contract',
    label: 'Awaiting Contract',
    isYourMove: true,
    action: 'Send the quote link to your client. Coordinate the 3-party contract signature (client → you → admin).',
  },
  {
    status: 'awaiting_deposit',
    label: 'Awaiting Deposit',
    isYourMove: true,
    action: 'Collect the 50% deposit from your client. Complete all Trip Info and Client Info fields, then forward the deposit to admin.',
  },
  {
    status: 'awaiting_schedule',
    label: 'Awaiting Schedule',
    isYourMove: false,
    action: 'Admin is building the itinerary. No action needed — you\'ll be notified when it\'s ready for review.',
  },
  {
    status: 'reviewing_schedule',
    label: 'Reviewing Schedule',
    isYourMove: true,
    action: 'Review the schedule admin uploaded. Confirm it to proceed, or request a revision with notes.',
  },
  {
    status: 'awaiting_pricing',
    label: 'Awaiting Final Pricing',
    isYourMove: false,
    action: 'Admin is finalizing the balance invoice. No action needed.',
  },
  {
    status: 'awaiting_payment',
    label: 'Awaiting Balance Payment',
    isYourMove: true,
    action: 'Send the final invoice link to your client. Collect the remaining 50% balance and confirm with admin.',
  },
  {
    status: 'awaiting_travel',
    label: 'Awaiting Travel',
    isYourMove: true,
    action: 'Coordinate on-the-ground logistics. Once travel is complete, click "Mark Travel Complete".',
  },
  {
    status: 'awaiting_review',
    label: 'Awaiting Review',
    isYourMove: true,
    action: 'Submit the post-trip survey and review on behalf of your client.',
  },
  {
    status: 'awaiting_settlement',
    label: 'Awaiting Settlement',
    isYourMove: true,
    action: 'Issue your commission invoice to admin. Wait for the payout to be processed.',
  },
  {
    status: 'completed',
    label: 'Completed',
    isYourMove: false,
    action: 'Case is fully closed. Commission has been paid.',
  },
]

const ONBOARDING_STEPS = [
  { label: 'Invite',         desc: 'Admin sends you an invitation email with a sign-up link.' },
  { label: 'Orientation',    desc: 'Read through the onboarding materials and confirm receipt.' },
  { label: 'NDA',            desc: 'Enter your details and sign the Non-Disclosure Agreement.' },
  { label: 'Partnership',    desc: 'Sign the Partnership Agreement (commission terms & conditions).' },
  { label: 'Pending Review', desc: 'Admin reviews and counter-signs both contracts. You\'ll be notified when done.' },
  { label: 'Account Setup',  desc: 'Set your email, password, and bank account for commission payouts.' },
  { label: 'Activated',      desc: 'Your agent dashboard is live. Start creating cases.' },
]

// ─── Agent screen sections ────────────────────────────────────────────────────
const AGENT_SECTIONS = [
  {
    key: 'home',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
    title: 'Home',
    desc: 'Your daily starting point. Surfaces cases that need your immediate action and shows a summary of your activity this month.',
    details: [
      'Action Required — cases where you must act to advance the pipeline',
      'Monthly stats: active cases, completed trips, revenue generated',
      'Quick case creation — select products and build a quote in one flow',
    ],
  },
  {
    key: 'cases',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
      </svg>
    ),
    title: 'Cases',
    desc: 'All cases you manage, organised by pipeline stage. Tap any case to open the detail view.',
    details: [
      'Status tabs separate cases that need your action from cases that are waiting on admin',
      'Case detail: enter client info, send document links, confirm schedules, mark travel complete',
      'Copy quote / invoice / schedule links to send directly to your client',
      'Cancel a case (before balance payment) — log a cancellation reason',
      'Agent Notes — internal memo visible only to admin, not to your client',
    ],
  },
  {
    key: 'clients',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    title: 'Clients',
    desc: 'Your client database. Profiles include travel preferences, medical history, and Muslim-friendly requirements.',
    details: [
      'Create client profiles directly or they are auto-created when you build a case',
      'All required fields must be filled before a case can advance past the deposit stage',
      'Passport, emergency contact, medical history, dietary restrictions, Muslim-friendly preferences',
      'A single client can be linked to multiple cases (returning clients)',
    ],
  },
  {
    key: 'payouts',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    title: 'Payouts',
    desc: 'Your commission payment history. View payout records for each completed case.',
    details: [
      'Settlement number, case number, KRW amount, and payment date',
      'Commission rate is calculated automatically based on your monthly completed patient count',
      'Rate tiers: 15% (0–10 patients) · 20% (11–30) · 25% (31+)',
      'Resets monthly — counted per patient, not per case (group of 4 = 4 patients)',
    ],
  },
  {
    key: 'dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: 'Dashboard',
    desc: 'Your performance overview. Charts show case volume, revenue trends, and client growth over time.',
    details: [
      'Monthly completed cases vs. active pipeline',
      'Revenue generated by period',
      'Patient count tracking (affects your commission tier)',
    ],
  },
  {
    key: 'profile',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    title: 'Profile',
    desc: 'Your account settings. Update personal details, bank account information, and your password.',
    details: [
      'Name, phone, country (email changes require admin support)',
      'Bank account — where your commission payouts are sent',
      'Change password',
    ],
  },
]

// ─── Section card with screenshot ────────────────────────────────────────────
function SectionCard({ icon, title, desc, details, screenshot }: {
  icon: React.ReactNode; title: string; desc: string; details: string[]; screenshot?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left flex items-start gap-3 px-4 py-4 hover:bg-gray-50 transition-colors"
      >
        <span className="w-8 h-8 rounded-lg bg-[#0f4c35]/8 flex items-center justify-center text-[#0f4c35] shrink-0 mt-0.5">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
        </div>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100 bg-gray-50">
          <ul className="mt-3 space-y-1.5">
            {details.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0f4c35]/40 mt-1.5 shrink-0" />
                {d}
              </li>
            ))}
          </ul>
          {screenshot && (
            <div className="mt-4 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                <span className="flex-1 mx-2 h-4 rounded bg-white border border-gray-200 text-[9px] text-gray-400 flex items-center px-2">tiktak</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={screenshot} alt={`${title} screen`} className="w-full block" loading="lazy" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Case pipeline component ──────────────────────────────────────────────────
function CasePipeline() {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">How Cases Work</h3>
      <p className="text-sm text-gray-500 mb-4">
        Every case follows a 9-stage pipeline from contract to settlement.
        Stages marked <span className="font-semibold text-[#0f4c35]">Your Turn</span> require your action before the case can advance.
      </p>
      <div className="space-y-2">
        {CASE_STEPS.map((step, i) => {
          const isOpen = expanded === step.status
          return (
            <div key={step.status}>
              <button
                onClick={() => setExpanded(isOpen ? null : step.status)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  isOpen
                    ? 'bg-gray-50 border-gray-200 border'
                    : step.isYourMove
                    ? 'bg-[#0f4c35]/5 border border-[#0f4c35]/20 hover:border-[#0f4c35]/40'
                    : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  step.isYourMove ? 'bg-[#0f4c35] text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-700">{step.label}</span>
                {step.isYourMove
                  ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#0f4c35] text-white">Your Turn</span>
                  : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Admin</span>
                }
                <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="mx-1 px-4 py-3 rounded-b-xl border border-t-0 border-gray-200 bg-gray-50">
                  <p className="text-sm text-gray-700 leading-relaxed">{step.action}</p>
                  {CASE_SS[step.status] && (
                    <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                        <span className="flex-1 mx-2 h-4 rounded bg-white border border-gray-200 text-[9px] text-gray-400 flex items-center px-2">tiktak</span>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={CASE_SS[step.status]} alt={`${step.label} screen`} className="w-full block" loading="lazy" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-xs text-gray-400">Cases can be cancelled before balance payment (stages 1–6). Final states: Completed, Cancelled.</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AgentGuideContent() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Agent Guide</h1>
          <p className="text-sm text-gray-500 mt-1">
            A walkthrough of your screens and how the case pipeline works.
          </p>
        </div>

        <div className="space-y-10">

          {/* ── Role ── */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0f4c35]">Your Role</span>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
              Agents are the client-facing backbone of Tiktak. You source clients, build quotes, collect payments, and coordinate with the admin team to deliver the full medical tourism experience. After travel is complete, you submit the post-trip survey and invoice your commission. Your earnings are calculated automatically based on your monthly completed patient count.
            </p>
          </div>

          {/* ── Onboarding ── */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Getting Started</h3>
            {/* Desktop stepper */}
            <div className="hidden sm:flex overflow-x-auto pb-2">
              {ONBOARDING_STEPS.map((step, i) => (
                <div key={step.label} className="flex flex-col items-center flex-1 min-w-[100px]">
                  <div className="relative w-full flex items-center justify-center h-8">
                    {i > 0 && <div className="absolute left-0 right-1/2 top-1/2 h-px bg-gray-200" />}
                    {i < ONBOARDING_STEPS.length - 1 && <div className="absolute left-1/2 right-0 top-1/2 h-px bg-gray-200" />}
                    <div className="w-7 h-7 rounded-full bg-[#0f4c35] text-white text-xs font-bold flex items-center justify-center z-10 relative shrink-0">
                      {i + 1}
                    </div>
                  </div>
                  <div className="text-center px-2 mt-1.5 pb-3">
                    <p className="text-xs font-semibold text-gray-800">{step.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Mobile list */}
            <div className="sm:hidden space-y-2">
              {ONBOARDING_STEPS.map((step, i) => (
                <div key={step.label} className="flex gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-[#0f4c35] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{step.label}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Screens ── */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Your Screens</h3>
            <div className="space-y-2">
              {AGENT_SECTIONS.map(s => (
                <SectionCard
                  key={s.key}
                  icon={s.icon}
                  title={s.title}
                  desc={s.desc}
                  details={s.details}
                  screenshot={SCREENSHOTS[s.key]}
                />
              ))}
            </div>
          </div>

          {/* ── Case pipeline ── */}
          <div className="border-t border-gray-100 pt-8">
            <CasePipeline />
          </div>

        </div>
      </div>
    </div>
  )
}
