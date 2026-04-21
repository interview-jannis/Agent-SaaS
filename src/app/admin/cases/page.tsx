'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type CaseStatus = 'payment_pending' | 'payment_completed' | 'schedule_reviewed' | 'schedule_confirmed' | 'travel_completed'

type CaseMember = {
  id: string
  is_lead: boolean
  clients: {
    id: string
    client_number: string
    name: string
    nationality: string
    gender: string
    date_of_birth: string | null
    phone: string | null
    email: string | null
    dietary_restriction: string
    needs_muslim_friendly: boolean
    special_requests: string | null
  }
}

type QuoteItem = {
  id: string
  base_price: number
  final_price: number
  products: { id: string; name: string; description: string | null } | null
}

type QuoteGroup = {
  id: string
  name: string
  order: number
  member_count: number
  quote_items: QuoteItem[]
  quote_group_members: { id: string }[]
}

type Quote = {
  id: string
  quote_number: string
  slug: string
  total_price: number
  payment_due_date: string | null
  agent_margin_rate: number
  company_margin_rate: number
  quote_groups: QuoteGroup[]
}

type Schedule = {
  id: string
  slug: string
  pdf_url: string | null
  status: string
  version: number
}

type Agent = { id: string; agent_number: string; name: string }

type Case = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  travel_end_date: string | null
  payment_date: string | null
  payment_confirmed_at: string | null
  created_at: string
  agents: Agent | Agent[] | null
  case_members: CaseMember[]
  quotes: Quote[]
  schedules: Schedule[]
}

