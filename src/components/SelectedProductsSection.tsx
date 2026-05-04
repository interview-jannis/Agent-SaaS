'use client'

import { useState } from 'react'

// Shared "Selected Products" renderer for case detail pages (admin + agent).
// Reads from the canonical documents model (quotation + additional_invoices)
// using each item's stored final_price — no margin-multiplier recalculation.
// That guarantees both sides see the same numbers even after admin edits
// final_price inline or issues an additional invoice mid-trip.

type ProductSnapshot = {
  name: string
  description?: string | null
  partner_name?: string | null
  duration_value?: number | null
  duration_unit?: string | null
  has_female_doctor?: boolean | null
  has_prayer_room?: boolean | null
  dietary_type?: string | null
  location_address?: string | null
} | null

type Item = {
  id: string
  final_price: number
  products?: ProductSnapshot
  product_name_snapshot?: string | null
}

type Group = {
  id: string
  name: string
  order: number
  member_count: number
  document_items: Item[]
}

export type SelectedProductsDoc = {
  id: string
  type: 'quotation' | 'additional_invoice'
  document_number: string | null
  total_price: number | null
  finalized_at?: string | null
  document_groups: Group[]
}

type Props = {
  documents: SelectedProductsDoc[]
  exchangeRate: number
  defaultExpanded?: boolean
  // Show KRW alongside USD. Admin needs both (partner payouts / cost tracking
  // happen in KRW). Agent operates entirely in USD — pass false to keep the
  // numbers consistent with the rest of the agent app.
  showKRW?: boolean
}

function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtKRW(n: number) {
  return '₩' + Math.round(n).toLocaleString('ko-KR')
}

function itemName(item: Item): string {
  return item.products?.name ?? item.product_name_snapshot ?? '—'
}

function groupTotal(g: Group): number {
  return g.document_items.reduce((s, item) => s + (item.final_price ?? 0), 0)
}

export default function SelectedProductsSection({
  documents, exchangeRate, defaultExpanded = false, showKRW = true,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [detailItem, setDetailItem] = useState<Item | null>(null)

  const quotation = documents.find(d => d.type === 'quotation') ?? null
  const additions = documents.filter(d => d.type === 'additional_invoice')

  const grandTotal =
    (quotation?.total_price ?? 0) +
    additions.reduce((s, d) => s + (d.total_price ?? 0), 0)

  const renderDoc = (doc: SelectedProductsDoc, label: string) => {
    const sortedGroups = [...doc.document_groups].sort((a, b) => a.order - b.order)
    return (
      <div key={doc.id} className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
          {doc.document_number && (
            <span className="text-[10px] font-mono text-gray-400">{doc.document_number}</span>
          )}
        </div>

        {sortedGroups.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No items.</p>
        ) : (
          sortedGroups.map(group => {
            const qty = Math.max(group.member_count ?? 1, 1)
            const total = groupTotal(group)
            const totalUsd = total / exchangeRate
            return (
              <div key={group.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-gray-800 truncate">{group.name}</span>
                    <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5 shrink-0">
                      {qty} pax
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">· {group.document_items.length} item{group.document_items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{fmtUSD(totalUsd)}</p>
                    {showKRW && <p className="text-[10px] text-gray-400">{fmtKRW(total)}</p>}
                  </div>
                </div>

                {expanded && (
                  <div className="divide-y divide-gray-100">
                    {group.document_items.map(item => {
                      const amtKRW = item.final_price ?? 0
                      const amtUSD = amtKRW / exchangeRate
                      const unitKRW = amtKRW / qty
                      const unitUSD = unitKRW / exchangeRate
                      const metaBits: string[] = []
                      if (item.products?.duration_value) {
                        metaBits.push(`${item.products.duration_value} ${item.products.duration_unit ?? ''}`.trim())
                      }
                      metaBits.push(`${fmtUSD(unitUSD)} × ${qty}`)
                      return (
                        <button key={item.id} onClick={() => setDetailItem(item)}
                          className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">{itemName(item)}</p>
                            <p className="text-[10px] text-gray-400 truncate">{metaBits.join(' · ')}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-gray-800 leading-tight">{fmtUSD(amtUSD)}</p>
                            {showKRW && <p className="text-[10px] text-gray-400 leading-tight">{fmtKRW(amtKRW)}</p>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    )
  }

  return (
    <section className="bg-gray-50 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Selected Products</h3>
        {additions.length > 0 && (
          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            +{additions.length} additional
          </span>
        )}
        <button onClick={() => setExpanded(v => !v)}
          className="ml-auto text-[11px] font-medium text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-100">
          {expanded ? '▲ Collapse' : '▼ Expand'}
        </button>
      </div>

      {quotation
        ? renderDoc(quotation, 'Quotation')
        : <p className="text-sm text-gray-400">No quotation.</p>}

      {additions.map(doc =>
        renderDoc(doc, `Additional · ${doc.finalized_at ? new Date(doc.finalized_at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : 'pending'}`)
      )}

      {/* Grand total — sum across quotation + all additional invoices */}
      <div className="flex items-center justify-between bg-[#0f4c35]/5 border border-[#0f4c35]/15 rounded-xl px-4 py-3">
        <span className="text-sm font-semibold text-gray-700">Grand Total</span>
        <div className="text-right">
          <p className="text-base font-bold text-[#0f4c35]">{fmtUSD(grandTotal / exchangeRate)}</p>
          {showKRW && <p className="text-xs text-gray-500">{fmtKRW(grandTotal)}</p>}
        </div>
      </div>

      {detailItem && (
        <ProductDetailModal item={detailItem} exchangeRate={exchangeRate} showKRW={showKRW} onClose={() => setDetailItem(null)} />
      )}
    </section>
  )
}

function ProductDetailModal({
  item, exchangeRate, showKRW, onClose,
}: { item: Item; exchangeRate: number; showKRW: boolean; onClose: () => void }) {
  const p = item.products
  const tags: { label: string; tone: 'emerald' | 'gray' }[] = []
  if (p?.has_female_doctor) tags.push({ label: 'Female doctor available', tone: 'emerald' })
  if (p?.has_prayer_room) tags.push({ label: 'Prayer room', tone: 'emerald' })
  if (p?.dietary_type && p.dietary_type !== 'none') {
    tags.push({ label: p.dietary_type.replace(/_/g, ' '), tone: 'emerald' })
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">{itemName(item)}</h3>
            {p?.partner_name && (
              <p className="text-xs text-gray-500 mt-0.5">{p.partner_name}</p>
            )}
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none p-1 -m-1">×</button>
        </div>

        {p?.description && (
          <p className="text-sm text-gray-700 whitespace-pre-line">{p.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          {p?.duration_value && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Duration</p>
              <p className="text-gray-800">{p.duration_value} {p.duration_unit}</p>
            </div>
          )}
          {p?.location_address && (
            <div className="col-span-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Location</p>
              <p className="text-gray-800">{p.location_address}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Final Price</p>
            <p className="text-gray-800 font-semibold">{fmtUSD((item.final_price ?? 0) / exchangeRate)}</p>
            {showKRW && <p className="text-[10px] text-gray-400">{fmtKRW(item.final_price ?? 0)}</p>}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 pt-2 border-t border-gray-100">
            {tags.map(t => (
              <span key={t.label}
                className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 capitalize">
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
