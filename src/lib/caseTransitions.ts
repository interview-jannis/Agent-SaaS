// Auto-transitions + admin notifications driven by data changes.
// Call after client info save, case trip info save, member add/remove, or
// document payment_received_at update.
//
// New SOP flow (4/30 meeting):
//   awaiting_contract  — quote sent, 3-party contract pending
//   awaiting_deposit   — contract signed, deposit + info pending in parallel
//   awaiting_schedule  — deposit paid AND info complete (admin starts work)
//   ...rest unchanged through awaiting_travel
//   awaiting_review    — travel done, review/survey pending
//   completed          — review submitted

import { supabase } from './supabase'
import {
  CLIENT_INFO_COLUMNS,
  hasCompleteClientInfo,
  getMissingCaseFields,
  type ClientInfo,
  type FlightInfo,
} from './clientCompleteness'
import { notifyAssignedAdmin } from './notifications'

type DocumentRow = {
  type: string
  from_party: string
  to_party: string
  payment_received_at: string | null
  document_groups: { member_count: number; document_group_members: { id: string }[] | null }[] | null
}

type CaseRow = {
  id: string
  case_number: string
  status: string
  concept: string | null
  outbound_flight: FlightInfo
  inbound_flight: FlightInfo
  case_members: { clients: ClientInfo | null }[]
  documents: DocumentRow[] | null
}

// Info completeness — case-level + every member's client info + quotation
// groups all filled.
function isInfoComplete(c: CaseRow): boolean {
  const caseFieldsMissing = getMissingCaseFields({
    concept: c.concept,
    outbound_flight: c.outbound_flight,
    inbound_flight: c.inbound_flight,
  })
  if (caseFieldsMissing.length > 0) return false
  const members = c.case_members ?? []
  if (members.length === 0) return false
  if (!members.every(m => hasCompleteClientInfo(m.clients))) return false

  const quotation = (c.documents ?? []).find(d => d.type === 'quotation')
  const groups = quotation?.document_groups ?? []
  if (groups.length === 0) return false
  return groups.every(g => (g.document_group_members?.length ?? 0) === g.member_count)
}

// "Deposit fully settled" — both legs of the deposit money flow are done:
//   1. Agent → Client invoice marked paid (client paid agent)
//   2. Admin → Agent settlement marked paid (agent forwarded the deposit to admin)
// Only when both are confirmed does the case advance out of awaiting_deposit.
function isDepositPaid(c: CaseRow): boolean {
  const docs = c.documents ?? []
  const clientLeg = docs.some(d =>
    d.type === 'deposit_invoice'
    && d.from_party === 'agent'
    && d.to_party === 'client'
    && !!d.payment_received_at
  )
  const adminLeg = docs.some(d =>
    d.type === 'deposit_invoice'
    && d.from_party === 'admin'
    && d.to_party === 'agent'
    && !!d.payment_received_at
  )
  return clientLeg && adminLeg
}

const SELECT = `id, case_number, status, concept, outbound_flight, inbound_flight,
                case_members(clients(${CLIENT_INFO_COLUMNS})),
                documents(type, from_party, to_party, payment_received_at,
                          document_groups(member_count, document_group_members(id)))`

async function fetchCase(caseId: string): Promise<CaseRow | null> {
  const { data } = await supabase
    .from('cases')
    .select(SELECT)
    .eq('id', caseId)
    .single()
  return data as unknown as CaseRow | null
}

