// Documents model — single source of truth for Quotation + 4 Invoice types.
//
// Replaces the legacy `quotes/quote_items/quote_groups/quote_group_members`
// quartet. Each case has exactly one `quotation` document and may have
// additional `*_invoice` documents (deposit/final/additional/commission).
//
// Items can be freely added/removed/edited per-document, supporting the 4/30
// SOP where Quote and Invoice line items may diverge during travel-stage
// adjustments.

import { supabase } from './supabase'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type DocumentType =
  | 'quotation'
  | 'deposit_invoice'
  | 'final_invoice'
  | 'additional_invoice'
  | 'commission_invoice'

export const DOCUMENT_TYPES: DocumentType[] = [
  'quotation',
  'deposit_invoice',
  'final_invoice',
  'additional_invoice',
  'commission_invoice',
]

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  quotation: 'Quotation',
  deposit_invoice: 'Deposit Invoice',
  final_invoice: 'Final Invoice',
  additional_invoice: 'Additional Invoice',
  commission_invoice: 'Commission Invoice',
}

// Number prefix per type
const NUMBER_PREFIX: Record<DocumentType, string> = {
  quotation: '#Q-',
  deposit_invoice: '#INV-D-',
  final_invoice: '#INV-F-',
  additional_invoice: '#INV-A-',
  commission_invoice: '#INV-C-',
}

// Customer-facing route per type ('/quote' for quotation, '/invoice' for invoices)
export function customerRouteFor(type: DocumentType): 'quote' | 'invoice' {
  return type === 'quotation' ? 'quote' : 'invoice'
}

export type SignerSnapshot = { name: string | null; title: string | null }

export type DocumentRow = {
  id: string
  case_id: string
  type: DocumentType
  document_number: string
  slug: string
  total_price: number | null
  company_margin_rate: number | null
  agent_margin_rate: number | null
  finalized_at: string | null
  payment_due_date: string | null
  payment_received_at: string | null
  signer_snapshot: SignerSnapshot | null
  first_opened_at: string | null
  open_count: number
  created_at: string
  created_by_admin_id: string | null
  notes: string | null
}

export type DocumentItemRow = {
  id: string
  document_id: string
  document_group_id: string | null
  product_id: string | null
  product_name_snapshot: string | null
  product_partner_snapshot: string | null
  base_price: number
  final_price: number
  quantity: number
  sort_order: number
}

export type DocumentGroupRow = {
  id: string
  document_id: string
  name: string | null
  member_count: number
  order: number
}

export type DocumentGroupMemberRow = {
  id: string
  document_group_id: string
  case_member_id: string
}

// ────────────────────────────────────────────────────────────────────────────
// Identifiers
// ────────────────────────────────────────────────────────────────────────────

export function generateSlug(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// Generate the next document_number for a given type. Counts existing rows of
// that type and increments. Not strictly transactional — fine for low-volume
// MVP, revisit if collisions appear.
export async function nextDocumentNumber(type: DocumentType): Promise<string> {
  const { count } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('type', type)
  return NUMBER_PREFIX[type] + String((count ?? 0) + 1).padStart(3, '0')
}

// ────────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────────

// The (single) quotation document for a case. Returns null if the case has no
// quote yet (shouldn't happen for cases past Home flow, but safe to handle).
export async function getCaseQuotation(caseId: string): Promise<DocumentRow | null> {
  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('case_id', caseId)
    .eq('type', 'quotation')
    .maybeSingle()
  return data as DocumentRow | null
}

// All documents for a case, ordered by created_at ascending.
export async function getCaseDocuments(caseId: string): Promise<DocumentRow[]> {
  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true })
  return (data ?? []) as DocumentRow[]
}

// Get all documents for a case grouped by type (most recent per type at end).
export async function getCaseDocumentsByType(caseId: string): Promise<Partial<Record<DocumentType, DocumentRow[]>>> {
  const all = await getCaseDocuments(caseId)
  const out: Partial<Record<DocumentType, DocumentRow[]>> = {}
  for (const d of all) {
    if (!out[d.type]) out[d.type] = []
    out[d.type]!.push(d)
  }
  return out
}

// Lookup by slug — used by customer-facing pages.
export async function getDocumentBySlug(slug: string): Promise<DocumentRow | null> {
  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  return data as DocumentRow | null
}

// All items for a document with embedded group + product references resolved.
export async function getDocumentItems(documentId: string): Promise<DocumentItemRow[]> {
  const { data } = await supabase
    .from('document_items')
    .select('*')
    .eq('document_id', documentId)
    .order('sort_order', { ascending: true })
  return (data ?? []) as DocumentItemRow[]
}

export async function getDocumentGroups(documentId: string): Promise<DocumentGroupRow[]> {
  const { data } = await supabase
    .from('document_groups')
    .select('*')
    .eq('document_id', documentId)
    .order('order', { ascending: true })
  return (data ?? []) as DocumentGroupRow[]
}

