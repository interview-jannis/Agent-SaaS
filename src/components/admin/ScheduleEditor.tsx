'use client'

// In-page schedule editor (admin). Replaces PDF upload as the primary path.
//
// UX: one card per Day, each card has rows of items. Per-row inputs:
//   Block | Time (optional) | Title | Location | Notes | Product (optional)
// "Add Item" inside each Day card; "Add Day" extends the trip beyond
// travel_end_date if needed; "Remove Day" only enabled when day has 0 items.
//
// Save creates a new `schedules` row (next version) with the items JSONB,
// status='pending', and bumps cases.status to 'reviewing_schedule'.

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logAsCurrentUser } from '@/lib/audit'
import { notifyAgent } from '@/lib/notifications'
import {
  type ScheduleItem,
  type ScheduleItemBlock,
  SCHEDULE_BLOCKS,
  SCHEDULE_BLOCK_LABEL,
  compareScheduleItems,
  dateForDay,
  formatDayHeader,
  generateScheduleItemId,
} from '@/types/schedule'

type CaseProduct = {
  variantId: string
  productName: string
  variantLabel: string | null
  partnerName: string | null
}

type Props = {
  caseId: string
  caseNumber: string
  agentId: string | null
  travelStartDate: string | null
  travelEndDate: string | null
  // Latest schedule version, if any. Editor seeds from it when present.
  initialItems: ScheduleItem[]
  // Used to seed Day count when no items exist yet.
  defaultDayCount: number
  // Products from the case's quotation, for the optional product picker.
  caseProducts: CaseProduct[]
  // Triggered after a successful save so parent can refetch.
  onSaved: () => void
  // Slug for "Preview" link.
  slug: string | null
  // Save creates a new version on top of this.
  nextVersion: number
}