// Single entry point — call after any agent edit that may affect case readiness
// or after any document state change. Handles:
//   - status=awaiting_info, info now complete  → bump to awaiting_schedule
//     (legacy path for old cases stuck in pre-SOP initial state)
//   - status=awaiting_deposit, deposit paid AND info complete → bump to awaiting_schedule
//   - any active state → notify admin with change summary if `change` provided
//   - terminal (completed/canceled) → no-op
export async function notifyCaseInfoChanged(
  caseId: string,
  change?: { header: string; items: string[] },
): Promise<void> {
  const c = await fetchCase(caseId)
  if (!c) return

  const TERMINAL = new Set(['completed', 'canceled'])
  if (TERMINAL.has(c.status)) return

  // awaiting_info: info-only gate. When info becomes complete → awaiting_schedule.
  // Reused for two paths:
  //   - Legacy cases that started at awaiting_info (pre-SOP).
  //   - New SOP flow: deposit paid moves the case here; admin can start scheduling
  //     only once the agent has finished collecting client/trip details.
  if (c.status === 'awaiting_info') {
    if (!isInfoComplete(c)) return
    const { error } = await supabase
      .from('cases')
      .update({ status: 'awaiting_schedule' })
      .eq('id', caseId)
      .eq('status', 'awaiting_info')
    if (error) return
    await notifyAssignedAdmin(
      { case_id: caseId },
      `${c.case_number} ready for schedule — all client info complete`,
      `/admin/cases/${caseId}`,
    )
    return
  }

  // awaiting_deposit: deposit-only gate. Once deposit is paid, move to
  // awaiting_info (or awaiting_schedule if info already happens to be complete).
  if (c.status === 'awaiting_deposit') {
    if (!isDepositPaid(c)) return
    const nextStatus = isInfoComplete(c) ? 'awaiting_schedule' : 'awaiting_info'
    const { error } = await supabase
      .from('cases')
      .update({ status: nextStatus })
      .eq('id', caseId)
      .eq('status', 'awaiting_deposit')
    if (error) return
    if (nextStatus === 'awaiting_schedule') {
      await notifyAssignedAdmin(
        { case_id: caseId },
        `${c.case_number} deposit received and info complete — ready for schedule`,
        `/admin/cases/${caseId}`,
      )
    } else {
      // Inform agent that deposit moved them into info-collection phase.
      const { data: caseRow } = await supabase.from('cases').select('agent_id').eq('id', caseId).maybeSingle()
      const agentId = (caseRow as { agent_id: string | null } | null)?.agent_id
      if (agentId) {
        const { notifyAgent } = await import('./notifications')
        await notifyAgent(agentId, `${c.case_number} deposit received — please complete client info to start schedule`, `/agent/cases/${caseId}`)
      }
    }
    return
  }

  // Any active state — emit change notif when caller provided one.
  if (!change) return

  let message: string
  if (change.items.length > 0) {
    message = `${c.case_number} ${change.header}\n\n• ${change.items.join('\n• ')}`
  } else {
    message = `${c.case_number} ${change.header}`
  }
  await notifyAssignedAdmin({ case_id: caseId }, message, `/admin/cases/${caseId}`)
}

// Mark the 3-party contract as signed → advance awaiting_contract → awaiting_deposit.
// Real signing flow lives in 2차 (case_contracts table). For now this is the
// transition trigger called from the temporary admin button.
export async function markContractSigned(caseId: string): Promise<void> {
  const c = await fetchCase(caseId)
  if (!c) return
  if (c.status !== 'awaiting_contract') return
  const { error } = await supabase
    .from('cases')
    .update({ status: 'awaiting_deposit' })
    .eq('id', caseId)
    .eq('status', 'awaiting_contract')
  if (error) return
  await notifyAssignedAdmin(
    { case_id: caseId },
    `${c.case_number} 3-party contract signed — deposit phase started`,
    `/admin/cases/${caseId}`,
  )
}

// Mark the post-travel review as submitted → advance awaiting_review → completed.
// Real survey flow lives in 3차 (surveys table). For now this is the transition
// trigger called from the temporary agent button.
export async function markReviewSubmitted(caseId: string): Promise<void> {
  const c = await fetchCase(caseId)
  if (!c) return
  if (c.status !== 'awaiting_review') return
  const { error } = await supabase
    .from('cases')
    .update({ status: 'completed' })
    .eq('id', caseId)
    .eq('status', 'awaiting_review')
  if (error) return
  await notifyAssignedAdmin(
    { case_id: caseId },
    `${c.case_number} client review submitted — case completed`,
    `/admin/cases/${caseId}`,
  )
}