export async function getDocumentGroupMembers(documentId: string): Promise<DocumentGroupMemberRow[]> {
  // Two-step (no FK from members to documents directly)
  const groups = await getDocumentGroups(documentId)
  if (groups.length === 0) return []
  const { data } = await supabase
    .from('document_group_members')
    .select('*')
    .in('document_group_id', groups.map(g => g.id))
  return (data ?? []) as DocumentGroupMemberRow[]
}

// ────────────────────────────────────────────────────────────────────────────
// Document creation
// ────────────────────────────────────────────────────────────────────────────

export type CreateDocumentInput = {
  caseId: string
  type: DocumentType
  totalPrice?: number | null
  companyMarginRate?: number | null
  agentMarginRate?: number | null
  paymentDueDate?: string | null   // YYYY-MM-DD
  notes?: string | null
}

// Create a new document row + return it. Generates document_number and slug
// automatically. Items + groups should be added separately.
export async function createDocument(input: CreateDocumentInput): Promise<DocumentRow> {
  const document_number = await nextDocumentNumber(input.type)
  const slug = generateSlug()
  const { data, error } = await supabase
    .from('documents')
    .insert({
      case_id: input.caseId,
      type: input.type,
      document_number,
      slug,
      total_price: input.totalPrice ?? null,
      company_margin_rate: input.companyMarginRate ?? null,
      agent_margin_rate: input.agentMarginRate ?? null,
      payment_due_date: input.paymentDueDate ?? null,
      notes: input.notes ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw error ?? new Error('Failed to create document')
  return data as DocumentRow
}

// ────────────────────────────────────────────────────────────────────────────
// Groups
// ────────────────────────────────────────────────────────────────────────────

export async function addDocumentGroup(
  documentId: string,
  name: string | null,
  order: number,
  memberCount: number,
): Promise<DocumentGroupRow> {
  const { data, error } = await supabase
    .from('document_groups')
    .insert({ document_id: documentId, name, order, member_count: memberCount })
    .select('*')
    .single()
  if (error || !data) throw error ?? new Error('Failed to add document group')
  return data as DocumentGroupRow
}

export async function updateDocumentGroup(
  groupId: string,
  patch: Partial<Pick<DocumentGroupRow, 'name' | 'member_count' | 'order'>>,
): Promise<void> {
  const { error } = await supabase.from('document_groups').update(patch).eq('id', groupId)
  if (error) throw error
}

export async function addDocumentGroupMember(groupId: string, caseMemberId: string): Promise<void> {
  const { error } = await supabase
    .from('document_group_members')
    .insert({ document_group_id: groupId, case_member_id: caseMemberId })
  if (error) throw error
}

export async function removeDocumentGroupMember(groupId: string, caseMemberId: string): Promise<void> {
  const { error } = await supabase
    .from('document_group_members')
    .delete()
    .eq('document_group_id', groupId)
    .eq('case_member_id', caseMemberId)
  if (error) throw error
}

// Remove a member from ALL groups under a document (used when a case_member is dropped)
export async function removeMemberFromAllGroups(documentId: string, caseMemberId: string): Promise<void> {
  const groups = await getDocumentGroups(documentId)
  if (groups.length === 0) return
  await supabase
    .from('document_group_members')
    .delete()
    .eq('case_member_id', caseMemberId)
    .in('document_group_id', groups.map(g => g.id))
}

// ────────────────────────────────────────────────────────────────────────────
// Items
// ────────────────────────────────────────────────────────────────────────────

export type AddItemInput = {
  documentId: string
  groupId?: string | null
  productId?: string | null
  productNameSnapshot?: string | null
  productPartnerSnapshot?: string | null
  basePrice: number
  finalPrice: number
  quantity?: number
  sortOrder?: number
}

export async function addDocumentItem(input: AddItemInput): Promise<DocumentItemRow> {
  const { data, error } = await supabase
    .from('document_items')
    .insert({
      document_id: input.documentId,
      document_group_id: input.groupId ?? null,
      product_id: input.productId ?? null,
      product_name_snapshot: input.productNameSnapshot ?? null,
      product_partner_snapshot: input.productPartnerSnapshot ?? null,
      base_price: input.basePrice,
      final_price: input.finalPrice,
      quantity: input.quantity ?? 1,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single()
  if (error || !data) throw error ?? new Error('Failed to add item')
  return data as DocumentItemRow
}

export async function updateDocumentItemPrice(itemId: string, finalPrice: number): Promise<void> {
  const { error } = await supabase
    .from('document_items')
    .update({ final_price: finalPrice })
    .eq('id', itemId)
  if (error) throw error
}

export async function removeDocumentItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('document_items').delete().eq('id', itemId)
  if (error) throw error
}

// ────────────────────────────────────────────────────────────────────────────
// Finalize / Pricing
// ────────────────────────────────────────────────────────────────────────────

export type FinalizeInput = {
  documentId: string
  totalPrice: number
  paymentDueDate?: string | null
  signerSnapshot?: SignerSnapshot | null
}

// Finalize a document — locks pricing, sets finalized_at, freezes signer.
// Idempotent on signer_snapshot (only sets if currently null).
export async function finalizeDocument(input: FinalizeInput): Promise<void> {
  const updates: Record<string, unknown> = {
    finalized_at: new Date().toISOString(),
    total_price: input.totalPrice,
  }
  if (input.paymentDueDate !== undefined) updates.payment_due_date = input.paymentDueDate
  if (input.signerSnapshot) updates.signer_snapshot = input.signerSnapshot

  const { error } = await supabase.from('documents').update(updates).eq('id', input.documentId)
  if (error) throw error
}

// Re-finalize (price edit after initial finalize) — preserves finalized_at,
// updates total_price + optional due date.
export async function repriceDocument(
  documentId: string,
  totalPrice: number,
  paymentDueDate?: string | null,
): Promise<void> {
  const updates: Record<string, unknown> = { total_price: totalPrice }
  if (paymentDueDate !== undefined) updates.payment_due_date = paymentDueDate
  const { error } = await supabase.from('documents').update(updates).eq('id', documentId)
  if (error) throw error
}

// ────────────────────────────────────────────────────────────────────────────
// Payment
// ────────────────────────────────────────────────────────────────────────────

export async function markPaymentReceived(documentId: string, when: string): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ payment_received_at: when })
    .eq('id', documentId)
  if (error) throw error
}

