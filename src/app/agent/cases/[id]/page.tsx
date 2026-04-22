'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type CaseStatus = 'payment_pending' | 'payment_completed' | 'schedule_reviewed' | 'schedule_confirmed' | 'travel_completed'
type DietaryType = 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'

type CaseMember = {
  id: string
  is_lead: boolean
  clients: { id: string; client_number: string; name: string; nationality: string | null; gender: string | null; needs_muslim_friendly: boolean } | null
}

type QuoteItem = {
  id: string
  final_price: number
  products: { id: string; name: string; base_price: number; price_currency: string; duration_value: number | null; duration_unit: string | null }
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
  slug: string | null
  total_price: number
  payment_due_date: string | null
  agent_margin_rate: number
  company_margin_rate: number
  quote_groups: QuoteGroup[]
}

type Schedule = {
  id: string
  slug: string | null
  pdf_url: string | null
  status: string
  version: number
  created_at: string
}

type CaseDetail = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  travel_end_date: string | null
  created_at: string
  case_members: CaseMember[]
  quotes: Quote[]
  schedules: Schedule[]
}

type AgentClient = { id: string; name: string; nationality: string }
type NewClientForm = {
  name: string; nationality: string; gender: 'male' | 'female'; date_of_birth: string
  phone: string; email: string; dietary_restriction: DietaryType; needs_muslim_friendly: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<CaseStatus, string> = {
  payment_pending: 'Awaiting Payment', payment_completed: 'Payment Confirmed',
  schedule_reviewed: 'Schedule Reviewed', schedule_confirmed: 'Schedule Confirmed', travel_completed: 'Travel Completed',
}
const STATUS_STYLES: Record<CaseStatus, string> = {
  payment_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  payment_completed: 'bg-blue-50 text-blue-700 border-blue-200',
  schedule_reviewed: 'bg-violet-50 text-violet-700 border-violet-200',
  schedule_confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  travel_completed: 'bg-gray-50 text-gray-500 border-gray-200',
}
const DIETARY_OPTIONS = [
  { value: 'halal_certified', label: 'Halal Certified' }, { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' }, { value: 'pork_free', label: 'Pork Free' }, { value: 'none', label: 'None' },
]
const DEFAULT_FORM: NewClientForm = { name: '', nationality: '', gender: 'male', date_of_birth: '', phone: '', email: '', dietary_restriction: 'none', needs_muslim_friendly: false }

// ── Component ─────────────────────────────────────────────────────────────────

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [agentId, setAgentId] = useState('')
  const [agentClients, setAgentClients] = useState<AgentClient[]>([])
  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [loading, setLoading] = useState(true)

  // Travel dates edit
  const [editDates, setEditDates] = useState(false)
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [savingDates, setSavingDates] = useState(false)

  // Companion management
  const [selectingCompanion, setSelectingCompanion] = useState(false)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientForm, setNewClientForm] = useState<NewClientForm>(DEFAULT_FORM)
  const [addingExisting, setAddingExisting] = useState(false)
  const [savingClient, setSavingClient] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [companionError, setCompanionError] = useState('')

  // Invoice
  const [copied, setCopied] = useState(false)
  const [scheduleCopied, setScheduleCopied] = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchCase = useCallback(async () => {
    const { data } = await supabase
      .from('cases')
      .select(`
        id, case_number, status, travel_start_date, travel_end_date, created_at,
        case_members(
          id, is_lead,
          clients(id, client_number, name, nationality, gender, needs_muslim_friendly)
        ),
        quotes(
          id, quote_number, slug, total_price, payment_due_date, agent_margin_rate, company_margin_rate,
          quote_groups(
            id, name, order, member_count,
            quote_items(id, final_price, products(id, name, base_price, price_currency, duration_value, duration_unit)),
            quote_group_members(id)
          )
        ),
        schedules(id, slug, pdf_url, status, version, created_at)
      `)
      .eq('id', id)
      .single()
    setCaseData(data as unknown as CaseDetail)
  }, [id])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data: ag } = await supabase.from('agents').select('id').eq('auth_user_id', uid).single()
      const aid = ag?.id ?? ''
      setAgentId(aid)

      const { data: ss } = await supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single()
      const rate = (ss?.value as { usd_krw?: number } | null)?.usd_krw
      if (typeof rate === 'number' && rate > 0) setExchangeRate(rate)

      await fetchCase()

      if (aid) {
        const { data: cl } = await supabase.from('clients').select('id, name, nationality').eq('agent_id', aid).order('name')
        setAgentClients(cl ?? [])
      }
      setLoading(false)
    }
    load()
  }, [fetchCase])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function saveDates() {
    if (!caseData) return
    setSavingDates(true)
    await supabase.from('cases').update({ travel_start_date: dateStart || null, travel_end_date: dateEnd || null }).eq('id', caseData.id)
    await fetchCase()
    setEditDates(false)
    setSavingDates(false)
  }

  async function addExistingCompanion(clientId: string) {
    if (!caseData) return
    setAddingExisting(true)
    await supabase.from('case_members').insert({ case_id: caseData.id, client_id: clientId, is_lead: false })
    await fetchCase()
    setSelectingCompanion(false)
    setAddingExisting(false)
  }

  async function removeCompanion(memberId: string) {
    setRemovingId(memberId)
    await supabase.from('case_members').delete().eq('id', memberId)
    await fetchCase()
    setRemovingId(null)
  }

  async function handleAddNewClient() {
    if (!newClientForm.name.trim()) { setCompanionError('Name is required.'); return }
    if (!agentId || !caseData) return
    setSavingClient(true); setCompanionError('')
    try {
      const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true })
      const { data: nc, error: ce } = await supabase.from('clients')
        .insert({ client_number: `#CL-${String((count ?? 0) + 1).padStart(3, '0')}`, agent_id: agentId, ...newClientForm })
        .select('id, name, nationality').single()
      if (ce) throw ce
      await supabase.from('case_members').insert({ case_id: caseData.id, client_id: nc.id, is_lead: false })
      setAgentClients(p => [...p, { id: nc.id, name: nc.name, nationality: nc.nationality }])
      await fetchCase()
      setNewClientForm(DEFAULT_FORM)
      setShowNewClient(false)
    } catch (e: unknown) {
      setCompanionError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setSavingClient(false)
    }
  }

  // Send Invoice
  function sendInvoice() {
    if (!quote?.slug) return
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    navigator.clipboard.writeText(`${baseUrl}/quote/${quote.slug}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Send Schedule
  function sendSchedule() {
    if (!schedule?.slug) return
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    navigator.clipboard.writeText(`${baseUrl}/schedule/${schedule.slug}`).then(() => {
      setScheduleCopied(true)
      setTimeout(() => setScheduleCopied(false), 2000)
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  if (!caseData) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Case not found.</p></div>

  const lead = caseData.case_members.find(m => m.is_lead)
  const companions = caseData.case_members.filter(m => !m.is_lead)
  const existingIds = new Set(caseData.case_members.map(m => m.clients?.id))
  const availableClients = agentClients.filter(c => !existingIds.has(c.id))
  const quote = caseData.quotes[0] ?? null
  const schedule = caseData.schedules?.[0] ?? null

  const totalKrw = quote?.total_price ?? 0
  const agentMarginRate = quote?.agent_margin_rate ?? 0
  const earningsKrw = agentMarginRate > 0 ? Math.round(totalKrw * agentMarginRate / (1 + agentMarginRate)) : 0
  const toUsd = (krw: number) => krw / exchangeRate
  const fmtUsd = (usd: number) => `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const durationDays = caseData.travel_start_date && caseData.travel_end_date
    ? Math.ceil((new Date(caseData.travel_end_date).getTime() - new Date(caseData.travel_start_date).getTime()) / 86400000)
    : null

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-gray-100 bg-white">
        <button onClick={() => router.push('/agent/cases')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Cases
        </button>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-900">{caseData.case_number}</span>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[caseData.status]}`}>
          {STATUS_LABELS[caseData.status]}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">

          {/* Travel Dates */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Travel Period</h3>
              {!editDates ? (
                <button onClick={() => { setEditDates(true); setDateStart(caseData.travel_start_date ?? ''); setDateEnd(caseData.travel_end_date ?? '') }}
                  className="text-xs text-[#0f4c35] hover:underline font-medium">Edit</button>
              ) : (
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditDates(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  <button onClick={saveDates} disabled={savingDates} className="text-xs font-medium text-[#0f4c35] hover:underline disabled:opacity-40">
                    {savingDates ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            {!editDates ? (
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Start</p>
                  <p className="text-gray-800 font-medium">{caseData.travel_start_date ?? '—'}</p>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">End</p>
                  <p className="text-gray-800 font-medium">{caseData.travel_end_date ?? '—'}</p>
                </div>
                {durationDays && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Duration</p>
                    <p className="text-gray-800 font-medium">{durationDays} days</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35]" />
                </div>
              </div>
            )}
          </section>

          {/* Lead Client */}
          {lead && (
            <section className="bg-gray-50 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Lead Client</h3>
                <span className="text-[10px] font-mono text-gray-400">{lead.clients?.client_number}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/agent/clients/${lead.clients?.id}`} className="text-sm font-semibold text-[#0f4c35] hover:underline">
                  {lead.clients?.name}
                </Link>
                {lead.clients?.nationality && <span className="text-xs text-gray-500">· {lead.clients.nationality}</span>}
                {lead.clients?.gender && <span className="text-xs text-gray-400 capitalize">· {lead.clients.gender}</span>}
                {lead.clients?.needs_muslim_friendly && <span className="text-xs text-emerald-600 font-medium">· Muslim Friendly</span>}
              </div>
            </section>
          )}

          {/* Companions */}
          <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Companions ({companions.length})
              </h3>
              <div className="flex items-center gap-3">
                <button onClick={() => { setSelectingCompanion(true); setShowNewClient(false) }}
                  className="text-xs font-medium text-[#0f4c35] hover:underline">+ Add existing</button>
                <span className="text-gray-200">|</span>
                <button onClick={() => { setShowNewClient(true); setSelectingCompanion(false) }}
                  className="text-xs font-medium text-[#0f4c35] hover:underline">+ Register new</button>
              </div>
            </div>

            {selectingCompanion && (
              <div className="flex items-center gap-2">
                <select defaultValue="" onChange={e => { if (e.target.value) addExistingCompanion(e.target.value) }}
                  disabled={addingExisting}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#0f4c35] bg-white">
                  <option value="" disabled>Select a client</option>
                  {availableClients.length === 0
                    ? <option disabled>No other clients available</option>
                    : availableClients.map(c => <option key={c.id} value={c.id}>{c.name}{c.nationality ? ` (${c.nationality})` : ''}</option>)}
                </select>
                <button onClick={() => setSelectingCompanion(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            )}

            {showNewClient && (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
                <p className="text-xs font-medium text-gray-600">Register new client as companion</p>
                <div className="grid grid-cols-2 gap-3">
                  {([['Name *', 'name', 'text'], ['Nationality', 'nationality', 'text'], ['Phone', 'phone', 'text'], ['Email', 'email', 'email']] as const).map(([label, field, type]) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input type={type} value={(newClientForm as unknown as Record<string, string>)[field]}
                        onChange={e => setNewClientForm(p => ({ ...p, [field]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Muslim?</label>
                  <div className="flex gap-4">
                    {([true, false] as const).map(v => (
                      <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={newClientForm.needs_muslim_friendly === v}
                          onChange={() => setNewClientForm(p => ({ ...p, needs_muslim_friendly: v }))}
                          className="accent-[#0f4c35]" />
                        <span className="text-sm text-gray-700">{v ? 'Yes' : 'No'}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dietary Restriction</label>
                  <select value={newClientForm.dietary_restriction}
                    onChange={e => setNewClientForm(p => ({ ...p, dietary_restriction: e.target.value as DietaryType }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                    {DIETARY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {companionError && <p className="text-xs text-red-500">{companionError}</p>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setShowNewClient(false); setCompanionError('') }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  <button onClick={handleAddNewClient} disabled={savingClient}
                    className="px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                    {savingClient ? 'Saving...' : 'Add Companion'}
                  </button>
                </div>
              </div>
            )}

            {companions.length === 0 && !selectingCompanion && !showNewClient ? (
              <p className="text-xs text-gray-400">No companions added yet.</p>
            ) : (
              <div className="space-y-2">
                {companions.map(m => (
                  <div key={m.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/agent/clients/${m.clients?.id}`} className="text-sm font-medium text-[#0f4c35] hover:underline">
                        {m.clients?.name}
                      </Link>
                      {m.clients?.nationality && <span className="text-xs text-gray-400">{m.clients.nationality}</span>}
                      {m.clients?.needs_muslim_friendly && <span className="text-xs text-emerald-600">Muslim Friendly</span>}
                    </div>
                    <button onClick={() => removeCompanion(m.id)} disabled={removingId === m.id}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none disabled:opacity-40 ml-2">×</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Selected Products */}
          {quote && quote.quote_groups.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Selected Products</h3>
                <span className="text-[10px] font-mono text-gray-400">{quote.quote_number}</span>
              </div>
              {[...quote.quote_groups].sort((a, b) => a.order - b.order).map(group => {
                const qty = Math.max(group.member_count ?? 1, 1)
                // Compute per-product unit price the SAME way Home does:
                //   baseUSD × (1 + companyMargin) × (1 + agentMargin)
                // Using quote's stored margins so display stays consistent with the moment of quote creation.
                const marginMult = (1 + (quote.company_margin_rate ?? 0)) * (1 + (quote.agent_margin_rate ?? 0))
                const unitUsdFor = (item: QuoteItem) => {
                  const baseUSD = item.products.price_currency === 'USD'
                    ? item.products.base_price
                    : item.products.base_price / exchangeRate
                  return baseUSD * marginMult
                }
                const groupTotalUsd = group.quote_items.reduce(
                  (sum, item) => sum + unitUsdFor(item) * qty,
                  0
                )
                return (
                  <div key={group.id} className="bg-gray-50 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">{group.name}</span>
                        <span className="text-[10px] text-gray-400 bg-white border border-gray-100 rounded-full px-2 py-0.5">
                          {qty} member{qty > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-0">
                      {/* Header row */}
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-[10px] font-medium text-gray-400 pb-2 border-b border-gray-100 mb-2">
                        <span>Product</span>
                        <span>Unit Price</span>
                        <span>Qty</span>
                        <span className="text-right">Total</span>
                      </div>
                      {group.quote_items.map(item => {
                        const unitUsd = unitUsdFor(item)
                        const totalUsd = unitUsd * qty
                        return (
                          <div key={item.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 py-2 border-b border-gray-100 last:border-0 text-sm">
                            <div>
                              <p className="text-gray-800">{item.products.name}</p>
                              {item.products.duration_value && (
                                <p className="text-xs text-gray-400">{item.products.duration_value} {item.products.duration_unit}</p>
                              )}
                            </div>
                            <span className="text-gray-500 text-xs self-center">${unitUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="text-gray-500 text-xs self-center">×{qty}</span>
                            <span className="text-right font-medium text-gray-900 self-center">${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-gray-200">
                      <span className="text-xs text-gray-500">Group subtotal</span>
                      <span className="text-sm font-bold text-gray-900">${groupTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          {/* Schedule */}
          <section className="bg-gray-50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Schedule</h3>
              {schedule?.slug && schedule.pdf_url && (
                <div className="flex items-center gap-2">
                  {/* Preview — open schedule page in new tab */}
                  <a
                    href={`${typeof window !== 'undefined' ? window.location.origin : ''}/schedule/${schedule.slug}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#0f4c35] transition-colors px-2 py-1.5 rounded-lg hover:bg-white">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Preview
                  </a>
                  {/* Send — copy schedule URL */}
                  <button onClick={sendSchedule}
                    className="flex items-center gap-1.5 text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] transition-colors px-3 py-1.5 rounded-lg">
                    {scheduleCopied ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                        </svg>
                        Send Schedule
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
            {!schedule ? (
              <p className="text-sm text-gray-400">No schedule uploaded yet. We will notify you once it is ready.</p>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Version {schedule.version}</p>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{schedule.created_at.slice(0, 10)} · {schedule.status}</p>
                </div>
                {schedule.pdf_url && (
                  <a href={schedule.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0f4c35] border border-[#0f4c35]/30 rounded-lg hover:bg-[#0f4c35]/5 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download PDF
                  </a>
                )}
              </div>
            )}
          </section>

          {/* Financials */}
          {quote && (
            <section className="bg-gray-50 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Financials</h3>
                {quote.slug && (
                  <div className="flex items-center gap-2">
                    {/* Preview — open invoice in new tab */}
                    <a
                      href={`${typeof window !== 'undefined' ? window.location.origin : ''}/quote/${quote.slug}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#0f4c35] transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-100">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Preview
                    </a>
                    {/* Send Invoice — copy link to clipboard */}
                    <button onClick={sendInvoice}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
                        bg-[#0f4c35] text-white border-[#0f4c35] hover:bg-[#0a3828]">
                      {copied ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                          </svg>
                          Send Invoice
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="text-[10px] text-gray-400 mb-1">Total Amount</p>
                  <p className="text-base font-bold text-gray-900">{fmtUsd(toUsd(totalKrw))}</p>
                </div>
                {quote.payment_due_date && (
                  <div className="bg-white rounded-xl border border-gray-100 p-3">
                    <p className="text-[10px] text-gray-400 mb-1">Payment Due</p>
                    <p className={`text-sm font-medium ${caseData.status === 'payment_pending' && new Date(quote.payment_due_date) < new Date() ? 'text-red-500' : 'text-gray-900'}`}>
                      {quote.payment_due_date}
                    </p>
                    {caseData.status === 'payment_pending' && new Date(quote.payment_due_date) < new Date() && (
                      <p className="text-[10px] text-red-400 mt-0.5">Overdue</p>
                    )}
                  </div>
                )}
              </div>
              {earningsKrw > 0 && (
                <div className="bg-[#0f4c35]/5 border border-[#0f4c35]/15 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-[#0f4c35]/70 mb-1">Your Estimated Earnings</p>
                    <p className="text-base font-bold text-[#0f4c35]">{fmtUsd(toUsd(earningsKrw))}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 mb-1">Commission Rate</p>
                    <p className="text-sm font-semibold text-gray-700">{(agentMarginRate * 100).toFixed(0)}%</p>
                  </div>
                </div>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  )
}
