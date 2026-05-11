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
  type ScheduleItemType,
  SCHEDULE_BLOCKS,
  SCHEDULE_BLOCK_LABEL,
  SCHEDULE_ITEM_TYPES,
  SCHEDULE_ITEM_TYPE_LABEL,
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
  groupId: string
  groupName: string
  isSubpackage: boolean
  isSharedGroup: boolean
  durationValue: number | null
  durationUnit: string | null
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
  // Persists current items as a draft without sending to agent.
  onSaveDraft: (items: ScheduleItem[]) => Promise<void>
  // When true, save/draft actions are hidden — view only.
  readOnly?: boolean
  // Slug for "Preview" link.
  slug: string | null
  // Save creates a new version on top of this.
  nextVersion: number
  // Concierge footer override (carried from last version — admin can edit).
  initialConciergeName?: string | null
  initialConciergePhone?: string | null
}

export default function ScheduleEditor({
  caseId, caseNumber, agentId,
  travelStartDate, travelEndDate,
  initialItems, defaultDayCount, caseProducts,
  caseGroups = [],
  onSaved, onSaveDraft, slug, nextVersion,
  initialConciergeName = null, initialConciergePhone = null,
  readOnly = false,
}: Props) {
  const [items, setItems] = useState<ScheduleItem[]>(initialItems)
  const [conciergeName, setConciergeName] = useState<string>(initialConciergeName ?? '')
  const [conciergePhone, setConciergePhone] = useState<string>(initialConciergePhone ?? '')
  const [revisionNote, setRevisionNote] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [error, setError] = useState('')
  // Items added in this session that haven't been "Saved" individually yet.
  // Pending rows show with dashed border + inline Cancel/Save and don't count
  // for the global coverage gate (so admin can stage incomplete drafts).
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())
  // Days that are collapsed. Initialised to all days that already have committed items —
  // so a loaded schedule starts compact and admins expand only what they want to edit.
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(() => {
    const s = new Set<number>()
    for (const item of initialItems) s.add(item.day)
    return s
  })
  function toggleDayCollapse(day: number) {
    setCollapsedDays(prev => { const n = new Set(prev); n.has(day) ? n.delete(day) : n.add(day); return n })
  }
  // Items whose group hasn't been explicitly chosen yet (shows "— Choose group —" prompt).
  // Cleared the moment admin changes the group select.
  const [unsetGroupItemIds, setUnsetGroupItemIds] = useState<Set<string>>(new Set())
  // Snapshot of items at the moment Edit was clicked, keyed by item id.
  // Used to restore original state if admin cancels an edit (vs new items which are removed entirely).
  const [editSnapshots, setEditSnapshots] = useState<Map<string, ScheduleItem>>(new Map())

  // variantIds that belong to the explicit Shared document_group.
  // Used by ItemRow picker: Shared schedule rows show only these variants.
  const sharedVariantIds = useMemo(() => {
    const shared = new Set<string>()
    for (const cp of caseProducts) {
      if (cp.isSharedGroup) shared.add(cp.variantId)
    }
    return shared
  }, [caseProducts])

  // variantId → Set<groupId|null> of committed rows that already link this variant.
  // null in the set means a Shared row (covers all groups).
  // Used by ItemRow to hide already-scheduled products from the picker.
  const committedVariantContexts = useMemo(() => {
    const result = new Map<string, Set<string | null>>()
    for (const it of items) {
      if (pendingItemIds.has(it.id) || !it.variantId) continue
      if (!result.has(it.variantId)) result.set(it.variantId, new Set())
      result.get(it.variantId)!.add(it.groupId ?? null)
    }
    return result
  }, [items, pendingItemIds])

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
    setCollapsedDays(prev => { const n = new Set(prev); n.delete(day); return n }) // auto-expand
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
    setPendingItemIds(prev => { const n = new Set(prev); n.add(id); return n })
    if (caseGroups.length > 1) setUnsetGroupItemIds(prev => { const n = new Set(prev); n.add(id); return n })
  }

  async function saveDraft(currentItems: ScheduleItem[]) {
    setSavingDraft(true)
    setDraftSaved(false)
    try {
      await onSaveDraft(currentItems)
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2500)
    } finally {
      setSavingDraft(false)
    }
  }

  function commitPendingItem(id: string) {
    setPendingItemIds(prev => { const n = new Set(prev); n.delete(id); return n })
    setEditSnapshots(prev => { const n = new Map(prev); n.delete(id); return n })
    void saveDraft(items)
  }
  function editItem(id: string) {
    const snapshot = items.find(i => i.id === id)
    if (snapshot) setEditSnapshots(prev => { const n = new Map(prev); n.set(id, { ...snapshot }); return n })
    setPendingItemIds(prev => { const n = new Set(prev); n.add(id); return n })
  }
  function cancelPendingItem(id: string) {
    const snapshot = editSnapshots.get(id)
    if (snapshot) {
      // Editing an existing committed item — restore original and exit edit mode
      setItems(prev => prev.map(i => i.id === id ? snapshot : i))
      setEditSnapshots(prev => { const n = new Map(prev); n.delete(id); return n })
    } else {
      // Brand-new item that was never committed — remove entirely
      setItems(prev => prev.filter(i => i.id !== id))
    }
    setPendingItemIds(prev => { const n = new Set(prev); n.delete(id); return n })
    setUnsetGroupItemIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }
  function markGroupChosen(id: string) {
    setUnsetGroupItemIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }
  function resetGroupChoice(id: string) {
    setUnsetGroupItemIds(prev => { const n = new Set(prev); n.add(id); return n })
  }

  // Free-time presets — common enough that admins shouldn't have to type
  // "Free time" + pick a block every time. Half-day = single block (morning
  // OR afternoon). Full-day = three rows (morning + afternoon + evening) so
  // the editorial output renders blank periods consistently.
  const PRAYER_PRESETS: Array<{ name: string; block: ScheduleItemBlock }> = [
    { name: 'Fajr',    block: 'morning'   },
    { name: 'Dhuhr',   block: 'afternoon' },
    { name: 'Asr',     block: 'afternoon' },
    { name: 'Maghrib', block: 'evening'   },
    { name: 'Isha',    block: 'evening'   },
  ]

  function addPrayerTime(day: number, prayerName: string) {
    const preset = PRAYER_PRESETS.find(p => p.name === prayerName)
    if (!preset) return
    const newItem: ScheduleItem = {
      id: generateScheduleItemId(),
      day,
      block: preset.block,
      time: null,
      title: `${preset.name} Prayer`,
      location: null,
      notes: null,
      variantId: null,
      isPrayer: true,
      sortOrder: items.filter(i => i.day === day).length,
    }
    setItems(prev => [...prev, newItem])
  }

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
      // Handle both legacy format (title included variant) and new format (title = productName only)
      const autoTitleNew = prev?.productName ?? null
      const autoTitleOld = prev ? [prev.productName, prev.variantLabel].filter(Boolean).join(' · ') : null
      const titleWasAuto = (autoTitleNew && current?.title === autoTitleNew) || (autoTitleOld && current?.title === autoTitleOld)
      const partnerWasAuto = prev?.partnerName && current?.partner === prev.partnerName
      const locationWasAuto = prev?.partnerName && current?.location === prev.partnerName
      updateItem(itemId, {
        variantId: null,
        variantTag: null,
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
    updateItem(itemId, {
      variantId,
      variantTag: cp.variantLabel ?? null,
      partner: cp.partnerName ?? null,
      title: cp.productName,
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
        admin_note: adminNote.trim() || null,
        concierge_name: conciergeName.trim() || null,
        concierge_phone: conciergePhone.trim() || null,
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

      // Clear draft now that it's been officially published
      await onSaveDraft([])

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
        const hasPending = dayItems.some(i => pendingItemIds.has(i.id))
        // Collapse unless there are pending (unsaved) items in this day
        const isCollapsed = collapsedDays.has(day) && !hasPending
        return (
          <div key={day} className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <button
                onClick={() => toggleDayCollapse(day)}
                className="flex items-baseline gap-2 flex-1 text-left"
              >
                <p className="text-sm font-semibold text-gray-900">Day {day}</p>
                {dateObj && <p className="text-xs text-gray-400">{formatDayHeader(dateObj)}</p>}
                {isCollapsed && dayItems.length > 0 && (
                  <span className="text-xs text-gray-400">· {dayItems.length} item{dayItems.length !== 1 ? 's' : ''}</span>
                )}
              </button>
              <div className="flex items-center gap-3">
                {!isCollapsed && (
                  <>
                    <button onClick={() => addItem(day)} className="text-xs font-medium text-[#0f4c35] hover:underline">+ Add Item</button>
                    <FreeTimeMenu onPick={(kind) => addFreeTime(day, kind)} />
                    <PrayerMenu onPick={(prayer) => addPrayerTime(day, prayer)} />
                  </>
                )}
                <button
                  onClick={() => toggleDayCollapse(day)}
                  className="text-[10px] text-gray-400 hover:text-gray-600 px-1"
                >
                  {isCollapsed ? '▼' : '▲'}
                </button>
              </div>
            </div>
            {!isCollapsed && (
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
                      sharedVariantIds={sharedVariantIds}
                      committedVariantContexts={committedVariantContexts}
                      isPending={pendingItemIds.has(it.id)}
                      isEditSession={editSnapshots.has(it.id)}
                      isGroupUnset={unsetGroupItemIds.has(it.id)}
                      onGroupChosen={() => markGroupChosen(it.id)}
                      onResetGroup={() => resetGroupChoice(it.id)}
                      canMoveUp={idx > 0 && dayItems[idx - 1].block === it.block}
                      canMoveDown={idx < dayItems.length - 1 && dayItems[idx + 1].block === it.block}
                      onUpdate={(patch) => updateItem(it.id, patch)}
                      onApplyVariant={(vid) => applyVariantPick(it.id, vid)}
                      onRemove={() => removeItem(it.id)}
                      onMove={(dir) => moveItem(it.id, dir)}
                      onEdit={() => editItem(it.id)}
                      onCommit={() => commitPendingItem(it.id)}
                      onCancelDraft={() => cancelPendingItem(it.id)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}

      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Concierge footer</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">Name</label>
            <input
              type="text"
              value={conciergeName}
              onChange={(e) => setConciergeName(e.target.value)}
              placeholder="Leave blank to use agent name"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35]"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">Phone</label>
            <input
              type="text"
              value={conciergePhone}
              onChange={(e) => setConciergePhone(e.target.value)}
              placeholder="Leave blank to use agent phone"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35]"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-3">
        <label className="block text-[11px] text-gray-500 mb-1">
          Note to agent / client <span className="text-gray-400">(optional — shown on schedule)</span>
        </label>
        <textarea
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          placeholder="e.g. Please confirm dietary requirements before Day 2 lunch. Hotel check-in is at 15:00."
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0f4c35] resize-none"
        />
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

      {/* Coverage gate:
          - Non-Subpackage: each (groupId, variantId) pair must be covered by
            a committed row where variantId matches AND (row.groupId === group OR
            row.groupId === null/Shared). A Shared row covers ALL groups.
          - Subpackage: treated as shared — any one row with that variantId
            satisfies it, regardless of which group the row belongs to.
          Pending drafts don't count. */}
      {(() => {
        // Build required coverage keys
        const requiredKeys = new Map<string, CaseProduct>() // key → representative CaseProduct for display
        for (const cp of caseProducts) {
          const key = cp.isSubpackage ? `sub:${cp.variantId}` : `${cp.groupId}:${cp.variantId}`
          if (!requiredKeys.has(key)) requiredKeys.set(key, cp)
        }

        // Build covered keys from committed items
        const committedItems = items.filter(i => !pendingItemIds.has(i.id) && i.variantId)
        const coveredKeys = new Set<string>()
        for (const it of committedItems) {
          const v = it.variantId!
          coveredKeys.add(`sub:${v}`) // covers any Subpackage with this variantId
          if (it.groupId === null) {
            // Shared row covers all groups for this variant
            for (const cp of caseProducts) {
              if (cp.variantId === v) coveredKeys.add(`${cp.groupId}:${v}`)
            }
          } else {
            coveredKeys.add(`${it.groupId}:${v}`)
          }
        }

        const missing = [...requiredKeys.entries()]
          .filter(([key]) => !coveredKeys.has(key))
          .map(([, cp]) => cp)
        const hasPending = pendingItemIds.size > 0
        const allCovered = missing.length === 0
        const canSave = !saving && allCovered && !hasPending && items.length > 0

        return (
          <div className="space-y-2">
            {!allCovered && requiredKeys.size > 0 && (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                <p className="font-semibold text-amber-700">
                  {missing.length} product{missing.length !== 1 ? 's' : ''} not yet in schedule
                </p>
                <ul className="text-amber-900 space-y-0.5 pl-3 list-disc">
                  {missing.map(p => (
                    <li key={p.isSubpackage ? `sub:${p.variantId}` : `${p.groupId}:${p.variantId}`}>
                      {!p.isSubpackage && <span className="text-amber-600">{p.groupName} — </span>}
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
            {readOnly ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-right">
                You are not the assigned admin for this case. Contact the assigned admin to save changes.
              </p>
            ) : (
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => void saveDraft(items)}
                disabled={savingDraft || saving || items.length === 0}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingDraft ? 'Saving…' : draftSaved ? 'Draft saved' : 'Save Draft'}
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                title={!allCovered ? 'Add a row for every selected product' : (hasPending ? 'Resolve pending drafts first' : '')}
                className="text-sm font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-4 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : `Save v${nextVersion} & Send to Agent`}
              </button>
            </div>
            )}
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

// ── Prayer time menu ─────────────────────────────────────────────────────────

function PrayerMenu({ onPick }: { onPick: (prayer: string) => void }) {
  const [open, setOpen] = useState(false)
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-xs font-medium text-orange-500 hover:text-orange-700"
      >
        + Prayer ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[130px] divide-y divide-gray-100">
          {prayers.map(p => (
            <button
              key={p}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(p); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-orange-700 hover:bg-orange-50"
            >
              {p}
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
// Matches agent home GROUP_PALETTE order (blue / emerald / orange / purple).
const GROUP_TONES: Array<{ stripe: string; chip: string; chipText: string }> = [
  { stripe: 'border-l-blue-400',    chip: 'bg-blue-50 border-blue-200',    chipText: 'text-blue-700' },
  { stripe: 'border-l-emerald-400', chip: 'bg-emerald-50 border-emerald-200', chipText: 'text-emerald-700' },
  { stripe: 'border-l-orange-400',  chip: 'bg-orange-50 border-orange-200',  chipText: 'text-orange-700' },
  { stripe: 'border-l-purple-400',  chip: 'bg-purple-50 border-purple-200',  chipText: 'text-purple-700' },
]
const SHARED_TONE = { stripe: 'border-l-gray-900', chip: 'bg-white border-gray-800', chipText: 'text-gray-900' }

function ItemRow({
  item, caseProducts, caseGroups, sharedVariantIds, committedVariantContexts,
  isPending, isEditSession, isGroupUnset,
  canMoveUp, canMoveDown,
  onUpdate, onApplyVariant, onRemove, onMove,
  onEdit, onCommit, onCancelDraft, onGroupChosen, onResetGroup,
}: {
  item: ScheduleItem
  caseProducts: CaseProduct[]
  caseGroups: Array<{ id: string; name: string }>
  sharedVariantIds: Set<string>
  committedVariantContexts: Map<string, Set<string | null>>
  isPending: boolean
  isEditSession: boolean
  isGroupUnset: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onUpdate: (patch: Partial<ScheduleItem>) => void
  onApplyVariant: (variantId: string | null) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  onEdit: () => void
  onCommit: () => void
  onCancelDraft: () => void
  onGroupChosen: () => void
  onResetGroup: () => void
}) {
  // Resolve group tone for left stripe + chip background.
  // Prayer items always use orange stripe regardless of group.
  const groupIdx = item.groupId ? caseGroups.findIndex(g => g.id === item.groupId) : -1
  const tone = item.isPrayer
    ? { stripe: 'border-l-orange-400', chip: '', chipText: '' }
    : groupIdx >= 0 ? GROUP_TONES[groupIdx % GROUP_TONES.length] : SHARED_TONE
  const showGroupSelect = caseGroups.length > 1

  // Picker scope: filter caseProducts based on the row's group context, then
  // exclude variants already committed in an overlapping context (except the
  // current row's own variant — always shown so admin can see/change it).
  //   Shared row  → Subpackage + variants that appear in 2+ groups
  //   Group G row → that group's non-Subpackage + Subpackage (for override)
  const pickerProducts = useMemo(() => {
    // No group decided yet — hide all products until admin picks a group.
    if (isGroupUnset) return []
    const filtered = caseProducts.filter(cp => {
      // Scope filter: Shared row shows Subpackage + cross-group variants;
      // Group row shows that group's products + Subpackage.
      const inScope = item.groupId === null
        ? cp.isSubpackage || sharedVariantIds.has(cp.variantId)
        : cp.groupId === item.groupId || cp.isSubpackage
      return inScope
    })
    const seen = new Set<string>()
    return filtered.filter(cp => {
      if (seen.has(cp.variantId)) return false
      seen.add(cp.variantId)
      return true
    })
  }, [isGroupUnset, caseProducts, item.groupId, sharedVariantIds])

  // For Shared rows with a linked product: show which groups this row covers.
  const coversGroups = useMemo(() => {
    if (item.groupId !== null || !item.variantId) return []
    const names = caseProducts
      .filter(cp => cp.variantId === item.variantId && !cp.isSubpackage)
      .map(cp => cp.groupName)
    return [...new Set(names)]
  }, [item.groupId, item.variantId, caseProducts])

  const itemType = item.itemType ?? 'appointment'
  const canCommit =
    itemType === 'free'     ? true :
    itemType === 'transfer' ? !!(item.fromLocation?.trim() && item.toLocation?.trim()) || item.title.trim().length > 0 :
    itemType === 'hotel'    ? !!(item.hotelCheckType) || item.title.trim().length > 0 :
    item.title.trim().length > 0

  return (
    <div className={`px-4 py-3 space-y-2 border-l-4 ${tone.stripe} ${isPending ? 'bg-amber-50/40 border border-dashed border-amber-300 m-2 rounded-lg' : ''}`}>
      {/* Top row: type + block (start–end) + time (start–end) + product + controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={item.itemType ?? 'appointment'}
          onChange={(e) => {
            const t = e.target.value as ScheduleItemType
            const updates: Partial<ScheduleItem> = { itemType: t }
            if (t === 'free' && !item.title.trim()) updates.title = 'Free time'
            if (t === 'hotel' && item.hotelCheckType && !item.title.trim())
              updates.title = item.hotelCheckType === 'checkin' ? 'Hotel Check-in' : 'Hotel Check-out'
            onUpdate(updates)
          }}
          disabled={!isPending}
          className="text-xs font-medium border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
          title="Item type"
        >
          {SCHEDULE_ITEM_TYPES.map(t => (
            <option key={t} value={t}>{SCHEDULE_ITEM_TYPE_LABEL[t]}</option>
          ))}
        </select>
        <span className="text-gray-200 mx-0.5">|</span>
        <select
          value={item.block}
          onChange={(e) => onUpdate({ block: e.target.value as ScheduleItemBlock })}
          disabled={!isPending}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
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
          disabled={!isPending}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
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
          disabled={!isPending}
        />
        <span className="text-xs text-gray-400">–</span>
        <Time24Input
          value={item.endTime ?? null}
          onChange={(v) => onUpdate({ endTime: v })}
          disabled={!isPending}
        />
        {showGroupSelect && (
          <span className="inline-flex items-center gap-1 shrink-0">
            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">For</span>
            <select
              value={isGroupUnset ? '__choose__' : (item.groupId ?? '')}
              onChange={(e) => {
                const v = e.target.value
                if (v === '__choose__') {
                  onApplyVariant(null)
                  onUpdate({ groupId: null })
                  onResetGroup()
                  return
                }
                onUpdate({ groupId: v || null })
                onGroupChosen()
              }}
              disabled={!isPending}
              className={`text-xs font-semibold border rounded-lg px-2 py-1 focus:outline-none focus:border-[#0f4c35] disabled:cursor-default disabled:opacity-75 ${tone.chip} ${tone.chipText}`}
              title="Which group sees this item. Shared = visible to everyone (e.g. hotel check-in, meals)."
            >
              {isPending && <option value="__choose__">— Choose group —</option>}
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
          disabled={!isPending}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] flex-1 min-w-[180px] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
        >
          <option value="">— Choose a product —</option>
          {pickerProducts.map(cp => {
            const isCommitted = cp.variantId !== item.variantId && committedVariantContexts.has(cp.variantId)
            const label = `${cp.partnerName ? `${cp.partnerName} · ` : ''}${cp.productName}${cp.variantLabel ? ` · ${cp.variantLabel}` : ''}`
            const dur = cp.durationValue && cp.durationUnit ? ` (${cp.durationValue}${cp.durationUnit})` : ''
            return (
              <option key={cp.variantId} value={cp.variantId}>
                {isCommitted ? `✓ ${label}${dur}` : `${label}${dur}`}
              </option>
            )
          })}
        </select>
        {coversGroups.length > 1 && (
          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">
            Covers {coversGroups.join(', ')}
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
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
                onClick={onEdit}
                className="text-gray-300 hover:text-[#0f4c35] w-6 h-6 flex items-center justify-center"
                title="Edit row"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.071-6.071a2 2 0 112.828 2.829L11.828 13.83a2 2 0 01-.707.464l-3.535 1.06 1.06-3.535A2 2 0 019 11z" /></svg>
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Remove this item from the schedule?')) onRemove()
                }}
                className="text-gray-300 hover:text-red-500 w-6 h-6 flex items-center justify-center"
                title="Remove item"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Partner eyebrow + title — appointment/free only (other types handle title above) */}
      {(itemType === 'appointment' || itemType === 'free') && (
        <>
          {item.partner && (
            <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">{item.partner}</p>
          )}
          <div className="flex items-center gap-2">
            {itemType === 'free' ? (
              <p className="flex-1 text-sm text-gray-400 px-2.5 py-1.5">Free time</p>
            ) : (
              <input type="text" value={item.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                disabled={!isPending} placeholder="Title"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-default"
              />
            )}
            {item.variantTag && (
              <span className="shrink-0 text-[11px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-1">
                {item.variantTag}
              </span>
            )}
          </div>
        </>
      )}

      {/* Type-specific fields — shown BEFORE title for types where they define the content */}
      {itemType === 'transfer' && (
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={item.fromLocation ?? ''}
            onChange={(e) => onUpdate({ fromLocation: e.target.value || null })}
            disabled={!isPending} placeholder="From (e.g. Grand Hyatt)"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
          />
          <input type="text" value={item.toLocation ?? ''}
            onChange={(e) => onUpdate({ toLocation: e.target.value || null })}
            disabled={!isPending} placeholder="To (e.g. Gil Hospital)"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
          />
          <select value={item.transportMode ?? ''}
            onChange={(e) => onUpdate({ transportMode: (e.target.value || null) as ScheduleItem['transportMode'] })}
            disabled={!isPending}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
          >
            <option value="">— Transport mode —</option>
            <option value="car">Private car</option>
            <option value="shuttle">Shuttle</option>
            <option value="taxi">Taxi</option>
            <option value="bus">Bus</option>
            <option value="walk">Walking</option>
          </select>
          <input type="text" value={item.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            disabled={!isPending}
            placeholder="Label override (optional)"
            className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400 disabled:cursor-default"
          />
        </div>
      )}
      {itemType === 'hotel' && (
        <div className="flex items-center gap-2 flex-wrap">
          <select value={item.hotelCheckType ?? ''}
            onChange={(e) => {
              const v = (e.target.value || null) as ScheduleItem['hotelCheckType']
              const prevAuto = item.hotelCheckType === 'checkin' ? 'Hotel Check-in' : item.hotelCheckType === 'checkout' ? 'Hotel Check-out' : ''
              const updates: Partial<ScheduleItem> = { hotelCheckType: v }
              if (!item.title.trim() || item.title === prevAuto)
                updates.title = v === 'checkin' ? 'Hotel Check-in' : v === 'checkout' ? 'Hotel Check-out' : ''
              onUpdate(updates)
            }}
            disabled={!isPending}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
          >
            <option value="">— Check-in / Check-out —</option>
            <option value="checkin">Check-in</option>
            <option value="checkout">Check-out</option>
          </select>
          <input type="text" value={item.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            disabled={!isPending} placeholder="Label override (optional)"
            className="flex-1 text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400 disabled:cursor-default"
          />
        </div>
      )}
      {itemType === 'meal' && (
        <div className="grid grid-cols-2 gap-2">
          <select value={item.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            disabled={!isPending}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
          >
            <option value="">— Meal type —</option>
            <option value="Breakfast">Breakfast</option>
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
            <option value="Brunch">Brunch</option>
            <option value="Snack">Snack / Café</option>
          </select>
          <input type="text" value={item.restaurantName ?? ''}
            onChange={(e) => onUpdate({ restaurantName: e.target.value || null })}
            disabled={!isPending} placeholder="Restaurant name (optional)"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
          />
          <input type="text" value={item.cuisine ?? ''}
            onChange={(e) => onUpdate({ cuisine: e.target.value || null })}
            disabled={!isPending} placeholder="Cuisine (e.g. Korean BBQ)"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
          />
        </div>
      )}

      {/* Title — shown for appointment only; other types handle title above */}
      {/* Notes — VIP-facing */}
      <input
        type="text"
        value={item.notes ?? ''}
        onChange={(e) => onUpdate({ notes: e.target.value || null })}
        disabled={!isPending}
        placeholder="Notes — visible to client (optional)"
        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
      />

      {/* Internal-only fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          type="text"
          value={item.location ?? ''}
          onChange={(e) => onUpdate({ location: e.target.value || null })}
          disabled={!isPending}
          placeholder="Location"
          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400 disabled:cursor-default"
        />
        <input
          type="text"
          value={item.internalNotes ?? ''}
          onChange={(e) => onUpdate({ internalNotes: e.target.value || null })}
          disabled={!isPending}
          placeholder="Internal note"
          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400 disabled:cursor-default"
        />
        <input
          type="text"
          value={item.address ?? ''}
          onChange={(e) => onUpdate({ address: e.target.value || null })}
          disabled={!isPending}
          placeholder="Full address"
          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400 disabled:cursor-default"
        />
        <input
          type="text"
          value={item.partnerContact ?? ''}
          onChange={(e) => onUpdate({ partnerContact: e.target.value || null })}
          disabled={!isPending}
          placeholder="Partner contact"
          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400 disabled:cursor-default"
        />
        <input
          type="text"
          value={item.driverInfo ?? ''}
          onChange={(e) => onUpdate({ driverInfo: e.target.value || null })}
          disabled={!isPending}
          placeholder="Driver details"
          className="md:col-span-2 text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400 disabled:cursor-default"
        />
      </div>

      {isPending && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="text-[10px] text-amber-700 mr-auto">Draft — not counted toward schedule coverage until saved</span>
          <button
            type="button"
            onClick={() => {
              if (isEditSession) {
                // Restores original — no data loss, no confirmation needed
                onCancelDraft()
                return
              }
              const hasData = item.title.trim() || item.variantId || item.notes || item.location || item.internalNotes || item.address || item.partnerContact || item.driverInfo
              if (!hasData || window.confirm('Discard this item?')) onCancelDraft()
            }}
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