function getAgent(c: { agents: Agent | Agent[] | null } | null | undefined): Agent | null {
  const a = c?.agents
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<CaseStatus, string> = {
  payment_pending: 'Awaiting Payment',
  payment_completed: 'Payment Confirmed',
  schedule_reviewed: 'Schedule Reviewed',
  schedule_confirmed: 'Schedule Confirmed',
  travel_completed: 'Travel Completed',
}

const STATUS_STYLES: Record<CaseStatus, string> = {
  payment_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  payment_completed: 'bg-blue-50 text-blue-700 border-blue-200',
  schedule_reviewed: 'bg-violet-50 text-violet-700 border-violet-200',
  schedule_confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  travel_completed: 'bg-gray-50 text-gray-500 border-gray-200',
}

const ALL_STATUSES: CaseStatus[] = [
  'payment_pending', 'payment_completed', 'schedule_reviewed', 'schedule_confirmed', 'travel_completed',
]

function fmtKRW(n: number) { return '₩' + n.toLocaleString('ko-KR') }
function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminCasesPage() {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCase, setSelectedCase] = useState<Case | null>(null)
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'all'>('all')
  const [exchangeRate, setExchangeRate] = useState(1350)

  // Action states
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [paymentDate, setPaymentDate] = useState('')
  const [uploadingSchedule, setUploadingSchedule] = useState(false)
  const [markingComplete, setMarkingComplete] = useState(false)
  const [actionError, setActionError] = useState('')

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchCases = useCallback(async () => {
    const { data, error } = await supabase
      .from('cases')
      .select(`
        id, case_number, status, travel_start_date, travel_end_date,
        payment_date, payment_confirmed_at, created_at,
        agents!cases_agent_id_fkey(id, agent_number, name),
        case_members(
          id, is_lead,
          clients(id, client_number, name, nationality, gender, date_of_birth, phone, email, dietary_restriction, needs_muslim_friendly, special_requests)
        ),
        quotes(
          id, quote_number, slug, total_price, payment_due_date, agent_margin_rate, company_margin_rate,
          quote_groups(id, name, order, member_count, quote_items(id, base_price, final_price, products(id, name, description)), quote_group_members(id))
        ),
        schedules(id, slug, pdf_url, status, version)
      `)
      .order('created_at', { ascending: false })

    if (error) console.error('[cases] fetch error:', error)
    const fetched = (data as unknown as Case[]) ?? []
    setCases(fetched)
    setSelectedCase((prev) => {
      if (!prev) return null
      return fetched.find((c) => c.id === prev.id) ?? null
    })
  }, [])

  useEffect(() => {
    async function init() {
      const [, rateRes] = await Promise.all([
        fetchCases(),
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
      ])
      const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (r) setExchangeRate(r)
      setLoading(false)
    }
    init()
  }, [fetchCases])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function confirmPayment() {
    if (!selectedCase) return
    setConfirmingPayment(true); setActionError('')
    try {
      const { error } = await supabase.from('cases').update({
        status: 'payment_completed',
        payment_date: paymentDate || null,
        payment_confirmed_at: new Date().toISOString(),
      }).eq('id', selectedCase.id)
      if (error) throw error
      await fetchCases()
      setPaymentDate('')
    } catch (e: unknown) { setActionError((e as { message?: string })?.message ?? 'Failed.') }
    finally { setConfirmingPayment(false) }
  }

  async function uploadSchedule(file: File) {
    if (!selectedCase) return
    setUploadingSchedule(true); setActionError('')
    try {
      const path = `schedules/${selectedCase.id}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage.from('schedules').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('schedules').getPublicUrl(path)
      const pdfUrl = urlData.publicUrl
      const existingSchedule = selectedCase.schedules?.[0]
      const slug = existingSchedule?.slug ?? crypto.randomUUID()
      const version = (existingSchedule?.version ?? 0) + 1
      if (existingSchedule) {
        await supabase.from('schedules').update({ pdf_url: pdfUrl, version, status: 'reviewed' }).eq('id', existingSchedule.id)
      } else {
        await supabase.from('schedules').insert({ case_id: selectedCase.id, quote_id: selectedCase.quotes?.[0]?.id ?? null, slug, pdf_url: pdfUrl, status: 'reviewed', version })
      }
      await supabase.from('cases').update({ status: 'schedule_reviewed' }).eq('id', selectedCase.id)
      await fetchCases()
    } catch (e: unknown) { setActionError((e as { message?: string })?.message ?? 'Failed.') }
    finally { setUploadingSchedule(false) }
  }

  async function markTravelComplete() {
    if (!selectedCase) return
    setMarkingComplete(true); setActionError('')
    try {
      const { error } = await supabase.from('cases').update({ status: 'travel_completed' }).eq('id', selectedCase.id)
      if (error) throw error
      await fetchCases()
    } catch (e: unknown) { setActionError((e as { message?: string })?.message ?? 'Failed.') }
    finally { setMarkingComplete(false) }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredCases = statusFilter === 'all' ? cases : cases.filter((c) => c.status === statusFilter)

  function openCase(c: Case) { setSelectedCase(c); setActionError(''); setPaymentDate('') }

  const lead = selectedCase?.case_members?.find((m) => m.is_lead)
  const companions = selectedCase?.case_members?.filter((m) => !m.is_lead) ?? []
  const latestQuote = selectedCase?.quotes?.[0] ?? null
  const latestSchedule = selectedCase?.schedules?.[0] ?? null
  const sortedGroups = latestQuote?.quote_groups
    ? [...latestQuote.quote_groups].sort((a, b) => a.order - b.order)
    : []
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  // ── Render ─────────────────────────────────────────────────────────────────

  // ── Detail view (50/50 split) ──────────────────────────────────────────────
  if (selectedCase) {
    return (
      <div className="flex flex-col h-full overflow-hidden">

        {/* Header bar */}
        <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-gray-100 bg-white">
          <button onClick={() => setSelectedCase(null)}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Cases
          </button>
          <span className="text-gray-200">/</span>
          <span className="text-sm font-medium text-gray-900">{selectedCase.case_number}</span>
          <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full border ${STATUS_STYLES[selectedCase.status]}`}>
            {STATUS_LABELS[selectedCase.status]}
          </span>
        </div>

        {/* 50/50 split */}
        <div className="flex-1 overflow-hidden flex">

          {/* LEFT — Case Info + Actions */}
          <div className="w-1/2 overflow-y-auto border-r border-gray-100 px-6 py-6 space-y-5">

            {/* Agent */}
            <section className="bg-gray-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Agent</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-400">{getAgent(selectedCase)?.agent_number}</span>
                <span className="text-sm font-medium text-gray-900">{getAgent(selectedCase)?.name ?? '—'}</span>
              </div>
            </section>

            {/* Travel Period */}
            <section className="bg-gray-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Travel Period</p>
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Start</p>
                  <p className="text-gray-800 font-medium">{selectedCase.travel_start_date ?? '—'}</p>
                </div>
                <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">End</p>
                  <p className="text-gray-800 font-medium">{selectedCase.travel_end_date ?? '—'}</p>
                </div>
                <p className="text-xs text-gray-400 ml-auto">Created: {selectedCase.created_at.slice(0, 10)}</p>
              </div>
            </section>

            {/* Lead Client */}
            {lead && (
              <section className="bg-gray-50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Lead Client</p>
                  <span className="text-[10px] text-gray-400 font-mono">{lead.clients?.client_number}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><p className="text-[10px] text-gray-400 mb-0.5">Name</p><p className="text-gray-800 font-medium">{lead.clients.name}</p></div>
                  <div><p className="text-[10px] text-gray-400 mb-0.5">Nationality</p><p className="text-gray-800">{lead.clients.nationality || '—'}</p></div>
                  <div><p className="text-[10px] text-gray-400 mb-0.5">Gender</p><p className="text-gray-800 capitalize">{lead.clients.gender || '—'}</p></div>
                  <div><p className="text-[10px] text-gray-400 mb-0.5">Date of Birth</p><p className="text-gray-800">{lead.clients.date_of_birth || '—'}</p></div>
                  <div><p className="text-[10px] text-gray-400 mb-0.5">Phone</p><p className="text-gray-800">{lead.clients.phone || '—'}</p></div>
                  <div><p className="text-[10px] text-gray-400 mb-0.5">Email</p><p className="text-gray-800 break-all">{lead.clients.email || '—'}</p></div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-400 mb-0.5">Dietary Restriction</p>
                    <p className="text-gray-800 capitalize">{lead.clients.dietary_restriction?.replace(/_/g, ' ') || '—'}</p>
                  </div>
                  {lead.clients.needs_muslim_friendly && (
                    <div className="col-span-2"><span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">Muslim Friendly</span></div>
                  )}
                  {lead.clients.special_requests && (
                    <div className="col-span-2"><p className="text-[10px] text-gray-400 mb-0.5">Special Requests</p><p className="text-gray-800 text-sm">{lead.clients.special_requests}</p></div>
                  )}
                </div>
              </section>
            )}

            {/* Companions */}
            {companions.length > 0 && (
              <section className="bg-gray-50 rounded-2xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Companions ({companions.length})</p>
                <div className="space-y-2">
                  {companions.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-1.5 px-3 bg-white rounded-xl border border-gray-100">
                      <span className="text-[10px] font-mono text-gray-400">{m.clients.client_number}</span>
                      <span className="text-sm text-gray-800">{m.clients.name}</span>
                      {m.clients.nationality && <span className="text-xs text-gray-400">{m.clients.nationality}</span>}
                      {m.clients.needs_muslim_friendly && <span className="text-xs text-emerald-600 ml-auto">Muslim Friendly</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Quote / Financials */}
            {latestQuote && (
              <section className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Financials</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-gray-400">{latestQuote.quote_number}</span>
                    <a href={`${baseUrl}/quote/${latestQuote.slug}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-[#0f4c35] transition-colors">View ↗</a>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-[10px] text-gray-400 mb-0.5">Total (KRW)</p><p className="font-semibold text-gray-900">{fmtKRW(latestQuote.total_price)}</p></div>
                  <div><p className="text-[10px] text-gray-400 mb-0.5">Total (USD)</p><p className="font-semibold text-gray-900">{fmtUSD(latestQuote.total_price / exchangeRate)}</p></div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Payment Due</p>
                    <p className={`font-medium text-sm ${selectedCase.status === 'payment_pending' && latestQuote.payment_due_date && new Date(latestQuote.payment_due_date) < new Date() ? 'text-red-500' : 'text-gray-800'}`}>
                      {latestQuote.payment_due_date ?? '—'}
                    </p>
                  </div>
                  <div><p className="text-[10px] text-gray-400 mb-0.5">Margins</p><p className="text-gray-700 text-xs">Co. {(latestQuote.company_margin_rate * 100).toFixed(0)}% / Agent {(latestQuote.agent_margin_rate * 100).toFixed(0)}%</p></div>
                </div>
                {selectedCase.payment_date && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400 mb-0.5">Payment Received</p>
                    <p className="text-sm font-medium text-gray-800">{selectedCase.payment_date}</p>
                  </div>
                )}
              </section>
            )}

            {/* Schedule */}
            {latestSchedule && (
              <section className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Schedule</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-400">v{latestSchedule.version}</span>
                    <a href={`${baseUrl}/schedule/${latestSchedule.slug}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#0f4c35] font-medium hover:underline">View ↗</a>
                  </div>
                </div>
                {latestSchedule.pdf_url && (
                  <a href={latestSchedule.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#0f4c35]">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    Download PDF
                  </a>
                )}
              </section>
            )}

            {/* Admin Actions */}
            {actionError && <p className="text-xs text-red-500 px-1">{actionError}</p>}

            {selectedCase.status === 'payment_pending' && (
              <section className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Confirm Payment</p>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Payment Date (optional)</label>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35] bg-white" />
                </div>
                <button onClick={confirmPayment} disabled={confirmingPayment}
                  className="w-full py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                  {confirmingPayment ? 'Confirming...' : 'Confirm Payment'}
                </button>
              </section>
            )}

            {(selectedCase.status === 'payment_completed' || selectedCase.status === 'schedule_reviewed') && (
              <section className={`border rounded-2xl p-4 space-y-3 ${selectedCase.status === 'payment_completed' ? 'border-blue-200 bg-blue-50' : 'border-violet-200 bg-violet-50'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${selectedCase.status === 'payment_completed' ? 'text-blue-700' : 'text-violet-700'}`}>
                  {selectedCase.status === 'payment_completed' ? 'Upload Schedule' : 'Update Schedule'}
                </p>
                {selectedCase.status === 'payment_completed' && <p className="text-xs text-blue-600">Upload a PDF schedule for the agent and client to review.</p>}
                <label className={`flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium rounded-xl border-2 border-dashed transition-colors cursor-pointer ${uploadingSchedule ? 'opacity-40 cursor-not-allowed' : selectedCase.status === 'payment_completed' ? 'border-blue-300 text-blue-700 hover:bg-blue-100' : 'border-violet-300 text-violet-700 hover:bg-violet-100'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                  {uploadingSchedule ? 'Uploading...' : 'Choose PDF'}
                  <input type="file" accept="application/pdf" disabled={uploadingSchedule} className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSchedule(f) }} />
                </label>
              </section>
            )}

            {selectedCase.status === 'schedule_confirmed' && (
              <section className="border border-emerald-200 bg-emerald-50 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Mark Travel Complete</p>
                <p className="text-xs text-emerald-600">Client has confirmed the schedule. Mark complete after the trip.</p>
                <button onClick={markTravelComplete} disabled={markingComplete}
                  className="w-full py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                  {markingComplete ? 'Updating...' : 'Mark Travel Complete'}
                </button>
              </section>
            )}

          </div>

          {/* RIGHT — Selected Products */}
          <div className="w-1/2 overflow-y-auto bg-gray-50/50 px-6 py-6">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Selected Products</p>

            {sortedGroups.length === 0 ? (
              <p className="text-sm text-gray-300">No products selected.</p>
            ) : (
              <div className="space-y-6">
                {sortedGroups.map((group) => {
                  const memberCount = Math.max(group.member_count ?? 1, 1)
                  const groupTotal = group.quote_items.reduce((s, item) => s + item.final_price, 0)
                  return (
                    <div key={group.id}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-base font-semibold text-gray-700">{group.name}</span>
                        <span className="text-xs text-gray-400">{memberCount} pax</span>
                      </div>
                      <div className="space-y-2.5">
                        {group.quote_items.map((item) => {
                          const amtKRW = item.final_price
                          const amtUSD = amtKRW / exchangeRate
                          const unitUSD = amtUSD / memberCount
                          return (
                            <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-4">
                              <p className="text-sm font-medium text-gray-800 mb-1">{item.products?.name ?? '—'}</p>
                              {item.products?.description && (
                                <p className="text-[11px] text-gray-400 mb-2.5 line-clamp-2 whitespace-pre-line">{item.products.description}</p>
                              )}
                              <div className="space-y-1 text-sm text-gray-500">
                                <div className="flex justify-between">
                                  <span>{fmtUSD(unitUSD)} × {memberCount}</span>
                                  <span className="font-semibold text-gray-800">{fmtUSD(amtUSD)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-gray-400">
                                  <span>{fmtKRW(item.final_price / memberCount)} × {memberCount}</span>
                                  <span>{fmtKRW(amtKRW)}</span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-200">
                        <span className="text-sm text-gray-500">Subtotal</span>
                        <div className="text-right">
                          <p className="text-base font-semibold text-gray-800">{fmtUSD(groupTotal / exchangeRate)}</p>
                          <p className="text-xs text-gray-400">{fmtKRW(groupTotal)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {latestQuote && (
                  <div className="flex items-center justify-between pt-4 border-t-2 border-gray-300">
                    <span className="text-base font-bold text-gray-900">Total</span>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{fmtUSD(latestQuote.total_price / exchangeRate)}</p>
                      <p className="text-xs text-gray-500">{fmtKRW(latestQuote.total_price)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    )
  }

  // ── Table view (no case selected) ─────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-gray-900">Cases</h1>
          {!loading && <span className="text-xs text-gray-400">{filteredCases.length}</span>}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CaseStatus | 'all')}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-600 ml-auto"
        >
          <option value="all">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : filteredCases.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-24">No cases found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
              <tr>
                {['Case #', 'Agent', 'Lead Client', 'Status', 'Members', 'Travel Period', 'Total (USD)'].map(h => (
                  <th key={h} className="py-3 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((c) => {
                const caseLead = c.case_members?.find((m) => m.is_lead)
                const quote = c.quotes?.[0]
                const memberCount = quote?.quote_groups?.reduce((s, g) => s + (g.member_count ?? 0), 0) ?? 0
                return (
                  <tr key={c.id} onClick={() => openCase(c)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-400">{c.case_number}</td>
                    <td className="py-3.5 px-4">
                      <p className="text-gray-800 font-medium">{getAgent(c)?.name ?? '—'}</p>
                      <p className="text-[10px] font-mono text-gray-400">{getAgent(c)?.agent_number}</p>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-gray-900">{caseLead?.clients?.name ?? '—'}</td>
                    <td className="py-3.5 px-4">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[c.status]}`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 text-center">{memberCount}</td>
                    <td className="py-3.5 px-4 text-gray-500 text-xs">
                      {c.travel_start_date || c.travel_end_date
                        ? `${c.travel_start_date ?? '—'} ~ ${c.travel_end_date ?? '—'}`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-gray-900">
                      {quote ? fmtUSD(quote.total_price / exchangeRate) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
