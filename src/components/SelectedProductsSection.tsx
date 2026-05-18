'use client'

import { useState } from 'react'

// Shared "Selected Products" renderer for case detail pages (admin + agent).
// Reads from the canonical documents model (quotation + additional_invoices)
// using each item's stored final_price ??no margin-multiplier recalculation.
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
  location?: string | null
  full_address?: string | null
  product_categories?: { name: string } | null
  product_subcategories?: { name: string } | null
} | null

type Item = {
  id: string
  final_price: number
  quantity?: number | null
  is_overtime_item?: boolean | null
  products?: ProductSnapshot
  product_name_snapshot?: string | null
  variant_label_snapshot?: string | null
  removed_at?: string | null
  origin?: string | null
  agent_note?: string | null
  sort_order?: number | null
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
  showKRW?: boolean
  // When true, only show origin='original' items (hide admin_added until schedule confirmed)
  showOriginalOnly?: boolean
  // When provided, shows an Edit button in the header
  onEditClick?: () => void
  // Highlight with green border (schedule-related statuses)
  highlight?: boolean
}

function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtKRW(n: number) {
  return '₩' + Math.round(n).toLocaleString('ko-KR')
}

function itemName(item: Item): string {
  return item.products?.name ?? item.product_name_snapshot ?? ''
}

function activeItems(g: Group, showOriginalOnly = false): Item[] {
  if (showOriginalOnly) {
    // Pre-confirmation agent view: removals are not confirmed yet ??show all original items
    return (g.document_items ?? []).filter(it =>
      it.origin === 'original' || it.origin == null
    )
  }
  return (g.document_items ?? []).filter(it => !it.removed_at)
}

function groupTotal(g: Group, showOriginalOnly = false): number {
  return activeItems(g, showOriginalOnly).reduce((s, item) => s + (item.final_price ?? 0), 0)
}

