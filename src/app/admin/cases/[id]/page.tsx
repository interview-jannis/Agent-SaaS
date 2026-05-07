'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { notifyAgent } from '@/lib/notifications'
import { logAsCurrentUser } from '@/lib/audit'
import { type CaseStatus, STATUS_LABELS, STATUS_STYLES } from '@/lib/caseStatus'
import { AdminCaseHero } from '@/components/CaseHeroAction'
import { useCaseRealtime } from '@/hooks/useCaseRealtime'
import CaseDocumentsSection from '@/components/CaseDocumentsSection'
import AdminCaseContractSection from '@/components/AdminCaseContractSection'
import SelectedProductsSection from '@/components/SelectedProductsSection'
import ScheduleEditor from '@/components/admin/ScheduleEditor'
import { SCHEDULE_BLOCK_LABEL, compareScheduleItems } from '@/types/schedule'
import type { DocumentRow } from '@/lib/documents'
import type { ScheduleItem } from '@/types/schedule'
import { nightsBetween } from '@/lib/pricing'
import type { SurveyRow } from '@/lib/surveys'

import type { ClientInfo, FlightInfo } from '@/lib/clientCompleteness'
import { getMissingClientFields, getMissingCaseFields, CLIENT_INFO_COLUMNS } from '@/lib/clientCompleteness'
import {
  finalizeDocument,
  repriceDocument,
  updateDocumentItemPrice,
  addDocumentItem,
  removeDocumentItem,
  recalcDocumentTotal,
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
  variant_id: string | null
  variant_label_snapshot: string | null
  origin?: 'original' | 'admin_added'
  removed_at?: string | null
  products: { id: string; name: string; description: string | null; partner_name: string | null; duration_value?: number | null; duration_unit?: string | null; has_female_doctor?: boolean | null; has_prayer_room?: boolean | null; dietary_type?: string | null; location_address?: string | null; product_categories?: { name: string } | null } | null
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
  payment_received_at: string | null
  from_party: 'admin' | 'agent'
  to_party: 'client' | 'agent' | 'admin'
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
  items: ScheduleItem[] | null
  status: ScheduleStatus
  version: number
  file_name: string | null
  revision_note: string | null
  admin_note: string | null
  confirmed_at: string | null
  created_at: string
  first_opened_at: string | null
  concierge_name: string | null
  concierge_phone: string | null
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
  agent_notes: string | null
  schedule_draft_items: import('@/types/schedule').ScheduleItem[] | null
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
  const [caseSurvey, setCaseSurvey] = useState<SurveyRow | null>(null)

  // Action states
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Pricing finalize state — keyed by quote_item.id
  const [pricingEdits, setPricingEdits] = useState<Record<string, string>>({})
  const [editingPricing, setEditingPricing] = useState(false)
  const [savingPricing, setSavingPricing] = useState(false)
  const [pricingError, setPricingError] = useState('')
  const [dueDateEdit, setDueDateEdit] = useState<string>('')

  // Item editor state — used by both Edit Selected Products section (awaiting_schedule)
  // and Finalize Pricing section (awaiting_pricing). The structural picker only
  // operates during awaiting_schedule via direct-write helpers (no staging).
  type ItemCurrency = 'KRW' | 'USD'
  // Per-existing-item display currency (data is always stored in KRW)
  const [pricingCurrencies, setPricingCurrencies] = useState<Record<string, ItemCurrency>>({})
  type ProductVariant = { id: string; variant_label: string | null; base_price: number; price_currency: ItemCurrency; is_active: boolean; sort_order: number }
  type ProductRow = {
    id: string; name: string; partner_name: string | null;
    base_price: number; price_currency: ItemCurrency | null;
    category_name: string | null; subcategory_name: string | null;
    category_sort: number;
    variants: ProductVariant[];
  }
  const [products, setProducts] = useState<ProductRow[]>([])
  // Product whose variants are expanded in the picker dropdown — only used
  // when a product has 2+ active variants (e.g., Beauty brand options, Hotel
  // room tiers).
  const [pickerExpandedProduct, setPickerExpandedProduct] = useState<string | null>(null)
  const [pickerCategoryFilter, setPickerCategoryFilter] = useState<string>('')
  const [pickerSubcategoryFilter, setPickerSubcategoryFilter] = useState<string>('')
  const [pickerGroupId, setPickerGroupId] = useState<string>('')
  const [pickerQuery, setPickerQuery] = useState<string>('')
  const [pickerOpen, setPickerOpen] = useState<boolean>(false)
  // Transient action ids (one in flight at a time)
  const [structuralBusy, setStructuralBusy] = useState<string | null>(null)
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null)
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  // Edit Selected Products — staged add/remove diff. Save commits all changes
  // in one batch; Cancel discards. Existing items removed are marked (not
  // deleted) so user can undo before save; staged adds are virtual rows.
  type StagedAdd = {
    tempId: string
    productId: string
    productName: string
    partnerName: string | null
    variantId: string | null
    variantLabel: string | null
    basePrice: number
    finalPrice: number
    priceCurrency: ItemCurrency
    groupId: string
    groupName: string
  }
  const [stagedAdds, setStagedAdds] = useState<StagedAdd[]>([])
  const [stagedRemoves, setStagedRemoves] = useState<Set<string>>(new Set())
  const [savingItems, setSavingItems] = useState(false)
  const [editingProducts, setEditingProducts] = useState(false)

  // Trip Setup collapse — defaults to collapsed when all info is complete.
  const [setupCollapsed, setSetupCollapsed] = useState(false)
  const [setupCollapseInitialized, setSetupCollapseInitialized] = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchCase = useCallback(async () => {
    const { data, error } = await supabase
      .from('cases')
      .select(`
        id, case_number, status, agent_id, travel_start_date, travel_end_date,
        payment_date, payment_confirmed_at, created_at,
        concept, outbound_flight, inbound_flight, cancellation_reason, agent_notes, schedule_draft_items,
        agents!cases_agent_id_fkey(id, agent_number, name),
        case_members(
          id, is_lead,
          clients(client_number, nationality, date_of_birth, phone, email, special_requests, ${CLIENT_INFO_COLUMNS})
        ),
        documents(
          id, type, document_number, slug, total_price, payment_due_date, payment_received_at, agent_margin_rate, company_margin_rate, finalized_at, from_party, to_party, created_at,
          document_groups(id, name, order, member_count, document_items(id, base_price, final_price, variant_id, variant_label_snapshot, origin, removed_at, products(id, name, description, partner_name, duration_value, duration_unit, has_female_doctor, has_prayer_room, dietary_type, location_address, product_categories(name))), document_group_members(id, case_member_id))
        ),
        schedules(id, slug, pdf_url, items, status, version, file_name, revision_note, admin_note, confirmed_at, created_at, first_opened_at, concierge_name, concierge_phone)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) console.error('[case] fetch error:', error)
    if (!data) { setNotFound(true); return }
    setCaseData(data as unknown as Case)

    const [{ data: pp }, { data: ss }, { data: sv }] = await Promise.all([
      supabase.from('partner_payments')
        .select('id, case_id, partner_name, amount, paid_at, note, created_at')
        .eq('case_id', id),
      supabase.from('settlements')
        .select('id, settlement_number, agent_id, case_id, amount, paid_at, created_at')
        .eq('case_id', id)
        .maybeSingle(),
      supabase.from('surveys')
        .select('id, case_id, responses, submitted_by_actor_type, submitted_by_actor_id, submitted_at, created_at')
        .eq('case_id', id)
        .maybeSingle(),
    ])
    setPartnerPayments((pp as PartnerPayment[]) ?? [])
    setAgentSettlement((ss as AgentSettlement | null) ?? null)
    setCaseSurvey((sv as SurveyRow | null) ?? null)

    // Self-heal: opportunistically advance status if both deposit legs are
    // paid / info is complete. Cheap no-op when already advanced or not eligible.
    const fresh = data as unknown as Case | null
    if (fresh && (fresh.status === 'awaiting_info' || fresh.status === 'awaiting_deposit')) {
      try {
        const { notifyCaseInfoChanged } = await import('@/lib/caseTransitions')
        await notifyCaseInfoChanged(fresh.id)
      } catch { /* noop */ }
    }
  }, [id])

  // Realtime: re-fetch when this case's row or its contracts/documents/schedules
  // change anywhere (e.g., agent generates contract, client signs, schedule confirmed).
  useCaseRealtime(id, fetchCase)

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

  // Load active products with their variants + category/subcategory names for
  // the staging picker. Variants matter so admin staging produces document_items
  // with the correct variant_id + variant_label_snapshot (parity with agent's
  // home-page cart). Category names drive the picker filter dropdowns.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('products')
        .select('id, name, partner_name, base_price, price_currency, is_active, product_categories(name, sort_order), product_subcategories(name), product_variants(id, variant_label, base_price, price_currency, is_active, sort_order)')
        .order('name', { ascending: true })
      if (error) { console.error('[case] products fetch error:', error); return }
      if (cancelled) return
      type CategoryRel = { name: string | null; sort_order?: number | null } | { name: string | null; sort_order?: number | null }[] | null
      type SubRel = { name: string | null } | { name: string | null }[] | null
      type Raw = {
        id: string; name: string; partner_name: string | null;
        base_price: number; price_currency: 'KRW' | 'USD' | null; is_active: boolean | null;
        product_categories: CategoryRel;
        product_subcategories: SubRel;
        product_variants: Array<{ id: string; variant_label: string | null; base_price: number; price_currency: 'KRW' | 'USD' | null; is_active: boolean | null; sort_order: number | null }>
      }
      const rows = (data ?? []) as unknown as Raw[]
      const pickName = <T extends { name: string | null }>(rel: T | T[] | null): string | null => {
        if (!rel) return null
        if (Array.isArray(rel)) return rel[0]?.name ?? null
        return rel.name ?? null
      }
      const pickCategorySort = (rel: CategoryRel): number => {
        if (!rel) return 9999
        const r = Array.isArray(rel) ? rel[0] : rel
        return r?.sort_order ?? 9999
      }
      const out: ProductRow[] = rows.filter(r => r.is_active !== false).map(r => ({
        id: r.id,
        name: r.name,
        partner_name: r.partner_name,
        base_price: r.base_price,
        price_currency: r.price_currency,
        category_name: pickName(r.product_categories),
        subcategory_name: pickName(r.product_subcategories),
        category_sort: pickCategorySort(r.product_categories),
        variants: (r.product_variants ?? [])
          .filter(v => v.is_active !== false)
          .map(v => ({
            id: v.id,
            variant_label: v.variant_label,
            base_price: v.base_price,
            price_currency: (v.price_currency === 'USD' ? 'USD' : 'KRW') as ItemCurrency,
            is_active: v.is_active !== false,
            sort_order: v.sort_order ?? 0,
          }))
          .sort((a, b) => b.base_price - a.base_price || a.sort_order - b.sort_order),
      }))
      setProducts(out)
    })()
    return () => { cancelled = true }
  }, [])

  // First time data resolves and Trip Setup is fully ready, default to collapsed.
  // Placed BEFORE early returns so the hook count is stable across renders.
  useEffect(() => {
    if (setupCollapseInitialized || !caseData) return
    const allMembersOk = caseData.case_members.length > 0
      && caseData.case_members.every(m => getMissingClientFields(m.clients).length === 0)
    const tripOk = getMissingCaseFields(caseData).length === 0
    const quotation = caseData.documents?.find(d => d.type === 'quotation')
    const groupsOk = !quotation?.document_groups?.length
      || quotation.document_groups.every(g => (g.document_group_members?.length ?? 0) === g.member_count)
    if (allMembersOk && tripOk && groupsOk && caseData.travel_start_date) {
      setSetupCollapsed(true)
    }
    setSetupCollapseInitialized(true)
  }, [setupCollapseInitialized, caseData])

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
  // Info-missing warnings only matter while the case is still in awaiting_info
  // (the info-collection stage). Once it moves on, gaps are no longer the
  // active task — keep boxes neutral so they don't add noise.
  const flagMissingInfo = caseData.status === 'awaiting_info'
  const scheduleReady = allClientsComplete && groupsComplete && caseInfoComplete
  // Schedule is locked once the agent confirms (or beyond) — no more uploads or deletes.
  const scheduleLocked =
    caseData.status === 'awaiting_pricing'
    || caseData.status === 'awaiting_payment'
    || caseData.status === 'awaiting_travel'
    || caseData.status === 'awaiting_review'
    || caseData.status === 'completed'
    || caseData.status === 'canceled'
  const canUploadSchedule = scheduleReady
    && (
      // First build: no schedule yet (or stale pending draft before first send)
      caseData.status === 'awaiting_schedule'
      // Revision: agent requested changes — allow a new version
      || (caseData.status === 'reviewing_schedule' && latestSchedule?.status === 'revision_requested')
    )
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

      {/* Single column scrollable body (matches agent layout) */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5">

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
            depositPaid={(caseData.documents ?? []).some(d => d.type === 'deposit_invoice' && d.from_party === 'agent' && d.to_party === 'client' && !!d.payment_received_at)}
            depositSettlementPaid={(caseData.documents ?? []).some(d => d.type === 'deposit_invoice' && d.from_party === 'admin' && d.to_party === 'agent' && !!d.payment_received_at)}
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

          {/* ─── TRIP SETUP — Travel + Trip Info + Lead Client + Members all-in-one ─── */}
          <section className="bg-gray-50 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Trip Setup</h3>
                {(caseInfoComplete && allClientsComplete && groupsComplete && caseData.travel_start_date) ? (
                  <span className="text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">Ready</span>
                ) : flagMissingInfo ? (
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">In progress</span>
                ) : (
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">In progress</span>
                )}
              </div>
              <button onClick={() => setSetupCollapsed(!setupCollapsed)}
                className="text-[11px] font-medium text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-100">
                {setupCollapsed ? '▼ Expand' : '▲ Collapse'}
              </button>
            </div>

            {setupCollapsed ? (
              <div className="text-xs text-gray-600 space-y-0.5">
                <p>{caseData.travel_start_date ? `Travel ${caseData.travel_start_date} → ${caseData.travel_end_date ?? '—'}` : 'Travel dates not set'}</p>
                <p>{caseData.case_members.length} member{caseData.case_members.length === 1 ? '' : 's'}{lead?.clients?.name ? ` · Lead ${lead.clients.name}` : ''}</p>
                <p>{caseInfoComplete ? '✓ Trip info complete' : '✗ Trip info incomplete'} · {allClientsComplete ? '✓ All clients complete' : '✗ Clients pending'} · {groupsComplete ? '✓ Groups assigned' : '✗ Groups incomplete'}</p>
              </div>
            ) : (
            <>

          {/* Travel Period */}
          <div>
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
          </div>

          {/* Trip Info (case-level, read-only) */}
          <div className={`pt-4 border-t border-gray-200 ${flagMissingInfo && !caseInfoComplete ? '-mx-1 px-1 py-2 rounded-xl bg-green-50 border border-green-200' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trip Info</p>
              {flagMissingInfo && !caseInfoComplete && <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Incomplete</span>}
            </div>
            {flagMissingInfo && !caseInfoComplete && (
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
          </div>

          {/* Lead Client */}
          {lead && (
            <div className="pt-4 border-t border-gray-200">
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
                  <div className="col-span-2"><span className="text-xs px-2 py-0.5 bg-green-50 text-[#0f4c35] rounded-full">Muslim Friendly</span></div>
                )}
                {lead.clients.special_requests && (
                  <div className="col-span-2"><p className="text-[10px] text-gray-400 mb-0.5">Special Requests</p><p className="text-gray-800 text-sm">{lead.clients.special_requests}</p></div>
                )}
              </div>
            </div>
          )}

          {/* Members + Readiness (merged) */}
          {(() => {
            const memberShortfall = expectedMemberCount > 0 && caseData.case_members.length < expectedMemberCount
            const groupGaps = latestQuote?.document_groups?.filter(g => (g.document_group_members?.length ?? 0) !== g.member_count) ?? []
            const issueCount = (memberShortfall ? 1 : 0) + groupGaps.length + clientsMissingInfo.length
            const ready = issueCount === 0 && caseData.case_members.length > 0
            return (
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Members ({caseData.case_members.length}{expectedMemberCount > 0 ? ` / ${expectedMemberCount}` : ''})
                  </h3>
                  {ready
                    ? <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">Ready</span>
                    : flagMissingInfo
                      ? <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{issueCount} issue{issueCount > 1 ? 's' : ''}</span>
                      : null}
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

                {!ready && flagMissingInfo && (
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
              </div>
            )
          })()}

            </>
            )}
          </section>
          {/* ─── /TRIP SETUP ─── */}

          {/* Agent notes — red highlight only while active; muted once case is at review/settlement/completed */}
          {caseData.agent_notes && (() => {
            const isDone = caseData.status === 'awaiting_review' || caseData.status === 'awaiting_settlement' || caseData.status === 'completed'
            return (
              <div className={`rounded-xl p-3 space-y-1 ${isDone ? 'bg-gray-50 border border-gray-200' : 'bg-white border border-gray-200'}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDone ? 'text-gray-400' : 'text-gray-700'}`}>Notes from agent</p>
                <p className="text-xs text-gray-800 whitespace-pre-wrap">{caseData.agent_notes}</p>
              </div>
            )
          })()}

          {/* Client Review — shown once survey is submitted */}
          {caseSurvey && (() => {
            const isHighlight = caseData.status === 'awaiting_settlement' || caseData.status === 'completed'
            return (
              <div className={`rounded-xl p-4 space-y-3 ${isHighlight ? 'bg-teal-50 border-2 border-teal-300' : 'bg-gray-50 border border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${isHighlight ? 'text-teal-700' : 'text-gray-400'}`}>Client Review</p>
                  <span className="text-[10px] text-gray-400">Submitted {new Date(caseSurvey.submitted_at).toLocaleString()}</span>
                </div>
                <div className="space-y-2">
                  {(caseSurvey.responses ?? []).map(r => (
                    <div key={r.question_id} className="bg-white rounded-lg p-3 border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">{r.prompt}</p>
                      {r.type === 'rating' ? (
                        <p className="text-sm text-gray-900">{'⭐'.repeat(r.rating ?? 0)}<span className="text-gray-400 ml-2 text-xs">{r.rating}/5</span></p>
                      ) : (
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.text || <span className="text-gray-300">(no comment)</span>}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* 3-Party Contract */}
          {caseData.status !== 'canceled' && caseData.status !== 'awaiting_info' && (
            <AdminCaseContractSection
              caseId={caseData.id}
              caseNumber={caseData.case_number}
              caseStatus={caseData.status}
              onChanged={async () => { await fetchCase() }}
            />
          )}

          {/* Selected Products — unified view/edit section */}
          {(caseData.documents?.length ?? 0) > 0 && (() => {
            const canEditProducts =
              caseData.status === 'awaiting_schedule'
              && !!latestQuote && !latestQuote.finalized_at
              && sortedGroups.length > 0
            const docList = (caseData.documents ?? [])
              .filter(d => d.type === 'quotation' || d.type === 'additional_invoice')
              .map(d => ({
                id: d.id,
                type: d.type as 'quotation' | 'additional_invoice',
                document_number: d.document_number ?? null,
                total_price: d.total_price ?? null,
                finalized_at: d.finalized_at ?? null,
                document_groups: d.document_groups,
              }))
            if (!editingProducts || !canEditProducts) {
              return (
                <SelectedProductsSection
                  documents={docList}
                  exchangeRate={exchangeRate}
                  defaultExpanded={true}
                  onEditClick={canEditProducts ? () => setEditingProducts(true) : undefined}
                />
              )
            }
            return null  // edit mode rendered below at original position
          })()}

          {/* Edit Selected Products — staged add/remove with explicit Save/Cancel.
              Marks for removal/addition build up in local state; Save commits
              all changes in one batch. Items lock once admin finalizes pricing.
              Rendered only when editingProducts=true (toggled by the Edit button
              in SelectedProductsSection header above). */}
          {editingProducts && latestQuote && !latestQuote.finalized_at && sortedGroups.length > 0 && (() => {
            // Note: this section intentionally does NOT filter removed_at — we
            // want the removed rows visible as audit trail. All other consumers
            // filter for active rows so customer-facing surfaces stay clean.
            const allItems = sortedGroups.flatMap(g => g.document_items.map(it => ({ ...it, groupName: g.name, groupId: g.id })))
            const dirty = stagedAdds.length > 0 || stagedRemoves.size > 0
            const activeCount = allItems.filter(it => !it.removed_at).length

            const cancelChanges = () => { setStagedAdds([]); setStagedRemoves(new Set()); setActionError('') }

            const saveChanges = async () => {
              if (!latestQuote) return
              setSavingItems(true); setActionError('')
              try {
                // Removals first (they don't depend on adds; ids stable)
                for (const itemId of stagedRemoves) {
                  const removed = allItems.find(it => it.id === itemId)
                  await removeDocumentItem(itemId)
                  await logAsCurrentUser('quote.item_removed',
                    { type: 'case', id: caseData.id, label: caseData.case_number },
                    { product: removed?.products?.name ?? null, group: removed?.groupName ?? null })
                }
                for (const add of stagedAdds) {
                  await addDocumentItem({
                    documentId: latestQuote.id,
                    groupId: add.groupId,
                    productId: add.productId,
                    productNameSnapshot: add.productName,
                    productPartnerSnapshot: add.partnerName,
                    variantId: add.variantId,
                    variantLabelSnapshot: add.variantLabel,
                    basePrice: add.basePrice,
                    finalPrice: add.finalPrice,
                    origin: 'admin_added',
                  })
                  await logAsCurrentUser('quote.item_added',
                    { type: 'case', id: caseData.id, label: caseData.case_number },
                    { product: add.productName, group: add.groupName })
                }
                // Keep the document's stored total in sync with the new
                // active-item sum so Estimated displays elsewhere are correct.
                await recalcDocumentTotal(latestQuote.id)
                setStagedAdds([])
                setStagedRemoves(new Set())
                await fetchCase()
              } catch (e: unknown) {
                setActionError((e as { message?: string })?.message ?? 'Failed to save.')
              } finally { setSavingItems(false) }
            }

            return (
              <section className="border border-gray-200 bg-white rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Edit Selected Products</p>
                    <p className="text-[10px] text-gray-400">
                      {dirty
                        ? `${stagedAdds.length} to add · ${stagedRemoves.size} to remove — review then save`
                        : 'Original / Added / Removed are all kept as audit trail.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { cancelChanges(); setEditingProducts(false) }}
                    disabled={savingItems}
                    className="text-[11px] font-medium text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 shrink-0">
                    ← Done
                  </button>
                </div>

                <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                  {activeCount === 0 && stagedAdds.length === 0 && allItems.length === 0 ? (
                    <p className="text-xs text-gray-400 italic px-3 py-4 text-center">No items yet — add from the picker below.</p>
                  ) : (
                    sortedGroups.map((g, gi) => {
                      const groupExisting = allItems.filter(it => it.groupId === g.id)
                      const groupStaged = stagedAdds.filter(a => a.groupId === g.id)
                      if (groupExisting.length === 0 && groupStaged.length === 0) return null
                      const groupActive = groupExisting.filter(it => !it.removed_at).length + groupStaged.length
                      return (
                        <div key={g.id} className={gi > 0 ? 'border-t-4 border-gray-200' : ''}>
                          <div className="px-3 py-1.5 bg-gray-100/60 flex items-baseline gap-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">{g.name}</p>
                            <p className="text-[10px] text-gray-400">{g.member_count} pax · {groupActive} active item{groupActive !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {/* Sort within group: actives on top (Original then
                                saved Added). Removed/Removing rows are split
                                out and rendered at the bottom of the group
                                (after New staged adds) for clearer hierarchy. */}
                            {[...groupExisting]
                              .filter(it => !it.removed_at && !stagedRemoves.has(it.id))
                              .sort((a, b) => {
                                const rank = (it: typeof a) => it.origin === 'admin_added' ? 2 : 1
                                return rank(a) - rank(b)
                              }).map(item => {
                              const persistedRemoved = !!item.removed_at
                              const stagedRemove = stagedRemoves.has(item.id)
                              const wasAdminAdded = item.origin === 'admin_added'

                              // 4 visual states:
                              //   persisted active original → gray "Original"
                              //   persisted active admin-added → emerald "Added"
                              //   persisted removed (origin original) → red "Removed"
                              //   persisted removed (origin admin_added) → red "Removed Added"
                              //   transient (this session) staged remove → red "Removing" + Undo
                              let badge: string
                              let badgeClass: string
                              let rowBg = ''
                              let strike = false
                              let muted = false
                              if (persistedRemoved) {
                                badge = wasAdminAdded ? 'Removed Added' : 'Removed'
                                badgeClass = 'bg-red-100 text-red-700'
                                rowBg = 'bg-red-50/40'
                                strike = true
                                muted = true
                              } else if (stagedRemove) {
                                badge = 'Removing'
                                badgeClass = 'bg-red-100 text-red-700'
                                rowBg = 'bg-red-50/60'
                                strike = true
                                muted = true
                              } else if (wasAdminAdded) {
                                badge = 'Added'
                                badgeClass = 'bg-green-100 text-green-700'
                              } else {
                                badge = 'Original'
                                badgeClass = 'bg-gray-100 text-gray-500'
                              }

                              return (
                                <div key={item.id} className={`flex items-center gap-3 px-3 py-2 ${rowBg}`}>
                                  <span className={`text-[9px] font-semibold uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded ${badgeClass}`}>
                                    {badge}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm truncate ${muted ? 'text-gray-400' : 'text-gray-900'} ${strike ? 'line-through' : ''}`}>{item.products?.name ?? 'Item'}</p>
                                    {(item.products?.partner_name || item.variant_label_snapshot) && (
                                      <p className="text-[10px] text-gray-400 truncate">
                                        {item.products?.partner_name ?? ''}
                                        {item.products?.partner_name && item.variant_label_snapshot && ' · '}
                                        {item.variant_label_snapshot ?? ''}
                                      </p>
                                    )}
                                  </div>
                                  <div className={`text-right shrink-0 ${strike ? 'line-through' : ''}`}>
                                    <p className={`text-xs tabular-nums ${muted ? 'text-gray-300' : 'text-gray-700'}`}>{fmtKRW(item.final_price)}</p>
                                    <p className={`text-[10px] tabular-nums ${muted ? 'text-gray-300' : 'text-gray-400'}`}>{fmtUSD(item.final_price / exchangeRate)}</p>
                                  </div>
                                  {persistedRemoved ? (
                                    // Already saved as removed — no inline action; row is read-only history.
                                    <span className="w-5 shrink-0" />
                                  ) : stagedRemove ? (
                                    <button
                                      type="button"
                                      onClick={() => setStagedRemoves(prev => { const n = new Set(prev); n.delete(item.id); return n })}
                                      className="text-[10px] font-medium text-gray-500 hover:text-gray-800 px-2 py-0.5 rounded border border-gray-200 hover:bg-white">
                                      Undo
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      aria-label="Mark for removal"
                                      onClick={() => {
                                        // Original (in the customer's quote) — confirm before
                                        // marking for removal. Admin-added items are admin's
                                        // own additions so no confirm.
                                        if (item.origin !== 'admin_added') {
                                          const ok = window.confirm(
                                            `Remove "${item.products?.name ?? 'this item'}"?\n\n` +
                                            `This was in the original quotation the client received. ` +
                                            `Removing it will exclude the line from invoices and totals.`,
                                          )
                                          if (!ok) return
                                        }
                                        setStagedRemoves(prev => { const n = new Set(prev); n.add(item.id); return n })
                                      }}
                                      className="text-gray-300 hover:text-red-500 shrink-0 w-5 h-5 flex items-center justify-center text-base leading-none">
                                      ×
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                            {groupStaged.map(add => (
                              <div key={add.tempId} className="flex items-center gap-3 px-3 py-2 bg-green-50/60">
                                <span className="text-[9px] font-semibold uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                                  New
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-900 truncate">{add.productName}</p>
                                  {(add.partnerName || add.variantLabel) && (
                                    <p className="text-[10px] text-gray-400 truncate">
                                      {add.partnerName ?? ''}
                                      {add.partnerName && add.variantLabel && ' · '}
                                      {add.variantLabel ?? ''}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs text-gray-800 tabular-nums">{fmtKRW(add.finalPrice)}</p>
                                  <p className="text-[10px] text-gray-400 tabular-nums">{fmtUSD(add.finalPrice / exchangeRate)}</p>
                                </div>
                                <button
                                  type="button"
                                  aria-label="Remove staged item"
                                  onClick={() => setStagedAdds(prev => prev.filter(a => a.tempId !== add.tempId))}
                                  className="text-gray-400 hover:text-red-500 shrink-0 w-5 h-5 flex items-center justify-center text-base leading-none">
                                  ×
                                </button>
                              </div>
                            ))}
                            {/* Bottom section: removed audit trail (staged
                                remove + persisted removed). */}
                            {groupExisting
                              .filter(it => it.removed_at || stagedRemoves.has(it.id))
                              .sort((a, b) => {
                                // staged-remove first (still revertible),
                                // persisted-removed after (immutable history).
                                const rank = (it: typeof a) => it.removed_at ? 2 : 1
                                return rank(a) - rank(b)
                              })
                              .map(item => {
                                const persistedRemoved = !!item.removed_at
                                const wasAdminAdded = item.origin === 'admin_added'
                                const badge = persistedRemoved
                                  ? (wasAdminAdded ? 'Removed Added' : 'Removed')
                                  : 'Removing'
                                const rowBg = persistedRemoved ? 'bg-red-50/40' : 'bg-red-50/60'
                                return (
                                  <div key={item.id} className={`flex items-center gap-3 px-3 py-2 ${rowBg}`}>
                                    <span className="text-[9px] font-semibold uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                      {badge}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm truncate text-gray-400 line-through">{item.products?.name ?? 'Item'}</p>
                                      {(item.products?.partner_name || item.variant_label_snapshot) && (
                                        <p className="text-[10px] text-gray-400 truncate">
                                          {item.products?.partner_name ?? ''}
                                          {item.products?.partner_name && item.variant_label_snapshot && ' · '}
                                          {item.variant_label_snapshot ?? ''}
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-right shrink-0 line-through">
                                      <p className="text-xs tabular-nums text-gray-300">{fmtKRW(item.final_price)}</p>
                                      <p className="text-[10px] tabular-nums text-gray-300">{fmtUSD(item.final_price / exchangeRate)}</p>
                                    </div>
                                    {persistedRemoved ? (
                                      <span className="w-5 shrink-0" />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setStagedRemoves(prev => { const n = new Set(prev); n.delete(item.id); return n })}
                                        className="text-[10px] font-medium text-gray-500 hover:text-gray-800 px-2 py-0.5 rounded border border-gray-200 hover:bg-white">
                                        Undo
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {(() => {
                  const q = pickerQuery.trim().toLowerCase()
                  const targetGroupId = pickerGroupId || sortedGroups[0].id
                  const targetGroup = sortedGroups.find(g => g.id === targetGroupId)
                  // Hide products already in the target group, including ones
                  // staged for addition (avoid double-adds before save).
                  // Multi-variant products stay visible — admins may want to
                  // add a different variant of the same product.
                  const existingMonoVariantProductIds = new Set<string>()
                  targetGroup?.document_items.forEach(it => {
                    if (it.removed_at) return  // soft-deleted items don't block re-add
                    if (!it.products?.id) return
                    const matched = products.find(p => p.id === it.products?.id)
                    const variantCount = matched?.variants.length ?? 0
                    if (variantCount <= 1) existingMonoVariantProductIds.add(it.products.id)
                  })
                  // Build category / subcategory option lists from active products.
                  // Categories sorted by product_categories.sort_order so the
                  // dropdown order matches agent home (K-Medical, K-Beauty,
                  // K-Wellness, K-Starcation, K-Education, Subpackage).
                  const categorySort = new Map<string, number>()
                  for (const p of products) {
                    if (p.category_name && !categorySort.has(p.category_name)) {
                      categorySort.set(p.category_name, p.category_sort)
                    }
                  }
                  const categoryOptions = [...categorySort.entries()]
                    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
                    .map(([name]) => name)
                  const subcategoryOptions = Array.from(new Set(
                    products
                      .filter(p => !pickerCategoryFilter || p.category_name === pickerCategoryFilter)
                      .map(p => p.subcategory_name)
                      .filter((x): x is string => !!x),
                  )).sort()

                  const available = products
                    .filter(p => !existingMonoVariantProductIds.has(p.id))
                    .filter(p => !pickerCategoryFilter || p.category_name === pickerCategoryFilter)
                    .filter(p => !pickerSubcategoryFilter || p.subcategory_name === pickerSubcategoryFilter)
                    // Within results, list by category sort_order then by name
                    // so users see groups together rather than scrambled.
                    .sort((a, b) => a.category_sort - b.category_sort || a.name.localeCompare(b.name))
                  // No slice cap — dropdown is scrollable; admin should see
                  // every match. Ordering already by name from fetch.
                  const matches = q === ''
                    ? available
                    : available.filter(p =>
                        p.name.toLowerCase().includes(q) || (p.partner_name?.toLowerCase().includes(q) ?? false)
                      )
                  const stageVariant = (product: ProductRow, variant: ProductVariant | null) => {
                    if (!targetGroup) return
                    const baseKrw = variant
                      ? (variant.price_currency === 'USD' ? Math.round(variant.base_price * exchangeRate) : variant.base_price)
                      : (product.price_currency === 'USD' ? Math.round(product.base_price * exchangeRate) : product.base_price)
                    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
                    setStagedAdds(prev => [...prev, {
                      tempId,
                      productId: product.id,
                      productName: product.name,
                      partnerName: product.partner_name,
                      variantId: variant?.id ?? null,
                      variantLabel: variant?.variant_label ?? null,
                      basePrice: variant?.base_price ?? product.base_price,
                      finalPrice: baseKrw,
                      priceCurrency: variant?.price_currency ?? (product.price_currency === 'USD' ? 'USD' : 'KRW'),
                      groupId: targetGroup.id,
                      groupName: targetGroup.name,
                    }])
                    setPickerQuery('')
                    setPickerOpen(false)
                    setPickerExpandedProduct(null)
                  }
                  const onProductClick = (product: ProductRow) => {
                    if (product.variants.length <= 1) {
                      // 0 or 1 variant — stage immediately
                      stageVariant(product, product.variants[0] ?? null)
                    } else {
                      // Toggle inline variant picker
                      setPickerExpandedProduct(prev => prev === product.id ? null : product.id)
                    }
                  }
                  const fmtVariantPrice = (v: ProductVariant) =>
                    v.price_currency === 'USD'
                      ? `$${v.base_price.toLocaleString('en-US')}`
                      : fmtKRW(v.base_price)
                  return (
                    <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex flex-wrap items-center gap-2 relative">
                      <span className="text-[10px] text-gray-500 shrink-0">Add to</span>
                      {sortedGroups.length > 1 && (
                        <select
                          value={pickerGroupId || sortedGroups[0].id}
                          onChange={(e) => setPickerGroupId(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white">
                          {sortedGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      )}
                      <select
                        value={pickerCategoryFilter}
                        onChange={(e) => { setPickerCategoryFilter(e.target.value); setPickerSubcategoryFilter('') }}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white">
                        <option value="">All categories</option>
                        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select
                        value={pickerSubcategoryFilter}
                        onChange={(e) => setPickerSubcategoryFilter(e.target.value)}
                        disabled={subcategoryOptions.length === 0}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white disabled:bg-gray-50">
                        <option value="">All sub</option>
                        {subcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <div className="flex-1 min-w-[12rem] relative">
                        <input
                          type="text"
                          value={pickerQuery}
                          placeholder={products.length === 0 ? 'No products available' : 'Search products by name or partner…'}
                          disabled={products.length === 0 || savingItems}
                          onFocus={() => setPickerOpen(true)}
                          onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                          onChange={(e) => { setPickerQuery(e.target.value); setPickerOpen(true) }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white disabled:bg-gray-50" />
                        {pickerOpen && matches.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto divide-y divide-gray-100">
                            {matches.map(p => {
                              const expanded = pickerExpandedProduct === p.id
                              const multi = p.variants.length > 1
                              const sole = p.variants[0]
                              return (
                                <div key={p.id}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => onProductClick(p)}
                                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-gray-900 truncate">{p.name}</span>
                                      {multi && (
                                        <span className="text-[10px] font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 shrink-0">
                                          {p.variants.length} variants {expanded ? '▲' : '▼'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-gray-400 flex justify-between gap-2">
                                      <span className="truncate">{p.partner_name ?? '—'}</span>
                                      <span className="tabular-nums shrink-0">
                                        {multi
                                          ? `${fmtVariantPrice(p.variants[p.variants.length - 1])} – ${fmtVariantPrice(p.variants[0])}`
                                          : sole ? fmtVariantPrice(sole)
                                          : (p.price_currency === 'USD' ? `$${p.base_price.toLocaleString('en-US')}` : fmtKRW(p.base_price))}
                                      </span>
                                    </div>
                                  </button>
                                  {multi && expanded && (
                                    <div className="bg-gray-50/60 border-t border-gray-100 divide-y divide-gray-100/60">
                                      {p.variants.map(v => (
                                        <button
                                          key={v.id}
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => stageVariant(p, v)}
                                          className="w-full text-left px-6 py-1.5 hover:bg-gray-50 text-xs flex items-center justify-between gap-2">
                                          <span className="text-gray-700 truncate">{v.variant_label ?? '— Default —'}</span>
                                          <span className="tabular-nums text-gray-600 shrink-0">{fmtVariantPrice(v)}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {pickerOpen && matches.length === 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-400">
                            {q !== '' ? `No products match "${pickerQuery}"` : 'No products match the current filters.'}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {actionError && <p className="text-xs text-red-500">{actionError}</p>}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={cancelChanges}
                    disabled={!dirty || savingItems}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveChanges}
                    disabled={!dirty || savingItems}
                    className="text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
                    {savingItems ? 'Saving…' : `Save${dirty ? ` (${stagedAdds.length}+ ${stagedRemoves.size}-)` : ''}`}
                  </button>
                </div>
              </section>
            )
          })()}

          {/* Schedule History */}
          {sortedSchedules.length > 0 && (
            <section className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Schedule History</p>
                <span className="text-[10px] text-gray-400">{sortedSchedules.length} version{sortedSchedules.length > 1 ? 's' : ''}</span>
              </div>

              {scheduleLocked && (
                <div className="flex items-center gap-2 border border-green-200 bg-green-50 rounded-xl px-3 py-2">
                  <svg className="w-3.5 h-3.5 text-green-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <p className="text-xs text-green-800">
                    {(caseData.status === 'completed' || caseData.status === 'awaiting_review')
                      ? 'Travel complete — schedule is locked.'
                      : 'Agent has confirmed the schedule — no further edits allowed.'}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {sortedSchedules.map((s) => {
                  const isLatest = s.id === latestSchedule?.id
                  const statusStyle =
                    s.status === 'confirmed' ? 'bg-green-50 text-green-700 border-green-200' :
                    s.status === 'revision_requested' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    'bg-gray-100 text-gray-600 border-gray-200'
                  const statusLabel =
                    s.status === 'confirmed' ? 'Confirmed' :
                    s.status === 'revision_requested' ? 'Revision Requested' :
                    'Pending Review'
                  const canDelete = !scheduleLocked && isLatest && s.status === 'pending' && !s.first_opened_at
                  return (
                    <div key={s.id} className={`bg-white rounded-xl border ${isLatest ? 'border-gray-300' : 'border-gray-100'}`}>
                      {/* Card header row — always visible */}
                      <div className="flex items-center gap-2 flex-wrap p-3">
                        <span className="text-xs font-semibold text-gray-700">v{s.version}</span>
                        {isLatest && <span className="text-[9px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">LATEST</span>}
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusStyle}`}>{statusLabel}</span>
                        {s.status === 'revision_requested' && s.revision_note && (
                          <span className="text-xs text-gray-700 border-l-2 border-rose-300 pl-2 flex-1 min-w-0 whitespace-pre-line">{s.revision_note}</span>
                        )}
                        <div className="ml-auto flex items-center gap-3">
                          {s.items && s.items.length > 0 && (
                            <button
                              onClick={() => setExpandedScheduleId(prev => prev === s.id ? null : s.id)}
                              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
                            >
                              <svg className={`w-3.5 h-3.5 transition-transform ${expandedScheduleId === s.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                              {expandedScheduleId === s.id ? 'Collapse' : `View (${s.items.length})`}
                            </button>
                          )}
                          {s.slug && (s.pdf_url || (s.items && s.items.length > 0)) && (
                            <a
                              href={`${baseUrl}/schedule/${s.slug}?preview=1&internal=1&v=${s.version}`}
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

                      {/* Expanded items view */}
                      {expandedScheduleId === s.id && s.items && s.items.length > 0 && (
                        isLatest && s.status === 'confirmed'
                          ? (
                            <div className="border-t border-gray-100">
                              <ScheduleInternalEditor schedule={s} onSaved={() => fetchCase()} />
                            </div>
                          )
                          : (() => {
                            const days = Array.from(new Set(s.items.map((it: ScheduleItem) => it.day))).sort((a, b) => a - b)
                            return (
                              <div className="border-t border-gray-100 divide-y divide-gray-100">
                                {days.map((day: number) => {
                                  const dayItems = (s.items as ScheduleItem[]).filter(it => it.day === day).sort(compareScheduleItems)
                                  return (
                                    <div key={day}>
                                      <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">Day {day}</p>
                                      {dayItems.map(it => (
                                        <div key={it.id} className="px-3 py-2 flex items-start gap-3 border-t border-gray-50">
                                          <div className="w-20 shrink-0">
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{SCHEDULE_BLOCK_LABEL[it.block]}{it.endBlock && it.endBlock !== it.block ? ` →` : ''}</p>
                                            {it.endBlock && it.endBlock !== it.block && (
                                              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{SCHEDULE_BLOCK_LABEL[it.endBlock]}</p>
                                            )}
                                            {it.time && <p className="text-[10px] text-gray-400 tabular-nums mt-0.5">{it.time}{it.endTime ? ` – ${it.endTime}` : ''}</p>}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            {it.partner && <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{it.partner}</p>}
                                            <p className="text-xs text-gray-800">{it.title}{it.variantTag ? ` · ${it.variantTag}` : ''}</p>
                                            {it.location && <p className="text-[11px] text-gray-400 mt-0.5">{it.location}</p>}
                                            {it.notes && <p className="text-[11px] text-gray-500 mt-0.5 italic">{it.notes}</p>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })()
                      )}

                      <div className="px-3 pb-3 space-y-1.5">
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


                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Schedule placeholder — telegraphs that the Schedule slot lives here.
              Real upload UI / history sit lower in the page; once a schedule
              exists, this placeholder hides and the full UI takes over below. */}
          {sortedSchedules.length === 0 && (
            <section className="bg-gray-50 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Schedule</h3>
                <span className="text-[10px] text-gray-400">not yet uploaded</span>
              </div>
              <p className="text-xs text-gray-500">
                {scheduleReady
                  ? 'Ready to upload — see the Upload Schedule section below.'
                  : 'Will be uploaded once Trip Info, every client\'s info, and group assignments are complete.'}
              </p>
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

          {canUploadSchedule && (() => {
            // Build product picker list from the case's quotation line items.
            // Key is (groupId, variantId) — same variant in two groups = two
            // separate entries, so the coverage gate can track per-group.
            // Subpackage items are flagged so coverage is treated as shared.
            const seen = new Set<string>() // `${groupId}:${variantId}`
            const caseProducts: {
              variantId: string; productName: string; variantLabel: string | null
              partnerName: string | null; groupId: string; groupName: string; isSubpackage: boolean
              durationValue: number | null; durationUnit: string | null
            }[] = []
            for (const grp of sortedGroups) {
              for (const it of (grp.document_items ?? []).filter(x => !x.removed_at)) {
                if (!it.variant_id) continue
                const key = `${grp.id}:${it.variant_id}`
                if (seen.has(key)) continue
                seen.add(key)
                const catName = it.products?.product_categories?.name ?? null
                caseProducts.push({
                  variantId: it.variant_id,
                  productName: it.products?.name ?? 'Service',
                  variantLabel: it.variant_label_snapshot ?? null,
                  partnerName: it.products?.partner_name ?? null,
                  groupId: grp.id,
                  groupName: grp.name,
                  isSubpackage: catName === 'Subpackage',
                  durationValue: it.products?.duration_value ?? null,
                  durationUnit: it.products?.duration_unit ?? null,
                })
              }
            }
            // Trip nights → default day count (nights + 1).
            const nights = nightsBetween(caseData.travel_start_date, caseData.travel_end_date)
            const defaultDays = Math.max(nights + 1, 1)
            // Carry forward latest version's items if it was revision-requested
            // (so admin doesn't start from a blank slate after agent feedback).
            // Seed priority: saved schedule (pending/revision) > draft > empty
            const carryItems: ScheduleItem[] = (latestSchedule?.items && (latestSchedule.status === 'pending' || latestSchedule.status === 'revision_requested'))
              ? latestSchedule.items
              : (caseData.schedule_draft_items ?? [])
            const nextVersion = (latestSchedule?.version ?? 0) + 1
            return (
              <section id="schedule-upload" className={`scroll-mt-20 border rounded-2xl p-4 space-y-3 border-green-200 bg-green-50`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-xs font-semibold uppercase tracking-wide text-green-700`}>
                    {sortedSchedules.length === 0 ? 'Build Schedule' : `New Version (v${nextVersion})`}
                  </p>
                  {latestSchedule?.slug && (
                    <a href={`${baseUrl}/schedule/${latestSchedule.slug}?preview=1&internal=1&v=${latestSchedule.version}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-gray-500 hover:underline">
                      Preview last version ↗
                    </a>
                  )}
                </div>
                {sortedSchedules.length === 0 && (
                  <p className="text-xs text-blue-700">Build day-by-day. Use &quot;Link a product&quot; to autofill titles from selected products.</p>
                )}
                <ScheduleEditor
                  caseId={caseData.id}
                  caseNumber={caseData.case_number}
                  agentId={caseData.agent_id ?? null}
                  travelStartDate={caseData.travel_start_date}
                  travelEndDate={caseData.travel_end_date}
                  initialItems={carryItems}
                  defaultDayCount={defaultDays}
                  caseProducts={caseProducts}
                  caseGroups={(latestQuote?.document_groups ?? [])
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map(g => ({ id: g.id, name: g.name }))}
                  onSaved={() => fetchCase()}
                  onSaveDraft={async (items) => {
                    await supabase.from('cases').update({ schedule_draft_items: items }).eq('id', caseData.id)
                  }}
                  slug={latestSchedule?.slug ?? null}
                  nextVersion={nextVersion}
                  initialConciergeName={latestSchedule?.concierge_name ?? null}
                  initialConciergePhone={latestSchedule?.concierge_phone ?? null}
                />
              </section>
            )
          })()}

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
            <section id="pricing" className="scroll-mt-20 border border-green-200 bg-green-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                  {latestQuote.finalized_at ? 'Edit Final Pricing' : 'Finalize Pricing'}
                </p>
                {latestQuote.finalized_at && (
                  <button onClick={() => { setEditingPricing(false); setPricingEdits({}); setDueDateEdit(''); setPricingError(''); setPricingCurrencies({}) }}
                    className="text-xs text-gray-500 hover:text-gray-800">Cancel</button>
                )}
              </div>
              <p className="text-[11px] text-gray-600">
                {latestQuote.finalized_at
                  ? 'Adjust line item prices. To add or remove items after finalize, issue an Additional Invoice.'
                  : 'Adjust line item prices. Items are locked at this stage — to add or remove, request a schedule revision.'}
              </p>

              {pricingError && <p className="text-xs text-red-500">{pricingError}</p>}

              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {sortedGroups.flatMap(g => g.document_items.filter(it => !it.removed_at).map(item => {
                  // pricingEdits stores canonical KRW digits; currency toggle only changes display.
                  const krwDigits = pricingEdits[item.id] ?? String(item.final_price)
                  const krwNum = Number(krwDigits) || 0
                  const currency: ItemCurrency = pricingCurrencies[item.id] ?? 'KRW'
                  const displayNum = currency === 'USD' ? Math.round(krwNum / exchangeRate) : krwNum
                  const displayVal = krwDigits === '' ? '' : displayNum.toLocaleString('en-US')
                  const origDisplay = currency === 'USD'
                    ? `$${Math.round(item.final_price / exchangeRate).toLocaleString('en-US')}`
                    : fmtKRW(item.final_price)
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{item.products?.name ?? 'Item'}</p>
                        <p className="text-[10px] text-gray-400">{g.name}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 tabular-nums shrink-0">orig {origDisplay}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={displayVal}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^0-9]/g, '')
                          if (cleaned === '') { setPricingEdits(p => ({ ...p, [item.id]: '' })); return }
                          const userNum = Number(cleaned) || 0
                          const krwVal = currency === 'USD' ? Math.round(userNum * exchangeRate) : userNum
                          setPricingEdits(p => ({ ...p, [item.id]: String(krwVal) }))
                        }}
                        className="w-32 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] tabular-nums text-right" />
                      <div className="flex shrink-0 rounded-md border border-gray-200 overflow-hidden text-[10px] font-medium">
                        <button
                          type="button"
                          aria-pressed={currency === 'KRW'}
                          onClick={() => setPricingCurrencies(p => ({ ...p, [item.id]: 'KRW' }))}
                          className={`px-1.5 py-0.5 ${currency === 'KRW' ? 'bg-[#0f4c35] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                          ₩
                        </button>
                        <button
                          type="button"
                          aria-pressed={currency === 'USD'}
                          onClick={() => setPricingCurrencies(p => ({ ...p, [item.id]: 'USD' }))}
                          className={`px-1.5 py-0.5 border-l border-gray-200 ${currency === 'USD' ? 'bg-[#0f4c35] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                          $
                        </button>
                      </div>
                    </div>
                  )
                }))}
              </div>

              {(() => {
                const liveSum = sortedGroups
                  .flatMap(g => g.document_items.filter(it => !it.removed_at))
                  .reduce((s, item) => s + (Number(pricingEdits[item.id] ?? item.final_price) || 0), 0)
                const newTotal = liveSum
                const diff = newTotal - latestQuote.total_price
                return (
                  <div className="flex items-baseline justify-between bg-white rounded-xl border border-gray-200 px-3 py-2">
                    <span className="text-xs text-gray-500">New Total</span>
                    <div className="flex items-baseline gap-3">
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{fmtUSD(newTotal / exchangeRate)}</span>
                      <span className="text-[11px] text-gray-400 tabular-nums">{fmtKRW(newTotal)}</span>
                      {diff !== 0 && (
                        <span className={`text-[10px] font-medium tabular-nums ${diff > 0 ? 'text-[#0f4c35]' : 'text-red-500'}`}>
                          {diff > 0 ? '+' : ''}{fmtKRW(diff)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Payment Due Date — defaults to today + 7d, admin can override */}
              <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex items-center justify-between gap-3">
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
                  .flatMap(g => g.document_items.filter(it => !it.removed_at))
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
                    const items = sortedGroups.flatMap(g => g.document_items.filter(it => !it.removed_at))
                    const liveSum = items.reduce((s, item) => s + (Number(pricingEdits[item.id] ?? item.final_price) || 0), 0)
                    const newTotal = liveSum
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
                      {
                        total_krw: newTotal,
                        ...(totalChanged && !isFirstFinalize ? { previous_total_krw: latestQuote.total_price } : {}),
                      })
                    setPricingEdits({})
                    setDueDateEdit('')
                    setEditingPricing(false)
                    await fetchCase()
                  } catch (e: unknown) {
                    setPricingError((e as { message?: string })?.message ?? 'Failed.')
                  } finally { setSavingPricing(false) }
                }}
                className="w-full py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                {savingPricing ? 'Saving...' : latestQuote.finalized_at ? 'Save Pricing Changes' : 'Finalize Pricing & Issue Invoice'}
              </button>
                )
              })()}
            </section>
            )
          })()}

          {/* Quote / Financials — cyan when admin has financial action queued
              (awaiting_deposit: issue deposit settlement after agent issues;
              awaiting_payment: confirm balance payment receipt). Mirror of the
              agent-side cyan tone — both sides have parallel actions in these
              two windows, so both get the action signal. */}
          {latestQuote && (() => {
            const isActionTarget = caseData.status === 'awaiting_deposit' || caseData.status === 'awaiting_payment'
            const sectionClass = isActionTarget
              ? 'bg-cyan-50 border border-cyan-200 rounded-2xl p-4 space-y-3'
              : 'bg-gray-50 rounded-2xl p-4 space-y-3'
            const labelClass = isActionTarget
              ? 'text-xs font-semibold text-cyan-700 uppercase tracking-wide'
              : 'text-xs font-semibold text-gray-400 uppercase tracking-wide'
            return (
            <section className={sectionClass}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className={labelClass}>Financials</p>
                  {!latestQuote.finalized_at && (
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5 uppercase tracking-wide">
                      Estimated
                    </span>
                  )}
                </div>
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
              {(() => {
                const schedConfirmed = (caseData.schedules ?? []).some(s => s.status === 'confirmed')
                const allItems = (latestQuote.document_groups ?? []).flatMap((g: { document_items: QuoteItem[] }) => g.document_items ?? [])
                const originalTotal = allItems
                  .filter((it: QuoteItem) => it.origin === 'original' || it.origin == null)
                  .reduce((s: number, it: QuoteItem) => s + (it.final_price ?? 0), 0)
                const pendingRemovals = allItems
                  .filter((it: QuoteItem) => it.removed_at && (it.origin === 'original' || it.origin == null))
                  .reduce((s: number, it: QuoteItem) => s + (it.final_price ?? 0), 0)
                const pendingAdditions = allItems
                  .filter((it: QuoteItem) => !it.removed_at && it.origin === 'admin_added')
                  .reduce((s: number, it: QuoteItem) => s + (it.final_price ?? 0), 0)
                const showPending = !latestQuote.finalized_at && !schedConfirmed && (pendingRemovals > 0 || pendingAdditions > 0)
                const displayTotal = (latestQuote.finalized_at || schedConfirmed) ? latestQuote.total_price : originalTotal
                return (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">
                    {latestQuote.finalized_at ? 'Total (KRW)' : 'Estimated (KRW)'}
                  </p>
                  <p className="font-semibold text-gray-900">{fmtKRW(displayTotal)}</p>
                  {showPending && (
                    <div className="mt-1 space-y-0.5">
                      {pendingRemovals > 0 && (
                        <p className="text-[10px] text-red-500">− {fmtKRW(pendingRemovals)} pending removal</p>
                      )}
                      {pendingAdditions > 0 && (
                        <p className="text-[10px] text-[#0f4c35]">+ {fmtKRW(pendingAdditions)} pending addition</p>
                      )}
                    </div>
                  )}
                  {!latestQuote.finalized_at && !schedConfirmed && (
                    <p className="mt-1">
                      <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        May change after you finalize
                      </span>
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">
                    {latestQuote.finalized_at ? 'Total (USD)' : 'Estimated (USD)'}
                  </p>
                  <p className="font-semibold text-gray-900">{fmtUSD(displayTotal / exchangeRate)}</p>
                  {showPending && (
                    <div className="mt-1 space-y-0.5">
                      {pendingRemovals > 0 && (
                        <p className="text-[10px] text-red-500">− {fmtUSD(pendingRemovals / exchangeRate)} pending removal</p>
                      )}
                      {pendingAdditions > 0 && (
                        <p className="text-[10px] text-[#0f4c35]">+ {fmtUSD(pendingAdditions / exchangeRate)} pending addition</p>
                      )}
                    </div>
                  )}
                  {!latestQuote.finalized_at && !schedConfirmed && (
                    <p className="mt-1">
                      <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        May change after you finalize
                      </span>
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Payment Due</p>
                  {latestQuote.finalized_at && latestQuote.payment_due_date ? (
                    <p className={`font-medium text-sm ${caseData.status === 'awaiting_payment' && new Date(latestQuote.payment_due_date) < new Date() ? 'text-red-500' : 'text-gray-800'}`}>
                      {latestQuote.payment_due_date}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Set on finalize</p>
                  )}
                </div>
                <div><p className="text-[10px] text-gray-400 mb-0.5">Margins</p><p className="text-gray-700 text-xs">Co. {(latestQuote.company_margin_rate * 100).toFixed(0)}% / Agent {(latestQuote.agent_margin_rate * 100).toFixed(0)}%</p></div>
              </div>
                )
              })()}

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
                        <span className="text-xs text-gray-600">Partner Cost</span>
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

              {/* Invoices (deposit / additional / commission) — embedded inside Financials */}
              <CaseDocumentsSection
                caseId={caseData.id}
                caseNumber={caseData.case_number}
                agentId={caseData.agent_id}
                actor="admin"
                caseStatus={caseData.status}
                embedded
                quotation={latestQuote as unknown as DocumentRow}
                finalInvoice={(finalInvoice ?? null) as unknown as DocumentRow | null}
                documents={(caseData.documents ?? []) as unknown as DocumentRow[]}
                exchangeRate={exchangeRate}
                onChanged={fetchCase}
              />
            </section>
            )
          })()}

          {/* Confirm Payment — only after pricing finalized */}
          {caseData.status === 'awaiting_payment' && !editingPricing && (
            <section id="confirm-payment" className="scroll-mt-20 border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Confirm Payment</p>
                <button onClick={() => { setEditingPricing(true); setPricingEdits({}); setPricingError('') }}
                  className="text-[10px] text-gray-500 hover:underline">Edit pricing</button>
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

          {caseData.status === 'awaiting_travel' && (
            <section className="border border-gray-200 bg-gray-50 rounded-2xl p-4">
              <p className="text-xs text-gray-500">Agent will mark travel complete after the trip.</p>
            </section>
          )}
          {/* Partner Payouts — track cash sent to hospitals/hotels/etc per partner */}
          {latestQuote && (() => {
            type PartnerItem = { name: string; price: number; group: string; qty: number }
            type PartnerGroup = { name: string; suggested: number; items: PartnerItem[] }
            const groups = new Map<string, PartnerGroup>()
            for (const g of latestQuote.document_groups ?? []) {
              for (const item of (g.document_items ?? []).filter(it => !it.removed_at)) {
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
            // Partners unlock once the schedule is confirmed — that's when the
            // line items per partner are locked in, so the suggested payout
            // amounts here are stable and tied to the confirmed itinerary.
            const paymentReceived = (caseData.schedules ?? []).some(s => s.status === 'confirmed')

            return (
              <section className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Partner Payouts</p>
                  <div className="flex items-baseline gap-3 text-[10px] text-gray-500">
                    <span>Paid <span className="font-semibold tabular-nums text-gray-700">{fmtUSD(totalPaid / exchangeRate)}</span> of {fmtUSD(totalSuggested / exchangeRate)}</span>
                    {allPaid && <span className="text-[#0f4c35] font-medium">All settled ✓</span>}
                  </div>
                </div>

                {!paymentReceived && (
                  <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs text-gray-500">
                    Partner payouts unlock once the schedule is confirmed by the agent.
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
                        <div key={g.name} className="bg-white rounded-xl border border-green-200 p-3 flex items-center gap-3 flex-wrap">
                          <span className="w-2 h-2 rounded-full bg-[#0f4c35] shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{g.name}</p>
                            <p className="text-[10px] text-gray-500">{g.items.length} item{g.items.length !== 1 ? 's' : ''} · paid {existing.paid_at}{existing.note ? ` · ${existing.note}` : ''}</p>
                          </div>
                          <span className="text-right tabular-nums">
                            <span className="text-sm font-semibold text-[#0f4c35]">{fmtUSD(existing.amount / exchangeRate)}</span>
                            <span className="text-[10px] text-gray-400 ml-2">{fmtKRW(existing.amount)}</span>
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setPartnerEdits(p => ({ ...p, [g.name]: { amount: String(existing.amount), paid_at: existing.paid_at, note: existing.note ?? '' } }))}
                              className="text-[10px] text-gray-400 hover:text-gray-700">Edit</button>
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete payment record for ${g.name}?\n\nAmount: ${fmtKRW(existing.amount)} · Paid: ${existing.paid_at}\n\nThis will mark the partner as unpaid. This cannot be undone.`)) return
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
                          <span className={`w-2 h-2 rounded-full shrink-0 ${existing ? 'bg-[#0f4c35]' : 'bg-gray-300'}`} />
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


        </div>
      </div>
    </div>
  )
}

// ── Confirmed schedule: admin-only operational fields editor ──────────────────
// Items (title/time/block) are read-only. Only address/partnerContact/driverInfo/
// internalNotes can be changed — saves directly to schedules.items (no new version).

type OpsDraft = { address: string; partnerContact: string; driverInfo: string; internalNotes: string }

function ScheduleInternalEditor({
  schedule,
  onSaved,
}: {
  schedule: { id: string; version: number; items: import('@/types/schedule').ScheduleItem[] | null }
  onSaved: () => void
}) {
  const [items, setItems] = useState(() => schedule.items ?? [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<OpsDraft>({ address: '', partnerContact: '', driverInfo: '', internalNotes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function startEdit(it: import('@/types/schedule').ScheduleItem) {
    setEditingId(it.id)
    setDraft({
      address: it.address ?? '',
      partnerContact: it.partnerContact ?? '',
      driverInfo: it.driverInfo ?? '',
      internalNotes: it.internalNotes ?? '',
    })
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft({ address: '', partnerContact: '', driverInfo: '', internalNotes: '' })
  }

  async function saveItem() {
    if (!editingId) return
    setSaving(true)
    setError('')
    const updated = items.map(it =>
      it.id === editingId
        ? { ...it, address: draft.address || null, partnerContact: draft.partnerContact || null, driverInfo: draft.driverInfo || null, internalNotes: draft.internalNotes || null }
        : it
    )
    try {
      const { error: err } = await supabase.from('schedules').update({ items: updated }).eq('id', schedule.id)
      if (err) throw err
      setItems(updated)
      setEditingId(null)
      onSaved()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const days = Array.from(new Set(items.map(i => i.day))).sort((a, b) => a - b)

  return (
    <div className="divide-y divide-gray-100 bg-white">
      {days.map(day => {
        const dayItems = items.filter(i => i.day === day).sort(compareScheduleItems)
        return (
          <div key={day}>
            <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">Day {day}</p>
            {dayItems.map(it => {
              const isEditing = editingId === it.id
              const hasOpsData = it.address || it.partnerContact || it.driverInfo || it.internalNotes
              return (
                <div key={it.id} className={`px-3 py-2.5 border-t border-gray-50 ${isEditing ? 'bg-gray-50' : ''}`}>
                  {/* Read-only header row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-baseline gap-1.5 flex-1 min-w-0 flex-wrap">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide shrink-0">
                        {SCHEDULE_BLOCK_LABEL[it.block]}{it.endBlock && it.endBlock !== it.block ? ` → ${SCHEDULE_BLOCK_LABEL[it.endBlock]}` : ''}
                      </span>
                      {it.time && <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{it.time}{it.endTime ? ` – ${it.endTime}` : ''}</span>}
                      <span className="text-xs font-medium text-gray-800 truncate">{it.title}</span>
                    </div>
                    {!isEditing && (
                      <button onClick={() => startEdit(it)}
                        className="text-[10px] font-medium text-gray-400 hover:text-[#0f4c35] shrink-0 transition-colors">
                        {hasOpsData ? 'Edit' : '+ Ops'}
                      </button>
                    )}
                  </div>

                  {/* Existing ops data preview (read mode) */}
                  {!isEditing && hasOpsData && (
                    <div className="mt-1.5 grid grid-cols-1 md:grid-cols-2 gap-0.5">
                      {it.address && <p className="text-[11px] text-gray-500 truncate"><span className="text-[10px] text-gray-400 uppercase tracking-wide mr-1">Addr</span>{it.address}</p>}
                      {it.partnerContact && <p className="text-[11px] text-gray-500 truncate"><span className="text-[10px] text-gray-400 uppercase tracking-wide mr-1">Contact</span>{it.partnerContact}</p>}
                      {it.driverInfo && <p className="text-[11px] text-gray-500 truncate"><span className="text-[10px] text-gray-400 uppercase tracking-wide mr-1">Driver</span>{it.driverInfo}</p>}
                      {it.internalNotes && <p className="text-[11px] text-gray-500 italic truncate md:col-span-2"><span className="text-[10px] text-gray-400 uppercase tracking-wide not-italic mr-1">Note</span>{it.internalNotes}</p>}
                    </div>
                  )}

                  {/* Edit mode */}
                  {isEditing && (
                    <div className="mt-2 space-y-1.5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                        <input type="text" value={draft.address} onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
                          placeholder="Address"
                          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400" />
                        <input type="text" value={draft.partnerContact} onChange={e => setDraft(d => ({ ...d, partnerContact: e.target.value }))}
                          placeholder="Partner contact (name + phone)"
                          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400" />
                        <input type="text" value={draft.driverInfo} onChange={e => setDraft(d => ({ ...d, driverInfo: e.target.value }))}
                          placeholder="Driver info (name + phone + pickup)"
                          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400" />
                        <input type="text" value={draft.internalNotes} onChange={e => setDraft(d => ({ ...d, internalNotes: e.target.value }))}
                          placeholder="Internal note"
                          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400" />
                      </div>
                      {error && <p className="text-xs text-red-600">{error}</p>}
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-700">Cancel</button>
                        <button onClick={saveItem} disabled={saving}
                          className="text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-3 py-1 rounded-lg disabled:opacity-40">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
