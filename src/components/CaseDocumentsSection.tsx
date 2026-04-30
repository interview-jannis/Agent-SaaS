'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { notifyAgent } from '@/lib/notifications'
import {
  type DocumentRow,
  type DocumentItemRow,
  type DocumentType,
  DOCUMENT_LABELS,
  customerRouteFor,
  issueDepositInvoice,
  issueAdditionalInvoice,
  issueCommissionInvoice,
  addDocumentItem,
  removeDocumentItem,
  recalcDocumentTotal,
  markPaymentReceived,
} from '@/lib/documents'

type Product = { id: string; name: string; partner_name: string | null; base_price: number; price_currency: string }

type Props = {
  caseId: string
  caseNumber: string
  agentId: string
  quotation: DocumentRow | null
  finalInvoice: DocumentRow | null
  documents: DocumentRow[]                    // all docs for this case
  exchangeRate: number
  readOnly?: boolean                          // agent view: read + Send link only
  onChanged: () => Promise<void> | void       // parent re-fetches
}

const TYPE_TONE: Record<DocumentType, string> = {
  quotation: 'border-gray-200 bg-white',
  deposit_invoice: 'border-cyan-200 bg-cyan-50',
  final_invoice: 'border-violet-200 bg-violet-50',
  additional_invoice: 'border-amber-200 bg-amber-50',
  commission_invoice: 'border-emerald-200 bg-emerald-50',
}