export default function SelectedProductsSection({
  documents, exchangeRate, defaultExpanded = false, showKRW = true,
  showOriginalOnly = false, onEditClick, highlight = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [detailItem, setDetailItem] = useState<Item | null>(null)

  const quotation = documents.find(d => d.type === 'quotation') ?? null
  const additions = documents.filter(d => d.type === 'additional_invoice')

  // When showOriginalOnly, recompute grand total from filtered items
  const grandTotal = showOriginalOnly
    ? [...(quotation?.document_groups ?? []), ...additions.flatMap(d => d.document_groups)]
        .reduce((s, g) => s + groupTotal(g, true), 0)
    : (quotation?.total_price ?? 0) + additions.reduce((s, d) => s + (d.total_price ?? 0), 0)

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
            const total = groupTotal(group, showOriginalOnly)
            const totalUsd = total / exchangeRate
            const items = activeItems(group, showOriginalOnly)
            // When not filtering (admin / agent post-confirm): show all items
            // including removed ones for full audit trail. Sort: active-original
            // ??active-added ??removed.
            const displayItems = showOriginalOnly
              ? items
              : (() => {
                  const all = [...(group.document_items ?? [])]
                  const baseItems = all.filter(it => !it.is_overtime_item).sort((a, b) => {
                    // removed items always at the bottom
                    const removedRank = (it: Item) => it.removed_at ? 1 : 0
                    return removedRank(a) - removedRank(b) || (a.sort_order ?? 0) - (b.sort_order ?? 0)
                  })
                  const otItems = all.filter(it => it.is_overtime_item)
                  const sorted: Item[] = []
                  for (const base of baseItems) {
                    sorted.push(base)
                    const baseName = base.product_name_snapshot ?? ''
                    otItems.filter(ot => (ot.product_name_snapshot ?? '').startsWith(baseName + ' – Overtime')).forEach(ot => sorted.push(ot))
                  }
                  const placed = new Set(sorted.map(it => it.id))
                  otItems.filter(it => !placed.has(it.id)).forEach(it => sorted.push(it))
                  return sorted
                })()
            return (
              <div key={group.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-gray-800 truncate">{group.name}</span>
                    <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5 shrink-0">
                      {qty} pax
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">· {items.length} item{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{fmtUSD(totalUsd)}</p>
                    {showKRW && <p className="text-[10px] text-gray-400">{fmtKRW(total)}</p>}
                  </div>
                </div>

                {expanded && (
                  <div className="divide-y divide-gray-100">
                    {displayItems.map(item => {
                      const isRemoved = !!item.removed_at
                      const isAdminAdded = item.origin === 'admin_added'
                      const amtKRW = item.final_price ?? 0
                      const amtUSD = amtKRW / exchangeRate
                      const unitKRW = amtKRW / qty
                      const unitUSD = unitKRW / exchangeRate
                      const metaBits: string[] = []
                      if (item.is_overtime_item) {
                        // OT items: quantity = overtime hours, base_price = hourly rate
                        if (item.quantity != null) metaBits.push(`${item.quantity}h overtime`)
                      } else {
                        if (item.products?.duration_value) {
                          metaBits.push(`${item.products.duration_value} ${item.products.duration_unit ?? ''}`.trim())
                        }
                        // Trip Services: show days/nights from quantity
                        if (group.name === 'Trip Services' && item.quantity != null) {
                          const isHotel = item.products?.product_subcategories?.name === 'Hotel'
                          metaBits.push(`${item.quantity}${isHotel ? 'n' : 'd'}`)
                        }
                      }
                      metaBits.push(`${fmtUSD(unitUSD)} × ${qty}`)

                      let badge: string | null = null
                      let badgeClass = ''
                      if (!showOriginalOnly) {
                        if (isRemoved && isAdminAdded) {
                          badge = 'Removed Added'; badgeClass = 'bg-red-100 text-red-700'
                        } else if (isRemoved) {
                          badge = 'Removed'; badgeClass = 'bg-red-100 text-red-700'
                        } else if (isAdminAdded) {
                          badge = 'Added'; badgeClass = 'bg-emerald-100 text-emerald-700'
                        } else {
                          badge = 'Original'; badgeClass = 'bg-gray-100 text-gray-500'
                        }
                      }

                      return (
                        <button key={item.id}
                          onClick={() => !isRemoved ? setDetailItem(item) : undefined}
                          className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${isRemoved ? 'cursor-default' : 'hover:bg-gray-50'}`}>
                          {badge && (
                            <span className={`text-[9px] font-semibold uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded ${badgeClass}`}>
                              {badge}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${isRemoved ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              {itemName(item)}
                              {item.variant_label_snapshot && (
                                <span className={`font-normal ${isRemoved ? 'text-gray-400' : 'text-gray-500'}`}> · {item.variant_label_snapshot}</span>
                              )}
                            </p>
                            <p className={`text-[10px] truncate ${isRemoved ? 'text-gray-300' : 'text-gray-400'}`}>{metaBits.join(' · ')}</p>
                            {item.agent_note && !isRemoved && (
                              <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-0.5 truncate">Note: {item.agent_note}</p>
                            )}
                          </div>
                          <div className={`text-right shrink-0 ${isRemoved ? 'line-through' : ''}`}>
                            <p className={`text-sm font-semibold leading-tight ${isRemoved ? 'text-gray-300' : 'text-gray-800'}`}>{fmtUSD(amtUSD)}</p>
                            {showKRW && <p className={`text-[10px] leading-tight ${isRemoved ? 'text-gray-300' : 'text-gray-400'}`}>{fmtKRW(amtKRW)}</p>}
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
    <section className={`rounded-2xl border-2 overflow-hidden ${highlight ? 'bg-white border-[#0f4c35]' : 'bg-gray-50 border-gray-300'}`}>
      <div className={`flex items-center gap-2 px-5 py-2.5 border-b ${highlight ? 'bg-green-50 border-green-200' : 'bg-gray-100 border-gray-200'}`}>
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${highlight ? 'text-[#0f4c35]' : 'text-gray-700'}`}>Selected Products</h3>
        {additions.length > 0 && (
          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            +{additions.length} additional
          </span>
        )}
        {onEditClick && (
          <button onClick={onEditClick}
            className="text-xs font-semibold bg-green-700 text-white hover:bg-green-800 px-2.5 py-1 rounded-lg transition-colors">
            Edit
          </button>
        )}
        <button onClick={() => setExpanded(v => !v)}
          className="ml-auto text-xs font-medium bg-gray-700 text-white hover:bg-gray-600 px-2.5 py-1.5 rounded-lg transition-colors">
          {expanded ? '▲ Collapse' : '▼ Expand'}
        </button>
      </div>
      <div className="p-5 space-y-4">

      {quotation
        ? renderDoc(quotation, 'Quotation')
        : <p className="text-sm text-gray-400">No quotation.</p>}

      {additions.map(doc =>
        renderDoc(doc, `Additional · ${doc.finalized_at ? new Date(doc.finalized_at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : 'pending'}`)
      )}

      {/* Grand total ??sum across quotation + all additional invoices */}
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
      </div>{/* /p-5 content wrapper */}
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
          {(p?.location || p?.full_address) && (
            <div className="col-span-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Location</p>
              <p className="text-gray-800">{p.full_address ?? p.location}</p>
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

