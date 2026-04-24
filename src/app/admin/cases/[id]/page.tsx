'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { notifyAgent } from '@/lib/notifications'
import { logAsCurrentUser } from '@/lib/audit'

// ── Types ─────────────────────────────────────────────────────────────────────

type CaseStatus = 'payment_pending' | 'payment_completed' | 'schedule_reviewed' | 'schedule_confirmed' | 'travel_completed'

import type { ClientInfo, FlightInfo } from '@/lib/clientCompleteness'
import { getMissingClientFields, getMissingCaseFields, CLIENT_INFO_COLUMNS } from '@/lib/clientCompleteness'

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
  products: { id: string; name: string; description: string | null } | null
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
  slug: string
  total_price: number
  payment_due_date: string | null
  agent_margin_rate: number
  company_margin_rate: number
  quote_groups: QuoteGroup[]
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
  confirmed_at: string | null
  created_at: string
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

function fmtKRW(n: number) { return '₩' + n.toLocaleString('ko-KR') }
function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }


// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminCaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [caseData, setCaseData] = useState<Case | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [exchangeRate, setExchangeRate] = useState(1350)

  // Action states
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [paymentDate, setPaymentDate] = useState('')
  const [stagedFile, setStagedFile] = useState<File | null>(null)
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
        concept, outbound_flight, inbound_flight,
        agents!cases_agent_id_fkey(id, agent_number, name),
        case_members(
          id, is_lead,
          clients(client_number, nationality, date_of_birth, phone, email, special_requests, ${CLIENT_INFO_COLUMNS})
        ),
        quotes(
          id, quote_number, slug, total_price, payment_due_date, agent_margin_rate, company_margin_rate,
          quote_groups(id, name, order, member_count, quote_items(id, base_price, final_price, products(id, name, description)), quote_group_members(id, case_member_id))
        ),
        schedules(id, slug, pdf_url, status, version, file_name, revision_note, confirmed_at, created_at)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) console.error('[case] fetch error:', error)
    if (!data) { setNotFound(true); return }
    setCaseData(data as unknown as Case)
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
      const { error } = await supabase.from('cases').update({
        status: 'payment_completed',
        payment_date: paymentDate || null,
        payment_confirmed_at: new Date().toISOString(),
      }).eq('id', caseData.id)
      if (error) throw error
      await notifyAgent(caseData.agent_id, `${caseData.case_number} Payment confirmed`, `/agent/cases/${caseData.id}`)
      await logAsCurrentUser('case.payment_confirmed', { type: 'case', id: caseData.id, label: caseData.case_number },
        paymentDate ? { paid_on: paymentDate } : undefined)
      await fetchCase()
      setPaymentDate('')
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
    setActionError('')
  }

  async function confirmUpload() {
    if (!caseData || !stagedFile) return
    setUploadingSchedule(true); setActionError('')
    try {
      const path = `${caseData.id}/${Date.now()}_${stagedFile.name}`
      const { error: uploadError } = await supabase.storage.from('schedules').upload(path, stagedFile, { upsert: false })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('schedules').getPublicUrl(path)
      const pdfUrl = urlData.publicUrl

      const existing = caseData.schedules ?? []
      const slug = existing[0]?.slug ?? crypto.randomUUID()
      const version = existing.reduce((m, s) => Math.max(m, s.version), 0) + 1

      const { error: insertError } = await supabase.from('schedules').insert({
        case_id: caseData.id,
        quote_id: caseData.quotes?.[0]?.id ?? null,
        slug,
        pdf_url: pdfUrl,
        status: 'pending',
        version,
        file_name: stagedFile.name,
      })
      if (insertError) throw insertError

      await supabase.from('cases').update({ status: 'schedule_reviewed' }).eq('id', caseData.id)
      await notifyAgent(caseData.agent_id, `${caseData.case_number} Schedule uploaded (v${version})`, `/agent/cases/${caseData.id}`)
      await logAsCurrentUser('schedule.uploaded', { type: 'case', id: caseData.id, label: caseData.case_number }, { version, file_name: stagedFile.name })
      await fetchCase()
      setStagedFile(null)
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
      if (remaining.length === 0 && caseData?.status === 'schedule_reviewed') {
        await supabase.from('cases').update({ status: 'payment_completed' }).eq('id', caseData.id)
      }

      if (caseData) {
        await logAsCurrentUser('schedule.deleted', { type: 'case', id: caseData.id, label: caseData.case_number }, { version, file_name: fileName })
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
  const latestQuote = caseData.quotes?.[0] ?? null
  const sortedSchedules = caseData.schedules ? [...caseData.schedules].sort((a, b) => b.version - a.version) : []
  const latestSchedule = sortedSchedules[0] ?? null
  const expectedMemberCount = latestQuote?.quote_groups?.reduce((s, g) => s + (g.member_count ?? 0), 0) ?? 0
  const clientsMissingInfo = caseData.case_members
    .map(m => ({ member: m, missing: getMissingClientFields(m.clients) }))
    .filter(x => x.missing.length > 0)
  // Info-only completeness (member count shortfall handled by group assignment section)
  const allClientsComplete = caseData.case_members.length > 0 && clientsMissingInfo.length === 0
  const groupsComplete = !latestQuote || latestQuote.quote_groups.every(g => (g.quote_group_members?.length ?? 0) === g.member_count)
  const missingCaseFields = getMissingCaseFields(caseData)
  const caseInfoComplete = missingCaseFields.length === 0
  const scheduleReady = allClientsComplete && groupsComplete && caseInfoComplete
  // Schedule is locked once the agent confirms (or travel is complete) — no more uploads or deletes.
  const scheduleLocked = caseData.status === 'schedule_confirmed' || caseData.status === 'travel_completed'
  const canUploadSchedule = !scheduleLocked
    && (caseData.status === 'payment_completed' || caseData.status === 'schedule_reviewed')
    && (latestSchedule === null || latestSchedule.status === 'revision_requested')
    && scheduleReady
  const sortedGroups = latestQuote?.quote_groups ? [...latestQuote.quote_groups].sort((a, b) => a.order - b.order) : []
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header bar */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-gray-100 bg-white">
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

      {/* 50/50 split */}
      <div className="flex-1 overflow-hidden flex">

        {/* LEFT — Case Info + Actions */}
        <div className="w-1/2 overflow-y-auto border-r border-gray-100 px-6 py-6 space-y-5">

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
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="col-span-2">
                <p className="text-[10px] text-gray-400 mb-0.5">Concept *</p>
                <p className="text-gray-800">{caseData.concept || <span className="text-gray-300">—</span>}</p>
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t border-gray-200">
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

          {/* Members + Readiness (merged) */}
          {(() => {
            const memberShortfall = expectedMemberCount > 0 && caseData.case_members.length < expectedMemberCount
            const groupGaps = latestQuote?.quote_groups?.filter(g => (g.quote_group_members?.length ?? 0) !== g.member_count) ?? []
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
                  sortedGroups.forEach(g => g.quote_group_members?.forEach(gm => memberGroupMap.set(gm.case_member_id, g.id)))
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
                        <li key={g.id}>· {g.name}: {g.quote_group_members?.length ?? 0} / {g.member_count} assigned</li>
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
                  <span className="text-[10px] font-mono text-gray-400">{latestQuote.quote_number}</span>
                  <a href={`${baseUrl}/quote/${latestQuote.slug}?preview=1`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-gray-400 hover:text-[#0f4c35] transition-colors">View ↗</a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[10px] text-gray-400 mb-0.5">Total (KRW)</p><p className="font-semibold text-gray-900">{fmtKRW(latestQuote.total_price)}</p></div>
                <div><p className="text-[10px] text-gray-400 mb-0.5">Total (USD)</p><p className="font-semibold text-gray-900">{fmtUSD(latestQuote.total_price / exchangeRate)}</p></div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Payment Due</p>
                  <p className={`font-medium text-sm ${caseData.status === 'payment_pending' && latestQuote.payment_due_date && new Date(latestQuote.payment_due_date) < new Date() ? 'text-red-500' : 'text-gray-800'}`}>
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
                    {caseData.status === 'travel_completed'
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
                  return (
                    <div key={s.id} className={`bg-white rounded-xl border p-3 space-y-1.5 ${isLatest ? 'border-gray-300' : 'border-gray-100'}`}>
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">v{s.version}</span>
                        {isLatest && <span className="text-[9px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">LATEST</span>}
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusStyle}`}>{statusLabel}</span>
                        {s.status === 'revision_requested' && s.revision_note && (
                          <span className="text-xs text-gray-700 border-l-2 border-rose-300 pl-2 flex-1 min-w-0 whitespace-pre-line">{s.revision_note}</span>
                        )}
                        <span className="text-[10px] text-gray-400 ml-auto">{s.created_at.slice(0, 10)}</span>
                      </div>
                      {s.file_name && <p className="text-xs text-gray-500 break-all">{s.file_name}</p>}
                      <div className="flex items-center gap-3 pt-1">
                        {s.pdf_url && (
                          <a href={s.pdf_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-[#0f4c35] font-medium hover:underline">View PDF ↗</a>
                        )}
                        {!scheduleLocked && isLatest && s.status === 'pending' && (
                          <button
                            onClick={() => deleteScheduleVersion(s.id, s.pdf_url, s.version, s.file_name)}
                            disabled={deletingScheduleId === s.id}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto disabled:opacity-40"
                            title="Undo: only the latest upload can be deleted, before the agent reviews it.">
                            {deletingScheduleId === s.id ? 'Deleting...' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Admin Actions */}
          {actionError && <p className="text-xs text-red-500 px-1">{actionError}</p>}

          {caseData.status === 'payment_pending' && (
            <section className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Confirm Payment</p>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Payment Date (optional)</label>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                  min={caseData.created_at.slice(0, 10)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35] bg-white" />
              </div>
              <button onClick={confirmPayment} disabled={confirmingPayment}
                className="w-full py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
                {confirmingPayment ? 'Confirming...' : 'Confirm Payment'}
              </button>
            </section>
          )}

          {/* Blocked upload placeholder when schedule isn't ready */}
          {!scheduleReady
            && (caseData.status === 'payment_completed' || caseData.status === 'schedule_reviewed')
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
            <section className={`border rounded-2xl p-4 space-y-3 ${caseData.status === 'payment_completed' ? 'border-blue-200 bg-blue-50' : 'border-violet-200 bg-violet-50'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${caseData.status === 'payment_completed' ? 'text-blue-700' : 'text-violet-700'}`}>
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
                  className={`flex flex-col items-center justify-center gap-1 w-full py-6 text-sm font-medium rounded-xl border-2 border-dashed cursor-pointer ring-offset-1 transition-all ${caseData.status === 'payment_completed' ? 'border-blue-300 text-blue-700 hover:bg-blue-100 ring-blue-300' : 'border-violet-300 text-violet-700 hover:bg-violet-100 ring-violet-300'}`}>
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

          {caseData.status === 'schedule_confirmed' && (
            <section className="border border-emerald-200 bg-emerald-50 rounded-2xl p-4">
              <p className="text-xs text-emerald-700">Agent will mark travel complete after the trip.</p>
            </section>
          )}

        </div>

        {/* RIGHT — Selected Products */}
        <div className="w-1/2 overflow-y-auto px-6 py-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Selected Products</p>

          {sortedGroups.length === 0 ? (
            <p className="text-sm text-gray-300">No products selected.</p>
          ) : (
            <div className="space-y-4">
              {sortedGroups.map((group) => {
                const memberCount = Math.max(group.member_count ?? 1, 1)
                const groupTotal = group.quote_items.reduce((s, item) => s + item.final_price, 0)
                return (
                  <div key={group.id} className="bg-gray-50 rounded-2xl overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                      <span className="text-sm font-semibold text-gray-800">{group.name}</span>
                      <span className="text-[11px] text-gray-500">{memberCount} pax · {group.quote_items.length} item{group.quote_items.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Item rows */}
                    <div className="divide-y divide-gray-200">
                      {group.quote_items.map((item) => {
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
