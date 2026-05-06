'use client'

// In-page schedule editor (admin). Replaces PDF upload as the primary path.
//
// UX: one card per Day, each card has rows of items. Per-row inputs:
//   Block | Time (optional) | Title | Location | Notes | Product (optional)
// Day count is derived from travel_start_date / travel_end_date — to extend
// or shorten the trip, edit dates in Trip Setup. Legacy items beyond the
// trip duration still surface (so historical data isn't hidden).
//
// Save creates a new `schedules` row (next version) with the items JSONB,
// status='pending', and bumps cases.status to 'reviewing_schedule'.

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logAsCurrentUser } from '@/lib/audit'
import Time24Input from '@/components/Time24Input'
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
  // Document groups — drives the per-row Group dropdown so admin can mark
  // an item as Shared (visible to everyone) or specific to one group.
  caseGroups?: Array<{ id: string; name: string }>
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
  caseGroups = [],
  onSaved, slug, nextVersion,
}: Props) {
  const [items, setItems] = useState<ScheduleItem[]>(initialItems)
  const [revisionNote, setRevisionNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Items added in this session that haven't been "Saved" individually yet.
  // Pending rows show with dashed border + inline Cancel/Save and don't count
  // for the global coverage gate (so admin can stage incomplete drafts).
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())

  // Days present in the editor — union of (1..defaultDayCount) and any item's day.
  const days = useMemo(() => {
    const set = new Set<number>()
    for (let d = 1; d <= Math.max(defaultDayCount, 1); d++) set.add(d)
    for (const it of items) set.add(it.day)
    return Array.from(set).sort((a, b) => a - b)
  }, [items, defaultDayCount])

  // Day count is fixed by travel dates. Legacy items with day > defaultDayCount
  // still appear in the editor (handled via `days` union above) so admins can
  // see/edit them, but no UI for adding or removing days here — change dates
  // in Trip Setup instead.

  function addItem(day: number) {
    const id = generateScheduleItemId()
    const newItem: ScheduleItem = {
      id,
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
    // Mark as pending — admin must Save it (per-row) before it counts toward
    // the coverage gate or feels "committed".
    setPendingItemIds(prev => { const n = new Set(prev); n.add(id); return n })
  }

  function commitPendingItem(id: string) {
    setPendingItemIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }
  function cancelPendingItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    setPendingItemIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  // Free-time presets — common enough that admins shouldn't have to type
  // "Free time" + pick a block every time. Half-day = single block (morning
  // OR afternoon). Full-day = three rows (morning + afternoon + evening) so
  // the editorial output renders blank periods consistently.
  function addFreeTime(day: number, kind: 'morning' | 'afternoon' | 'evening' | 'full') {
    const baseSort = items.filter(i => i.day === day).length
    if (kind === 'full') {
      const blocks: Array<'morning' | 'afternoon' | 'evening'> = ['morning', 'afternoon', 'evening']
      const additions: ScheduleItem[] = blocks.map((b, i) => ({
        id: generateScheduleItemId(),
        day,
        block: b,
        time: null,
        title: 'Free time',
        location: null,
        notes: null,
        variantId: null,
        sortOrder: baseSort + i,
      }))
      setItems(prev => [...prev, ...additions])
    } else {
      const newItem: ScheduleItem = {
        id: generateScheduleItemId(),
        day,
        block: kind,
        time: null,
        title: 'Free time',
        location: null,
        notes: null,
        variantId: null,
        sortOrder: baseSort,
      }
      setItems(prev => [...prev, newItem])
    }
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

  // Apply variant pick: split fields so renderer can lay out hierarchy.
  //   partner → eyebrow (e.g. "GIL HOSPITAL")
  //   title   → activity (e.g. "VIP Premium · Female")
  // Deselect clears auto-derived fields, but free-form text the admin typed
  // by hand survives.
  function applyVariantPick(itemId: string, variantId: string | null) {
    if (!variantId) {
      const current = items.find(i => i.id === itemId)
      const prev = current?.variantId ? caseProducts.find(p => p.variantId === current.variantId) : null
      const prevAutoTitle = prev
        ? [prev.productName, prev.variantLabel].filter(Boolean).join(' · ')
        : null
      const titleWasAuto = prevAutoTitle && current?.title === prevAutoTitle
      const partnerWasAuto = prev?.partnerName && current?.partner === prev.partnerName
      const locationWasAuto = prev?.partnerName && current?.location === prev.partnerName
      updateItem(itemId, {
        variantId: null,
        ...(titleWasAuto ? { title: '' } : {}),
        ...(partnerWasAuto ? { partner: null } : {}),
        ...(locationWasAuto ? { location: null } : {}),
      })
      return
    }
    const cp = caseProducts.find(p => p.variantId === variantId)
    if (!cp) {
      updateItem(itemId, { variantId })
      return
    }
    const titleParts: string[] = [cp.productName]
    if (cp.variantLabel) titleParts.push(cp.variantLabel)
    updateItem(itemId, {
      variantId,
      partner: cp.partnerName ?? null,
      title: titleParts.join(' · '),
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

  const visibleDays = days

  return (
    <div className="space-y-4">
      {visibleDays.map(day => {
        const dayItems = items
          .filter(i => i.day === day)
          .sort(compareScheduleItems)
        const dateObj = dateForDay(travelStartDate, day)
        return (
          <div key={day} className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-semibold text-gray-900">Day {day}</p>
                {dateObj && <p className="text-xs text-gray-400">{formatDayHeader(dateObj)}</p>}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => addItem(day)}
                  className="text-xs font-medium text-[#0f4c35] hover:underline"
                >
                  + Add Item
                </button>
                <FreeTimeMenu onPick={(kind) => addFreeTime(day, kind)} />
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
                    caseGroups={caseGroups}
                    isPending={pendingItemIds.has(it.id)}
                    canMoveUp={idx > 0 && dayItems[idx - 1].block === it.block}
                    canMoveDown={idx < dayItems.length - 1 && dayItems[idx + 1].block === it.block}
                    onUpdate={(patch) => updateItem(it.id, patch)}
                    onApplyVariant={(vid) => applyVariantPick(it.id, vid)}
                    onRemove={() => removeItem(it.id)}
                    onMove={(dir) => moveItem(it.id, dir)}
                    onCommit={() => commitPendingItem(it.id)}
                    onCancelDraft={() => cancelPendingItem(it.id)}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}

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

      {/* Coverage gate: every variant in the case's selected products must
          appear in at least one *committed* schedule row (pending drafts
          don't count). Free-form rows (no variant) don't help cover. */}
      {(() => {
        const requiredVariants = caseProducts
        const coveredVariantIds = new Set(
          items
            .filter(i => !pendingItemIds.has(i.id) && i.variantId)
            .map(i => i.variantId as string),
        )
        const missing = requiredVariants.filter(p => !coveredVariantIds.has(p.variantId))
        const hasPending = pendingItemIds.size > 0
        const allCovered = missing.length === 0
        const canSave = !saving && allCovered && !hasPending && items.length > 0

        return (
          <div className="space-y-2">
            {!allCovered && requiredVariants.length > 0 && (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                <p className="font-semibold text-amber-700">
                  {missing.length} product{missing.length !== 1 ? 's' : ''} not yet in schedule
                </p>
                <ul className="text-amber-900 space-y-0.5 pl-3 list-disc">
                  {missing.map(p => (
                    <li key={p.variantId}>
                      {p.partnerName && <span className="text-amber-700">{p.partnerName} · </span>}
                      {p.productName}{p.variantLabel ? ` · ${p.variantLabel}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasPending && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {pendingItemIds.size} item{pendingItemIds.size !== 1 ? 's' : ''} still in draft — Save or Cancel each before sending.
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleSave}
                disabled={!canSave}
                title={!allCovered ? 'Add a row for every selected product' : (hasPending ? 'Resolve pending drafts first' : '')}
                className="text-sm font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-4 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : `Save v${nextVersion} & Send to Agent`}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Free time menu ────────────────────────────────────────────────────────────

// Small dropdown next to "Add Item" — three preset options. Half-day picks
// drop a single "Free time" row in that block; full-day drops three (morning
// + afternoon + evening) so the editorial render shows the full day blank.
function FreeTimeMenu({
  onPick,
}: {
  onPick: (kind: 'morning' | 'afternoon' | 'evening' | 'full') => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        + Free time ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[150px] divide-y divide-gray-100">
          {[
            { k: 'morning' as const, label: 'Morning free' },
            { k: 'afternoon' as const, label: 'Afternoon free' },
            { k: 'evening' as const, label: 'Evening free' },
            { k: 'full' as const, label: 'Full day free' },
          ].map(opt => (
            <button
              key={opt.k}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(opt.k); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Item row ──────────────────────────────────────────────────────────────────

// Color palette for group accents — repeats if there are more groups.
// Used as a left border stripe + select chip tint so admin can see at a
// glance which group each row belongs to.
const GROUP_TONES: Array<{ stripe: string; chip: string; chipText: string }> = [
  { stripe: 'border-l-pink-400',    chip: 'bg-pink-50 border-pink-200',    chipText: 'text-pink-700' },
  { stripe: 'border-l-sky-400',     chip: 'bg-sky-50 border-sky-200',      chipText: 'text-sky-700' },
  { stripe: 'border-l-violet-400',  chip: 'bg-violet-50 border-violet-200', chipText: 'text-violet-700' },
  { stripe: 'border-l-amber-400',   chip: 'bg-amber-50 border-amber-200',   chipText: 'text-amber-700' },
]
const SHARED_TONE = { stripe: 'border-l-gray-300', chip: 'bg-gray-100 border-gray-200', chipText: 'text-gray-600' }

function ItemRow({
  item, caseProducts, caseGroups, isPending,
  canMoveUp, canMoveDown,
  onUpdate, onApplyVariant, onRemove, onMove,
  onCommit, onCancelDraft,
}: {
  item: ScheduleItem
  caseProducts: CaseProduct[]
  caseGroups: Array<{ id: string; name: string }>
  isPending: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onUpdate: (patch: Partial<ScheduleItem>) => void
  onApplyVariant: (variantId: string | null) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  onCommit: () => void
  onCancelDraft: () => void
}) {
  // Resolve group tone for left stripe + chip background.
  const groupIdx = item.groupId ? caseGroups.findIndex(g => g.id === item.groupId) : -1
  const tone = groupIdx >= 0 ? GROUP_TONES[groupIdx % GROUP_TONES.length] : SHARED_TONE
  const showGroupSelect = caseGroups.length > 1

  // Pending rows can't commit until they have at least a title.
  const canCommit = item.title.trim().length > 0

  return (
    <div className={`px-4 py-3 space-y-2 border-l-4 ${tone.stripe} ${isPending ? 'bg-amber-50/40 border border-dashed border-amber-300 m-2 rounded-lg' : ''}`}>
      {/* Top row: block (start–end) + time (start–end) + product + controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={item.block}
          onChange={(e) => onUpdate({ block: e.target.value as ScheduleItemBlock })}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35]"
          title="Start block"
        >
          {SCHEDULE_BLOCKS.map(b => (
            <option key={b} value={b}>{SCHEDULE_BLOCK_LABEL[b]}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">→</span>
        <select
          value={item.endBlock ?? ''}
          onChange={(e) => {
            const v = e.target.value as ScheduleItemBlock | ''
            onUpdate({ endBlock: v ? (v as ScheduleItemBlock) : null })
          }}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35]"
          title="End block (optional — only set if the activity spans into a later block)"
        >
          <option value="">Same</option>
          {SCHEDULE_BLOCKS.map(b => (
            <option key={b} value={b}>{SCHEDULE_BLOCK_LABEL[b]}</option>
          ))}
        </select>
        <span className="text-gray-200 mx-1">|</span>
        <Time24Input
          value={item.time ?? null}
          onChange={(v) => onUpdate({ time: v })}
        />
        <span className="text-xs text-gray-400">–</span>
        <Time24Input
          value={item.endTime ?? null}
          onChange={(v) => onUpdate({ endTime: v })}
        />
        {showGroupSelect && (
          <span className="inline-flex items-center gap-1 shrink-0">
            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">For</span>
            <select
              value={item.groupId ?? ''}
              onChange={(e) => onUpdate({ groupId: e.target.value || null })}
              className={`text-xs font-semibold border rounded-lg px-2 py-1 focus:outline-none focus:border-[#0f4c35] ${tone.chip} ${tone.chipText}`}
              title="Which group sees this item. Shared = visible to everyone (e.g. hotel check-in, meals)."
            >
              <option value="">Shared</option>
              {caseGroups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </span>
        )}
        <select
          value={item.variantId ?? ''}
          onChange={(e) => onApplyVariant(e.target.value || null)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] flex-1 min-w-[180px]"
        >
          <option value="">— Choose a product —</option>
          {caseProducts.map(cp => (
            <option key={cp.variantId} value={cp.variantId}>
              {cp.partnerName ? `${cp.partnerName} · ` : ''}{cp.productName}{cp.variantLabel ? ` · ${cp.variantLabel}` : ''}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 ml-auto">
          {/* Pending rows hide move/delete and show Cancel/Save instead — admin
              has to commit (or cancel) before manipulating the row's order. */}
          {!isPending && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Partner eyebrow — auto-derived from product link, mirrors how the
          rendered schedule will show it above the title. No edit affordance:
          changing the product link is the only way to change partner. */}
      {item.partner && (
        <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
          {item.partner}
        </p>
      )}
      <input
        type="text"
        value={item.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder="Title (e.g. VIP Premium · Female)"
        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35]"
      />

      {/* Notes — VIP-facing */}
      <input
        type="text"
        value={item.notes ?? ''}
        onChange={(e) => onUpdate({ notes: e.target.value || null })}
        placeholder="Notes — visible to client (optional)"
        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35]"
      />

      {/* Internal-only fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          type="text"
          value={item.location ?? ''}
          onChange={(e) => onUpdate({ location: e.target.value || null })}
          placeholder="Location — internal (address, building, floor)"
          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400"
        />
        <input
          type="text"
          value={item.internalNotes ?? ''}
          onChange={(e) => onUpdate({ internalNotes: e.target.value || null })}
          placeholder="Internal note (driver, contact, prep…)"
          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400"
        />
      </div>

      {isPending && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="text-[10px] text-amber-700 mr-auto">Draft — not counted toward schedule coverage until saved</span>
          <button
            type="button"
            onClick={onCancelDraft}
            className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1 rounded-lg border border-gray-200 hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCommit}
            disabled={!canCommit}
            title={!canCommit ? 'Title required' : ''}
            className="text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-3 py-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save row
          </button>
        </div>
      )}
    </div>
  )
}