const TYPE_LABEL_TONE: Record<DocumentType, string> = {
  quotation: 'text-gray-600',
  deposit_invoice: 'text-cyan-700',
  final_invoice: 'text-violet-700',
  additional_invoice: 'text-amber-700',
  commission_invoice: 'text-emerald-700',
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
  caseId, caseNumber, agentId, quotation, finalInvoice, documents, exchangeRate, readOnly = false, onChanged,
}: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<Record<string, DocumentItemRow[]>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Issue modal state
  const [issuing, setIssuing] = useState<DocumentType | null>(null)
  const [depositPercent, setDepositPercent] = useState('50')
  const [issueDueDate, setIssueDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10)
  })

  // Item editing per-doc
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null)
  const [newItemProductId, setNewItemProductId] = useState('')
  const [newItemPriceRaw, setNewItemPriceRaw] = useState('')
  const [newItemNameOverride, setNewItemNameOverride] = useState('')

  // Paid-at editing per-doc
  const [paidAtEditingId, setPaidAtEditingId] = useState<string | null>(null)
  const [paidAtValue, setPaidAtValue] = useState('')

  // Load products once
  useEffect(() => {
    supabase.from('products').select('id, name, partner_name, base_price, price_currency')
      .eq('is_active', true).order('name')
      .then(({ data }) => setProducts((data as Product[]) ?? []))
  }, [])

  // Load items for all non-quotation docs (quotation items are rendered in
  // the existing Financials section already)
  useEffect(() => {
    async function loadItems() {
      const ids = documents.map(d => d.id)
      if (ids.length === 0) { setItems({}); return }
      const { data } = await supabase.from('document_items').select('*').in('document_id', ids).order('sort_order')
      const grouped: Record<string, DocumentItemRow[]> = {}
      for (const it of (data as DocumentItemRow[] | null) ?? []) {
        if (!grouped[it.document_id]) grouped[it.document_id] = []
        grouped[it.document_id].push(it)
      }
      setItems(grouped)
    }
    loadItems()
  }, [documents])

  // Existing-doc detection (only one of each type allowed except additional)
  const has = {
    deposit: documents.some(d => d.type === 'deposit_invoice'),
    final: !!finalInvoice,
    commission: documents.some(d => d.type === 'commission_invoice'),
  }

  async function doIssue(type: Exclude<DocumentType, 'quotation'>) {
    setBusy(type); setError('')
    try {
      const signer = await captureSigner()
      let issued: DocumentRow | null = null
      if (type === 'deposit_invoice') {
        const pct = Math.max(1, Math.min(100, Number(depositPercent) || 50))
        issued = await issueDepositInvoice(caseId, { percent: pct, dueDate: issueDueDate, signerSnapshot: signer })
      } else if (type === 'additional_invoice') {
        issued = await issueAdditionalInvoice(caseId, { dueDate: issueDueDate, signerSnapshot: signer })
      } else if (type === 'commission_invoice') {
        issued = await issueCommissionInvoice(caseId, { dueDate: issueDueDate, signerSnapshot: signer })
      }
      // Notify the agent so they can review / send to client
      if (issued && agentId) {
        const label = DOCUMENT_LABELS[type]
        const message = type === 'additional_invoice'
          ? `${caseNumber} ${label} created (${issued.document_number}) — admin is editing items`
          : `${caseNumber} ${label} issued (${issued.document_number}) — please review and send to client`
        await notifyAgent(agentId, message, `/agent/cases/${caseId}`)
      }
      setIssuing(null)
      await onChanged()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to issue document.')
    } finally { setBusy(null) }
  }

  async function doRemoveItem(itemId: string, docId: string) {
    setBusy(itemId); setError('')
    try {
      await removeDocumentItem(itemId)
      await recalcDocumentTotal(docId)
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
      const name = newItemNameOverride.trim() || product?.name || 'Custom item'
      await addDocumentItem({
        documentId: docId,
        productId: product?.id ?? null,
        productNameSnapshot: name,
        productPartnerSnapshot: product?.partner_name ?? null,
        basePrice: priceVal,
        finalPrice: priceVal,
      })
      await recalcDocumentTotal(docId)
      setAddingItemTo(null)
      setNewItemProductId('')
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
      await markPaymentReceived(docId, new Date(paidAtValue).toISOString())
      setPaidAtEditingId(null); setPaidAtValue('')
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

  // Visible documents in this section: invoices only. Quotation + final_invoice
  // already render in the existing Financials section above.
  const invoiceDocs = documents.filter(d =>
    d.type === 'deposit_invoice' || d.type === 'additional_invoice' || d.type === 'commission_invoice'
  ).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  const canIssue = !!quotation  // need a quotation to base off

  return (
    <section className="bg-gray-50 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Invoices</p>
        {!readOnly && (
          <div className="flex items-center gap-2 flex-wrap">
            {!has.deposit && (
              <button onClick={() => setIssuing('deposit_invoice')} disabled={!canIssue}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40">
                + Deposit
              </button>
            )}
            <button onClick={() => setIssuing('additional_invoice')} disabled={!canIssue}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40">
              + Additional
            </button>
            {!has.commission && (
              <button onClick={() => setIssuing('commission_invoice')} disabled={!canIssue}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                + Commission
              </button>
            )}
          </div>
        )}
      </div>
      {!canIssue && !readOnly && (
        <p className="text-[11px] text-gray-500">Issue Quotation first via Home flow.</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Issue modal */}
      {issuing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !busy && setIssuing(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900">
              Issue {DOCUMENT_LABELS[issuing]}
            </h3>
            {issuing === 'deposit_invoice' && (
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Deposit percent (%)</label>
                <input type="text" inputMode="numeric" value={depositPercent}
                  onChange={e => setDepositPercent(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                <p className="text-[10px] text-gray-400 mt-1">
                  {quotation?.total_price ? `≈ ${fmtKRW(Math.round(quotation.total_price * (Number(depositPercent) / 100)))}` : ''}
                </p>
              </div>
            )}
            {issuing === 'commission_invoice' && quotation && (
              <p className="text-xs text-gray-600">
                Auto-calculated from agent margin rate. Estimated:{' '}
                <span className="font-semibold text-gray-900">
                  {(() => {
                    const tp = quotation.total_price ?? 0
                    const am = quotation.agent_margin_rate ?? 0
                    if (!am || am <= 0) return '₩0'
                    return fmtKRW(Math.round(tp * am / (1 + am)))
                  })()}
                </span>
              </p>
            )}
            {issuing === 'additional_invoice' && (
              <p className="text-xs text-gray-600">Issued empty — add items after creation.</p>
            )}
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Payment due date</label>
              <input type="date" value={issueDueDate} onChange={e => setIssueDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setIssuing(null)} disabled={!!busy}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg disabled:opacity-40">Cancel</button>
              <button onClick={() => issuing !== 'quotation' && doIssue(issuing)} disabled={!!busy}
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
        return (
          <div key={doc.id} className={`rounded-xl border ${TYPE_TONE[doc.type]} p-3 space-y-2`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${TYPE_LABEL_TONE[doc.type]}`}>
                  {DOCUMENT_LABELS[doc.type]}
                </span>
                <span className="text-[10px] font-mono text-gray-500">{doc.document_number}</span>
                {paid ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">Paid {doc.payment_received_at?.slice(0, 10)}</span>
                ) : overdue ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Overdue</span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Pending</span>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtKRW(doc.total_price ?? 0)}</p>
                <p className="text-[10px] text-gray-400 tabular-nums">{fmtUSD((doc.total_price ?? 0) / exchangeRate)}</p>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white rounded-lg border border-gray-100 divide-y divide-gray-50">
              {docItems.length === 0 ? (
                <p className="text-[11px] text-gray-400 px-3 py-2">No items.</p>
              ) : docItems.map(it => (
                <div key={it.id} className="flex items-center gap-3 px-3 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 truncate">{it.product_name_snapshot ?? 'Item'}</p>
                    {it.product_partner_snapshot && <p className="text-[10px] text-gray-400 truncate">{it.product_partner_snapshot}</p>}
                  </div>
                  <span className="text-xs text-gray-700 tabular-nums shrink-0">{fmtKRW(it.final_price)}</span>
                  {!paid && !readOnly && (
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

            {/* Add item inline form */}
            {!paid && !readOnly && (
              addingItemTo === doc.id ? (
                <div className="bg-white rounded-lg border border-gray-200 p-2.5 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <select value={newItemProductId} onChange={e => setNewItemProductId(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35]">
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
                  <div className="flex items-center gap-2">
                    <input type="text" inputMode="numeric" placeholder="Price (KRW)"
                      value={newItemPriceRaw === '' ? '' : Number(newItemPriceRaw).toLocaleString('en-US')}
                      onChange={e => setNewItemPriceRaw(e.target.value.replace(/[^0-9]/g, ''))}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] tabular-nums text-right" />
                    <button onClick={() => { setAddingItemTo(null); setNewItemProductId(''); setNewItemPriceRaw(''); setNewItemNameOverride('') }}
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

            {/* Bottom row — links + payment */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <a href={`${baseUrl}/${customerRouteFor(doc.type)}/${doc.slug}?preview=1`} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-gray-500 hover:text-[#0f4c35]">Preview ↗</a>
                <button onClick={() => copyLink(doc)}
                  className="text-[11px] text-gray-500 hover:text-[#0f4c35]">
                  {copiedId === doc.id ? 'Copied!' : 'Copy link'}
                </button>
              </div>
              {!paid && !readOnly && (
                paidAtEditingId === doc.id ? (
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={paidAtValue} onChange={e => setPaidAtValue(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-[11px] text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                    <button onClick={() => { setPaidAtEditingId(null); setPaidAtValue('') }}
                      className="text-[11px] text-gray-500 hover:text-gray-800">Cancel</button>
                    <button onClick={() => doMarkPaid(doc.id)} disabled={busy === doc.id || !paidAtValue}
                      className="text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg px-2 py-1 disabled:opacity-40">
                      {busy === doc.id ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setPaidAtEditingId(doc.id); setPaidAtValue(new Date().toISOString().slice(0, 10)) }}
                    className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800">Mark paid</button>
                )
              )}
            </div>
            {doc.payment_due_date && !paid && (
              <p className={`text-[10px] ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                Due {doc.payment_due_date}
              </p>
            )}
          </div>
        )
      })}
    </section>
  )
}
