'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { notifyAgent } from '@/lib/notifications'
import { logAsCurrentUser } from '@/lib/audit'
import { type CaseStatus, STATUS_LABELS, STATUS_STYLES } from '@/lib/caseStatus'
import { AdminCaseHero } from '@/components/CaseHeroAction'
import CaseDocumentsSection from '@/components/CaseDocumentsSection'
import type { DocumentRow } from '@/lib/documents'

import type { ClientInfo, FlightInfo } from '@/lib/clientCompleteness'
import { getMissingClientFields, getMissingCaseFields, CLIENT_INFO_COLUMNS } from '@/lib/clientCompleteness'
import {
  finalizeDocument,
  repriceDocument,
  updateDocumentItemPrice,
  issueInvoice,
  syncFinalInvoiceFromQuotation,
  getCaseFinalInvoice,
} from '@/lib/documents'

type MemberClient = ClientInfo & {
  client_number: string
  nationality: string
  date_of_birth: string | null
  phone: string | null
  email: string | null
  special_requests: string | null
}

type CaseMember = {
  id: string
  is_lead: boolean
  clients: MemberClient
}

type QuoteItem = {
  id: string
  base_price: number
  final_price: number
  products: { id: string; name: string; description: string | null; partner_name: string | null } | null
}

type PartnerPayment = {
  id: string
  case_id: string
  partner_name: string
  amount: number
  paid_at: string
  note: string | null
  created_at: string
}

type AgentSettlement = {
  id: string
  settlement_number: string | null
  agent_id: string
  case_id: string | null
  amount: number
  paid_at: string | null
  created_at: string
}

type QuoteGroup = {
  id: string
  name: string
  order: number
  member_count: number
  document_items: QuoteItem[]
  document_group_members: { id: string; case_member_id: string }[]
}

type Quote = {
  id: string
  type: 'quotation' | 'deposit_invoice' | 'final_invoice' | 'additional_invoice' | 'commission_invoice'
  document_number: string
  slug: string
  total_price: number
  payment_due_date: string | null
  agent_margin_rate: number
  company_margin_rate: number
  finalized_at: string | null
  document_groups: QuoteGroup[]
}

type ScheduleStatus = 'pending' | 'confirmed' | 'revision_requested'

type Schedule = {
  id: string
  slug: string
  pdf_url: string | null
  status: ScheduleStatus
  version: number
  file_name: string | null
  revision_note: string | null
  admin_note: string | null
  confirmed_at: string | null
  created_at: string
  first_opened_at: string | null
}

type Agent = { id: string; agent_number: string; name: string }

type Case = {
  id: string
  case_number: string
  status: CaseStatus
  agent_id: string
  travel_start_date: string | null
  travel_end_date: string | null
  payment_date: string | null
  payment_confirmed_at: string | null
  created_at: string
  concept: string | null
  outbound_flight: FlightInfo
  inbound_flight: FlightInfo
  cancellation_reason: string | null
  agents: Agent | Agent[] | null
  case_members: CaseMember[]
  documents: Quote[]
  schedules: Schedule[]
}

function getAgent(c: { agents: Agent | Agent[] | null } | null | undefined): Agent | null {
  const a = c?.agents
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

// ── Constants ─────────────────────────────────────────────────────────────────

function fmtKRW(n: number) { return '₩' + n.toLocaleString('ko-KR') }
function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }


// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminCaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [caseData, setCaseData] = useState<Case | null>(null)
  const [partnerPayments, setPartnerPayments] = useState<PartnerPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [exchangeRate, setExchangeRate] = useState(1350)

  // Partner payments — local edit state by partner_name
  const [partnerEdits, setPartnerEdits] = useState<Record<string, { amount: string; paid_at: string; note: string }>>({})
  const [savingPartner, setSavingPartner] = useState<string | null>(null)
  const [partnerError, setPartnerError] = useState('')

  // Agent settlement — single row per case
  const [agentSettlement, setAgentSettlement] = useState<AgentSettlement | null>(null)
  const [agentSettlePaidAt, setAgentSettlePaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [savingAgentSettle, setSavingAgentSettle] = useState(false)
  const [agentSettleError, setAgentSettleError] = useState('')

  // Action states
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Pricing finalize state — keyed by quote_item.id
  const [pricingEdits, setPricingEdits] = useState<Record<string, string>>({})
  const [editingPricing, setEditingPricing] = useState(false)
  const [savingPricing, setSavingPricing] = useState(false)
  const [pricingError, setPricingError] = useState('')
  const [dueDateEdit, setDueDateEdit] = useState<string>('')
  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [stagedNote, setStagedNote] = useState('')
  const [uploadingSchedule, setUploadingSchedule] = useState(false)
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  // Blob URL for staged PDF preview — lifecycle managed below
  const stagedFileUrl = useMemo(() => stagedFile ? URL.createObjectURL(stagedFile) : null, [stagedFile])
  useEffect(() => {
    return () => { if (stagedFileUrl) URL.revokeObjectURL(stagedFileUrl) }
  }, [stagedFileUrl])

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchCase = useCallback(async () => {
    const { data, error } = await supabase
      .from('cases')
      .select(`
        id, case_number, status, agent_id, travel_start_date, travel_end_date,
        payment_date, payment_confirmed_at, created_at,
        concept, outbound_flight, inbound_flight, cancellation_reason,
        agents!cases_agent_id_fkey(id, agent_number, name),
        case_members(
          id, is_lead,
          clients(client_number, nationality, date_of_birth, phone, email, special_requests, ${CLIENT_INFO_COLUMNS})
        ),
        documents(
          id, type, document_number, slug, total_price, payment_due_date, agent_margin_rate, company_margin_rate, finalized_at,
          document_groups(id, name, order, member_count, document_items(id, base_price, final_price, products(id, name, description, partner_name)), document_group_members(id, case_member_id))
        ),
        schedules(id, slug, pdf_url, status, version, file_name, revision_note, admin_note, confirmed_at, created_at, first_opened_at)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) console.error('[case] fetch error:', error)
    if (!data) { setNotFound(true); return }
    setCaseData(data as unknown as Case)

    const [{ data: pp }, { data: ss }] = await Promise.all([
      supabase.from('partner_payments')
        .select('id, case_id, partner_name, amount, paid_at, note, created_at')
        .eq('case_id', id),
      supabase.from('settlements')
        .select('id, settlement_number, agent_id, case_id, amount, paid_at, created_at')
        .eq('case_id', id)
        .maybeSingle(),
    ])
    setPartnerPayments((pp as PartnerPayment[]) ?? [])
    setAgentSettlement((ss as AgentSettlement | null) ?? null)
  }, [id])

  useEffect(() => {
    async function init() {
      const [, rateRes] = await Promise.all([
        fetchCase(),
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
      ])
      const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (r) setExchangeRate(r)
      setLoading(false)
    }
    init()
  }, [fetchCase])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function confirmPayment() {
    if (!caseData) return
    setConfirmingPayment(true); setActionError('')
    try {
      const paidIso = paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString()
      const { error } = await supabase.from('cases').update({
        status: 'awaiting_travel',
        payment_date: paymentDate || null,
        payment_confirmed_at: new Date().toISOString(),
      }).eq('id', caseData.id)
      if (error) throw error
      // Also mark the case's final_invoice as paid (data consistency — single source of truth migration)
      const finalInvDoc = caseData.documents?.find(d => d.type === 'final_invoice')
      if (finalInvDoc) {
        await supabase.from('documents').update({ payment_received_at: paidIso }).eq('id', finalInvDoc.id)
      }
      await notifyAgent(caseData.agent_id, `${caseData.case_number} Payment confirmed`, `/agent/cases/${caseData.id}`)
      await logAsCurrentUser('case.payment_confirmed', { type: 'case', id: caseData.id, label: caseData.case_number },
        paymentDate ? { paid_on: paymentDate } : undefined)
      await fetchCase()
      setPaymentDate(new Date().toISOString().slice(0, 10))
    } catch (e: unknown) { setActionError((e as { message?: string })?.message ?? 'Failed.') }
    finally { setConfirmingPayment(false) }
  }

  function stageFile(file: File) {
    if (file.type !== 'application/pdf') { setActionError('Only PDF files are allowed.'); return }
    setActionError('')
    setStagedFile(file)
  }

  function cancelStaged() {
    setStagedFile(null)
    setStagedNote('')
    setActionError('')
  }

  async function confirmUpload() {
    if (!caseData || !stagedFile) return
    setUploadingSchedule(true); setActionError('')
    try {
      // Sanitize for Supabase Storage key: ASCII alphanumerics, dot, dash, underscore only.
      // Non-ASCII (e.g. Korean) and chars like comma/space get stripped/replaced.
      const safeName = stagedFile.name
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]/g, '')        // drop non-ASCII
        .replace(/[^a-zA-Z0-9._-]+/g, '_')   // replace runs of unsupported chars with _
        .replace(/^_+|_+$/g, '')              // trim leading/trailing underscores
        || 'schedule.pdf'
      const path = `${caseData.id}/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage.from('schedules').upload(path, stagedFile, { upsert: false })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('schedules').getPublicUrl(path)
      const pdfUrl = urlData.publicUrl

      const existing = caseData.schedules ?? []
      const slug = existing[0]?.slug ?? crypto.randomUUID()
      const version = existing.reduce((m, s) => Math.max(m, s.version), 0) + 1

      const note = stagedNote.trim() || null
      const { error: insertError } = await supabase.from('schedules').insert({
        case_id: caseData.id,
        quote_id: caseData.documents?.find(d => d.type === "quotation")?.id ?? null,
        slug,
        pdf_url: pdfUrl,
        status: 'pending',
        version,
        file_name: stagedFile.name,
        admin_note: note,
      })
      if (insertError) throw insertError

      await supabase.from('cases').update({ status: 'reviewing_schedule' }).eq('id', caseData.id)
      const notifyMsg = note
        ? `${caseData.case_number} Schedule v${version} uploaded — ${note}`
        : `${caseData.case_number} Schedule uploaded (v${version})`
      await notifyAgent(caseData.agent_id, notifyMsg, `/agent/cases/${caseData.id}`)
      await logAsCurrentUser('schedule.uploaded', { type: 'case', id: caseData.id, label: caseData.case_number }, { version, file_name: stagedFile.name, note })
      await fetchCase()
      setStagedFile(null)
      setStagedNote('')
    } catch (e: unknown) { setActionError((e as { message?: string })?.message ?? 'Failed.') }
    finally { setUploadingSchedule(false) }
  }

  async function deleteScheduleVersion(scheduleId: string, pdfUrl: string | null, version: number, fileName: string | null) {
    const confirmed = window.confirm(
      `Delete schedule version ${version}${fileName ? ` (${fileName})` : ''}?\n\nThis cannot be undone. The file will be removed from storage and this version will no longer be visible to the agent or client.`
    )
    if (!confirmed) return

    setDeletingScheduleId(scheduleId); setActionError('')
    try {
      if (pdfUrl) {
        const marker = '/object/public/schedules/'
        const idx = pdfUrl.indexOf(marker)
        if (idx !== -1) {
          const objectPath = pdfUrl.slice(idx + marker.length)
          await supabase.storage.from('schedules').remove([objectPath])
        }
      }
      const { error } = await supabase.from('schedules').delete().eq('id', scheduleId)
      if (error) throw error

      const remaining = (caseData?.schedules ?? []).filter(s => s.id !== scheduleId)
      if (remaining.length === 0 && caseData?.status === 'reviewing_schedule') {
        // No schedule left → revert to awaiting_schedule so admin can re-upload
        await supabase.from('cases').update({ status: 'awaiting_schedule' }).eq('id', caseData.id)
      }

      if (caseData) {
        await logAsCurrentUser('schedule.deleted', { type: 'case', id: caseData.id, label: caseData.case_number }, { version, file_name: fileName })
        await notifyAgent(
          caseData.agent_id,
          `${caseData.case_number} Schedule v${version} deleted by admin`,
          `/agent/cases/${caseData.id}`
        )
      }
      await fetchCase()
    } catch (e: unknown) { setActionError((e as { message?: string })?.message ?? 'Failed.') }
    finally { setDeletingScheduleId(null) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  if (notFound || !caseData) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-gray-400">Case not found.</p>
      <button onClick={() => router.push('/admin/cases')} className="text-xs text-[#0f4c35] hover:underline">Back to Cases</button>
    </div>
  )

  const lead = caseData.case_members?.find((m) => m.is_lead)
  const companions = caseData.case_members?.filter((m) => !m.is_lead) ?? []
  // Derive quotation + final_invoice from the unified documents array.
  // `latestQuote` retained as the in-page name for the quotation document.
  const latestQuote = caseData.documents?.find(d => d.type === 'quotation') ?? null
  const finalInvoice = caseData.documents?.find(d => d.type === 'final_invoice') ?? null
  const sortedSchedules = caseData.schedules ? [...caseData.schedules].sort((a, b) => b.version - a.version) : []
  const latestSchedule = sortedSchedules[0] ?? null
  const expectedMemberCount = latestQuote?.document_groups?.reduce((s, g) => s + (g.member_count ?? 0), 0) ?? 0
  const clientsMissingInfo = caseData.case_members
    .map(m => ({ member: m, missing: getMissingClientFields(m.clients) }))
    .filter(x => x.missing.length > 0)
  // Info-only completeness (member count shortfall handled by group assignment section)
  const allClientsComplete = caseData.case_members.length > 0 && clientsMissingInfo.length === 0
  const groupsComplete = !latestQuote || latestQuote.document_groups.every(g => (g.document_group_members?.length ?? 0) === g.member_count)
  const missingCaseFields = getMissingCaseFields(caseData)
  const caseInfoComplete = missingCaseFields.length === 0
  const scheduleReady = allClientsComplete && groupsComplete && caseInfoComplete
  // Schedule is locked once the agent confirms (or beyond) — no more uploads or deletes.
  const scheduleLocked =
    caseData.status === 'awaiting_pricing'
    || caseData.status === 'awaiting_payment'
    || caseData.status === 'awaiting_travel'
    || caseData.status === 'completed'
    || caseData.status === 'canceled'
  const canUploadSchedule = !scheduleLocked
    && (caseData.status === 'awaiting_schedule' || caseData.status === 'reviewing_schedule')
    && (latestSchedule === null || latestSchedule.status === 'revision_requested')
    && scheduleReady
  const sortedGroups = latestQuote?.document_groups ? [...latestQuote.document_groups].sort((a, b) => a.order - b.order) : []
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header bar */}
      <div className="shrink-0 border-b border-gray-100 bg-white px-4 md:px-6 py-3 md:py-0 md:h-14 flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/admin/cases')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Cases
        </button>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-900">{caseData.case_number}</span>
        <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full border ${STATUS_STYLES[caseData.status]}`}>
          {STATUS_LABELS[caseData.status]}
        </span>
      </div>

      {/* 50/50 on desktop, stacked on mobile */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

        {/* LEFT — Case Info + Actions */}
        <div className="w-full md:w-1/2 overflow-y-auto border-b md:border-b-0 md:border-r border-gray-100 px-4 md:px-6 py-4 md:py-6 space-y-5">

          {/* Canceled banner */}
          {caseData.status === 'canceled' && (
            <div className="border-l-4 border-rose-400 bg-rose-50 rounded-r-xl px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-rose-800">This case has been canceled</p>
              {caseData.cancellation_reason && (
                <p className="text-xs text-rose-700"><span className="font-medium">Cancellation reason:</span> {caseData.cancellation_reason}</p>
              )}
              <p className="text-xs text-rose-700">Most actions are disabled. View-only.</p>
            </div>
          )}

          {/* Hero: status-aware next action */}
          <AdminCaseHero
            status={caseData.status}
            caseInfoComplete={caseInfoComplete}
            allClientsComplete={allClientsComplete}
            groupsComplete={groupsComplete}
            scheduleVersion={latestSchedule?.version ?? null}
            scheduleStatus={(latestSchedule?.status as 'pending' | 'confirmed' | 'revision_requested' | undefined) ?? null}
            scheduleReady={scheduleReady}
            hasInvoice={!!latestQuote?.finalized_at}
            paymentDueDate={latestQuote?.payment_due_date ?? null}
            travelStartDate={caseData.travel_start_date}
            onScrollToScheduleUpload={() => document.getElementById('schedule-upload')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            onScrollToPricing={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            onScrollToConfirmPayment={() => document.getElementById('confirm-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />

          {/* Agent */}
          <section className="bg-gray-50 rounded-2xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Agent</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-gray-400">{getAgent(caseData)?.agent_number}</span>
              <span className="text-sm font-medium text-gray-900">{getAgent(caseData)?.name ?? '—'}</span>
            </div>
          </section>

          {/* Travel Period */}
          <section className="bg-gray-50 rounded-2xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Travel Period</p>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Start</p>
                <p className="text-gray-800 font-medium">{caseData.travel_start_date ?? '—'}</p>
              </div>
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">End</p>
                <p className="text-gray-800 font-medium">{caseData.travel_end_date ?? '—'}</p>
              </div>
              <p className="text-xs text-gray-400 ml-auto">Created: {caseData.created_at.slice(0, 10)}</p>
            </div>
          </section>

          {/* Trip Info (case-level, read-only) */}
          <section className={`rounded-2xl p-4 ${caseInfoComplete ? 'bg-gray-50' : 'bg-amber-50 border border-amber-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trip Info</p>
              {!caseInfoComplete && <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Incomplete</span>}
            </div>
            {!caseInfoComplete && (
              <p className="text-xs text-amber-800 mb-3">Missing: {missingCaseFields.join(' · ')}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="col-span-2">
                <p className="text-[10px] text-gray-400 mb-0.5">Concept *</p>
                <p className="text-gray-800">{caseData.concept || <span className="text-gray-300">—</span>}</p>
              </div>
              <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t border-gray-200">
                <div>
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Outbound *</p>
                  <p className="text-xs text-gray-800">{caseData.outbound_flight?.departure_airport ?? '—'} → {caseData.outbound_flight?.arrival_airport ?? '—'}</p>
                  <p className="text-[11px] text-gray-500">Dep: {caseData.outbound_flight?.departure_datetime ?? '—'}</p>
                  <p className="text-[11px] text-gray-500">Arr: {caseData.outbound_flight?.arrival_datetime ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Inbound *</p>
                  <p className="text-xs text-gray-800">{caseData.inbound_flight?.departure_airport ?? '—'} → {caseData.inbound_flight?.arrival_airport ?? '—'}</p>
                  <p className="text-[11px] text-gray-500">Dep: {caseData.inbound_flight?.departure_datetime ?? '—'}</p>
                  <p className="text-[11px] text-gray-500">Arr: {caseData.inbound_flight?.arrival_datetime ?? '—'}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Lead Client */}
          {lead && (
            <section className="bg-gray-50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Lead Client</p>
                <span className="text-[10px] text-gray-400 font-mono">{lead.clients?.client_number}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
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

          {/* Members + Readiness (merged) */}
          {(() => {
            const memberShortfall = expectedMemberCount > 0 && caseData.case_members.length < expectedMemberCount
            const groupGaps = latestQuote?.document_groups?.filter(g => (g.document_group_members?.length ?? 0) !== g.member_count) ?? []
            const issueCount = (memberShortfall ? 1 : 0) + groupGaps.length + clientsMissingInfo.length
            const ready = issueCount === 0 && caseData.case_members.length > 0
            return (
              <section className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Members ({caseData.case_members.length}{expectedMemberCount > 0 ? ` / ${expectedMemberCount}` : ''})
                  </h3>
                  {ready
                    ? <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Ready</span>
                    : <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{issueCount} issue{issueCount > 1 ? 's' : ''}</span>}
                </div>

                {caseData.case_members.length > 0 && (() => {
                  const memberGroupMap = new Map<string, string>()
                  sortedGroups.forEach(g => g.document_group_members?.forEach(gm => memberGroupMap.set(gm.case_member_id, g.id)))
                  const grouped = sortedGroups.map(g => ({
                    group: g,
                    members: caseData.case_members
                      .filter(m => memberGroupMap.get(m.id) === g.id)
                      .sort((a, b) => Number(b.is_lead) - Number(a.is_lead)),
                  }))
                  const unassigned = caseData.case_members
                    .filter(m => !memberGroupMap.has(m.id))
                    .sort((a, b) => Number(b.is_lead) - Number(a.is_lead))

                  const renderRow = (m: typeof caseData.case_members[number]) => (
                    <div key={m.id} className="flex items-center gap-2 py-1">
                      <span className="text-sm text-gray-800 truncate">{m.clients?.name ?? '—'}</span>
                      <span className="text-[10px] font-mono text-gray-400">{m.clients?.client_number}</span>
                      {m.is_lead && <span className="text-[9px] font-medium text-white bg-[#0f4c35] px-1.5 py-0.5 rounded">LEAD</span>}
                    </div>
                  )

                  return sortedGroups.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {grouped.map(({ group, members }) => (
                        <div key={group.id} className="space-y-1">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{group.name}</p>
                          {members.length === 0
                            ? <p className="text-xs text-gray-300 italic">No members assigned</p>
                            : members.map(renderRow)}
                        </div>
                      ))}
                      {unassigned.length > 0 && (
                        <div className="space-y-1 sm:col-span-2">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Unassigned</p>
                          {unassigned.map(renderRow)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">{caseData.case_members.map(renderRow)}</div>
                  )
                })()}

                {!ready && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide mb-1.5">{issueCount} issue{issueCount > 1 ? 's' : ''} to resolve</p>
                    <ul className="space-y-1 text-xs text-amber-800">
                      {memberShortfall && (
                        <li>· Members: {caseData.case_members.length} of {expectedMemberCount} registered</li>
                      )}
                      {groupGaps.map(g => (
                        <li key={g.id}>· {g.name}: {g.document_group_members?.length ?? 0} / {g.member_count} assigned</li>
                      ))}
                      {clientsMissingInfo.map(({ member, missing }) => {
                        const c = member.clients
                        return (
                          <li key={member.id}>
                            · <span className="font-medium text-gray-800">{c.name}</span>
                            <span className="text-[10px] font-mono text-gray-400 ml-1">{c.client_number}</span>
                            <span className="text-amber-700"> — info incomplete ({missing.length} field{missing.length > 1 ? 's' : ''})</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </section>
            )
          })()}

          {/* Quote / Financials */}
          {latestQuote && (
            <section className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Financials</p>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-gray-400">
                    {latestQuote.document_number}
                    {finalInvoice?.document_number && <span className="ml-1.5 text-gray-300">·</span>}
                    {finalInvoice?.document_number && <span className="ml-1.5 text-[#0f4c35]">{finalInvoice.document_number}</span>}
                  </span>
                  {latestQuote.finalized_at ? (
                    <>
                      <a href={`${baseUrl}/quote/${latestQuote.slug}?preview=1`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-gray-400 hover:text-[#0f4c35] transition-colors">Quotation ↗</a>
                      {finalInvoice && (
                        <a href={`${baseUrl}/invoice/${finalInvoice.slug}?preview=1`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-[#0f4c35] transition-colors">Invoice ↗</a>
                      )}
                    </>
                  ) : (
                    <a href={`${baseUrl}/quote/${latestQuote.slug}?preview=1`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-[#0f4c35] transition-colors">Preview ↗</a>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[10px] text-gray-400 mb-0.5">Total (KRW)</p><p className="font-semibold text-gray-900">{fmtKRW(latestQuote.total_price)}</p></div>
                <div><p className="text-[10px] text-gray-400 mb-0.5">Total (USD)</p><p className="font-semibold text-gray-900">{fmtUSD(latestQuote.total_price / exchangeRate)}</p></div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Payment Due</p>
                  <p className={`font-medium text-sm ${caseData.status === 'awaiting_payment' && latestQuote.payment_due_date && new Date(latestQuote.payment_due_date) < new Date() ? 'text-red-500' : 'text-gray-800'}`}>
                    {latestQuote.payment_due_date ?? '—'}
                  </p>
                </div>
                <div><p className="text-[10px] text-gray-400 mb-0.5">Margins</p><p className="text-gray-700 text-xs">Co. {(latestQuote.company_margin_rate * 100).toFixed(0)}% / Agent {(latestQuote.agent_margin_rate * 100).toFixed(0)}%</p></div>
              </div>

              {/* Revenue breakdown */}
              {(() => {
                const total = latestQuote.total_price ?? 0
                const co = latestQuote.company_margin_rate ?? 0
                const ag = latestQuote.agent_margin_rate ?? 0
                const denom = (1 + co) * (1 + ag)
                const base = denom > 0 ? total / denom : 0
                const companyShare = base * co
                const agentShare = base * (1 + co) * ag
                return (
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Revenue Breakdown</p>
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-gray-600">Partner Cost (원가)</span>
                        <span className="text-right tabular-nums">
                          <span className="text-sm font-medium text-gray-800">{fmtUSD(base / exchangeRate)}</span>
                          <span className="text-[10px] text-gray-400 ml-2">{fmtKRW(base)}</span>
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-gray-600">Company Revenue ({(co * 100).toFixed(0)}%)</span>
                        <span className="text-right tabular-nums">
                          <span className="text-sm font-medium text-[#0f4c35]">{fmtUSD(companyShare / exchangeRate)}</span>
                          <span className="text-[10px] text-gray-400 ml-2">{fmtKRW(companyShare)}</span>
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-gray-600">Agent Payout ({(ag * 100).toFixed(0)}%)</span>
                        <span className="text-right tabular-nums">
                          <span className="text-sm font-medium text-amber-700">{fmtUSD(agentShare / exchangeRate)}</span>
                          <span className="text-[10px] text-gray-400 ml-2">{fmtKRW(agentShare)}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {caseData.payment_date && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-0.5">Payment Received</p>
                  <p className="text-sm font-medium text-gray-800">{caseData.payment_date}</p>
                </div>
              )}
            </section>
          )}

          {/* Invoices (deposit / additional / commission) */}
          {latestQuote && (
            <CaseDocumentsSection
              caseId={caseData.id}
              caseNumber={caseData.case_number}
              agentId={caseData.agent_id}
              quotation={latestQuote as unknown as DocumentRow}
              finalInvoice={(finalInvoice ?? null) as unknown as DocumentRow | null}
              documents={(caseData.documents ?? []) as unknown as DocumentRow[]}
              exchangeRate={exchangeRate}
              onChanged={fetchCase}
            />
          )}


          {/* Schedule History */}
          {sortedSchedules.length > 0 && (
            <section className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Schedule History</p>
                <span className="text-[10px] text-gray-400">{sortedSchedules.length} version{sortedSchedules.length > 1 ? 's' : ''}</span>
              </div>

              {scheduleLocked && (
                <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 rounded-xl px-3 py-2">
                  <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <p className="text-xs text-emerald-800">
                    {caseData.status === 'completed'
                      ? 'Travel complete — schedule is locked.'
                      : 'Agent has confirmed the schedule — no further edits allowed.'}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {sortedSchedules.map((s) => {
                  const isLatest = s.id === latestSchedule?.id
                  const statusStyle =
                    s.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    s.status === 'revision_requested' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    'bg-blue-50 text-blue-700 border-blue-200'
                  const statusLabel =
                    s.status === 'confirmed' ? 'Confirmed' :
                    s.status === 'revision_requested' ? 'Revision Requested' :
                    'Pending Review'
                  const canDelete = !scheduleLocked && isLatest && s.status === 'pending' && !s.first_opened_at
                  return (
                    <div key={s.id} className={`bg-white rounded-xl border p-3 space-y-1.5 ${isLatest ? 'border-gray-300' : 'border-gray-100'}`}>
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">v{s.version}</span>
                        {isLatest && <span className="text-[9px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">LATEST</span>}
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusStyle}`}>{statusLabel}</span>
                        {s.status === 'revision_requested' && s.revision_note && (
                          <span className="text-xs text-gray-700 border-l-2 border-rose-300 pl-2 flex-1 min-w-0 whitespace-pre-line">{s.revision_note}</span>
                        )}
                        <div className="ml-auto flex items-center gap-3">
                          {s.slug && s.pdf_url && (
                            <a
                              href={`${baseUrl}/schedule/${s.slug}?preview=1&v=${s.version}`}
                              target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#0f4c35] transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              Preview
                            </a>
                          )}
                          <span className="text-[10px] text-gray-400">{s.created_at.slice(0, 10)}</span>
                        </div>
                      </div>
                      {s.file_name && <p className="text-xs text-gray-500 break-all">{s.file_name}</p>}
                      {s.admin_note && (() => {
                        // Pending: blue (still actionable). Confirmed/older: muted gray (historical).
                        const isPending = s.status === 'pending'
                        const wrapClass = isPending
                          ? 'border-l-2 border-blue-300 bg-blue-50 px-2 py-1 rounded-r'
                          : 'border-l-2 border-gray-300 bg-gray-100 px-2 py-1 rounded-r'
                        const labelClass = isPending
                          ? 'text-[10px] font-semibold text-blue-700 uppercase tracking-wide mb-0.5'
                          : 'text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5'
                        const textClass = isPending
                          ? 'text-xs text-blue-900 whitespace-pre-line'
                          : 'text-xs text-gray-700 whitespace-pre-line'
                        return (
                          <div className={wrapClass}>
                            <p className={labelClass}>Admin note</p>
                            <p className={textClass}>{s.admin_note}</p>
                          </div>
                        )
                      })()}
                      {canDelete && (
                        <div className="flex items-center pt-1">
                          <button
                            onClick={() => deleteScheduleVersion(s.id, s.pdf_url, s.version, s.file_name)}
                            disabled={deletingScheduleId === s.id}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto disabled:opacity-40"
                            title="Undo: only the latest upload can be deleted, before the agent reviews it or the client opens it.">
                            {deletingScheduleId === s.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Admin Actions */}
          {actionError && <p className="text-xs text-red-500 px-1">{actionError}</p>}

          {/* Finalize Pricing — admin adjusts final prices after agent confirms schedule */}
          {((caseData.status === 'awaiting_pricing') || (caseData.status === 'awaiting_payment' && editingPricing)) && latestQuote && (() => {
            // Default due date: existing value, else today + 7 days
            const today = new Date().toISOString().slice(0, 10)
            const defaultDue = latestQuote.payment_due_date ?? (() => {
              const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10)
            })()
            const dueDateValue = dueDateEdit || defaultDue
            return (
            <section id="pricing" className="scroll-mt-20 border border-violet-200 bg-violet-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
                  {latestQuote.finalized_at ? 'Edit Final Pricing' : 'Finalize Pricing'}
                </p>
                {latestQuote.finalized_at && (
                  <button onClick={() => { setEditingPricing(false); setPricingEdits({}); setDueDateEdit(''); setPricingError('') }}
                    className="text-xs text-gray-500 hover:text-gray-800">Cancel</button>
                )}
              </div>
              <p className="text-[11px] text-gray-600">Adjust each line item to reflect the actual final price before issuing the invoice.</p>

              {pricingError && <p className="text-xs text-red-500">{pricingError}</p>}

              <div className="bg-white rounded-xl border border-violet-100 divide-y divide-gray-100">
                {sortedGroups.flatMap(g => g.document_items.map(item => {
                  // pricingEdits stores raw digit string; display with thousands separators.
                  const rawVal = pricingEdits[item.id] ?? String(item.final_price)
                  const displayVal = rawVal === '' ? '' : Number(rawVal).toLocaleString('en-US')
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{item.products?.name ?? 'Item'}</p>
                        <p className="text-[10px] text-gray-400">{g.name}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 tabular-nums shrink-0">orig {fmtKRW(item.final_price)}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={displayVal}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^0-9]/g, '')
                          setPricingEdits(p => ({ ...p, [item.id]: cleaned }))
                        }}
                        className="w-32 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] tabular-nums text-right" />
                      <span className="text-[10px] text-gray-400 shrink-0 w-3">₩</span>
                    </div>
                  )
                }))}
              </div>

              {(() => {
                const newTotal = sortedGroups
                  .flatMap(g => g.document_items)
                  .reduce((s, item) => s + (Number(pricingEdits[item.id] ?? item.final_price) || 0), 0)
                const diff = newTotal - latestQuote.total_price
                return (
                  <div className="flex items-baseline justify-between bg-white rounded-xl border border-violet-100 px-3 py-2">
                    <span className="text-xs text-gray-500">New Total</span>
                    <div className="flex items-baseline gap-3">
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{fmtUSD(newTotal / exchangeRate)}</span>
                      <span className="text-[11px] text-gray-400 tabular-nums">{fmtKRW(newTotal)}</span>
                      {diff !== 0 && (
                        <span className={`text-[10px] font-medium tabular-nums ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {diff > 0 ? '+' : ''}{fmtKRW(diff)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Payment Due Date — defaults to today + 7d, admin can override */}
              <div className="bg-white rounded-xl border border-violet-100 px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-700 font-medium">Payment Due Date</p>
                  <p className="text-[10px] text-gray-400">Default is 7 days from today. Adjust if the client needs more or less time.</p>
                </div>
                <input type="date" value={dueDateValue} min={today}
                  onChange={(e) => setDueDateEdit(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white" />
              </div>

              {(() => {
                const hasPricingChanges = sortedGroups
                  .flatMap(g => g.document_items)
                  .some(item => {
                    const v = pricingEdits[item.id]
                    return v !== undefined && Number(v) !== item.final_price
                  })
                const dueDateChanged = dueDateValue !== latestQuote.payment_due_date
                const isFirstFinalize = !latestQuote.finalized_at
                const buttonDisabled = savingPricing || (!isFirstFinalize && !hasPricingChanges && !dueDateChanged)
                return (
              <button
                disabled={buttonDisabled}
                onClick={async () => {
                  if (!latestQuote) return
                  setSavingPricing(true); setPricingError('')
                  try {
                    const items = sortedGroups.flatMap(g => g.document_items)
                    const newTotal = items.reduce((s, item) => s + (Number(pricingEdits[item.id] ?? item.final_price) || 0), 0)
                    const newDueDate = dueDateValue

                    // Update each quotation item whose final_price changed
                    for (const item of items) {
                      const newVal = Number(pricingEdits[item.id] ?? item.final_price) || 0
                      if (newVal !== item.final_price) {
                        await updateDocumentItemPrice(item.id, newVal)
                      }
                    }

                    const isFirstFinalize = !latestQuote.finalized_at
                    const totalChanged = newTotal !== latestQuote.total_price

                    // Capture current admin as signer snapshot
                    let signerSnapshot: { name: string | null; title: string | null } | null = null
                    {
                      const { data: { session } } = await supabase.auth.getSession()
                      const uid = session?.user?.id
                      if (uid) {
                        const { data: adminRow } = await supabase.from('admins')
                          .select('name, title').eq('auth_user_id', uid).maybeSingle()
                        if (adminRow) {
                          signerSnapshot = {
                            name: (adminRow as { name: string | null }).name ?? null,
                            title: (adminRow as { title: string | null }).title ?? null,
                          }
                        }
                      }
                    }

                    // Update quotation: lock pricing, record signer
                    if (isFirstFinalize) {
                      await finalizeDocument({
                        documentId: latestQuote.id,
                        totalPrice: newTotal,
                        paymentDueDate: newDueDate,
                        signerSnapshot,
                      })
                    } else {
                      await repriceDocument(latestQuote.id, newTotal, newDueDate)
                      if (signerSnapshot) {
                        await supabase.from('documents')
                          .update({ signer_snapshot: signerSnapshot })
                          .eq('id', latestQuote.id)
                      }
                    }

                    // First finalize: issue final_invoice mirroring quotation.
                    // Subsequent: sync existing final_invoice from quotation.
                    let invoiceNumber: string
                    if (isFirstFinalize) {
                      const inv = await issueInvoice({
                        caseId: caseData.id,
                        type: 'final_invoice',
                        copyItemsFromQuotation: true,
                        paymentDueDate: newDueDate,
                        signerSnapshot,
                      })
                      invoiceNumber = inv.document_number
                    } else {
                      await syncFinalInvoiceFromQuotation(caseData.id)
                      const inv = await getCaseFinalInvoice(caseData.id)
                      invoiceNumber = inv?.document_number ?? caseData.case_number
                      // Reprice with real change → re-arm "invoice opened" notification
                      if (totalChanged && inv) {
                        await supabase.from('documents')
                          .update({ first_opened_at: null, signer_snapshot: signerSnapshot ?? inv.signer_snapshot })
                          .eq('id', inv.id)
                      }
                    }

                    // First finalize → bump case to awaiting_payment so confirm-payment block opens.
                    if (isFirstFinalize) {
                      await supabase.from('cases').update({ status: 'awaiting_payment' }).eq('id', caseData.id)
                    }

                    const ref = invoiceNumber ?? caseData.case_number
                    let notifyMessage: string
                    if (isFirstFinalize) {
                      notifyMessage = `${ref} Pricing finalized — invoice ready to send`
                    } else {
                      // Reprice — build diff summary
                      const changedItems = items.filter(item => {
                        const newVal = Number(pricingEdits[item.id] ?? item.final_price) || 0
                        return newVal !== item.final_price
                      }).length
                      const dueChanged = newDueDate !== latestQuote.payment_due_date
                      const fmtKRWshort = (n: number) => `₩${n.toLocaleString('en-US')}`
                      const parts: string[] = []
                      if (totalChanged) parts.push(`Total ${fmtKRWshort(latestQuote.total_price)} → ${fmtKRWshort(newTotal)}`)
                      if (changedItems > 0) parts.push(`${changedItems} item${changedItems > 1 ? 's' : ''} repriced`)
                      if (dueChanged) parts.push(`Due ${latestQuote.payment_due_date ?? '—'} → ${newDueDate}`)
                      const header = `${ref} Invoice updated`
                      notifyMessage = parts.length === 0
                        ? header
                        : `${header}\n\n• ${parts.join('\n• ')}${totalChanged ? '\n\nPlease review before resending.' : ''}`
                    }
                    await notifyAgent(caseData.agent_id, notifyMessage, `/agent/cases/${caseData.id}`)
                    await logAsCurrentUser(isFirstFinalize ? 'quote.finalized' : 'quote.repriced',
                      { type: 'case', id: caseData.id, label: caseData.case_number },
                      { total_krw: newTotal, ...(totalChanged && !isFirstFinalize ? { previous_total_krw: latestQuote.total_price } : {}) })
                    setPricingEdits({})
                    setDueDateEdit('')
                    setEditingPricing(false)
                    await fetchCase()
                  } catch (e: unknown) {
                    setPricingError((e as { message?: string })?.message ?? 'Failed.')
                  } finally { setSavingPricing(false) }
                }}
                className="w-full py-2.5 text-sm font-medium bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-40 transition-colors">
                {savingPricing ? 'Saving...' : latestQuote.finalized_at ? 'Save Pricing Changes' : 'Finalize Pricing & Issue Invoice'}
              </button>
                )
              })()}
            </section>
            )
          })()}

          {/* Confirm Payment — only after pricing finalized */}
          {caseData.status === 'awaiting_payment' && !editingPricing && (
            <section id="confirm-payment" className="scroll-mt-20 border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Confirm Payment</p>
                <button onClick={() => { setEditingPricing(true); setPricingEdits({}); setPricingError('') }}
                  className="text-[10px] text-violet-700 hover:underline">Edit pricing</button>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Payment Date <span className="text-amber-700">*</span></label>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                  min={caseData.created_at.slice(0, 10)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35] bg-white" />
              </div>
              <button onClick={confirmPayment} disabled={confirmingPayment || !paymentDate}
                className="w-full py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                {confirmingPayment ? 'Confirming...' : 'Confirm Payment'}
              </button>
            </section>
          )}

          {/* Blocked upload placeholder when schedule isn't ready */}
          {!scheduleReady
            && (caseData.status === 'awaiting_info' || caseData.status === 'awaiting_schedule' || caseData.status === 'reviewing_schedule')
            && (latestSchedule === null || latestSchedule.status === 'revision_requested') && (
            <section className="border border-gray-200 bg-gray-50 rounded-2xl p-4 space-y-2 opacity-80">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upload Schedule</p>
              <p className="text-xs text-gray-500">
                {[
                  !caseInfoComplete && 'Trip info incomplete',
                  !allClientsComplete && 'Client info incomplete',
                  !groupsComplete && 'Groups not fully assigned',
                ].filter(Boolean).join(' · ')}. Upload is disabled until the agent resolves this.
              </p>
              <div className="flex flex-col items-center justify-center gap-1 w-full py-6 text-sm font-medium rounded-xl border-2 border-dashed border-gray-300 text-gray-400 cursor-not-allowed">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                <span>Waiting for agent</span>
              </div>
            </section>
          )}

          {canUploadSchedule && (
            <section id="schedule-upload" className={`scroll-mt-20 border rounded-2xl p-4 space-y-3 ${caseData.status === 'awaiting_schedule' ? 'border-blue-200 bg-blue-50' : 'border-violet-200 bg-violet-50'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${caseData.status === 'awaiting_schedule' ? 'text-blue-700' : 'text-violet-700'}`}>
                {sortedSchedules.length === 0 ? 'Upload Schedule' : `Upload New Version (v${(latestSchedule?.version ?? 0) + 1})`}
              </p>
              {!stagedFile && sortedSchedules.length === 0 && (
                <p className="text-xs text-blue-600">Select or drag a PDF. You&apos;ll review it before committing.</p>
              )}

              {!stagedFile ? (
                <label
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('ring-2') }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('ring-2') }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    e.currentTarget.classList.remove('ring-2')
                    const f = e.dataTransfer.files?.[0]
                    if (f) stageFile(f)
                  }}
                  className={`flex flex-col items-center justify-center gap-1 w-full py-6 text-sm font-medium rounded-xl border-2 border-dashed cursor-pointer ring-offset-1 transition-all ${caseData.status === 'awaiting_schedule' ? 'border-blue-300 text-blue-700 hover:bg-blue-100 ring-blue-300' : 'border-violet-300 text-violet-700 hover:bg-violet-100 ring-violet-300'}`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                  <span>Click or drag PDF here</span>
                  <input type="file" accept="application/pdf" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) stageFile(f); e.currentTarget.value = '' }} />
                </label>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <svg className="w-8 h-8 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 break-all">{stagedFile.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{(stagedFile.size / 1024).toFixed(1)} KB · PDF</p>
                    </div>
                    {stagedFileUrl && (
                      <a href={stagedFileUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-medium text-[#0f4c35] hover:underline shrink-0">Preview ↗</a>
                    )}
                  </div>

                  <p className="text-[11px] text-gray-500">Open the preview to review the PDF, then confirm to publish this version to the agent.</p>

                  {/* Note for agent — only shown on revisions (v2+) since v1 has no prior version to diff against */}
                  {sortedSchedules.length > 0 && (
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">
                        What changed? <span className="text-gray-400">(helps agent see what was updated)</span>
                      </label>
                      <textarea
                        value={stagedNote}
                        onChange={(e) => setStagedNote(e.target.value)}
                        placeholder="e.g. Moved hospital appointment to afternoon, swapped day 3 and day 4."
                        rows={3}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] resize-none" />
                    </div>
                  )}

                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={cancelStaged} disabled={uploadingSchedule}
                      className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg disabled:opacity-40">
                      Cancel
                    </button>
                    <button onClick={confirmUpload} disabled={uploadingSchedule}
                      className="text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-3 py-1.5 rounded-lg disabled:opacity-40">
                      {uploadingSchedule ? 'Uploading...' : 'Confirm Upload'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {caseData.status === 'awaiting_travel' && (
            <section className="border border-emerald-200 bg-emerald-50 rounded-2xl p-4">
              <p className="text-xs text-emerald-700">Agent will mark travel complete after the trip.</p>
            </section>
          )}
          {/* Partner Payouts — track cash sent to hospitals/hotels/etc per partner */}
          {latestQuote && (() => {
            type PartnerItem = { name: string; price: number; group: string; qty: number }
            type PartnerGroup = { name: string; suggested: number; items: PartnerItem[] }
            const groups = new Map<string, PartnerGroup>()
            for (const g of latestQuote.document_groups ?? []) {
              for (const item of g.document_items ?? []) {
                const pname = item.products?.partner_name?.trim()
                if (!pname) continue
                const prev = groups.get(pname) ?? { name: pname, suggested: 0, items: [] }
                prev.suggested += item.base_price ?? 0
                prev.items.push({
                  name: item.products?.name ?? 'Service',
                  price: item.base_price ?? 0,
                  group: g.name,
                  qty: g.member_count ?? 1,
                })
                groups.set(pname, prev)
              }
            }
            const partnerList = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
            if (partnerList.length === 0) return null

            const totalPaid = partnerPayments.reduce((s, p) => s + (p.amount ?? 0), 0)
            const totalSuggested = partnerList.reduce((s, g) => s + g.suggested, 0)
            const allPaid = partnerList.every(g => partnerPayments.some(p => p.partner_name === g.name))
            // Partners can only be paid out after we've received client payment
            const paymentReceived = caseData.status === 'awaiting_travel' || caseData.status === 'completed'

            return (
              <section className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Partner Payouts</p>
                  <div className="flex items-baseline gap-3 text-[10px] text-gray-500">
                    <span>Paid <span className="font-semibold tabular-nums text-gray-700">{fmtUSD(totalPaid / exchangeRate)}</span> of {fmtUSD(totalSuggested / exchangeRate)}</span>
                    {allPaid && <span className="text-emerald-700 font-medium">All settled ✓</span>}
                  </div>
                </div>

                {!paymentReceived && (
                  <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs text-gray-500">
                    Partner payouts are unlocked once client payment is confirmed.
                  </div>
                )}

                {partnerError && <p className="text-xs text-red-500">{partnerError}</p>}

                <div className="space-y-2">
                  {!paymentReceived && partnerList.map(g => (
                    <div key={g.name} className="bg-white rounded-xl border border-gray-100 p-3 space-y-2 opacity-60">
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">{g.name}</p>
                          <p className="text-[10px] text-gray-400">{g.items.length} item{g.items.length !== 1 ? 's' : ''} · suggested {fmtUSD(g.suggested / exchangeRate)}</p>
                        </div>
                        <span className="text-sm text-gray-500 tabular-nums">{fmtUSD(g.suggested / exchangeRate)}</span>
                      </div>
                      <ul className="text-[10px] text-gray-500 space-y-0.5 pl-4 border-l border-gray-100">
                        {g.items.map((it, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span className="truncate">
                              {it.name}
                              <span className="text-gray-400"> · {it.group} ({it.qty} pax)</span>
                            </span>
                            <span className="text-gray-400 tabular-nums shrink-0">{fmtKRW(it.price)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {paymentReceived && partnerList.map(g => {
                    const existing = partnerPayments.find(p => p.partner_name === g.name)
                    const edit = partnerEdits[g.name]
                    const editing = !!edit
                    const saving = savingPartner === g.name

                    if (existing && !editing) {
                      // Paid view
                      return (
                        <div key={g.name} className="bg-white rounded-xl border border-emerald-200 p-3 flex items-center gap-3 flex-wrap">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{g.name}</p>
                            <p className="text-[10px] text-gray-500">{g.items.length} item{g.items.length !== 1 ? 's' : ''} · paid {existing.paid_at}{existing.note ? ` · ${existing.note}` : ''}</p>
                          </div>
                          <span className="text-right tabular-nums">
                            <span className="text-sm font-semibold text-emerald-700">{fmtUSD(existing.amount / exchangeRate)}</span>
                            <span className="text-[10px] text-gray-400 ml-2">{fmtKRW(existing.amount)}</span>
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setPartnerEdits(p => ({ ...p, [g.name]: { amount: String(existing.amount), paid_at: existing.paid_at, note: existing.note ?? '' } }))}
                              className="text-[10px] text-gray-400 hover:text-gray-700">Edit</button>
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete partner payment for ${g.name}?`)) return
                                setSavingPartner(g.name); setPartnerError('')
                                try {
                                  const { error } = await supabase.from('partner_payments').delete().eq('id', existing.id)
                                  if (error) throw error
                                  await fetchCase()
                                } catch (e: unknown) {
                                  setPartnerError((e as { message?: string })?.message ?? 'Failed.')
                                } finally { setSavingPartner(null) }
                              }}
                              className="text-[10px] text-red-500 hover:text-red-700">Delete</button>
                          </div>
                        </div>
                      )
                    }

                    // Edit / unpaid input
                    const amount = edit?.amount ?? String(Math.round(g.suggested))
                    const paid_at = edit?.paid_at ?? new Date().toISOString().slice(0, 10)
                    const note = edit?.note ?? ''
                    const setField = (key: 'amount' | 'paid_at' | 'note', v: string) =>
                      setPartnerEdits(p => ({ ...p, [g.name]: { ...{ amount, paid_at, note }, ...(p[g.name] ?? {}), [key]: v } }))

                    return (
                      <div key={g.name} className={`bg-white rounded-xl border p-3 space-y-2 ${existing ? 'border-emerald-200' : 'border-gray-200'}`}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${existing ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{g.name}</p>
                            <p className="text-[10px] text-gray-500">{g.items.length} item{g.items.length !== 1 ? 's' : ''} · suggested {fmtUSD(g.suggested / exchangeRate)} · {fmtKRW(g.suggested)}</p>
                          </div>
                        </div>
                        <ul className="text-[10px] text-gray-500 space-y-0.5 pl-4 border-l border-gray-100">
                          {g.items.map((it, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span className="truncate">
                                {it.name}
                                <span className="text-gray-400"> · {it.group} ({it.qty} pax)</span>
                              </span>
                              <span className="text-gray-400 tabular-nums shrink-0">{fmtKRW(it.price)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1">Amount (KRW)</label>
                            <input value={amount} onChange={e => setField('amount', e.target.value.replace(/[^0-9]/g, ''))} type="text" inputMode="numeric"
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1">Paid On</label>
                            <input value={paid_at} onChange={e => setField('paid_at', e.target.value)} type="date"
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-1">Note (optional)</label>
                            <input value={note} onChange={e => setField('note', e.target.value)} placeholder="Bank ref, etc."
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          {edit && (
                            <button onClick={() => setPartnerEdits(p => { const n = { ...p }; delete n[g.name]; return n })}
                              className="text-xs text-gray-400 hover:text-gray-700">Cancel</button>
                          )}
                          <button
                            disabled={saving || !amount || Number(amount) <= 0 || !paid_at}
                            onClick={async () => {
                              setSavingPartner(g.name); setPartnerError('')
                              try {
                                const { data: { session } } = await supabase.auth.getSession()
                                const { data: adminRow } = await supabase.from('admins').select('id').eq('auth_user_id', session?.user?.id ?? '').maybeSingle()
                                const payload = {
                                  case_id: caseData.id,
                                  partner_name: g.name,
                                  amount: Number(amount),
                                  paid_at,
                                  note: note.trim() || null,
                                  paid_by: adminRow?.id ?? null,
                                }
                                if (existing) {
                                  const { error } = await supabase.from('partner_payments').update(payload).eq('id', existing.id)
                                  if (error) throw error
                                } else {
                                  const { error } = await supabase.from('partner_payments').insert(payload)
                                  if (error) throw error
                                }
                                await logAsCurrentUser('partner.paid',
                                  { type: 'case', id: caseData.id, label: caseData.case_number },
                                  { partner_name: g.name, amount_krw: Number(amount), paid_at })
                                setPartnerEdits(p => { const n = { ...p }; delete n[g.name]; return n })
                                await fetchCase()
                              } catch (e: unknown) {
                                setPartnerError((e as { message?: string })?.message ?? 'Failed.')
                              } finally { setSavingPartner(null) }
                            }}
                            className="px-3 py-1 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                            {saving ? 'Saving...' : existing ? 'Save' : 'Mark Paid'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })()}

          {/* Agent Settlement — commission paid to the agent (1 per case) */}
          {latestQuote && (() => {
            const total = latestQuote.total_price ?? 0
            const ag = latestQuote.agent_margin_rate ?? 0
            const commissionAmount = ag > 0 ? Math.round(total * ag / (1 + ag)) : 0
            const isCompleted = caseData.status === 'completed'
            const paid = !!agentSettlement?.paid_at

            const agent = getAgent(caseData)

            return (
              <section className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Agent Settlement</p>
                  {paid ? (
                    <span className="text-[10px] text-emerald-700 font-medium">Settled ✓</span>
                  ) : !isCompleted ? (
                    <span className="text-[10px] text-gray-400">Available after travel completion</span>
                  ) : (
                    <span className="text-[10px] text-amber-700 font-medium">Pending</span>
                  )}
                </div>

                {agentSettleError && <p className="text-xs text-red-500">{agentSettleError}</p>}

                {paid && agentSettlement ? (
                  <div className="bg-white rounded-xl border border-emerald-200 p-3 flex items-center gap-3 flex-wrap">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{agent?.name ?? '—'}</p>
                      <p className="text-[10px] text-gray-500">
                        {agentSettlement.settlement_number ?? ''} · paid {agentSettlement.paid_at}
                      </p>
                    </div>
                    <span className="text-right tabular-nums">
                      <span className="text-sm font-semibold text-emerald-700">{fmtUSD(agentSettlement.amount / exchangeRate)}</span>
                      <span className="text-[10px] text-gray-400 ml-2">{fmtKRW(agentSettlement.amount)}</span>
                    </span>
                  </div>
                ) : isCompleted ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{agent?.name ?? '—'}</p>
                        <p className="text-[10px] text-gray-500">commission @ {(ag * 100).toFixed(0)}% margin</p>
                      </div>
                      <span className="text-right tabular-nums">
                        <span className="text-sm font-semibold text-gray-900">{fmtUSD(commissionAmount / exchangeRate)}</span>
                        <span className="text-[10px] text-gray-400 ml-2">{fmtKRW(commissionAmount)}</span>
                      </span>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] text-gray-500 mb-1">Paid On</label>
                        <input value={agentSettlePaidAt} onChange={e => setAgentSettlePaidAt(e.target.value)} type="date"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                      </div>
                      <button
                        disabled={savingAgentSettle || !agentSettlePaidAt || commissionAmount <= 0}
                        onClick={async () => {
                          if (!caseData) return
                          setSavingAgentSettle(true); setAgentSettleError('')
                          try {
                            const { count } = await supabase.from('settlements').select('*', { count: 'exact', head: true })
                            const next = (count ?? 0) + 1
                            const settlementNumber = `#S-${String(next).padStart(3, '0')}`
                            const { error } = await supabase.from('settlements').insert({
                              settlement_number: settlementNumber,
                              agent_id: caseData.agent_id,
                              case_id: caseData.id,
                              amount: commissionAmount,
                              paid_at: agentSettlePaidAt,
                            })
                            if (error) throw error
                            await notifyAgent(caseData.agent_id,
                              `${caseData.case_number} Settlement paid — ${fmtUSD(commissionAmount / exchangeRate)}`,
                              '/agent/payouts')
                            await logAsCurrentUser('settlement.paid',
                              { type: 'case', id: caseData.id, label: caseData.case_number },
                              { amount_krw: commissionAmount, paid_at: agentSettlePaidAt, settlement_number: settlementNumber })
                            await fetchCase()
                          } catch (e: unknown) {
                            setAgentSettleError((e as { message?: string })?.message ?? 'Failed.')
                          } finally { setSavingAgentSettle(false) }
                        }}
                        className="px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 shrink-0">
                        {savingAgentSettle ? 'Saving...' : 'Mark Paid'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 opacity-60">
                    <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-500">{agent?.name ?? '—'} · {(ag * 100).toFixed(0)}% margin</p>
                      <p className="text-[10px] text-gray-400">Mark Travel Complete first to settle</p>
                    </div>
                    <span className="text-right tabular-nums">
                      <span className="text-sm text-gray-500">{fmtUSD(commissionAmount / exchangeRate)}</span>
                    </span>
                  </div>
                )}
              </section>
            )
          })()}

        </div>

        {/* RIGHT — Selected Products */}
        <div className="w-full md:w-1/2 overflow-y-auto px-4 md:px-6 py-4 md:py-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Selected Products</p>

          {sortedGroups.length === 0 ? (
            <p className="text-sm text-gray-300">No products selected.</p>
          ) : (
            <div className="space-y-4">
              {sortedGroups.map((group) => {
                const memberCount = Math.max(group.member_count ?? 1, 1)
                const groupTotal = group.document_items.reduce((s, item) => s + item.final_price, 0)
                return (
                  <div key={group.id} className="bg-gray-50 rounded-2xl overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                      <span className="text-sm font-semibold text-gray-800">{group.name}</span>
                      <span className="text-[11px] text-gray-500">{memberCount} pax · {group.document_items.length} item{group.document_items.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Item rows */}
                    <div className="divide-y divide-gray-200">
                      {group.document_items.map((item) => {
                        const amtKRW = item.final_price
                        const amtUSD = amtKRW / exchangeRate
                        return (
                          <div key={item.id} className="flex items-start gap-3 px-4 py-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{item.products?.name ?? '—'}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">{fmtKRW(amtKRW / memberCount)} × {memberCount}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-gray-800">{fmtUSD(amtUSD)}</p>
                              <p className="text-[10px] text-gray-400">{fmtKRW(amtKRW)}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Subtotal */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-100/70 border-t border-gray-200">
                      <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Subtotal</span>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-900">{fmtUSD(groupTotal / exchangeRate)}</span>
                        <span className="text-[10px] text-gray-500 ml-2">{fmtKRW(groupTotal)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {latestQuote && (
                <div className="flex items-center justify-between px-4 py-3 border-t-2 border-gray-300">
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
