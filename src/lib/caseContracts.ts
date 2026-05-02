// Case-level contract management — 3-party (Agent + Client + Admin) per-case
// agreements. Replaces the temp `markContractSigned` button once all 3 sigs
// are collected, the case auto-transitions awaiting_contract → awaiting_deposit.

import { supabase } from './supabase'
import { notifyAgent, notifyAllAdmins } from './notifications'

export type CaseContractType = 'three_party' | 'agent_client'

export type CaseContractRow = {
  id: string
  case_id: string
  contract_type: CaseContractType
  title_snapshot: string
  body_snapshot: string
  client_token: string | null
  // Agent
  agent_signed_at: string | null
  agent_signature_data_url: string | null
  agent_signer_name: string | null
  // Client
  client_signed_at: string | null
  client_signature_data_url: string | null
  client_signer_name: string | null
  // Admin
  admin_signed_at: string | null
  admin_signature_data_url: string | null
  admin_signer_id: string | null
  admin_signer_name: string | null
  admin_signer_title: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

function randomToken(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// Substitute identity tokens in template body. Tokens left undefined render
// as a [Placeholder] so the contract is readable but clearly templated.
export function substituteContractTokens(
  body: string,
  tokens: Partial<Record<'AGENT_NAME' | 'AGENT_COUNTRY' | 'CLIENT_NAME' | 'CASE_NUMBER' | 'QUOTE_NUMBER' | 'TOTAL_AMOUNT' | 'DEPOSIT_PERCENTAGE', string>>,
): string {
  return body
    .replace(/\*\*\{\{AGENT_NAME\}\}\*\*/g, tokens.AGENT_NAME ? `**${tokens.AGENT_NAME}**` : '[Agent name]')
    .replace(/\{\{AGENT_NAME\}\}/g, tokens.AGENT_NAME ? `**${tokens.AGENT_NAME}**` : '[Agent name]')
    .replace(/\{\{AGENT_COUNTRY\}\}/g, tokens.AGENT_COUNTRY || '[Agent country]')
    .replace(/\*\*\{\{CLIENT_NAME\}\}\*\*/g, tokens.CLIENT_NAME ? `**${tokens.CLIENT_NAME}**` : '[Client name]')
    .replace(/\{\{CLIENT_NAME\}\}/g, tokens.CLIENT_NAME ? `**${tokens.CLIENT_NAME}**` : '[Client name]')
    .replace(/\{\{CASE_NUMBER\}\}/g, tokens.CASE_NUMBER || '[Case number]')
    .replace(/\{\{QUOTE_NUMBER\}\}/g, tokens.QUOTE_NUMBER || '[Quote number]')
    .replace(/\{\{TOTAL_AMOUNT\}\}/g, tokens.TOTAL_AMOUNT || '[Total]')
    .replace(/\{\{DEPOSIT_PERCENTAGE\}\}/g, tokens.DEPOSIT_PERCENTAGE || '50')
}

// Create a new case_contract row by snapshotting the template body with the
// case's identity tokens substituted in. Returns the created row.
export async function createCaseContract(
  caseId: string,
  contractType: CaseContractType,
  tokens: Parameters<typeof substituteContractTokens>[1],
): Promise<CaseContractRow> {
  const { data: tpl, error: tplErr } = await supabase
    .from('contract_templates')
    .select('title, body')
    .eq('contract_type', contractType)
    .maybeSingle()
  if (tplErr || !tpl) throw new Error('Contract template not found. Edit in Admin > Contracts.')

  const body = substituteContractTokens((tpl as { body: string }).body, tokens)
  const { data, error } = await supabase
    .from('case_contracts')
    .insert({
      case_id: caseId,
      contract_type: contractType,
      title_snapshot: (tpl as { title: string }).title,
      body_snapshot: body,
      client_token: randomToken(),
    })
    .select('*')
    .single()
  if (error || !data) throw error ?? new Error('Failed to create case contract.')
  return data as CaseContractRow
}

export async function getCaseContract(caseId: string, contractType: CaseContractType = 'three_party'): Promise<CaseContractRow | null> {
  const { data } = await supabase
    .from('case_contracts')
    .select('*')
    .eq('case_id', caseId)
    .eq('contract_type', contractType)
    .maybeSingle()
  return data as CaseContractRow | null
}

export async function getCaseContractByToken(token: string): Promise<CaseContractRow | null> {
  const { data } = await supabase
    .from('case_contracts')
    .select('*')
    .eq('client_token', token)
    .maybeSingle()
  return data as CaseContractRow | null
}

export async function signAsAgent(contractId: string, signatureDataUrl: string, signerName: string): Promise<void> {
  const { error } = await supabase.from('case_contracts').update({
    agent_signature_data_url: signatureDataUrl,
    agent_signed_at: new Date().toISOString(),
    agent_signer_name: signerName,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  }).eq('id', contractId)
  if (error) throw error
}

export async function signAsClient(contractId: string, signatureDataUrl: string, signerName: string): Promise<void> {
  const { error } = await supabase.from('case_contracts').update({
    client_signature_data_url: signatureDataUrl,
    client_signed_at: new Date().toISOString(),
    client_signer_name: signerName,
  }).eq('id', contractId)
  if (error) throw error
}

export async function signAsAdmin(
  contractId: string,
  signatureDataUrl: string,
  admin: { id: string; name: string; title: string | null },
): Promise<void> {
  const { error } = await supabase.from('case_contracts').update({
    admin_signature_data_url: signatureDataUrl,
    admin_signed_at: new Date().toISOString(),
    admin_signer_id: admin.id,
    admin_signer_name: admin.name,
    admin_signer_title: admin.title,
  }).eq('id', contractId)
  if (error) throw error
}

export function isFullySigned(c: CaseContractRow | null | undefined): boolean {
  if (!c) return false
  return !!(c.agent_signed_at && c.client_signed_at && c.admin_signed_at)
}

// Try to advance case status from awaiting_contract to awaiting_deposit if the
// 3-party contract is now fully signed. Idempotent + safe to call after any
// signature event.
export async function tryAdvanceContractSigned(caseId: string): Promise<{ advanced: boolean }> {
  const c = await getCaseContract(caseId, 'three_party')
  if (!isFullySigned(c)) return { advanced: false }

  const { data: caseRow } = await supabase
    .from('cases').select('id, case_number, status, agent_id').eq('id', caseId).maybeSingle()
  const cr = caseRow as { id: string; case_number: string; status: string; agent_id: string | null } | null
  if (!cr) return { advanced: false }
  if (cr.status !== 'awaiting_contract') return { advanced: false }

  const { error } = await supabase
    .from('cases')
    .update({ status: 'awaiting_deposit' })
    .eq('id', caseId)
    .eq('status', 'awaiting_contract')
  if (error) return { advanced: false }

  // Notify both sides so they know to move on.
  if (cr.agent_id) {
    await notifyAgent(cr.agent_id, `${cr.case_number} 3-party contract signed — issue deposit invoice now`, `/agent/cases/${cr.id}`)
  }
  await notifyAllAdmins(`${cr.case_number} 3-party contract signed — deposit phase started`, `/admin/cases/${cr.id}`)
  return { advanced: true }
}
