// Auto-transitions + admin notifications driven by data changes.
// Call after client info save, case trip info save, or member add/remove.

import { supabase } from './supabase'
import {
  CLIENT_INFO_COLUMNS,
  hasCompleteClientInfo,
  getMissingCaseFields,
  type ClientInfo,
  type FlightInfo,
} from './clientCompleteness'
import { notifyAllAdmins } from './notifications'

type CaseRow = {
  id: string
  case_number: string
  status: string
  concept: string | null
  outbound_flight: FlightInfo
  inbound_flight: FlightInfo
  case_members: { clients: ClientInfo | null }[]
}

function isComplete(c: CaseRow): boolean {
  const caseFieldsMissing = getMissingCaseFields({
    concept: c.concept,
    outbound_flight: c.outbound_flight,
    inbound_flight: c.inbound_flight,
  })
  if (caseFieldsMissing.length > 0) return false
  const members = c.case_members ?? []
  if (members.length === 0) return false
  return members.every(m => hasCompleteClientInfo(m.clients))
}

// Single entry point — call after any agent edit that may affect case readiness.
// Handles three paths:
//  - status=awaiting_info, info now complete  → bump to awaiting_schedule + notify "ready for schedule"
//  - status=awaiting_info, info still incomplete → no notification (admin can't act yet)
//  - status past awaiting_info (active flow) → notify "client/trip info updated"
//  - status terminal (completed/canceled) → no notification
export async function notifyCaseInfoChanged(caseId: string): Promise<void> {
  const { data } = await supabase
    .from('cases')
    .select(`id, case_number, status, concept, outbound_flight, inbound_flight,
             case_members(clients(${CLIENT_INFO_COLUMNS}))`)
    .eq('id', caseId)
    .single()

  const c = data as unknown as CaseRow | null
  if (!c) return

  const TERMINAL = new Set(['completed', 'canceled'])
  if (TERMINAL.has(c.status)) return

  if (c.status === 'awaiting_info') {
    if (!isComplete(c)) return
    const { error } = await supabase
      .from('cases')
      .update({ status: 'awaiting_schedule' })
      .eq('id', caseId)
      .eq('status', 'awaiting_info')  // race guard
    if (error) return
    await notifyAllAdmins(
      `${c.case_number} ready for schedule — all client info complete`,
      `/admin/cases/${caseId}`
    )
    return
  }

  // Active flow past awaiting_info — agent edited info that admin should know about.
  await notifyAllAdmins(
    `${c.case_number} client/trip info updated by agent`,
    `/admin/cases/${caseId}`
  )
}
