'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
export type GuideEdits = {
  screenshots: Record<string, string[]>
  descs: Record<string, string>
  actions: Record<string, string>
}

// ─── Screenshot defaults ──────────────────────────────────────────────────────
const SS = 'https://tknucfjnqapriadgiwuv.supabase.co/storage/v1/object/public/guide/screenshots'

const DEFAULT_CASE_SS: Record<string, string> = {
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
const DEFAULT_SS: Record<string, string> = {
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
    action: 'Send your client the quotation link from the case page. The quote is a permanent snapshot — the products and estimated prices your client sees are fixed at the moment you created the case. Even if products change later, the original quote stays as-is.\n\nAt the same time, coordinate the 3-party contract: your client signs first, then you, then admin counter-signs. All three signatures are required before moving on.',
  },
  {
    status: 'awaiting_deposit',
    label: 'Awaiting Deposit',
    isYourMove: true,
    action: 'Collect 50% of the total as a deposit from your client and forward it to admin.\n\nWhile waiting, fill in all Trip Info (flights, accommodation, travel dates) and Client Info (passport, medical details, dietary needs) on the case page. Incomplete fields will block the case from moving to the schedule stage — so the more you fill in now, the smoother the process.\n\nIf the product selection needs any changes, raise it with admin now. Once the schedule stage starts, product changes become much harder.',
  },
  {
    status: 'awaiting_schedule',
    label: 'Awaiting Schedule',
    isYourMove: false,
    action: 'Admin is reviewing the product selection and building the day-by-day itinerary. Nothing required from you right now — you\'ll get a notification as soon as the schedule is ready for your review.\n\nIf you recall a product change the client requested, message admin now while there\'s still time.',
  },
  {
    status: 'reviewing_schedule',
    label: 'Reviewing Schedule',
    isYourMove: true,
    action: 'Review the schedule admin has prepared. Check that the dates, service names, clinics, and timing all match what your client is expecting.\n\nIf anything needs to change, click "Request Revision" and leave a clear, specific note for admin (e.g. "Move the facial treatment to Day 2 afternoon — client has a doctor appointment on Day 1"). Admin will revise and re-send for another round of review.\n\nWhen everything looks good, click "Confirm". This permanently locks the schedule — no further edits are possible after this point, so make sure your client is aligned before you confirm.',
  },
  {
    status: 'awaiting_pricing',
    label: 'Awaiting Final Pricing',
    isYourMove: false,
    action: 'Admin is setting the final prices for the balance invoice. No action needed from you.\n\nNote: at this stage, the product list is locked. If you realise something needs to be added or removed, contact admin — they would need to revert the schedule to make structural changes, which takes extra time. Try to catch these issues during the schedule review.',
  },
  {
    status: 'awaiting_payment',
    label: 'Awaiting Balance Payment',
    isYourMove: true,
    action: 'Send your client the final invoice link. You can copy it from the case page using the "Send" button next to the invoice.\n\nOnce your client pays the remaining 50%, notify admin so they can confirm receipt on their end. The case won\'t advance until admin confirms the payment.',
  },
  {
    status: 'awaiting_travel',
    label: 'Awaiting Travel',
    isYourMove: true,
    action: 'The payment is confirmed and the trip is on. Share the schedule link with your client so they have their itinerary on hand.\n\nCoordinate any on-the-ground logistics — transfers, clinic check-in times, hotel arrangements. Once the trip is fully complete, come back to the case and click "Mark Travel Complete". The timestamp is recorded and used as the basis for your commission.',
  },
  {
    status: 'awaiting_review',
    label: 'Awaiting Review',
    isYourMove: true,
    action: 'Collect feedback from your client and submit the post-trip survey on their behalf. Ask them how the trip went, whether the services met their expectations, and if there\'s anything to improve.\n\nOnce you submit the review, the case unlocks the commission invoice step. The sooner you submit, the sooner your payout can be processed.',
  },
  {
    status: 'awaiting_settlement',
    label: 'Awaiting Settlement',
    isYourMove: true,
    action: 'Issue your commission invoice to admin using the "Issue Commission Invoice" button on the case page. Your commission rate (15–25%) is automatically applied based on your completed patient count for the month.\n\nOnce admin processes the payout and clicks "Mark Paid", a settlement record is created automatically and the case moves to Completed. You can view all your payouts under the Payouts tab.',
  },
  {
    status: 'completed',
    label: 'Completed',
    isYourMove: false,
    action: 'The case is fully closed — contract signed, trip completed, review submitted, commission paid. All documents and records remain accessible on the case page for future reference.\n\nCheck your Payouts tab to confirm the settlement entry is recorded correctly.',
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
    desc: 'A client-facing presentation page you can use during initial consultations. Shows TikkTakk\'s service offering and the full journey from first contact to completion.',
    details: [
      '"Why TikkTakk" — VIP concierge service, Muslim-friendly by default, all-in-one programme, vetted partners with transparent pricing',
      '"How It Works" — 6-step journey overview for clients: Choose Program → Receive Quotation → Sign & Confirm → Secure Booking → Get Schedule → Experience Korea',
      'Useful to walk a new client through what to expect before building their quote',
      'Notification bell (top right) — real-time alerts when admin uploads a schedule, confirms a payment, or takes any action on your cases',
    ],
  },
  {
    key: 'product',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
      </svg>
    ),
    title: 'Product',
    desc: 'The quote-building workspace. Browse the full product catalogue, configure client groups, and generate a quotation in one flow.',
    details: [
      'Top bar — set Trip Name, select Client, and travel dates (required before creating a quote)',
      'Category pills — filter by K-Medical, K-Beauty, K-Wellness, K-Education, K-Starcation, or Subpackage',
      'Muslim Friendly filter — narrow by prayer room, female medical staff, and dietary grade (Halal Certified / Friendly / etc.)',
      'Groups — each group represents a set of clients who share the same services. "Shared Activities" auto-applies to all members across every group',
      'Add Group — for trips with multiple clients needing different services (e.g. Group 1: procedures, Group 2: wellness only)',
      'Member count per group (±) determines how the price multiplies for that group\'s items',
      'Trip Services — Subpackage items (hotel, interpreter, car, concierge) are priced per day/night, not per person. Hotel nights auto-sync to travel dates',
      'Product detail modal — view images, description, Muslim-friendly tags, and choose a specific variant (e.g. session count, room type)',
      'Create Quote — takes you to the review page to confirm all line items and prices before saving. Cart is preserved in localStorage if you navigate away',
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
      'Building a quote: select services per group (Shared group = activities all members share; individual groups = services per person). The Quotation is a permanent, uneditable snapshot once created — your client sees exactly what was agreed',
      'Trip Name — the case label shown on the schedule cover. Set this when creating the case',
      'Schedule: once you confirm the itinerary, it is locked and cannot be changed. If revisions are needed, use "Request Revision" before confirming',
      'Commission invoice: after travel is complete and the review is submitted, issue your commission invoice to admin. When admin marks it paid, a settlement record is automatically created and the case moves to Completed',
      'Cancel a case (before balance payment) — you must type the trip name exactly to confirm cancellation. This action cannot be undone',
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
    desc: 'Your client database. Each profile stores everything needed to plan a personalised medical tourism trip.',
    details: [
      'Profiles are created when you build a new case, or can be added here in advance for returning clients',
      'Completeness indicator — a yellow warning shows which required fields are still missing. All must be filled before the case can advance past the deposit stage',
      'Basic info: passport number, nationality, date of birth, emergency contact, blood type',
      'Medical info: allergies, current medications, health conditions, height/weight, prior aesthetic procedures',
      'Muslim-friendly settings: dietary restriction grade (halal certified / halal friendly / etc.), prayer frequency and location preference, same-gender doctor/therapist request, mixed-gender activity comfort level',
      'Lifestyle: pregnancy status, smoking and alcohol habits — important for pre-procedure screening',
      'One client can appear across multiple cases — useful for returning clients or family groups',
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

// ─── Edit UI components ───────────────────────────────────────────────────────
function MultiImageField({ label, values, onChange, uploadKey }: {
  label: string; values: string[]; onChange: (urls: string[]) => void; uploadKey: string
}) {
  const [uploading, setUploading] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `screenshots/guide-${uploadKey}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('guide').upload(path, file, {
      upsert: true, contentType: file.type,
    })
    if (error) {
      alert('Upload failed: ' + error.message)
    } else {
      const { data } = supabase.storage.from('guide').getPublicUrl(path)
      onChange([...values, data.publicUrl])
    }
    setUploading(false)
  }

  function remove(i: number) {
    onChange(values.filter((_, idx) => idx !== i))
  }

  function updateUrl(i: number, url: string) {
    const next = [...values]; next[i] = url; onChange(next)
  }

  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      {values.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {values.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-4 text-right shrink-0">{i + 1}</span>
              <input
                type="url"
                value={url}
                onChange={e => updateUrl(i, e.target.value)}
                className="flex-1 min-w-0 text-xs font-mono border border-[#0f4c35]/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#0f4c35]/40 bg-white text-gray-800"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-rose-200 text-rose-400 hover:bg-rose-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#0f4c35] hover:bg-[#0f4c35]/90 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
      >
        {uploading ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        )}
        {uploading ? 'Uploading…' : 'Add Image'}
      </button>
      <input
        ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { upload(f); e.target.value = '' } }}
      />
    </div>
  )
}

function EditTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <textarea
        rows={3}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full text-xs border border-[#0f4c35]/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#0f4c35]/40 bg-white text-gray-800 resize-y leading-relaxed"
      />
    </div>
  )
}

// ─── Browser frame (hides itself on 404) ─────────────────────────────────────
function BrowserFrame({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <span className="flex-1 mx-2 h-4 rounded bg-white border border-gray-200 text-[9px] text-gray-400 flex items-center px-2">tikktakk</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full block" loading="lazy" onError={() => setFailed(true)} />
    </div>
  )
}

function ImageGallery({ urls, alt }: { urls: string[]; alt: string }) {
  if (urls.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      {urls.map((url, i) => (
        <div key={i}>
          {urls.length > 1 && (
            <p className="text-[10px] text-gray-400 mb-1">Image {i + 1}</p>
          )}
          <BrowserFrame src={url} alt={`${alt} ${i + 1}`} />
        </div>
      ))}
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ icon, title, desc, details, screenshots, editMode, uploadKey, onChangeScreenshots, onChangeDesc }: {
  icon: React.ReactNode; title: string; desc: string; details: string[]; screenshots?: string[]
  editMode?: boolean; uploadKey?: string
  onChangeScreenshots?: (v: string[]) => void
  onChangeDesc?: (v: string) => void
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
          {!editMode && screenshots && screenshots.length > 0 && (
            <ImageGallery urls={screenshots} alt={`${title} screen`} />
          )}
          {editMode && uploadKey && onChangeScreenshots && onChangeDesc && (
            <div className="mt-4 p-3 rounded-lg border border-[#0f4c35]/15 bg-[#0f4c35]/3">
              <EditTextarea label="Description text" value={desc} onChange={onChangeDesc} />
              <MultiImageField
                label="Screenshots"
                values={screenshots ?? []}
                onChange={onChangeScreenshots}
                uploadKey={uploadKey}
              />
              {screenshots && screenshots.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] text-gray-400 mb-1">Preview</p>
                  <ImageGallery urls={screenshots} alt={`${title} screen`} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Case pipeline ────────────────────────────────────────────────────────────
function CasePipeline({ edits, editMode, onEdit }: {
  edits: GuideEdits
  editMode?: boolean
  onEdit?: (type: keyof GuideEdits, key: string, value: string | string[]) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  function getScreenshots(status: string): string[] {
    const saved = edits.screenshots[`case_agent_${status}`]
    if (saved && saved.length > 0) return saved
    const def = DEFAULT_CASE_SS[status]
    return def ? [def] : []
  }
  function getAction(status: string, defaultAction: string): string {
    return edits.actions[`agent_${status}`] || defaultAction
  }

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
          const screenshots = getScreenshots(step.status)
          const actionText = getAction(step.status, step.action)
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
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${step.isYourMove ? 'bg-[#0f4c35] text-white' : 'bg-gray-200 text-gray-500'}`}>
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
                  <div className="space-y-2">
                    {actionText.split('\n\n').map((para, pi) => (
                      <p key={pi} className="text-sm text-gray-700 leading-relaxed">{para}</p>
                    ))}
                  </div>
                  {!editMode && screenshots.length > 0 && (
                    <ImageGallery urls={screenshots} alt={`${step.label} screen`} />
                  )}
                  {editMode && onEdit && (
                    <div className="mt-3 p-3 rounded-lg border border-[#0f4c35]/15 bg-[#0f4c35]/3 space-y-1">
                      <EditTextarea
                        label="Agent action text"
                        value={actionText}
                        onChange={v => onEdit('actions', `agent_${step.status}`, v)}
                      />
                      <MultiImageField
                        label="Agent screenshots"
                        values={screenshots}
                        onChange={v => onEdit('screenshots', `case_agent_${step.status}`, v)}
                        uploadKey={`case-agent-${step.status}`}
                      />
                      {screenshots.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] text-gray-400 mb-1">Preview</p>
                          <ImageGallery urls={screenshots} alt={`${step.label} screen`} />
                        </div>
                      )}
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

// ─── Content (shared between embedded and standalone) ─────────────────────────
function AgentGuideContentInner({ edits, editMode, onEdit }: {
  edits: GuideEdits
  editMode?: boolean
  onEdit?: (type: keyof GuideEdits, key: string, value: string | string[]) => void
}) {
  function getSS(key: string): string[] {
    const saved = edits.screenshots[`agent_${key}`]
    if (saved && saved.length > 0) return saved
    const def = DEFAULT_SS[key]
    return def ? [def] : []
  }
  function getDesc(key: string, base: string): string {
    return edits.descs[`agent_${key}`] || base
  }

  return (
    <div className="space-y-10">

      {/* ── Role ── */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-[#0f4c35]">Your Role</span>
        <p className="mt-1 text-sm text-gray-600 leading-relaxed">
          Agents are the client-facing backbone of TikkTakk. You source clients, build quotes, collect payments, and coordinate with the admin team to deliver the full medical tourism experience. After travel is complete, you submit the post-trip survey and invoice your commission. Your earnings are calculated automatically based on your monthly completed patient count.
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
              desc={getDesc(s.key, s.desc)}
              details={s.details}
              screenshots={getSS(s.key)}
              editMode={editMode}
              uploadKey={`agent_${s.key}`}
              onChangeScreenshots={onEdit ? v => onEdit('screenshots', `agent_${s.key}`, v) : undefined}
              onChangeDesc={onEdit ? v => onEdit('descs', `agent_${s.key}`, v as string) : undefined}
            />
          ))}
        </div>
      </div>

      {/* ── Case pipeline ── */}
      <div className="border-t border-gray-100 pt-8">
        <CasePipeline edits={edits} editMode={editMode} onEdit={onEdit} />
      </div>

    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AgentGuideContent({
  editMode,
  edits,
  onEdit,
  embedded,
}: {
  editMode?: boolean
  edits?: GuideEdits
  onEdit?: (type: keyof GuideEdits, key: string, value: string | string[]) => void
  embedded?: boolean
} = {}) {
  const [overrides, setOverrides] = useState<GuideEdits>({ screenshots: {}, descs: {}, actions: {} })

  useEffect(() => {
    // Only fetch from DB when standalone (not receiving edits from parent)
    if (!edits) {
      supabase.from('system_settings').select('value').eq('key', 'guide_content').maybeSingle()
        .then(({ data }) => {
          if (data?.value) {
            const v = data.value as Partial<{
              screenshots: Record<string, string | string[]>
              descs: Record<string, string>
              actions: Record<string, string>
            }>
            // migrate: old data stored single strings, now arrays
            const screenshots: Record<string, string[]> = {}
            for (const [k, val] of Object.entries(v.screenshots ?? {})) {
              screenshots[k] = Array.isArray(val) ? val : [val]
            }
            setOverrides({ screenshots, descs: v.descs ?? {}, actions: v.actions ?? {} })
          }
        })
    }
  }, [edits])

  const effectiveEdits = edits ?? overrides

  // Embedded mode: just render content (GuideContent handles layout/header)
  if (embedded) {
    return (
      <AgentGuideContentInner
        edits={effectiveEdits}
        editMode={editMode}
        onEdit={onEdit}
      />
    )
  }

  // Standalone mode: full page layout for agents
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Agent Guide</h1>
          <p className="text-sm text-gray-500 mt-1">
            A walkthrough of your screens and how the case pipeline works.
          </p>
        </div>
        <AgentGuideContentInner edits={effectiveEdits} />
      </div>
    </div>
  )
}
