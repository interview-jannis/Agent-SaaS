'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { notifyAllAdmins } from '@/lib/notifications'
import { logAsCurrentUser } from '@/lib/audit'
import DOBPicker from '@/components/DOBPicker'
import PrintPdfButton from '@/components/PrintPdfButton'
import DateTime24Picker from '@/components/DateTime24Picker'

// ── Types ─────────────────────────────────────────────────────────────────────

type CaseStatus = 'payment_pending' | 'payment_completed' | 'schedule_reviewed' | 'schedule_confirmed' | 'travel_completed'
type DietaryType = 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'

import type { ClientInfo, FlightInfo } from '@/lib/clientCompleteness'
import { getMissingClientFields, getMissingCaseFields, CLIENT_INFO_COLUMNS } from '@/lib/clientCompleteness'

type MemberClient = ClientInfo & {
  client_number: string
  nationality: string | null
}

type CaseMember = {
  id: string
  is_lead: boolean
  clients: MemberClient | null
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
  quote_group_members: { id: string; case_member_id: string }[]
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

type ScheduleStatus = 'pending' | 'confirmed' | 'revision_requested'

type Schedule = {
  id: string
  slug: string | null
  pdf_url: string | null
  status: ScheduleStatus
  version: number
  created_at: string
  file_name: string | null
  revision_note: string | null
  confirmed_at: string | null
}

type CaseDetail = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  travel_end_date: string | null
  created_at: string
  concept: string | null
  outbound_flight: FlightInfo
  inbound_flight: FlightInfo
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

type TripForm = {
  concept: string
  out_departure_datetime: string; out_departure_airport: string
  out_arrival_datetime: string; out_arrival_airport: string
  in_departure_datetime: string; in_departure_airport: string
  in_arrival_datetime: string; in_arrival_airport: string
}
const EMPTY_TRIP_FORM: TripForm = {
  concept: '',
  out_departure_datetime: '', out_departure_airport: '',
  out_arrival_datetime: '', out_arrival_airport: '',
  in_departure_datetime: '', in_departure_airport: '',
  in_arrival_datetime: '', in_arrival_airport: '',
}

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
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientForm, setNewClientForm] = useState<NewClientForm>(DEFAULT_FORM)
  const [savingClient, setSavingClient] = useState(false)
  const [companionError, setCompanionError] = useState('')

  // ── Members staging state ─────────────────────────────────────────────────
  // All Member changes (add / remove / lead / group) stage locally until Save is pressed.
  type PendingMember = {
    id: string          // case_member id (existing) or temp id (e.g. 'new-<clientId>') for not-yet-saved additions
    isNew: boolean      // pending case_member insert
    isRemoved: boolean  // pending case_member delete
    clientId: string
    clientNumber: string
    clientName: string
    nationality: string | null
    needsMuslim: boolean
    isLead: boolean
    groupId: string | null
  }
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([])
  const [savingMembers, setSavingMembers] = useState(false)
  const [membersError, setMembersError] = useState('')
  const [editMembers, setEditMembers] = useState(false)

  // Selected Products collapse toggle
  const [productsOpen, setProductsOpen] = useState(false)

  // Invoice
  const [copied, setCopied] = useState(false)
  const [scheduleCopied, setScheduleCopied] = useState(false)

  // Schedule review actions
  const [confirmingSchedule, setConfirmingSchedule] = useState(false)
  const [markingTravelComplete, setMarkingTravelComplete] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [revisionNote, setRevisionNote] = useState('')
  const [submittingRevision, setSubmittingRevision] = useState(false)
  const [scheduleError, setScheduleError] = useState('')

  // Trip (case-level) info edit
  const [editTrip, setEditTrip] = useState(false)
  const [tripForm, setTripForm] = useState<TripForm>(EMPTY_TRIP_FORM)
  const [savingTrip, setSavingTrip] = useState(false)
  const [tripError, setTripError] = useState('')

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchCase = useCallback(async () => {
    const { data } = await supabase
      .from('cases')
      .select(`
        id, case_number, status, travel_start_date, travel_end_date, created_at,
        concept, outbound_flight, inbound_flight,
        case_members(
          id, is_lead,
          clients(client_number, nationality, ${CLIENT_INFO_COLUMNS})
        ),
        quotes(
          id, quote_number, slug, total_price, payment_due_date, agent_margin_rate, company_margin_rate,
          quote_groups(
            id, name, order, member_count,
            quote_items(id, final_price, products(id, name, base_price, price_currency, duration_value, duration_unit)),
            quote_group_members(id, case_member_id)
          )
        ),
        schedules(id, slug, pdf_url, status, version, created_at, file_name, revision_note, confirmed_at)
      `)
      .eq('id', id)
      .single()
    const fresh = data as unknown as CaseDetail
    setCaseData(fresh)
    return fresh
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

  async function handleAddNewClient() {
    const f = newClientForm
    const missing: string[] = []
    if (!f.name.trim()) missing.push('Name')
    if (!f.nationality.trim()) missing.push('Nationality')
    if (!f.gender) missing.push('Gender')
    if (!f.date_of_birth) missing.push('Date of Birth')
    if (!f.phone.trim()) missing.push('Phone')
    if (!f.email.trim()) missing.push('Email')
    if (missing.length > 0) { setCompanionError(`Required: ${missing.join(', ')}`); return }
    if (!agentId || !caseData) return
    setSavingClient(true); setCompanionError('')
    try {
      // Create the client record (independent resource; stays even if user Cancels the case_members change).
      const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true })
      const { data: nc, error: ce } = await supabase.from('clients')
        .insert({
          client_number: `#CL-${String((count ?? 0) + 1).padStart(3, '0')}`,
          agent_id: agentId,
          name: f.name.trim(),
          nationality: f.nationality.trim(),
          gender: f.gender,
          date_of_birth: f.date_of_birth,
          phone: f.phone.trim(),
          email: f.email.trim(),
          needs_muslim_friendly: f.needs_muslim_friendly,
          dietary_restriction: f.dietary_restriction,
        })
        .select('id, name, nationality, needs_muslim_friendly').single()
      if (ce) throw ce

      setAgentClients(p => [...p, { id: nc.id, name: nc.name, nationality: nc.nationality }])

      // Stage as a new member (commits to case_members when user clicks Save).
      const tempId = `new-${nc.id}-${Date.now()}`
      setPendingMembers(prev => [...prev, {
        id: tempId, isNew: true, isRemoved: false,
        clientId: nc.id, clientNumber: '',
        clientName: nc.name, nationality: nc.nationality ?? null,
        needsMuslim: !!nc.needs_muslim_friendly, isLead: false, groupId: null,
      }])

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

  async function cancelCase() {
    if (!caseData) return
    if (caseData.status !== 'payment_pending') { setCancelError('Case can only be cancelled before payment is confirmed.'); return }
    if (!cancelReason.trim()) { setCancelError('Please enter a reason.'); return }
    setCancelling(true); setCancelError('')
    try {
      const caseId = caseData.id
      // Resolve related IDs
      const quoteIds = caseData.quotes?.map(q => q.id) ?? []
      const groupIds = caseData.quotes?.flatMap(q => q.quote_groups?.map(g => g.id) ?? []) ?? []

      // Delete in FK-safe order
      if (groupIds.length > 0) {
        await supabase.from('quote_group_members').delete().in('quote_group_id', groupIds)
        await supabase.from('quote_items').delete().in('quote_group_id', groupIds)
      }
      if (quoteIds.length > 0) {
        await supabase.from('quote_groups').delete().in('quote_id', quoteIds)
        await supabase.from('quotes').delete().in('id', quoteIds)
      }
      await supabase.from('case_members').delete().eq('case_id', caseId)
      const { error } = await supabase.from('cases').delete().eq('id', caseId)
      if (error) throw error

      await notifyAllAdmins(`${caseData.case_number} cancelled by agent — "${cancelReason.trim()}"`, '/admin/cases')
      await logAsCurrentUser('case.cancelled',
        { type: 'case', id: caseId, label: caseData.case_number },
        { reason: cancelReason.trim() })
      router.replace('/agent/cases')
    } catch (e: unknown) {
      setCancelError((e as { message?: string })?.message ?? 'Failed to cancel.')
      setCancelling(false)
    }
  }

  async function markTravelComplete() {
    if (!caseData) return
    if (!window.confirm('Mark this trip as completed? This will move the case to the settlement queue.')) return
    setMarkingTravelComplete(true); setScheduleError('')
    try {
      const { error } = await supabase.from('cases').update({ status: 'travel_completed', travel_completed_at: new Date().toISOString() }).eq('id', caseData.id)
      if (error) throw error
      await notifyAllAdmins(`${caseData.case_number} Travel completed — ready for settlement`, `/admin/settlement`)
      await logAsCurrentUser('case.travel_completed', { type: 'case', id: caseData.id, label: caseData.case_number })
      await fetchCase()
    } catch (e: unknown) {
      setScheduleError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setMarkingTravelComplete(false)
    }
  }

  async function confirmSchedule() {
    if (!caseData || !schedule) return
    setConfirmingSchedule(true); setScheduleError('')
    try {
      const { error: se } = await supabase.from('schedules')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', schedule.id)
      if (se) throw se
      await supabase.from('cases').update({ status: 'schedule_confirmed' }).eq('id', caseData.id)
      await notifyAllAdmins(`${caseData.case_number} Schedule v${schedule.version} confirmed`, `/admin/cases/${caseData.id}`)
      await logAsCurrentUser('schedule.confirmed', { type: 'case', id: caseData.id, label: caseData.case_number }, { version: schedule.version })
      await fetchCase()
    } catch (e: unknown) {
      setScheduleError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setConfirmingSchedule(false)
    }
  }

  async function saveTripInfo() {
    if (!caseData) return
    setSavingTrip(true); setTripError('')
    try {
      const out: FlightInfo = (tripForm.out_departure_datetime || tripForm.out_departure_airport
        || tripForm.out_arrival_datetime || tripForm.out_arrival_airport)
        ? {
            departure_datetime: tripForm.out_departure_datetime || undefined,
            departure_airport: tripForm.out_departure_airport || undefined,
            arrival_datetime: tripForm.out_arrival_datetime || undefined,
            arrival_airport: tripForm.out_arrival_airport || undefined,
          }
        : null
      const inb: FlightInfo = (tripForm.in_departure_datetime || tripForm.in_departure_airport
        || tripForm.in_arrival_datetime || tripForm.in_arrival_airport)
        ? {
            departure_datetime: tripForm.in_departure_datetime || undefined,
            departure_airport: tripForm.in_departure_airport || undefined,
            arrival_datetime: tripForm.in_arrival_datetime || undefined,
            arrival_airport: tripForm.in_arrival_airport || undefined,
          }
        : null
      const { error } = await supabase.from('cases').update({
        concept: tripForm.concept.trim() || null,
        outbound_flight: out,
        inbound_flight: inb,
      }).eq('id', caseData.id)
      if (error) throw error
      await fetchCase()
      setEditTrip(false)
    } catch (e: unknown) {
      setTripError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setSavingTrip(false)
    }
  }

  // Build initial pendingMembers snapshot from server data
  const buildPendingFromServer = useCallback((cd: CaseDetail): PendingMember[] => {
    const quote = cd.quotes[0]
    const gmMap = new Map<string, string>()
    quote?.quote_groups.forEach(g => g.quote_group_members?.forEach(gm => gmMap.set(gm.case_member_id, g.id)))
    return cd.case_members.map(m => ({
      id: m.id,
      isNew: false,
      isRemoved: false,
      clientId: m.clients?.id ?? '',
      clientNumber: m.clients?.client_number ?? '',
      clientName: m.clients?.name ?? '',
      nationality: m.clients?.nationality ?? null,
      needsMuslim: !!m.clients?.needs_muslim_friendly,
      isLead: m.is_lead,
      groupId: gmMap.get(m.id) ?? null,
    }))
  }, [])

  // Re-sync pendingMembers when server data loads/refreshes (unless user has staged changes)
  const membersDirty = (() => {
    if (!caseData) return false
    const snap = buildPendingFromServer(caseData)
    if (snap.length !== pendingMembers.filter(p => !p.isNew).length + pendingMembers.filter(p => p.isNew && !p.isRemoved).length) {
      // length mismatch happens when user added/removed
      if (pendingMembers.some(p => p.isNew || p.isRemoved)) return true
    }
    for (const p of pendingMembers) {
      const s = snap.find(s => s.id === p.id)
      if (!s) { if (p.isNew || !p.isRemoved) return true; else continue }
      if (p.isRemoved) return true
      if (p.isLead !== s.isLead) return true
      if (p.groupId !== s.groupId) return true
    }
    return false
  })()

  useEffect(() => {
    if (!caseData) return
    if (membersDirty) return // preserve staged edits across refetches
    setPendingMembers(buildPendingFromServer(caseData))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData])

  function stageAddExisting(clientId: string) {
    if (!clientId) return
    const existing = agentClients.find(c => c.id === clientId)
    if (!existing) return
    // Avoid duplicate (already in case)
    if (pendingMembers.some(p => p.clientId === clientId && !p.isRemoved)) {
      setMembersError('Client already in this case.')
      return
    }
    setMembersError('')
    const tempId = `new-${clientId}-${Date.now()}`
    setPendingMembers(prev => [...prev, {
      id: tempId, isNew: true, isRemoved: false,
      clientId, clientNumber: '',
      clientName: existing.name, nationality: existing.nationality ?? null,
      needsMuslim: false, isLead: false, groupId: null,
    }])
  }

  function stageToggleRemove(memberId: string) {
    setPendingMembers(prev => prev.flatMap(p => {
      if (p.id !== memberId) return [p]
      if (p.isNew) return [] // just drop from list
      return [{ ...p, isRemoved: !p.isRemoved, isLead: p.isRemoved ? p.isLead : false }]
    }))
  }

  function stageSetLead(memberId: string) {
    setPendingMembers(prev => prev.map(p => ({ ...p, isLead: p.id === memberId && !p.isRemoved })))
  }

  function stageAssignGroup(memberId: string, groupId: string | null) {
    setPendingMembers(prev => prev.map(p => p.id === memberId ? { ...p, groupId } : p))
  }

  async function saveMembers() {
    if (!caseData) return

    // Validation
    const activeMembers = pendingMembers.filter(p => !p.isRemoved)
    if (activeMembers.length === 0) {
      setMembersError('At least one member required.')
      return
    }
    const leadCount = activeMembers.filter(p => p.isLead).length
    if (leadCount === 0) { setMembersError('A lead must be designated.'); return }
    if (leadCount > 1) { setMembersError('Only one lead allowed.'); return }

    setSavingMembers(true); setMembersError('')
    try {
      const server = buildPendingFromServer(caseData)
      const quote = caseData.quotes[0]
      const quoteGroupIds = quote?.quote_groups.map(g => g.id) ?? []

      // 1) Delete removed existing members (cascade will clean group_members)
      const toDelete = pendingMembers.filter(p => !p.isNew && p.isRemoved).map(p => p.id)
      if (toDelete.length > 0) {
        const { error } = await supabase.from('case_members').delete().in('id', toDelete)
        if (error) throw error
      }

      // 2) Upsert new members (idempotent — re-save after a partial failure won't throw on dup key)
      const toInsert = pendingMembers.filter(p => p.isNew && !p.isRemoved)
      const tempIdToRealId = new Map<string, string>()
      if (toInsert.length > 0) {
        const rows = toInsert.map(p => ({ case_id: caseData.id, client_id: p.clientId, is_lead: false }))
        const { data: inserted, error } = await supabase
          .from('case_members')
          .upsert(rows, { onConflict: 'case_id,client_id', ignoreDuplicates: false })
          .select('id, client_id')
        if (error) throw error
        const byClient = new Map<string, string>()
          ; (inserted ?? []).forEach((r: { id: string; client_id: string }) => byClient.set(r.client_id, r.id))
        toInsert.forEach(p => {
          const realId = byClient.get(p.clientId)
          if (realId) tempIdToRealId.set(p.id, realId)
        })
      }

      // 3) Update is_lead for remaining/new members
      // Collect (realId, isLead) pairs
      const leadOps: { id: string; is_lead: boolean }[] = []
      for (const p of pendingMembers) {
        if (p.isRemoved) continue
        const realId = p.isNew ? tempIdToRealId.get(p.id) : p.id
        if (!realId) continue
        // Compare to server state
        const prior = server.find(s => s.id === p.id)
        if (!prior || prior.isLead !== p.isLead || p.isNew) {
          leadOps.push({ id: realId, is_lead: p.isLead })
        }
      }
      for (const op of leadOps) {
        const { error } = await supabase.from('case_members').update({ is_lead: op.is_lead }).eq('id', op.id)
        if (error) throw error
      }

      // 4) Sync group assignments
      for (const p of pendingMembers) {
        if (p.isRemoved) continue
        const realId = p.isNew ? tempIdToRealId.get(p.id) : p.id
        if (!realId) continue
        const priorGroup = server.find(s => s.id === p.id)?.groupId ?? null
        if (priorGroup !== p.groupId || p.isNew) {
          // Remove any existing assignment for this member
          if (quoteGroupIds.length > 0) {
            await supabase.from('quote_group_members').delete().eq('case_member_id', realId).in('quote_group_id', quoteGroupIds)
          }
          if (p.groupId) {
            const { error } = await supabase.from('quote_group_members').insert({ quote_group_id: p.groupId, case_member_id: realId })
            if (error) throw error
          }
        }
      }

      const fresh = await fetchCase()
      // Force rebuild: temp-id NEW entries are now real rows — otherwise membersDirty stays true
      // and the next Save would try to re-insert them (duplicate key).
      if (fresh) setPendingMembers(buildPendingFromServer(fresh))
      setEditMembers(false)
    } catch (e: unknown) {
      setMembersError((e as { message?: string })?.message ?? 'Failed to save members.')
      // Even on error, refetch to surface whatever did persist — prevents stale pending state
      // from triggering the same duplicate-key on retry.
      try {
        const fresh = await fetchCase()
        if (fresh) setPendingMembers(buildPendingFromServer(fresh))
      } catch { /* ignore refetch failures */ }
    } finally {
      setSavingMembers(false)
    }
  }

  function cancelMembers() {
    if (!caseData) return
    setPendingMembers(buildPendingFromServer(caseData))
    setMembersError('')
    setShowNewClient(false)
    setEditMembers(false)
  }

  function openTripEditor() {
    if (!caseData) return
    setTripForm({
      concept: caseData.concept ?? '',
      out_departure_datetime: caseData.outbound_flight?.departure_datetime ?? '',
      out_departure_airport: caseData.outbound_flight?.departure_airport ?? '',
      out_arrival_datetime: caseData.outbound_flight?.arrival_datetime ?? '',
      out_arrival_airport: caseData.outbound_flight?.arrival_airport ?? '',
      in_departure_datetime: caseData.inbound_flight?.departure_datetime ?? '',
      in_departure_airport: caseData.inbound_flight?.departure_airport ?? '',
      in_arrival_datetime: caseData.inbound_flight?.arrival_datetime ?? '',
      in_arrival_airport: caseData.inbound_flight?.arrival_airport ?? '',
    })
    setTripError('')
    setEditTrip(true)
  }

  async function requestRevision() {
    if (!caseData || !schedule) return
    if (!revisionNote.trim()) { setScheduleError('Please describe what needs to change.'); return }
    setSubmittingRevision(true); setScheduleError('')
    try {
      const { error: se } = await supabase.from('schedules')
        .update({ status: 'revision_requested', revision_note: revisionNote.trim() })
        .eq('id', schedule.id)
      if (se) throw se
      await notifyAllAdmins(`${caseData.case_number} Schedule v${schedule.version} revision requested`, `/admin/cases/${caseData.id}`)
      await logAsCurrentUser('schedule.revision_requested',
        { type: 'case', id: caseData.id, label: caseData.case_number },
        { version: schedule.version, note: revisionNote.trim() })
      await fetchCase()
      setShowRevisionModal(false)
      setRevisionNote('')
    } catch (e: unknown) {
      setScheduleError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setSubmittingRevision(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  if (!caseData) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-gray-400">Case not found.</p></div>

  const lead = caseData.case_members.find(m => m.is_lead)
  const companions = caseData.case_members.filter(m => !m.is_lead)
  const quote = caseData.quotes[0] ?? null
  const schedule = caseData.schedules && caseData.schedules.length > 0
    ? [...caseData.schedules].sort((a, b) => b.version - a.version)[0]
    : null

  const expectedMemberCount = quote?.quote_groups?.reduce((s, g) => s + (g.member_count ?? 0), 0) ?? 0
  const clientsMissingInfo = caseData.case_members
    .map(m => ({ member: m, missing: getMissingClientFields(m.clients) }))
    .filter(x => x.missing.length > 0)
  // Info-only completeness (member count shortfall is a group assignment concern, not an info concern)
  const allClientsComplete = caseData.case_members.length > 0 && clientsMissingInfo.length === 0
  const groupsComplete = !quote || quote.quote_groups.every(g => (g.quote_group_members?.length ?? 0) === g.member_count)
  const missingCaseFields = getMissingCaseFields(caseData)
  const caseInfoComplete = missingCaseFields.length === 0
  const scheduleReady = allClientsComplete && groupsComplete && caseInfoComplete

  // case_member_id → quote_group_id map
  const memberGroupMap = new Map<string, string>()
  quote?.quote_groups?.forEach(g => {
    g.quote_group_members?.forEach(gm => { memberGroupMap.set(gm.case_member_id, g.id) })
  })
  const sortedGroups = quote?.quote_groups ? [...quote.quote_groups].sort((a, b) => a.order - b.order) : []

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
        <span className="text-xs text-gray-500 ml-auto">
          <span className="text-[10px] uppercase tracking-wide text-gray-400 mr-1.5">Created</span>
          <span className="font-medium text-gray-700">{caseData.created_at.slice(0, 10)}</span>
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

          {/* Trip Info (case-level) */}
          <section className={`rounded-2xl p-5 ${caseInfoComplete ? 'bg-gray-50' : 'bg-amber-50 border border-amber-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trip Info</h3>
                {!caseInfoComplete && <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Required</span>}
              </div>
              {!editTrip ? (
                <button onClick={openTripEditor} className="text-xs text-[#0f4c35] hover:underline font-medium">
                  {caseInfoComplete ? 'Edit' : 'Add info'}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <button onClick={() => { setEditTrip(false); setTripError('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  <button onClick={saveTripInfo} disabled={savingTrip} className="text-xs font-medium text-[#0f4c35] hover:underline disabled:opacity-40">
                    {savingTrip ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            {!caseInfoComplete && !editTrip && (
              <p className="text-xs text-amber-800 mb-3">Missing: {missingCaseFields.join(' · ')}</p>
            )}

            {!editTrip ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="col-span-2">
                  <p className="text-[10px] text-gray-400 mb-0.5">Concept *</p>
                  <p className="text-gray-800">{caseData.concept || <span className="text-gray-300">—</span>}</p>
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t border-gray-200">
                  <div>
                    <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Outbound Flight *</p>
                    <p className="text-xs text-gray-800">{caseData.outbound_flight?.departure_airport ?? '—'} → {caseData.outbound_flight?.arrival_airport ?? '—'}</p>
                    <p className="text-[11px] text-gray-500">Dep: {caseData.outbound_flight?.departure_datetime ?? '—'}</p>
                    <p className="text-[11px] text-gray-500">Arr: {caseData.outbound_flight?.arrival_datetime ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Inbound Flight *</p>
                    <p className="text-xs text-gray-800">{caseData.inbound_flight?.departure_airport ?? '—'} → {caseData.inbound_flight?.arrival_airport ?? '—'}</p>
                    <p className="text-[11px] text-gray-500">Dep: {caseData.inbound_flight?.departure_datetime ?? '—'}</p>
                    <p className="text-[11px] text-gray-500">Arr: {caseData.inbound_flight?.arrival_datetime ?? '—'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Concept *</label>
                  <input type="text" value={tripForm.concept}
                    onChange={e => setTripForm(p => ({ ...p, concept: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35] bg-white" />
                </div>
                {([
                  ['Outbound', 'out'],
                  ['Inbound', 'in'],
                ] as const).map(([label, prefix]) => (
                  <div key={prefix} className="col-span-2 bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label} Flight *</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Departure Date & Time</label>
                        <DateTime24Picker value={tripForm[`${prefix}_departure_datetime`]}
                          minDate={caseData.created_at.slice(0, 10)}
                          onChange={v => setTripForm(p => ({ ...p, [`${prefix}_departure_datetime`]: v }))} />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Departure Airport</label>
                        <input type="text" value={tripForm[`${prefix}_departure_airport`]}
                          onChange={e => setTripForm(p => ({ ...p, [`${prefix}_departure_airport`]: e.target.value }))}
                          placeholder="e.g. Dubai (DXB)"
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0f4c35]" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Arrival Date & Time</label>
                        <DateTime24Picker value={tripForm[`${prefix}_arrival_datetime`]}
                          minDate={caseData.created_at.slice(0, 10)}
                          onChange={v => setTripForm(p => ({ ...p, [`${prefix}_arrival_datetime`]: v }))} />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Arrival Airport</label>
                        <input type="text" value={tripForm[`${prefix}_arrival_airport`]}
                          onChange={e => setTripForm(p => ({ ...p, [`${prefix}_arrival_airport`]: e.target.value }))}
                          placeholder="e.g. Incheon (ICN)"
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0f4c35]" />
                      </div>
                    </div>
                  </div>
                ))}
                {tripError && <p className="col-span-2 text-xs text-red-500">{tripError}</p>}
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

          {/* Members & Groups — includes member-related readiness */}
          {(() => {
            const memberShortfall = expectedMemberCount > 0 && caseData.case_members.length < expectedMemberCount
            const groupGaps = quote?.quote_groups?.filter(g => (g.quote_group_members?.length ?? 0) !== g.member_count) ?? []
            const memberIssueCount = (memberShortfall ? 1 : 0) + groupGaps.length + clientsMissingInfo.length
            const memberReady = memberIssueCount === 0 && caseData.case_members.length > 0
            return (
          <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Members ({pendingMembers.filter(p => !p.isRemoved).length}{expectedMemberCount > 0 ? ` / ${expectedMemberCount}` : ''})
                </h3>
                {!memberReady
                  ? <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{memberIssueCount} issue{memberIssueCount > 1 ? 's' : ''}</span>
                  : <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Ready</span>}
                {editMembers && membersDirty && <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Unsaved</span>}
              </div>
              {!editMembers ? (
                <button onClick={() => setEditMembers(true)}
                  className="text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
              ) : (
                <button onClick={() => setShowNewClient(v => !v)}
                  className="text-xs font-medium text-[#0f4c35] hover:underline">+ Register new client</button>
              )}
            </div>

            {/* Group slot overview — edit mode only (view-mode status handled by Case Readiness) */}
            {editMembers && sortedGroups.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className="text-gray-400">Group slots:</span>
                {sortedGroups.map(g => {
                  const assigned = pendingMembers.filter(p => !p.isRemoved && p.groupId === g.id).length
                  const full = assigned === g.member_count
                  const over = assigned > g.member_count
                  return (
                    <span key={g.id} className={`px-2 py-0.5 rounded-full border ${over ? 'bg-red-50 border-red-200 text-red-700' : full ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                      {g.name}: {assigned}/{g.member_count}
                    </span>
                  )
                })}
              </div>
            )}

            {/* Add existing client dropdown (edit mode only) */}
            {editMembers && (() => {
              const pendingClientIds = new Set(pendingMembers.filter(p => !p.isRemoved).map(p => p.clientId))
              const addable = agentClients.filter(c => !pendingClientIds.has(c.id))
              return addable.length > 0 && (
                <div className="flex items-center gap-2">
                  <select value="" onChange={e => { if (e.target.value) stageAddExisting(e.target.value) }}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#0f4c35] bg-white">
                    <option value="">+ Add existing client...</option>
                    {addable.map(c => <option key={c.id} value={c.id}>{c.name}{c.nationality ? ` (${c.nationality})` : ''}</option>)}
                  </select>
                </div>
              )
            })()}

            {showNewClient && (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
                <p className="text-xs font-medium text-gray-600">Register new client as companion</p>
                <div className="grid grid-cols-2 gap-3">
                  {([['Name *', 'name', 'text'], ['Nationality *', 'nationality', 'text'], ['Phone *', 'phone', 'text'], ['Email *', 'email', 'email']] as const).map(([label, field, type]) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input type={type} value={(newClientForm as unknown as Record<string, string>)[field]}
                        onChange={e => setNewClientForm(p => ({ ...p, [field]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Gender *</label>
                    <select value={newClientForm.gender}
                      onChange={e => setNewClientForm(p => ({ ...p, gender: e.target.value as 'male' | 'female' }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Date of Birth *</label>
                    <DOBPicker value={newClientForm.date_of_birth} onChange={v => setNewClientForm(p => ({ ...p, date_of_birth: v }))} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Muslim? *</label>
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

            {/* View mode — grouped 2-column compact list */}
            {!editMembers ? (
              pendingMembers.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">No members yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {(() => {
                    // Group members by groupId; unassigned go last
                    const groupedMembers = sortedGroups.map(g => ({
                      group: g,
                      members: pendingMembers.filter(p => p.groupId === g.id)
                        .sort((a, b) => Number(b.isLead) - Number(a.isLead)),
                    }))
                    const unassigned = pendingMembers.filter(p => !p.groupId)
                      .sort((a, b) => Number(b.isLead) - Number(a.isLead))

                    const blocks = [
                      ...groupedMembers.map(({ group, members }) => (
                        <div key={group.id}>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{group.name}</p>
                          {members.length === 0 ? (
                            <p className="text-xs text-gray-300">—</p>
                          ) : (
                            <div className="space-y-1">
                              {members.map(p => (
                                <div key={p.id} className="flex items-center gap-2 text-sm">
                                  <Link href={`/agent/clients/${p.clientId}`} className="font-medium text-[#0f4c35] hover:underline truncate">
                                    {p.clientName}
                                  </Link>
                                  <span className="text-[10px] font-mono text-gray-400">{p.clientNumber}</span>
                                  {p.isLead && <span className="text-[9px] font-medium text-white bg-[#0f4c35] px-1.5 py-0.5 rounded">LEAD</span>}
                                  {p.needsMuslim && <span className="text-[10px] text-emerald-600">Muslim</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )),
                      ...(unassigned.length > 0 ? [(
                        <div key="unassigned">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">Unassigned</p>
                          <div className="space-y-1">
                            {unassigned.map(p => (
                              <div key={p.id} className="flex items-center gap-2 text-sm">
                                <Link href={`/agent/clients/${p.clientId}`} className="font-medium text-[#0f4c35] hover:underline truncate">
                                  {p.clientName}
                                </Link>
                                <span className="text-[10px] font-mono text-gray-400">{p.clientNumber}</span>
                                {p.isLead && <span className="text-[9px] font-medium text-white bg-[#0f4c35] px-1.5 py-0.5 rounded">LEAD</span>}
                                {p.needsMuslim && <span className="text-[10px] text-emerald-600">Muslim</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )] : []),
                    ]
                    return blocks
                  })()}
                </div>
              )
            ) : (
              /* Edit mode — grouped 2-column staging UI */
              <>
                {(() => {
                  const renderMemberCard = (p: PendingMember) => {
                    const borderCls = p.isRemoved ? 'border-red-200 bg-red-50/40' : p.isNew ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-100 bg-white'
                    return (
                      <div key={p.id} className={`rounded-xl border p-2.5 space-y-1.5 ${borderCls}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.isRemoved ? (
                            <span className="text-sm font-medium text-gray-500 line-through truncate">{p.clientName}</span>
                          ) : (
                            <Link href={`/agent/clients/${p.clientId}`} className="text-sm font-medium text-[#0f4c35] hover:underline truncate">
                              {p.clientName}
                            </Link>
                          )}
                          {p.clientNumber && <span className="text-[10px] font-mono text-gray-400">{p.clientNumber}</span>}
                          {p.isLead && !p.isRemoved && <span className="text-[9px] font-medium text-white bg-[#0f4c35] px-1.5 py-0.5 rounded">LEAD</span>}
                          {p.needsMuslim && !p.isRemoved && <span className="text-[10px] text-emerald-600">Muslim</span>}
                          {p.isNew && <span className="text-[9px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">NEW</span>}
                          {p.isRemoved && <span className="text-[9px] font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded">REMOVED</span>}
                          <button onClick={() => stageToggleRemove(p.id)}
                            className={`ml-auto text-lg leading-none ${p.isRemoved ? 'text-gray-500 hover:text-gray-700' : 'text-gray-300 hover:text-red-400'}`}
                            title={p.isRemoved ? 'Undo removal' : 'Remove member'}>
                            {p.isRemoved ? '↺' : '×'}
                          </button>
                        </div>
                        {!p.isRemoved && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {sortedGroups.length > 0 && (
                              <select value={p.groupId ?? ''}
                                onChange={e => stageAssignGroup(p.id, e.target.value || null)}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#0f4c35] bg-white flex-1 min-w-0">
                                <option value="">— Unassigned —</option>
                                {sortedGroups.map(g => {
                                  const assigned = pendingMembers.filter(pp => !pp.isRemoved && pp.groupId === g.id).length
                                  const isCurrent = g.id === p.groupId
                                  const full = assigned >= g.member_count && !isCurrent
                                  return (
                                    <option key={g.id} value={g.id} disabled={full}>
                                      {g.name} ({assigned}/{g.member_count})
                                    </option>
                                  )
                                })}
                              </select>
                            )}
                            {!p.isLead && (
                              <button onClick={() => stageSetLead(p.id)}
                                className="text-[10px] font-medium text-[#0f4c35] hover:underline whitespace-nowrap">
                                Set as Lead
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  }

                  const groupedMembers = sortedGroups.map(g => ({
                    group: g,
                    members: pendingMembers.filter(p => p.groupId === g.id)
                      .sort((a, b) => Number(b.isLead) - Number(a.isLead)),
                  }))
                  const unassigned = pendingMembers.filter(p => !p.groupId)
                    .sort((a, b) => Number(b.isLead) - Number(a.isLead))

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {groupedMembers.map(({ group, members }) => (
                        <div key={group.id} className="space-y-2">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{group.name}</p>
                          {members.length === 0 ? (
                            <p className="text-xs text-gray-300 italic">No members assigned</p>
                          ) : (
                            members.map(renderMemberCard)
                          )}
                        </div>
                      ))}
                      {unassigned.length > 0 && (
                        <div className="space-y-2 sm:col-span-2">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Unassigned</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {unassigned.map(renderMemberCard)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {membersError && <p className="text-xs text-red-500">{membersError}</p>}

                <div className="flex items-center gap-2 justify-end pt-2 border-t border-gray-200">
                  <button onClick={cancelMembers} disabled={savingMembers}
                    className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg disabled:opacity-40">
                    Cancel
                  </button>
                  <button onClick={saveMembers} disabled={savingMembers || !membersDirty}
                    className="text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-3 py-1.5 rounded-lg disabled:opacity-40">
                    {savingMembers ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </>
            )}

            {/* Member-related readiness checklist (embedded, view mode only) */}
            {!editMembers && !memberReady && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-1">
                <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide mb-1.5">{memberIssueCount} issue{memberIssueCount > 1 ? 's' : ''} to resolve</p>
                <ul className="space-y-1 text-xs text-amber-800">
                  {memberShortfall && (
                    <li>· Members: {caseData.case_members.length} of {expectedMemberCount} registered</li>
                  )}
                  {groupGaps.map(g => (
                    <li key={g.id}>· {g.name}: {g.quote_group_members?.length ?? 0} / {g.member_count} assigned</li>
                  ))}
                  {clientsMissingInfo.map(({ member, missing }) => {
                    const c = member.clients
                    if (!c) return null
                    return (
                      <li key={member.id}>
                        · <Link href={`/agent/clients/${c.id}`} className="text-[#0f4c35] hover:underline font-medium">{c.name}</Link>
                        <span className="text-amber-700"> info incomplete ({missing.length} field{missing.length > 1 ? 's' : ''})</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>
            )
          })()}

          {/* Selected Products — group subtotals always visible, details collapsible */}
          {quote && quote.quote_groups.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Selected Products</h3>
                <span className="ml-auto text-[10px] font-mono text-gray-400">{quote.quote_number}</span>
                <button onClick={() => setProductsOpen(v => !v)}
                  className="flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-[#0f4c35]">
                  <span>{productsOpen ? 'Hide details' : 'Show details'}</span>
                  <svg className={`w-3 h-3 transition-transform ${productsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
              {[...quote.quote_groups].sort((a, b) => a.order - b.order).map(group => {
                const qty = Math.max(group.member_count ?? 1, 1)
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">{group.name}</span>
                        <span className="text-[10px] text-gray-400 bg-white border border-gray-100 rounded-full px-2 py-0.5">
                          {qty} member{qty > 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] text-gray-400">· {group.quote_items.length} item{group.quote_items.length > 1 ? 's' : ''}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-900">${groupTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>

                    {productsOpen && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
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
                    )}
                  </div>
                )
              })}

              {/* Grand total — always visible */}
              <div className="flex items-center justify-between bg-[#0f4c35]/5 border border-[#0f4c35]/15 rounded-2xl px-4 py-3">
                <span className="text-sm font-semibold text-gray-700">Total</span>
                <span className="text-base font-bold text-[#0f4c35]">${(quote.total_price / exchangeRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
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
              !scheduleReady
                ? <p className="text-sm text-amber-700">Complete trip info, every client&apos;s info, and group assignments above. The schedule will be uploaded once everything is ready.</p>
                : <p className="text-sm text-gray-400">No schedule uploaded yet. We will notify you once it is ready.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">Version {schedule.version}</p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        schedule.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        schedule.status === 'revision_requested' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {schedule.status === 'confirmed' ? 'Confirmed' :
                         schedule.status === 'revision_requested' ? 'Revision Requested' :
                         'Pending Review'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Uploaded {schedule.created_at.slice(0, 10)}</p>
                  </div>
                  {schedule.pdf_url && schedule.slug && <PrintPdfButton scheduleSlug={schedule.slug} />}
                </div>

                {schedule.status === 'revision_requested' && schedule.revision_note && (
                  <div className="border border-rose-200 bg-rose-50 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-rose-700 uppercase tracking-wide mb-1">Your Revision Note</p>
                    <p className="text-xs text-rose-800 whitespace-pre-line">{schedule.revision_note}</p>
                    <p className="text-[10px] text-rose-600 mt-2">Awaiting updated schedule from admin.</p>
                  </div>
                )}

                {schedule.status === 'confirmed' && schedule.confirmed_at && (
                  <p className="text-xs text-emerald-600">Confirmed on {schedule.confirmed_at.slice(0, 10)}</p>
                )}

                {scheduleError && <p className="text-xs text-red-500">{scheduleError}</p>}

                {/* Mark Travel Complete — only after schedule_confirmed, before travel_completed */}
                {caseData.status === 'schedule_confirmed' && (
                  <div className="flex items-center justify-end pt-1">
                    <button onClick={markTravelComplete} disabled={markingTravelComplete}
                      className="px-3 py-1.5 text-xs font-medium bg-white text-[#0f4c35] border border-[#0f4c35] rounded-lg hover:bg-[#0f4c35]/5 disabled:opacity-40 transition-colors">
                      {markingTravelComplete ? 'Updating...' : '✓ Mark Travel Complete'}
                    </button>
                  </div>
                )}
                {caseData.status === 'travel_completed' && (
                  <p className="text-xs text-gray-500">Travel completed. Commission pending settlement.</p>
                )}

                {schedule.status === 'pending' && (
                  <div className="flex items-center gap-2 justify-end pt-1">
                    <button onClick={() => { setShowRevisionModal(true); setRevisionNote(''); setScheduleError('') }}
                      className="px-3 py-1.5 text-xs font-medium text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors">
                      Request Revision
                    </button>
                    <button onClick={confirmSchedule} disabled={confirmingSchedule}
                      className="px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                      {confirmingSchedule ? 'Confirming...' : 'Confirm Schedule'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Revision note modal */}
          {showRevisionModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !submittingRevision && setShowRevisionModal(false)}>
              <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Request Schedule Revision</h3>
                  <p className="text-xs text-gray-500 mt-1">Describe what the client wants changed. Admin will upload a new version.</p>
                </div>
                <textarea
                  value={revisionNote}
                  onChange={e => setRevisionNote(e.target.value)}
                  placeholder="e.g. Move the hospital appointment to afternoon; swap day 3 and day 4."
                  rows={5}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35] resize-none"
                  autoFocus
                />
                {scheduleError && <p className="text-xs text-red-500">{scheduleError}</p>}
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => setShowRevisionModal(false)} disabled={submittingRevision}
                    className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg disabled:opacity-40">
                    Cancel
                  </button>
                  <button onClick={requestRevision} disabled={submittingRevision || !revisionNote.trim()}
                    className="text-xs font-medium bg-rose-600 text-white hover:bg-rose-700 px-3 py-1.5 rounded-lg disabled:opacity-40">
                    {submittingRevision ? 'Submitting...' : 'Submit Revision Request'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Financials */}
          {quote && (
            <section className="bg-gray-50 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Financials</h3>
                {quote.slug && (
                  <div className="flex items-center gap-2">
                    {/* Preview — open invoice in new tab */}
                    <a
                      href={`${typeof window !== 'undefined' ? window.location.origin : ''}/quote/${quote.slug}?preview=1`}
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

          {/* Cancel Case — agent self-service, only before payment */}
          {caseData.status === 'payment_pending' && (
            <section className="border border-red-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cancel Case</h3>
                <p className="text-xs text-gray-500">Remove this case if it was created by mistake. Admin will be notified with your reason.</p>
              </div>
              <button onClick={() => setShowCancel(true)}
                className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                Cancel Case
              </button>
            </section>
          )}

          {/* Cancel confirmation modal */}
          {showCancel && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={() => { if (!cancelling) setShowCancel(false) }}>
              <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Cancel Case {caseData.case_number}?</h3>
                  <p className="text-xs text-gray-500 mt-1">This will permanently remove the case and its quote. The admin will be notified with your reason. This action cannot be undone.</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Reason *</label>
                  <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                    rows={3} placeholder="e.g. Created the wrong quote by mistake, client changed their mind, etc."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] resize-none" />
                </div>
                {cancelError && <p className="text-xs text-red-500">{cancelError}</p>}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => { setShowCancel(false); setCancelReason(''); setCancelError('') }}
                    disabled={cancelling}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800">Keep Case</button>
                  <button onClick={cancelCase} disabled={cancelling || !cancelReason.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40">
                    {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
