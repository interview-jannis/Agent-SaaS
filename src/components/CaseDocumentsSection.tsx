'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { notifyAgent, notifyAssignedAdmin } from '@/lib/notifications'
import { logAsCurrentUser } from '@/lib/audit'
import {
  type DocumentRow,
  type DocumentItemRow,
  type DocumentType,
  type AdditionalItemDraft,
  DOCUMENT_LABELS,
  customerRouteFor,
  issueDepositSettlement,
  issueAdditionalInvoice,
  issueCommissionInvoice,
  addDocumentItem,
  removeDocumentItem,
  recalcDocumentTotal,
  markPaymentReceived,
} from '@/lib/documents'

// Issue intents — labels exposed in the UI map 1:1 to invoice flows in 4/30 SOP.
type IssueIntent =
  | 'deposit_settlement'       // admin → agent
  | 'additional'               // admin → client
  | 'commission'               // agent → admin

const INTENT_LABEL: Record<IssueIntent, string> = {
  deposit_settlement: 'Deposit Settlement (to Agent)',
  additional: 'Additional Invoice (to Client)',
  commission: 'Commission Invoice (to Admin)',
}

type ProductVariant = { id: string; variant_label: string | null; base_price: number; price_currency: string; sort_order: number }
type Product = { id: string; name: string; partner_name: string | null; base_price: number; price_currency: string; product_variants: ProductVariant[] }

type Props = {
  caseId: string
  caseNumber: string
  agentId: string
  /**
   * Who is viewing the section — controls which Issue / Mark Paid buttons
   * appear. Per 4/30 SOP:
   *   admin: Deposit Settlement (admin → agent), Additional (admin → client)
   *   agent: Deposit (agent → client), Commission (agent → admin)
   * Mark Paid is shown to the from_party (issuer = receiver of the money).
   */
  actor: 'admin' | 'agent'
  /** Case status — gates issuing/marking actions during pre-contract phase */
  caseStatus?: string
  /** When true, drop outer bg/rounded so the section can sit inside another wrapper. */
  embedded?: boolean
  /** travel_completed_at — gates Commission issuance on agent side */
  travelCompletedAt?: string | null
  quotation: DocumentRow | null
  finalInvoice: DocumentRow | null
  documents: DocumentRow[]                    // all docs for this case
  exchangeRate: number
  onChanged: () => Promise<void> | void       // parent re-fetches
  /** Admin only — called after marking final_invoice paid to advance case status */
  onFinalPaymentConfirm?: (paidAt: string) => Promise<void>
  /** When false, Mark Paid / Issue buttons are disabled (non-assigned admin) */
  canEdit?: boolean
}

// Card styling — all white so no single invoice type dominates the section
// visually. Type identification comes from TYPE_LABEL_TONE on the label chip.
const TYPE_TONE: Record<DocumentType, string> = {
  quotation: 'border-gray-200 bg-white',
  deposit_invoice: 'border-gray-200 bg-white',
  final_invoice: 'border-gray-200 bg-white',
  additional_invoice: 'border-gray-200 bg-white',
  commission_invoice: 'border-gray-200 bg-white',
}

const TYPE_LABEL_TONE: Record<DocumentType, string> = {
  quotation: 'text-gray-600',
  deposit_invoice: 'text-gray-700',
  final_invoice: 'text-gray-700',
  additional_invoice: 'text-gray-700',
  commission_invoice: 'text-gray-700',
}

function fmtKRW(n: number) { return '₩' + (n ?? 0).toLocaleString('ko-KR') }
function fmtUSD(n: number) { return '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

async function captureSigner(): Promise<{ name: string | null; title: string | null } | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return null
  const { data } = await supabase.from('admins').select('name, title').eq('auth_user_id', uid).maybeSingle()
  if (!data) return null
  return {
    name: (data as { name: string | null }).name ?? null,
    title: (data as { title: string | null }).title ?? null,
  }
}