// ────────────────────────────────────────────────────────────────────────────
// Customer engagement (slug-driven open tracking)
// ────────────────────────────────────────────────────────────────────────────

// Called by /quote/[slug] and /invoice/[slug] server components on each render.
// Sets first_opened_at if not yet set, and increments open_count atomically.
export async function recordDocumentOpen(documentId: string): Promise<{ wasFirstOpen: boolean }> {
  const { data: existing } = await supabase
    .from('documents')
    .select('first_opened_at, open_count')
    .eq('id', documentId)
    .single()
  if (!existing) return { wasFirstOpen: false }
  const wasFirstOpen = !existing.first_opened_at
  const updates: Record<string, unknown> = {
    open_count: (existing.open_count ?? 0) + 1,
  }
  if (wasFirstOpen) updates.first_opened_at = new Date().toISOString()
  await supabase.from('documents').update(updates).eq('id', documentId)
  return { wasFirstOpen }
}

// ────────────────────────────────────────────────────────────────────────────
// Issue Invoice (deposit / final / additional / commission)
// ────────────────────────────────────────────────────────────────────────────

// Create a new invoice document for a case. By default copies items from the
// case's quotation document as a starting point (admin then edits per type).
export type IssueInvoiceInput = {
  caseId: string
  type: Exclude<DocumentType, 'quotation'>
  copyItemsFromQuotation?: boolean   // default true
  paymentDueDate?: string | null
  notes?: string | null
  signerSnapshot?: SignerSnapshot | null
}

export async function issueInvoice(input: IssueInvoiceInput): Promise<DocumentRow> {
  const copyItems = input.copyItemsFromQuotation ?? true

  // Fetch source quotation for margin/total carryover
  const quotation = await getCaseQuotation(input.caseId)

  const newDoc = await createDocument({
    caseId: input.caseId,
    type: input.type,
    totalPrice: quotation?.total_price ?? null,
    companyMarginRate: quotation?.company_margin_rate ?? null,
    agentMarginRate: quotation?.agent_margin_rate ?? null,
    paymentDueDate: input.paymentDueDate ?? null,
    notes: input.notes ?? null,
  })

  if (input.signerSnapshot) {
    await supabase.from('documents').update({ signer_snapshot: input.signerSnapshot }).eq('id', newDoc.id)
  }

  if (copyItems && quotation) {
    // Copy groups (preserve naming + ordering for invoice rendering)
    const srcGroups = await getDocumentGroups(quotation.id)
    const groupIdMap = new Map<string, string>()
    for (const g of srcGroups) {
      const newGroup = await addDocumentGroup(newDoc.id, g.name, g.order, g.member_count)
      groupIdMap.set(g.id, newGroup.id)
    }
    // Copy items
    const srcItems = await getDocumentItems(quotation.id)
    for (const it of srcItems) {
      await addDocumentItem({
        documentId: newDoc.id,
        groupId: it.document_group_id ? groupIdMap.get(it.document_group_id) ?? null : null,
        productId: it.product_id,
        productNameSnapshot: it.product_name_snapshot,
        productPartnerSnapshot: it.product_partner_snapshot,
        basePrice: it.base_price,
        finalPrice: it.final_price,
        quantity: it.quantity,
        sortOrder: it.sort_order,
      })
    }
    // Copy group members (so customer sees same family groupings)
    const srcGroupMembers = await getDocumentGroupMembers(quotation.id)
    for (const gm of srcGroupMembers) {
      const newGroupId = groupIdMap.get(gm.document_group_id)
      if (newGroupId) {
        await addDocumentGroupMember(newGroupId, gm.case_member_id)
      }
    }
  }

  return newDoc
}