export default function ScheduleEditor({
  caseId, caseNumber, agentId,
  travelStartDate, travelEndDate,
  initialItems, defaultDayCount, caseProducts,
  onSaved, slug, nextVersion,
}: Props) {
  const [items, setItems] = useState<ScheduleItem[]>(initialItems)
  const [revisionNote, setRevisionNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Days present in the editor — union of (1..defaultDayCount) and any item's day.
  const days = useMemo(() => {
    const set = new Set<number>()
    for (let d = 1; d <= Math.max(defaultDayCount, 1); d++) set.add(d)
    for (const it of items) set.add(it.day)
    return Array.from(set).sort((a, b) => a - b)
  }, [items, defaultDayCount])

  const [maxDay, setMaxDay] = useState(() =>
    Math.max(defaultDayCount, ...items.map(i => i.day), 1)
  )

  function addDay() {
    setMaxDay(d => d + 1)
  }
  function removeDay(day: number) {
    if (items.some(i => i.day === day)) return
    // Shift any items above this day down by 1
    setItems(prev => prev.map(i => i.day > day ? { ...i, day: i.day - 1 } : i))
    setMaxDay(d => Math.max(1, d - 1))
  }

  function addItem(day: number) {
    const newItem: ScheduleItem = {
      id: generateScheduleItemId(),
      day,
      block: 'morning',
      time: null,
      title: '',
      location: null,
      notes: null,
      variantId: null,
      sortOrder: items.filter(i => i.day === day).length,
    }
    setItems(prev => [...prev, newItem])
  }

  function updateItem(id: string, patch: Partial<ScheduleItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id)
      if (idx < 0) return prev
      const target = prev[idx]
      // Sort within same (day, block) by current sortOrder
      const peers = prev
        .filter(i => i.day === target.day && i.block === target.block)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      const peerIdx = peers.findIndex(i => i.id === id)
      const swapWith = peers[peerIdx + direction]
      if (!swapWith) return prev
      // Swap sortOrders
      return prev.map(i => {
        if (i.id === target.id) return { ...i, sortOrder: swapWith.sortOrder }
        if (i.id === swapWith.id) return { ...i, sortOrder: target.sortOrder }
        return i
      })
    })
  }

  // Apply variant pick: fill Title from product+variant, Location from partner.
  function applyVariantPick(itemId: string, variantId: string | null) {
    if (!variantId) {
      updateItem(itemId, { variantId: null })
      return
    }
    const cp = caseProducts.find(p => p.variantId === variantId)
    if (!cp) {
      updateItem(itemId, { variantId })
      return
    }
    const titleParts = [cp.productName]
    if (cp.variantLabel) titleParts.push(cp.variantLabel)
    const newTitle = titleParts.join(' · ')
    updateItem(itemId, {
      variantId,
      title: newTitle,
      location: cp.partnerName ?? null,
    })
  }

  async function handleSave() {
    if (items.length === 0) {
      setError('Add at least one item before saving.')
      return
    }
    // Validate titles
    const empty = items.filter(i => !i.title.trim())
    if (empty.length > 0) {
      setError(`${empty.length} item${empty.length > 1 ? 's' : ''} missing a title.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      // Normalize sortOrder per (day, block) for stable storage
      const normalized = [...items]
        .sort(compareScheduleItems)
        .map((it, idx) => ({ ...it, sortOrder: idx }))

      // Reuse existing slug if we have one, else generate.
      const newSlug = slug ?? (Math.random().toString(36).slice(2, 10) + Date.now().toString(36))

      const { error: insertError } = await supabase.from('schedules').insert({
        case_id: caseId,
        version: nextVersion,
        slug: newSlug,
        status: 'pending',
        items: normalized,
        pdf_url: null,
        revision_note: revisionNote.trim() || null,
      })
      if (insertError) throw insertError

      // Bump case status if it was awaiting_schedule
      await supabase
        .from('cases')
        .update({ status: 'reviewing_schedule' })
        .eq('id', caseId)
        .eq('status', 'awaiting_schedule')

      // Notify agent
      if (agentId) {
        await notifyAgent(
          agentId,
          `Schedule v${nextVersion} ready for review on ${caseNumber}`,
          `/agent/cases/${caseId}`,
        )
      }

      await logAsCurrentUser(
        'schedule.uploaded',
        { type: 'case', id: caseId, label: caseNumber },
        { version: nextVersion, item_count: normalized.length, source: 'editor', note: revisionNote.trim() || null },
      )

      onSaved()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save schedule.')
    } finally {
      setSaving(false)
    }
  }

  const visibleDays = Array.from(new Set([...days, ...Array.from({ length: maxDay }, (_, i) => i + 1)]))
    .sort((a, b) => a - b)

  return (
    <div className="space-y-4">
      {visibleDays.map(day => {
        const dayItems = items
          .filter(i => i.day === day)
          .sort(compareScheduleItems)
        const dateObj = dateForDay(travelStartDate, day)
        const canRemove = dayItems.length === 0 && visibleDays.length > 1
        return (
          <div key={day} className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-semibold text-gray-900">Day {day}</p>
                {dateObj && <p className="text-xs text-gray-400">{formatDayHeader(dateObj)}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => addItem(day)}
                  className="text-xs font-medium text-[#0f4c35] hover:underline"
                >
                  + Add Item
                </button>
                {canRemove && (
                  <button
                    onClick={() => removeDay(day)}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Remove Day
                  </button>
                )}
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {dayItems.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 text-center italic">No items yet — click &quot;Add Item&quot; to start.</p>
              ) : (
                dayItems.map((it, idx) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    caseProducts={caseProducts}
                    canMoveUp={idx > 0 && dayItems[idx - 1].block === it.block}
                    canMoveDown={idx < dayItems.length - 1 && dayItems[idx + 1].block === it.block}
                    onUpdate={(patch) => updateItem(it.id, patch)}
                    onApplyVariant={(vid) => applyVariantPick(it.id, vid)}
                    onRemove={() => removeItem(it.id)}
                    onMove={(dir) => moveItem(it.id, dir)}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={addDay}
          className="text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 hover:border-gray-500"
        >
          + Add Day
        </button>
      </div>

      {nextVersion > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <label className="block text-[11px] text-gray-500 mb-1">
            What changed? <span className="text-gray-400">(visible to agent on revision)</span>
          </label>
          <textarea
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            placeholder="e.g. Moved hospital appointment to afternoon, swapped day 3 and day 4."
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] resize-none"
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-4 py-2 rounded-xl disabled:opacity-40"
        >
          {saving ? 'Saving…' : `Save v${nextVersion} & Send to Agent`}
        </button>
      </div>
    </div>
  )
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item, caseProducts,
  canMoveUp, canMoveDown,
  onUpdate, onApplyVariant, onRemove, onMove,
}: {
  item: ScheduleItem
  caseProducts: CaseProduct[]
  canMoveUp: boolean
  canMoveDown: boolean
  onUpdate: (patch: Partial<ScheduleItem>) => void
  onApplyVariant: (variantId: string | null) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  return (
    <div className="px-4 py-3 space-y-2">
      {/* Top row: block, time, product picker, controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={item.block}
          onChange={(e) => onUpdate({ block: e.target.value as ScheduleItemBlock })}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35]"
        >
          {SCHEDULE_BLOCKS.map(b => (
            <option key={b} value={b}>{SCHEDULE_BLOCK_LABEL[b]}</option>
          ))}
        </select>
        <input
          type="time"
          value={item.time ?? ''}
          onChange={(e) => onUpdate({ time: e.target.value || null })}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] w-[100px]"
          placeholder="--:--"
        />
        <select
          value={item.variantId ?? ''}
          onChange={(e) => onApplyVariant(e.target.value || null)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] flex-1 min-w-[180px]"
        >
          <option value="">— Link a product (optional) —</option>
          {caseProducts.map(cp => (
            <option key={cp.variantId} value={cp.variantId}>
              {cp.productName}{cp.variantLabel ? ` · ${cp.variantLabel}` : ''}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            className="text-gray-300 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-300 w-6 h-6 flex items-center justify-center"
            title="Move up"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            className="text-gray-300 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-300 w-6 h-6 flex items-center justify-center"
            title="Move down"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button
            onClick={onRemove}
            className="text-gray-300 hover:text-red-500 w-6 h-6 flex items-center justify-center"
            title="Remove item"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Title */}
      <input
        type="text"
        value={item.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder="Title (e.g. DIAR Clinic · Cheongdam-dong)"
        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35]"
      />

      {/* Location + notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          type="text"
          value={item.location ?? ''}
          onChange={(e) => onUpdate({ location: e.target.value || null })}
          placeholder="Location (optional)"
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35]"
        />
        <input
          type="text"
          value={item.notes ?? ''}
          onChange={(e) => onUpdate({ notes: e.target.value || null })}
          placeholder="Notes (optional)"
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35]"
        />
      </div>
    </div>
  )
}