export default function CaseDocumentsSection({
  caseId, caseNumber, agentId, actor, caseStatus, embedded, travelCompletedAt, quotation, finalInvoice, documents, exchangeRate, onChanged, onFinalPaymentConfirm, canEdit = true,
}: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<Record<string, DocumentItemRow[]>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Issue modal state — null when closed, otherwise the intent
  const [issuing, setIssuing] = useState<IssueIntent | null>(null)
  const [depositPercent, setDepositPercent] = useState('50')
  const [depositPercentDefault, setDepositPercentDefault] = useState('50')
  const [issueDueDate, setIssueDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10)
  })
  // Additional-invoice item drafts (for the Issue modal — admin builds the
  // line items here before clicking Issue, instead of issuing empty + adding
  // items inline afterward)
  const [draftItems, setDraftItems] = useState<AdditionalItemDraft[]>([])
  const [draftProductId, setDraftProductId] = useState('')
  const [draftPriceRaw, setDraftPriceRaw] = useState('')
  const [draftNameOverride, setDraftNameOverride] = useState('')

  // Item editing per-doc
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null)
  const [newItemProductId, setNewItemProductId] = useState('')
  const [newItemVariantId, setNewItemVariantId] = useState('')
  const [newItemPriceRaw, setNewItemPriceRaw] = useState('')
  const [newItemNameOverride, setNewItemNameOverride] = useState('')

  // Draft item variant (issue modal)
  const [draftVariantId, setDraftVariantId] = useState('')

  // Paid-at editing per-doc
  const [paidAtEditingId, setPaidAtEditingId] = useState<string | null>(null)
  const [paidAtValue, setPaidAtValue] = useState('')

  // Load products once
  useEffect(() => {
    supabase.from('products')
      .select('id, name, partner_name, base_price, price_currency, product_variants(id, variant_label, base_price, price_currency, sort_order)')
      .eq('is_active', true).order('name')
      .then(({ data }) => setProducts((data as unknown as Product[]) ?? []))
  }, [])

  // Load deposit % default from system settings
  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'deposit_percentage').maybeSingle()
      .then(({ data }) => {
        const pct = (data?.value as { percentage?: number } | null)?.percentage
        if (pct !== undefined) {
          const s = String(pct)
          setDepositPercent(s); setDepositPercentDefault(s)
        }
      })
  }, [])

  // Load items for all non-quotation docs (quotation items are rendered in
  // the existing Financials section already)
  useEffect(() => {
    async function loadItems() {
      const ids = documents.map(d => d.id)
      if (ids.length === 0) { setItems({}); return }
      const { data } = await supabase.from('document_items').select('*').in('document_id', ids).is('removed_at', null).order('sort_order')
      const grouped: Record<string, DocumentItemRow[]> = {}
      for (const it of (data as DocumentItemRow[] | null) ?? []) {
        if (!grouped[it.document_id]) grouped[it.document_id] = []
        grouped[it.document_id].push(it)
      }
      setItems(grouped)
    }
    loadItems()
  }, [documents])

  // Existing-doc detection — direction-aware
  const has = {
    depositToAgent: documents.some(d => d.type === 'deposit_invoice' && d.to_party === 'agent'),
    commission: documents.some(d => d.type === 'commission_invoice'),
  }

  async function doIssue(intent: IssueIntent) {
    setBusy(intent); setError('')
    try {
      const signer = await captureSigner()
      let issued: DocumentRow | null = null

      if (intent === 'deposit_settlement') {
        const pct = Math.max(1, Math.min(100, Number(depositPercent) || 50))
        issued = await issueDepositSettlement(caseId, { percent: pct, dueDate: issueDueDate, signerSnapshot: signer })
      } else if (intent === 'additional') {
        issued = await issueAdditionalInvoice(caseId, {
          items: draftItems,
          dueDate: issueDueDate,
          signerSnapshot: signer,
        })
      } else if (intent === 'commission') {
        // Agent → Admin: agent doesn't have a signer snapshot model; leave null
        issued = await issueCommissionInvoice(caseId, { dueDate: issueDueDate })
      }

      // Notify the counterparty (NOT the issuer themselves).
      if (issued) {
        const label = INTENT_LABEL[intent]
        const recipient: 'client' | 'agent' | 'admin' = issued.to_party

        await logAsCurrentUser(
          'document.issued',
          { type: 'case', id: caseId, label: caseNumber },
          { intent, document_number: issued.document_number, document_type: issued.type, to_party: recipient, total_price: issued.total_price },
        )

        if (recipient === 'admin') {
          // Agent issued commission → notify admins
          await notifyAssignedAdmin({ case_id: caseId }, `${caseNumber} ${label} issued by agent (${issued.document_number})`, `/admin/cases/${caseId}`)
        } else if (recipient === 'agent' && agentId) {
          // Admin issued deposit settlement → notify agent
          await notifyAgent(agentId, `${caseNumber} ${label} issued (${issued.document_number}) — please review`, `/agent/cases/${caseId}`)
        } else if (recipient === 'client') {
          // Client doesn't have notifications. Admin issued additional → notify
          // agent so they coordinate with the client.
          if (actor === 'admin' && agentId) {
            await notifyAgent(agentId, `${caseNumber} ${label} issued (${issued.document_number}) — please send to client`, `/agent/cases/${caseId}`)
          }
        }
      }

      setIssuing(null)
      setDraftItems([]); setDraftProductId(''); setDraftPriceRaw(''); setDraftNameOverride('')
      await onChanged()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to issue document.')
    } finally { setBusy(null) }
  }

  // Resolve KRW price from a product/variant's base_price + currency
  function resolveKrwPrice(basePriceVal: number, currency: string): number {
    return currency === 'USD' ? Math.round(basePriceVal * exchangeRate) : basePriceVal
  }

  function autofillPrice(productId: string, variantId: string, setter: (v: string) => void) {
    const product = products.find(p => p.id === productId)
    if (!product) return
    const variants = (product.product_variants ?? []).filter(v => v.sort_order !== undefined)
    const variant = variantId ? variants.find(v => v.id === variantId) : null
    const src = variant ?? (variants.length === 1 ? variants[0] : null) ?? product
    setter(String(resolveKrwPrice(src.base_price, src.price_currency)))
  }

  function addDraftItem() {
    const price = Number(draftPriceRaw.replace(/[^0-9]/g, '')) || 0
    if (price <= 0) { setError('Enter a non-zero price.'); return }
    const product = products.find(p => p.id === draftProductId)
    const variant = product?.product_variants?.find(v => v.id === draftVariantId) ?? null
    const name = draftNameOverride.trim() || product?.name || 'Custom item'
    setDraftItems(prev => [...prev, {
      productId: product?.id ?? null,
      variantId: variant?.id ?? null,
      variantLabelSnapshot: variant?.variant_label ?? null,
      productNameSnapshot: name,
      productPartnerSnapshot: product?.partner_name ?? null,
      basePrice: price,
      finalPrice: price,
    }])
    setDraftProductId(''); setDraftVariantId(''); setDraftPriceRaw(''); setDraftNameOverride('')
    setError('')
  }

  function removeDraftItem(idx: number) {
    setDraftItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function doRemoveItem(itemId: string, docId: string) {
    setBusy(itemId); setError('')
    try {
      const doc = documents.find(d => d.id === docId)
      await removeDocumentItem(itemId)
      await recalcDocumentTotal(docId)
      await logAsCurrentUser(
        'document.item_removed',
        { type: 'case', id: caseId, label: caseNumber },
        { document_number: doc?.document_number ?? null, item_id: itemId },
      )
      await onChanged()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to remove item.')
    } finally { setBusy(null) }
  }

  async function doAddItem(docId: string) {
    const priceVal = Number(newItemPriceRaw.replace(/[^0-9]/g, '')) || 0
    if (priceVal <= 0) { setError('Enter a non-zero price.'); return }
    setBusy(docId); setError('')
    try {
      const product = products.find(p => p.id === newItemProductId)
      const variant = product?.product_variants?.find(v => v.id === newItemVariantId) ?? null
      const name = newItemNameOverride.trim() || product?.name || 'Custom item'
      await addDocumentItem({
        documentId: docId,
        productId: product?.id ?? null,
        variantId: variant?.id ?? null,
        variantLabelSnapshot: variant?.variant_label ?? null,
        productNameSnapshot: name,
        productPartnerSnapshot: product?.partner_name ?? null,
        basePrice: priceVal,
        finalPrice: priceVal,
      })
      await recalcDocumentTotal(docId)
      const doc = documents.find(d => d.id === docId)
      await logAsCurrentUser(
        'document.item_added',
        { type: 'case', id: caseId, label: caseNumber },
        { document_number: doc?.document_number ?? null, name, price: priceVal },
      )
      setAddingItemTo(null)
      setNewItemProductId('')
      setNewItemVariantId('')
      setNewItemPriceRaw('')
      setNewItemNameOverride('')
      await onChanged()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to add item.')
    } finally { setBusy(null) }
  }

  async function doMarkPaid(docId: string) {
    if (!paidAtValue) return
    setBusy(docId); setError('')
    try {
      await markPaymentReceived(docId, new Date(paidAtValue).toISOString(), exchangeRate)
      setPaidAtEditingId(null); setPaidAtValue('')

      // Notify the counterparty that money was received. Issuer = receiver of
      // funds (from_party); the counterparty (the actor's partner) is who
      // originally needed to know that payment landed.
      const doc = documents.find(d => d.id === docId)
      await logAsCurrentUser(
        'document.paid',
        { type: 'case', id: caseId, label: caseNumber },
        { document_number: doc?.document_number ?? null, document_type: doc?.type, paid_at: paidAtValue, total_price: doc?.total_price ?? null },
      )
      if (doc) {
        const docNumber = doc.document_number ?? ''
        if (doc.type === 'deposit_invoice' && doc.from_party === 'admin' && doc.to_party === 'agent') {
          // Admin received deposit forward from agent → notify agent
          if (agentId) await notifyAgent(agentId, `${caseNumber} Deposit forward confirmed by admin (${docNumber})`, `/agent/cases/${caseId}`)
        } else if (doc.type === 'final_invoice') {
          // Admin received balance from client → advance status + notify agent
          if (onFinalPaymentConfirm) await onFinalPaymentConfirm(paidAtValue)
          if (agentId) await notifyAgent(agentId, `${caseNumber} Balance payment confirmed (${docNumber})`, `/agent/cases/${caseId}`)
        } else if (doc.type === 'commission_invoice') {
          // Admin marked commission invoice paid → create settlement + close case
          const amount = doc.total_price ?? 0
          const { count } = await supabase.from('settlements').select('*', { count: 'exact', head: true })
          const next = (count ?? 0) + 1
          const settlementNumber = `#S-${String(next).padStart(3, '0')}`
          await supabase.from('settlements').insert({
            settlement_number: settlementNumber,
            agent_id: agentId,
            case_id: caseId,
            amount,
            paid_at: paidAtValue,
          })
          await supabase.from('cases')
            .update({ status: 'completed' })
            .eq('id', caseId)
            .eq('status', 'awaiting_settlement')
          if (agentId) await notifyAgent(agentId, `${caseNumber} Commission paid (${docNumber}) — ${fmtUSD(amount / exchangeRate)}`, `/agent/cases/${caseId}`)
        }
      }

      // Deposit paid may unblock awaiting_deposit → awaiting_info/_schedule.
      try {
        const { notifyCaseInfoChanged } = await import('@/lib/caseTransitions')
        await notifyCaseInfoChanged(caseId)
      } catch { /* noop */ }
      await onChanged()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to mark paid.')
    } finally { setBusy(null) }
  }

  function copyLink(doc: DocumentRow) {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const url = `${baseUrl}/${customerRouteFor(doc.type)}/${doc.slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(doc.id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  // Visible documents in this section: all invoice types. Quotation is
  // rendered separately in the Selected Products section.
  const invoiceDocs = documents.filter(d =>
    d.type === 'deposit_invoice' || d.type === 'final_invoice' || d.type === 'additional_invoice' || d.type === 'commission_invoice'
  ).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  const canIssue = !!quotation  // need a quotation to base off
  // Pre-contract: nothing should be issued yet (3-party signing must finish first).
  const contractPending = caseStatus === 'awaiting_contract'
  // Highlight the section when it's the active CTA (deposit phase, no invoice yet)
  const ctaHighlight = caseStatus === 'awaiting_deposit' && invoiceDocs.length === 0

  return (
    <section className={embedded
      ? 'pt-4 border-t border-gray-200 space-y-3'
      : `${ctaHighlight ? 'bg-green-50 border-2 border-green-200' : 'bg-gray-50 border-2 border-gray-300'} rounded-2xl p-4 space-y-3`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Invoices</p>
        <div className="flex items-center gap-2 flex-wrap">
          {actor === 'admin' && !has.depositToAgent && (
            <button onClick={() => setIssuing('deposit_settlement')} disabled={!canEdit || !canIssue || contractPending}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[#0f4c35] text-white hover:bg-[#0a3828] disabled:opacity-40"
              title={contractPending ? 'Available after the 3-party contract is signed' : 'Admin → Agent (deposit owed to admin)'}>
              + Deposit Settlement
            </button>
          )}
          {actor === 'admin' && caseStatus !== 'completed' && (
            <button onClick={() => setIssuing('additional')} disabled={!canEdit || !canIssue || !finalInvoice}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
              title={finalInvoice ? 'Admin → Client (mid-trip add-ons)' : 'Available after Balance Invoice is issued (Finalize Pricing)'}>
              + Additional
            </button>
          )}
          {actor === 'agent' && !has.commission && (
            <button onClick={() => setIssuing('commission')} disabled={!canIssue || !travelCompletedAt}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[#0f4c35] text-white hover:bg-[#0a3828] disabled:opacity-40"
              title={travelCompletedAt ? 'Agent → Admin (claim margin)' : 'Available after travel is marked complete'}>
              + Commission
            </button>
          )}
        </div>
      </div>
      {!canIssue && (
        <p className="text-[11px] text-gray-500">Issue Quotation first via Home flow.</p>
      )}
      {ctaHighlight && actor === 'admin' && (
        <p className="text-[11px] text-green-800">3-party contract signed — issue the deposit settlement invoice to the agent.</p>
      )}
      {caseStatus === 'awaiting_deposit' && actor === 'agent' && quotation?.total_price ? (() => {
        const settlement = documents.find(d => d.type === 'deposit_invoice' && d.from_party === 'admin' && d.to_party === 'agent')
        const krw = settlement?.total_price
          ?? Math.round((quotation.total_price ?? 0) * (Number(depositPercentDefault) / 100))
        const usd = fmtUSD(krw / exchangeRate)
        return (
          <div className="text-[11px] text-green-900 bg-green-100/60 border border-green-200 rounded-lg px-3 py-2">
            <span className="font-semibold">Deposit to collect from client: {usd}</span>
            <span className="text-green-800/80"> ({fmtKRW(krw)})</span>
            <span className="block text-green-800/70 mt-0.5">
              {settlement
                ? 'Admin has issued the settlement — collect this amount from the client, then forward to admin.'
                : `Estimated at ${depositPercentDefault}% of the quotation. Final amount will be set when admin issues the deposit settlement.`}
            </span>
          </div>
        )
      })() : null}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Issue modal */}
      {issuing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !busy && setIssuing(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900">
              Issue {INTENT_LABEL[issuing]}
            </h3>
            {issuing === 'deposit_settlement' && (
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Deposit percent (%)</label>
                <input type="text" inputMode="numeric" value={depositPercent}
                  onChange={e => setDepositPercent(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                <p className="text-[10px] text-gray-400 mt-1">
                  Default {depositPercentDefault}% from settings.{' '}
                  {quotation?.total_price ? (() => {
                    const krw = Math.round(quotation.total_price * (Number(depositPercent) / 100))
                    const usd = fmtUSD(krw / exchangeRate)
                    return `≈ ${usd}${actor === 'admin' ? ` (${fmtKRW(krw)})` : ''}`
                  })() : ''}
                </p>
              </div>
            )}
            {issuing === 'commission' && quotation && (
              <p className="text-xs text-gray-600">
                Auto-calculated from agent margin rate. Estimated:{' '}
                <span className="font-semibold text-gray-900">
                  {(() => {
                    const tp = quotation.total_price ?? 0
                    const am = quotation.agent_margin_rate ?? 0
                    if (!am || am <= 0) return '$0.00'
                    const krw = Math.round(tp * am / (1 + am))
                    return fmtUSD(krw / exchangeRate)
                  })()}
                </span>
              </p>
            )}
            {issuing === 'additional' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">Add items to include on this invoice. You can also edit them later.</p>

                {/* Draft items list */}
                {draftItems.length > 0 && (
                  <div className="bg-gray-50 rounded-lg border border-gray-100 divide-y divide-gray-100">
                    {draftItems.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-800 truncate">{it.productNameSnapshot}</p>
                          {it.productPartnerSnapshot && (
                            <p className="text-[10px] text-gray-400 truncate">{it.productPartnerSnapshot}</p>
                          )}
                        </div>
                        <span className="text-xs text-gray-700 tabular-nums shrink-0">{fmtKRW(it.finalPrice)}</span>
                        <button onClick={() => removeDraftItem(idx)} className="text-gray-300 hover:text-red-500 transition-colors" title="Remove">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-2.5 py-1.5 bg-white">
                      <span className="text-[11px] text-gray-500">Total</span>
                      <span className="text-xs font-semibold text-gray-900 tabular-nums">
                        {fmtKRW(draftItems.reduce((s, it) => s + it.finalPrice, 0))}
                      </span>
                    </div>
                  </div>
                )}

                {/* Add item form */}
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-2 space-y-1.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <select value={draftProductId} onChange={e => {
                      const pid = e.target.value
                      setDraftProductId(pid); setDraftVariantId('')
                      if (pid) autofillPrice(pid, '', setDraftPriceRaw)
                      else setDraftPriceRaw('')
                    }} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white">
                      <option value="">— Custom (enter name) —</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.partner_name ? `${p.partner_name} · ` : ''}{p.name}
                        </option>
                      ))}
                    </select>
                    <input type="text" placeholder={draftProductId ? '(uses product name)' : 'Custom item name'}
                      value={draftNameOverride} onChange={e => setDraftNameOverride(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white" />
                  </div>
                  {(() => {
                    const variants = draftProductId ? (products.find(p => p.id === draftProductId)?.product_variants ?? []).filter(v => v.variant_label) : []
                    return variants.length > 1 ? (
                      <select value={draftVariantId} onChange={e => {
                        const vid = e.target.value
                        setDraftVariantId(vid)
                        autofillPrice(draftProductId, vid, setDraftPriceRaw)
                      }} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white">
                        <option value="">— Select variant —</option>
                        {variants.map(v => (
                          <option key={v.id} value={v.id}>{v.variant_label}</option>
                        ))}
                      </select>
                    ) : null
                  })()}
                  <div className="flex items-center gap-1.5">
                    <input type="text" inputMode="numeric" placeholder="Price (KRW)"
                      value={draftPriceRaw === '' ? '' : Number(draftPriceRaw).toLocaleString('en-US')}
                      onChange={e => setDraftPriceRaw(e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={e => e.key === 'Enter' && addDraftItem()}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] tabular-nums text-right bg-white" />
                    <button onClick={addDraftItem} disabled={!draftPriceRaw}
                      className="text-[11px] font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] rounded-lg px-3 py-1.5 disabled:opacity-40">
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Payment due date</label>
              <input type="date" value={issueDueDate} onChange={e => setIssueDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setIssuing(null)} disabled={!!busy}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg disabled:opacity-40">Cancel</button>
              <button onClick={() => doIssue(issuing)} disabled={!!busy}
                className="text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-3 py-1.5 rounded-lg disabled:opacity-40">
                {busy ? 'Issuing…' : 'Issue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document cards */}
      {invoiceDocs.length === 0 ? (
        <p className="text-[11px] text-gray-400">No deposit / additional / commission invoices yet.</p>
      ) : invoiceDocs.map(doc => {
        const docItems = items[doc.id] ?? []
        const paid = !!doc.payment_received_at
        const overdue = !paid && doc.payment_due_date && new Date(doc.payment_due_date) < new Date()
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        // Commission invoice (agent → admin): admin marks paid when they disburse.
        // Final invoice: admin confirms balance received from client.
        // All other invoices: issuer (from_party) confirms receipt.
        // Also gates by the canEdit prop (assigned admin check).
        const canMarkThisDoc = canEdit && (
          (doc.type === 'commission_invoice' || doc.type === 'final_invoice')
            ? actor === 'admin'
            : actor === doc.from_party
        )
        // Direction-specific label, since both deposit_invoice and final_invoice
        // can be admin → client; commission/deposit_invoice differ by from_party.
        const label = doc.type === 'deposit_invoice' && doc.to_party === 'agent'
          ? 'Deposit Settlement'
          : DOCUMENT_LABELS[doc.type]
        const partyLabel = (p: 'client' | 'agent' | 'admin') =>
          p === 'client' ? 'Client' : p === 'agent' ? 'Agent' : 'Admin'
        // Settlement (admin → agent) gets a darker shade so it visually separates
        // from the agent-issued client-facing deposit on the same case.
        const isSettlement = doc.type === 'deposit_invoice' && doc.to_party === 'agent'
        // Paid invoices show green border; unpaid stay white to draw attention.
        const cardTone = paid
          ? 'border-green-200 bg-green-50/30'
          : TYPE_TONE[doc.type]
        void isSettlement
        return (
          <div key={doc.id} className={`rounded-xl border ${cardTone} p-3 space-y-2`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${TYPE_LABEL_TONE[doc.type]}`}>
                  {label}
                </span>
                <span className="text-[10px] text-gray-400 font-medium">
                  {partyLabel(doc.from_party)} → {partyLabel(doc.to_party)}
                </span>
                <span className="text-[10px] font-mono text-gray-500">{doc.document_number}</span>
                {paid ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-800 border border-green-200 font-medium">✓ Paid {doc.payment_received_at?.slice(0, 10)}</span>
                ) : overdue ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Overdue</span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Pending</span>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtUSD((doc.total_price ?? 0) / exchangeRate)}</p>
                {actor === 'admin' && (
                  <p className="text-[10px] text-gray-400 tabular-nums">{fmtKRW(doc.total_price ?? 0)}</p>
                )}
              </div>
            </div>

            {/* Items — hidden for deposit_invoice (flat amount) and final_invoice
                (preview link is sufficient; items managed via Finalize Pricing). */}
            {doc.type !== 'deposit_invoice' && doc.type !== 'final_invoice' && (
              <div className="bg-white rounded-lg border border-gray-100 divide-y divide-gray-50">
                {docItems.length === 0 ? (
                  <p className="text-[11px] text-gray-400 px-3 py-2">No items.</p>
                ) : docItems.map(it => (
                  <div key={it.id} className="flex items-center gap-3 px-3 py-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800 truncate">{it.product_name_snapshot ?? 'Item'}</p>
                      {it.product_partner_snapshot && <p className="text-[10px] text-gray-400 truncate">{it.product_partner_snapshot}</p>}
                    </div>
                    <span className="text-xs text-gray-700 tabular-nums shrink-0">
                      {fmtUSD(it.final_price / exchangeRate)}
                      {actor === 'admin' && <span className="text-gray-400 ml-1">({fmtKRW(it.final_price)})</span>}
                    </span>
                    {!paid && canMarkThisDoc && (
                      <button onClick={() => doRemoveItem(it.id, doc.id)} disabled={busy === it.id}
                        className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40" title="Remove item">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add item inline form — deposit/commission/final invoices are not editable here */}
            {!paid && canMarkThisDoc && doc.type !== 'deposit_invoice' && doc.type !== 'final_invoice' && doc.type !== 'commission_invoice' && (
              addingItemTo === doc.id ? (
                <div className="bg-white rounded-lg border border-gray-200 p-2.5 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <select value={newItemProductId} onChange={e => {
                      const pid = e.target.value
                      setNewItemProductId(pid); setNewItemVariantId('')
                      if (pid) autofillPrice(pid, '', setNewItemPriceRaw)
                      else setNewItemPriceRaw('')
                    }} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35]">
                      <option value="">— Custom (enter name) —</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.partner_name ? `${p.partner_name} · ` : ''}{p.name}
                        </option>
                      ))}
                    </select>
                    <input type="text" placeholder={newItemProductId ? '(uses product name)' : 'Custom item name'}
                      value={newItemNameOverride} onChange={e => setNewItemNameOverride(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                  {(() => {
                    const variants = newItemProductId ? (products.find(p => p.id === newItemProductId)?.product_variants ?? []).filter(v => v.variant_label) : []
                    return variants.length > 1 ? (
                      <select value={newItemVariantId} onChange={e => {
                        const vid = e.target.value
                        setNewItemVariantId(vid)
                        autofillPrice(newItemProductId, vid, setNewItemPriceRaw)
                      }} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35]">
                        <option value="">— Select variant —</option>
                        {variants.map(v => (
                          <option key={v.id} value={v.id}>{v.variant_label}</option>
                        ))}
                      </select>
                    ) : null
                  })()}
                  <div className="flex items-center gap-2">
                    <input type="text" inputMode="numeric" placeholder="Price (KRW)"
                      value={newItemPriceRaw === '' ? '' : Number(newItemPriceRaw).toLocaleString('en-US')}
                      onChange={e => setNewItemPriceRaw(e.target.value.replace(/[^0-9]/g, ''))}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] tabular-nums text-right" />
                    <button onClick={() => { setAddingItemTo(null); setNewItemProductId(''); setNewItemVariantId(''); setNewItemPriceRaw(''); setNewItemNameOverride('') }}
                      disabled={busy === doc.id}
                      className="text-[11px] text-gray-500 hover:text-gray-800 px-2 py-1 disabled:opacity-40">Cancel</button>
                    <button onClick={() => doAddItem(doc.id)} disabled={busy === doc.id || !newItemPriceRaw}
                      className="text-[11px] font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] rounded-lg px-2.5 py-1 disabled:opacity-40">
                      {busy === doc.id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingItemTo(doc.id)}
                  className="text-[11px] font-medium text-gray-600 hover:text-[#0f4c35] hover:bg-white rounded-lg px-2 py-1 transition-colors">
                  + Add item
                </button>
              )
            )}

            {/* Bottom row — bordered button row matching the contract section's
                Save PDF / Expand button style (text links were too quiet). */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2 flex-wrap">
                <a href={`${baseUrl}/${customerRouteFor(doc.type)}/${doc.slug}?preview=1`} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded-lg border border-gray-200 hover:bg-white">
                  Preview ↗
                </a>
                <button onClick={() => copyLink(doc)}
                  className="text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded-lg border border-gray-200 hover:bg-white">
                  {copiedId === doc.id ? '✓ Copied!' : 'Copy link'}
                </button>
                {paid ? (
                  <span className="text-[10px] text-gray-400 ml-1">Paid {doc.payment_received_at?.slice(0, 10)}</span>
                ) : doc.payment_due_date ? (
                  <span className={`text-[10px] ml-1 ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    Due {doc.payment_due_date}
                  </span>
                ) : null}
              </div>
              <div className="min-h-[24px] flex items-center">
                {!paid && canMarkThisDoc && (
                  paidAtEditingId === doc.id ? (
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={paidAtValue} onChange={e => setPaidAtValue(e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-[11px] text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                      <button onClick={() => { setPaidAtEditingId(null); setPaidAtValue('') }}
                        className="text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded-lg border border-gray-200 hover:bg-white">Cancel</button>
                      <button onClick={() => doMarkPaid(doc.id)} disabled={!canMarkThisDoc || busy === doc.id || !paidAtValue}
                        className="text-[11px] font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] rounded-lg px-2.5 py-1 disabled:opacity-40">
                        {busy === doc.id ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setPaidAtEditingId(doc.id); setPaidAtValue(new Date().toISOString().slice(0, 10)) }}
                      disabled={!canMarkThisDoc}
                      className="text-[11px] font-semibold bg-[#0f4c35] text-white hover:bg-[#0a3828] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                      Mark Paid
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}
