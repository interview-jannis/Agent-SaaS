'use client'

// In-page schedule editor (admin). Replaces PDF upload as the primary path.
//
// UX: one card per Day, each card has rows of items. Per-row inputs:
//   Block | Time (optional) | Title | Location | Notes | Product (optional)
// Day count is derived from travel_start_date / travel_end_date ??to extend
// or shorten the trip, edit dates in Trip Setup. Legacy items beyond the
// trip duration still surface (so historical data isn't hidden).
//
// Save creates a new `schedules` row (next version) with the items JSONB,
// status='pending', and bumps cases.status to 'reviewing_schedule'.

import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  blockFromTime,
  dateForDay,
  formatDayHeader,
  generateScheduleItemId,
  resolveGroupIds,
} from '@/types/schedule'

// Per-day per-service assignment with hours. Hours default to the product's
// durationValue and admin can override per day. Total contracted = quantity ×
// durationValue; sum of `hours` across all days = actual; difference = overage.
export type DaySubpackageEntry = { variantId: string; hours: number }

type CaseProduct = {
  variantId: string
  productName: string
  variantLabel: string | null
  partnerName: string | null
  groupId: string
  groupName: string
  isSubpackage: boolean
  isSharedGroup: boolean
  isTripService: boolean
  isHotel: boolean
  isVehicle: boolean
  quantity: number
  durationValue: number | null
  durationUnit: string | null
  isHealthCheckup: boolean
  location: string | null
  fullAddress: string | null
  contactPhone: string | null
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
  // Document groups ??drives the per-row Group dropdown so admin can mark
  // an item as Shared (visible to everyone) or specific to one group.
  caseGroups?: Array<{ id: string; name: string }>
  // Triggered after a successful save so parent can refetch.
  onSaved: () => void
  // Persists current items as a draft without sending to agent.
  onSaveDraft: (items: ScheduleItem[]) => Promise<void>
  // When true, save/draft actions are hidden ??view only.
  readOnly?: boolean
  // Slug for "Preview" link.
  slug: string | null
  // Save creates a new version on top of this.
  nextVersion: number
  // Concierge footer override (carried from last version ??admin can edit).
  initialConciergeName?: string | null
  initialConciergePhone?: string | null
  // Previous version's items for diff display while editing.
  prevItems?: ScheduleItem[]
  // Day-level concierge subpackage assignments: { [day]: { variantId, hours }[] }.
  // Drives the Trip Services coverage count — only days listed here count toward
  // the contracted quantity. Per-day `hours` defaults to the product's durationValue
  // but admin can override per day (will trigger overage flow in finalize stage).
  // Item-level tripServiceVariantIds remain as optional per-item overrides
  // (informational; not counted).
  // Legacy shape `string[]` is read-tolerated and migrated to objects on load.
  initialDaySubpackages?: Record<number, Array<string | DaySubpackageEntry>>
  // Pixel offset from viewport top for sticky day headers (accounts for any fixed/sticky parent).
  stickyTop?: number
}

export default function ScheduleEditor({
  caseId, caseNumber, agentId,
  travelStartDate, travelEndDate,
  initialItems, defaultDayCount, caseProducts,
  caseGroups = [],
  onSaved, onSaveDraft, slug, nextVersion,
  initialConciergeName = null, initialConciergePhone = null,
  readOnly = false,
  prevItems,
  initialDaySubpackages,
  stickyTop = 0,
}: Props) {
  const [items, setItems] = useState<ScheduleItem[]>(initialItems)
  // Keep a ref to the latest items so callbacks like commitPendingItem read the freshest
  // value, not the one captured in their closure at render time.
  const itemsRef = useRef(items)
  itemsRef.current = items

  // Next sortOrder for a day. Uses max(sortOrder)+1 over surviving items so new rows
  // always land after existing ones — robust to gaps and to marked-for-removal items
  // (which are excluded so their sortOrder doesn't shift new rows into a collision).
  function nextSortOrderForDay(day: number): number {
    const orders = items
      .filter(i => i.day === day && !markedForRemoval.has(i.id))
      .map(i => i.sortOrder)
    return orders.length === 0 ? 0 : Math.max(...orders) + 1
  }
  const [markedForRemoval, setMarkedForRemoval] = useState<Set<string>>(new Set())
  const diffKeyFn = (it: ScheduleItem) => it.variantId ?? it.title.trim().toLowerCase()
  const prevKeySet = useMemo(() => new Set((prevItems ?? []).map(diffKeyFn)), [prevItems])
  const [conciergeName, setConciergeName] = useState<string>(initialConciergeName ?? '')
  const [conciergePhone, setConciergePhone] = useState<string>(initialConciergePhone ?? '')
  const [revisionNote, setRevisionNote] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [error, setError] = useState('')
  const [emptyTitleIds, setEmptyTitleIds] = useState<Set<string>>(new Set())
  // Items added in this session that haven't been "Saved" individually yet.
  // Pending rows show with dashed border + inline Cancel/Save and don't count
  // for the global coverage gate (so admin can stage incomplete drafts).
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())
  // Days that are collapsed. Initialised to all days that already have committed items ??
  // so a loaded schedule starts compact and admins expand only what they want to edit.
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(() => {
    const s = new Set<number>()
    for (const item of initialItems) s.add(item.day)
    return s
  })
  function toggleDayCollapse(day: number) {
    setCollapsedDays(prev => { const n = new Set(prev); n.has(day) ? n.delete(day) : n.add(day); return n })
  }
  // Items whose group hasn't been explicitly chosen yet (shows "??Choose group ?? prompt).
  // Cleared the moment admin changes the group select.
  const [unsetGroupItemIds, setUnsetGroupItemIds] = useState<Set<string>>(new Set())
  // Day-level concierge subpackage assignments with hours per service per day.
  // Legacy data may be string[] (variantIds only) — normalize to entries on init.
  const [daySubpackages, setDaySubpackages] = useState<Record<number, DaySubpackageEntry[]>>(() => {
    const out: Record<number, DaySubpackageEntry[]> = {}
    if (!initialDaySubpackages) return out
    for (const [dayStr, arr] of Object.entries(initialDaySubpackages)) {
      const day = Number(dayStr)
      const entries = (arr ?? []).map(v => {
        if (typeof v === 'string') {
          // Legacy: pull default hours from product durationValue (hours unit)
          const cp = caseProducts.find(p => p.variantId === v)
          const isHours = (cp?.durationUnit ?? '').toLowerCase().startsWith('h')
          return { variantId: v, hours: isHours ? (cp?.durationValue ?? 0) : 0 }
        }
        return v
      })
      if (entries.length > 0) out[day] = entries
    }
    return out
  })
  // Default hours for a service variant (from product.durationValue when unit is hours).
  function defaultHoursForVariant(variantId: string): number {
    const cp = caseProducts.find(p => p.variantId === variantId)
    if (!cp) return 0
    const unit = (cp.durationUnit ?? '').toLowerCase()
    return unit.startsWith('h') ? (cp.durationValue ?? 0) : 0
  }
  function setDayEntries(day: number, entries: DaySubpackageEntry[]) {
    setDaySubpackages(prev => {
      const next = { ...prev }
      if (entries.length === 0) delete next[day]
      else next[day] = entries
      return next
    })
  }
  function toggleDayVariant(day: number, variantId: string) {
    const current = daySubpackages[day] ?? []
    const hasIt = current.some(e => e.variantId === variantId)
    const next = hasIt
      ? current.filter(e => e.variantId !== variantId)
      : [...current, { variantId, hours: defaultHoursForVariant(variantId) }]
    setDayEntries(day, next)
  }
  function setDayVariantHours(day: number, variantId: string, hours: number) {
    const current = daySubpackages[day] ?? []
    const next = current.map(e => e.variantId === variantId ? { ...e, hours } : e)
    setDayEntries(day, next)
  }
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

  // variantId ??Set<groupId|null> of committed rows that already link this variant.
  // null in the set means a Shared row (covers all groups).
  // Used by ItemRow to hide already-scheduled products from the picker.
  const committedVariantContexts = useMemo(() => {
    const result = new Map<string, Set<string | null>>()
    for (const it of items) {
      if (pendingItemIds.has(it.id) || !it.variantId) continue
      if (!result.has(it.variantId)) result.set(it.variantId, new Set())
      const gids = resolveGroupIds(it)
      const vid = it.variantId!
      if (gids === null) result.get(vid)!.add(null)
      else gids.forEach(gid => result.get(vid)!.add(gid))
    }
    return result
  }, [items, pendingItemIds])

  // Days present in the editor ??union of (1..defaultDayCount) and any item's day.
  const days = useMemo(() => {
    const set = new Set<number>()
    for (let d = 1; d <= Math.max(defaultDayCount, 1); d++) set.add(d)
    for (const it of items) set.add(it.day)
    return Array.from(set).sort((a, b) => a - b)
  }, [items, defaultDayCount])

  // Day count is fixed by travel dates. Legacy items with day > defaultDayCount
  // still appear in the editor (handled via `days` union above) so admins can
  // see/edit them, but no UI for adding or removing days here ??change dates
  // in Trip Setup instead.

  function addItem(day: number, atBottom = false) {
    setCollapsedDays(prev => { const n = new Set(prev); n.delete(day); return n }) // auto-expand
    const id = generateScheduleItemId()
    const dayItems = items.filter(i => i.day === day)
    const lastBlock = atBottom && dayItems.length > 0
      ? dayItems[dayItems.length - 1].block
      : 'morning'
    const newItem: ScheduleItem = {
      id,
      day,
      block: lastBlock,
      time: null,
      title: '',
      location: null,
      notes: null,
      variantId: null,
      sortOrder: nextSortOrderForDay(day),
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
    setUnsetGroupItemIds(prev => { const n = new Set(prev); n.delete(id); return n })
    // Use the ref so the saved draft includes the freshest edit (closure `items` can be
    // one tick behind if the user's last keystroke fired in the same handler chain).
    void saveDraft(itemsRef.current)
  }
  function editItem(id: string) {
    const snapshot = items.find(i => i.id === id)
    if (snapshot) setEditSnapshots(prev => { const n = new Map(prev); n.set(id, { ...snapshot }); return n })
    setPendingItemIds(prev => { const n = new Set(prev); n.add(id); return n })
  }
  function cancelPendingItem(id: string) {
    const snapshot = editSnapshots.get(id)
    if (snapshot) {
      // Editing an existing committed item ??restore original and exit edit mode
      setItems(prev => prev.map(i => i.id === id ? snapshot : i))
      setEditSnapshots(prev => { const n = new Map(prev); n.delete(id); return n })
    } else {
      // Brand-new item that was never committed ??remove entirely
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


  // Free-time presets ??common enough that admins shouldn't have to type
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
      sortOrder: nextSortOrderForDay(day),
    }
    setItems(prev => [...prev, newItem])
    setPendingItemIds(prev => { const n = new Set(prev); n.add(newItem.id); return n })
  }

  function fillTransfers(day: number) {
    // Include pending items so they (a) anchor new transfers and (b) prevent duplicates
    // when a pending transfer already sits between two activities. Exclude only items
    // marked for removal — those will disappear on save.
    const baseItems = items
      .filter(i => i.day === day && !markedForRemoval.has(i.id))
      .sort(compareScheduleItems)

    // Pick a human-readable label for from/to and title fallback.
    const labelOf = (it: ScheduleItem): string => {
      if (it.location) return it.location
      if (it.itemType === 'meal' && it.restaurantName) return it.restaurantName
      if (it.title) return it.title
      return ''
    }
    const locOf = (it: ScheduleItem): string | null => {
      if (it.location) return it.location
      if (it.itemType === 'meal' && it.restaurantName) return it.restaurantName
      return null
    }

    type Insertion = { afterIdx: number; transfer: ScheduleItem }
    const insertions: Insertion[] = []

    for (let i = 0; i < baseItems.length - 1; i++) {
      const a = baseItems[i]
      const b = baseItems[i + 1]
      const aType = a.itemType ?? 'appointment'
      const bType = b.itemType ?? 'appointment'
      if (aType === 'transfer' || bType === 'transfer') continue
      if (aType === 'free' || bType === 'free') continue
      if (a.isPrayer || b.isPrayer) continue
      const aGroups = resolveGroupIds(a)
      const bGroups = resolveGroupIds(b)
      let transferGroups: string[] | null = null
      if (aGroups === null && bGroups === null) {
        transferGroups = null
      } else if (aGroups === null) {
        transferGroups = bGroups
      } else if (bGroups === null) {
        transferGroups = aGroups
      } else {
        const intersection = aGroups.filter(g => bGroups!.includes(g))
        if (intersection.length === 0) continue
        transferGroups = intersection
      }

      const toLabel = labelOf(b)
      const transfer: ScheduleItem = {
        id: generateScheduleItemId(),
        day,
        block: a.block,
        endBlock: a.block !== b.block ? b.block : undefined,
        // Inherit a's end/start time as the transfer start, and b's start time as
        // the transfer arrival. transfer는 정확히 a 끝 ~ b 시작 사이에 끼는 이동.
        time: a.endTime ?? a.time ?? null,
        endTime: b.time ?? null,
        title: toLabel ? `Transfer to ${toLabel}` : 'Transfer',
        itemType: 'transfer',
        fromLocation: locOf(a),
        toLocation: locOf(b),
        transportMode: 'car',
        location: null,
        notes: null,
        variantId: null,
        groupIds: transferGroups,
        sortOrder: 0, // re-numbered below
      }
      insertions.push({ afterIdx: i, transfer })
    }

    if (insertions.length === 0) return

    // Rebuild the day's sorted list with each transfer inserted right after its `a`,
    // then renumber sortOrders so the new transfer doesn't get pushed to the end.
    const merged: ScheduleItem[] = []
    for (let i = 0; i < baseItems.length; i++) {
      merged.push(baseItems[i])
      const ins = insertions.find(x => x.afterIdx === i)
      if (ins) merged.push(ins.transfer)
    }
    const renumbered = merged.map((it, idx) => ({ ...it, sortOrder: idx }))
    const baseIds = new Set(baseItems.map(it => it.id))
    const newTransfers = insertions.map(x => x.transfer)

    setItems(prev => {
      const kept = prev.filter(i => !baseIds.has(i.id))
      return [...kept, ...renumbered]
    })
    setPendingItemIds(prev => { const n = new Set(prev); newTransfers.forEach(t => n.add(t.id)); return n })
    setCollapsedDays(prev => { const n = new Set(prev); n.delete(day); return n })
  }

  function addFreeTime(day: number, kind: 'night' | 'morning' | 'afternoon' | 'evening' | 'full') {
    const baseSort = nextSortOrderForDay(day)
    if (kind === 'full') {
      const blocks: Array<'morning' | 'afternoon' | 'evening'> = ['morning', 'afternoon', 'evening']
      const additions: ScheduleItem[] = blocks.map((b, i) => ({
        id: generateScheduleItemId(),
        day,
        block: b,
        time: null,
        title: 'Free time',
        itemType: 'free' as const,
        location: null,
        notes: null,
        variantId: null,
        sortOrder: baseSort + i,
      }))
      setItems(prev => [...prev, ...additions])
      setPendingItemIds(prev => { const n = new Set(prev); additions.forEach(a => n.add(a.id)); return n })
    } else {
      const newItem: ScheduleItem = {
        id: generateScheduleItemId(),
        day,
        block: kind,
        time: null,
        title: 'Free time',
        itemType: 'free',
        location: null,
        notes: null,
        variantId: null,
        sortOrder: baseSort,
      }
      setItems(prev => [...prev, newItem])
      setPendingItemIds(prev => { const n = new Set(prev); n.add(newItem.id); return n })
    }
  }

  function updateItem(id: string, patch: Partial<ScheduleItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  function removeItem(id: string) {
    const it = items.find(i => i.id === id)
    if (it && prevKeySet.has(diffKeyFn(it))) {
      // Existing item: toggle "marked for removal" instead of deleting
      setMarkedForRemoval(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
      })
    } else {
      // New item: actually remove
      setItems(prev => prev.filter(i => i.id !== id))
    }
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id)
      if (idx < 0) return prev
      const target = prev[idx]
      // Peer order must match the displayed order, otherwise ▲/▼ swaps with the wrong
      // row. The renderer uses compareScheduleItems (block → time → sortOrder), so use
      // the same comparator here.
      const peers = prev
        .filter(i => i.day === target.day && i.block === target.block)
        .sort(compareScheduleItems)
      const peerIdx = peers.findIndex(i => i.id === id)
      if (peerIdx < 0) return prev
      const swapWith = peers[peerIdx + direction]
      if (!swapWith) return prev
      // Swap sortOrders. For same-time pairs this produces a visible reorder; for
      // time-distinguished pairs sortOrder is the tiebreaker so the swap is a no-op
      // (admin should change the time to reorder time-anchored items).
      return prev.map(i => {
        if (i.id === target.id) return { ...i, sortOrder: swapWith.sortOrder }
        if (i.id === swapWith.id) return { ...i, sortOrder: target.sortOrder }
        return i
      })
    })
  }

  // Apply variant pick: split fields so renderer can lay out hierarchy.
  //   partner ??eyebrow (e.g. "GIL HOSPITAL")
  //   title   ??activity (e.g. "VIP Premium · Female")
  // Deselect clears auto-derived fields, but free-form text the admin typed
  // by hand survives.
  function applyVariantPick(itemId: string, variantId: string | null) {
    if (!variantId) {
      const current = items.find(i => i.id === itemId)
      const prev = current?.variantId ? caseProducts.find(p => p.variantId === current.variantId) : null
      // Handle both legacy format (title included variant) and new format (title = productName only)
      const autoTitleNew = prev?.productName ?? null
      const autoTitleOld = prev ? [prev.productName, prev.variantLabel].filter(Boolean).join(' · ') : null
      // Hotel sub-dropdown can auto-fill these titles regardless of product name.
      const HOTEL_AUTO_TITLES = ['Hotel Check-in', 'Hotel Check-out', 'Hotel Stay']
      const titleWasHotelAuto = !!current?.title && HOTEL_AUTO_TITLES.includes(current.title)
      const titleWasAuto = (autoTitleNew && current?.title === autoTitleNew) || (autoTitleOld && current?.title === autoTitleOld) || titleWasHotelAuto
      const partnerWasAuto = prev?.partnerName && current?.partner === prev.partnerName
      const locationWasAuto = prev?.location
        ? current?.location === prev.location
        : prev?.partnerName && current?.location === prev.partnerName
      const addressWasAuto = prev?.fullAddress && current?.address === prev.fullAddress
      const partnerContactWasAuto = prev?.contactPhone && current?.partnerContact?.includes(prev.contactPhone)
      updateItem(itemId, {
        variantId: null,
        variantTag: null,
        // Hotel check-type only makes sense while a hotel product is linked.
        hotelCheckType: null,
        ...(titleWasAuto ? { title: '' } : {}),
        ...(partnerWasAuto ? { partner: null } : {}),
        ...(locationWasAuto ? { location: null } : {}),
        ...(addressWasAuto ? { address: null } : {}),
        ...(partnerContactWasAuto ? { partnerContact: null } : {}),
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
      location: cp.location ?? cp.partnerName ?? null,
      ...(cp.fullAddress ? { address: cp.fullAddress } : {}),
      ...(cp.contactPhone ? { partnerContact: [cp.partnerName, cp.contactPhone].filter(Boolean).join(' · ') } : {}),
      // Switching to a non-hotel product? Drop any stale hotel check-type.
      ...(cp.isHotel ? {} : { hotelCheckType: null }),
    })
  }

  async function handleSave() {
    if (items.length === 0) {
      setError('Add at least one item before saving.')
      return
    }
    // Validate titles
    const empty = items.filter(i => {
      const t = i.itemType ?? 'appointment'
      if (t === 'free') return false
      if (t === 'transfer') return !(i.fromLocation?.trim() && i.toLocation?.trim()) && !i.title.trim()
      if (t === 'hotel') return !i.hotelCheckType && !i.title.trim()
      return !i.title.trim()
    })
    if (empty.length > 0) {
      setError(`${empty.length} item${empty.length > 1 ? 's' : ''} missing a title.`)
      setEmptyTitleIds(new Set(empty.map(i => i.id)))
      return
    }
    setSaving(true)
    setError('')
    setEmptyTitleIds(new Set())
    try {
      // Normalize sortOrder per (day, block) for stable storage; exclude marked-for-removal items
      const normalized = [...items]
        .filter(it => !markedForRemoval.has(it.id))
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
        day_subpackages: daySubpackages,
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

  // Diff vs previous version (only when prevItems provided)
  const activeItems = items.filter(it => !markedForRemoval.has(it.id))
  const activeKeys = new Set(activeItems.map(diffKeyFn))
  const addedKeys = prevItems ? new Set(activeItems.filter(it => !prevKeySet.has(diffKeyFn(it))).map(diffKeyFn)) : new Set<string>()

  // Set of groupIds that have a health checkup product linked ??used to
  // show the Results Consultation option only for those specific groups
  const healthCheckupGroupIds = new Set(
    items
      .filter(i => i.variantId != null && caseProducts.find(p => p.variantId === i.variantId)?.isHealthCheckup)
      .flatMap(i => (i.groupIds ?? (i.groupId ? [i.groupId] : [])))
  )

  // Available locations for transfer From/To datalist suggestions. Only case
  // product locations — airports stay as free-text (admin types directly) since
  // airports aren't products. Hybrid: input stays as <input> so admin can type
  // any value; datalist provides product-location autocomplete.
  const availableLocations = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const cp of caseProducts) {
      if (cp.isTripService && !cp.isHotel) continue
      const loc = (cp.location ?? cp.partnerName)?.trim()
      if (loc) set.add(loc)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [caseProducts])

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
          <div key={day} className={`bg-white border border-gray-100 shadow-sm ${isCollapsed ? 'rounded-2xl' : 'rounded-2xl'}`}>
            {/* Day header */}
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => toggleDayCollapse(day)}
                className="flex items-baseline gap-2 flex-1 text-left min-w-0"
              >
                <p className="text-sm font-semibold text-gray-900 shrink-0">Day {day}</p>
                {dateObj && <p className="text-xs text-gray-400 truncate">{formatDayHeader(dateObj)}</p>}
                {isCollapsed && dayItems.length > 0 && (
                  <span className="text-xs text-gray-400 shrink-0">· {dayItems.length} item{dayItems.length !== 1 ? 's' : ''}</span>
                )}
              </button>
              <div className="flex items-center gap-3 shrink-0">
                {!isCollapsed && (
                  <>
                    <button onClick={() => addItem(day)} className="text-xs font-semibold text-[#0f4c35] hover:bg-green-50 px-2 py-1 rounded-lg border border-[#0f4c35]/30 hover:border-[#0f4c35] transition-colors">+ Add Item</button>
                    <FreeTimeMenu onPick={(kind) => addFreeTime(day, kind)} />
                    <PrayerMenu onPick={(prayer) => addPrayerTime(day, prayer)} />
                    <button onClick={() => fillTransfers(day)} className="text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg border border-blue-200 hover:bg-blue-50">⇄ Fill Transfers</button>
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
            {!isCollapsed && (() => {
              const groups = caseGroups ?? []
              const hasGroups = groups.length > 0

              // Reusable ItemRow renderer to avoid prop repetition
              const renderItemRow = (it: ScheduleItem, allItems: ScheduleItem[]) => {
                const idx = allItems.indexOf(it)
                return (
                  <ItemRow
                    key={it.id}
                    item={it}
                    caseProducts={caseProducts}
                    caseGroups={groups}
                    availableLocations={availableLocations}
                    sharedVariantIds={sharedVariantIds}
                    committedVariantContexts={committedVariantContexts}
                    isPending={pendingItemIds.has(it.id)}
                    isEditSession={editSnapshots.has(it.id)}
                    isGroupUnset={unsetGroupItemIds.has(it.id)}
                    highlightEmptyTitle={emptyTitleIds.has(it.id)}
                    showResultsSuggestion={
                      !!(it.groupIds?.some(gid => healthCheckupGroupIds.has(gid)) ||
                        (it.groupId && healthCheckupGroupIds.has(it.groupId)))
                    }
                    isNew={addedKeys.has(diffKeyFn(it))}
                    isMarkedForRemoval={markedForRemoval.has(it.id)}
                    onGroupChosen={() => markGroupChosen(it.id)}
                    canMoveUp={idx > 0 && allItems[idx - 1].block === it.block}
                    canMoveDown={idx < allItems.length - 1 && allItems[idx + 1].block === it.block}
                    onUpdate={(patch) => {
                      if (patch.title) setEmptyTitleIds(prev => { const n = new Set(prev); n.delete(it.id); return n })
                      updateItem(it.id, patch)
                    }}
                    onApplyVariant={(vid) => applyVariantPick(it.id, vid)}
                    onRemove={() => removeItem(it.id)}
                    onMove={(dir) => moveItem(it.id, dir)}
                    onEdit={() => editItem(it.id)}
                    onCommit={() => commitPendingItem(it.id)}
                    onCancelDraft={() => cancelPendingItem(it.id)}
                  />
                )
              }

              // --- Segmented layout (when groups exist) ---
              type Seg = { type: 'shared'; item: ScheduleItem } | { type: 'group'; items: ScheduleItem[] }
              const segments: Seg[] = []
              if (hasGroups) {
                let batch: ScheduleItem[] = []
                for (const it of dayItems) {
                  const gids = resolveGroupIds(it)
                  const isShared = gids === null || gids.length === 0
                  if (isShared) {
                    if (batch.length > 0) { segments.push({ type: 'group', items: batch }); batch = [] }
                    segments.push({ type: 'shared', item: it })
                  } else {
                    batch.push(it)
                  }
                }
                if (batch.length > 0) segments.push({ type: 'group', items: batch })
              }

              // Day-level concierge subpackages: trip services (excluding hotel & vehicle)
              // that apply to this day by default. Drives the Trip Services coverage count.
              const dayConciergeOptions = [...new Map(
                caseProducts
                  .filter(cp => cp.isTripService && !cp.isHotel && !cp.isVehicle)
                  .map(cp => [cp.variantId, cp])
              ).values()]
              const entriesForDay = daySubpackages[day] ?? []
              const entryByVariant = new Map(entriesForDay.map(e => [e.variantId, e]))

              return (
              <div className="border-t border-gray-100">
                {dayConciergeOptions.length > 0 && (
                  <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide shrink-0">Day concierge</span>
                    {dayConciergeOptions.map(cp => {
                      const entry = entryByVariant.get(cp.variantId)
                      const checked = !!entry
                      const baseLabel = `${cp.partnerName ? `${cp.partnerName} · ` : ''}${cp.productName}${cp.variantLabel ? ` · ${cp.variantLabel}` : ''}`
                      const hours = entry?.hours ?? 0
                      return (
                        <span key={cp.variantId}>
                          {!checked ? (
                            <button
                              type="button"
                              onClick={() => toggleDayVariant(day, cp.variantId)}
                              className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-white text-gray-600 border-gray-200 hover:border-[#0f4c35] transition-colors"
                            >
                              + {baseLabel}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 bg-[#0f4c35] text-white rounded-full border border-[#0f4c35] pl-2 pr-1.5 py-0.5 text-[11px] font-medium">
                              <button
                                type="button"
                                onClick={() => toggleDayVariant(day, cp.variantId)}
                                className="hover:opacity-70 transition-opacity"
                              >
                                ✓ {baseLabel}
                              </button>
                              <span className="opacity-30 mx-1">·</span>
                              <button
                                type="button"
                                onClick={() => setDayVariantHours(day, cp.variantId, Math.max(0, hours - 1))}
                                className="hover:opacity-70 transition-opacity px-0.5 leading-none"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={hours}
                                onChange={(e) => setDayVariantHours(day, cp.variantId, Math.max(0, Number(e.target.value) || 0))}
                                className="w-5 text-[11px] text-white bg-transparent focus:outline-none text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <span className="opacity-60 text-[10px] -ml-0.5">h</span>
                              <button
                                type="button"
                                onClick={() => setDayVariantHours(day, cp.variantId, hours + 1)}
                                className="hover:opacity-70 transition-opacity px-0.5 leading-none"
                              >
                                +
                              </button>
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                )}
                {dayItems.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-gray-400 text-center italic">No items yet — click &quot;Add Item&quot; to start.</p>
                ) : !hasGroups ? (
                  // ── Flat list (no groups configured) ──────────────────────
                  <div className="divide-y divide-gray-300 max-w-3xl mx-auto w-full">
                    {dayItems.map(it => renderItemRow(it, dayItems))}
                  </div>
                ) : (
                  // ── Segmented column layout ────────────────────────────────
                  <div className="divide-y divide-gray-200">
                    {/* Group column headers — full width to span all columns */}
                    <div className="flex bg-gray-50 border-b border-gray-100">
                      {groups.map(g => (
                        <div key={g.id} className="flex-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-1.5 border-l first:border-l-0 border-gray-100">
                          {g.name}
                        </div>
                      ))}
                    </div>

                    {segments.map((seg, segIdx) => {
                      if (seg.type === 'shared') {
                        // Shared item — full width (distinguished by tint + left border)
                        return (
                          <div key={`seg-${segIdx}`} className="bg-green-50/30 border-l-2 border-[#0f4c35]/20">
                            {renderItemRow(seg.item, dayItems)}
                          </div>
                        )
                      }
                      // Group columns segment — row-based with colspan merging.
                      // Multi-group items whose groups don't form a contiguous range in the
                      // current column order get pulled out as full-width "subset shared"
                      // banner rows (the Covers chip inside ItemRow names the groups).
                      const colItemsPerGroup = groups.map(g =>
                        seg.items.filter(it => {
                          const gids = resolveGroupIds(it)
                          return gids !== null && gids.includes(g.id)
                        })
                      )
                      const maxRows = Math.max(0, ...colItemsPerGroup.map(c => c.length))
                      return (
                        <div key={`seg-${segIdx}`} className="flex flex-col divide-y divide-gray-100">
                          {Array.from({ length: maxRows }, (_, rIdx) => {
                            const row = colItemsPerGroup.map(col => col[rIdx] ?? null)

                            // Identify items that appear at non-contiguous column positions.
                            const positionsById = new Map<string, { item: ScheduleItem; positions: number[] }>()
                            row.forEach((it, idx) => {
                              if (!it) return
                              const entry = positionsById.get(it.id) ?? { item: it, positions: [] }
                              entry.positions.push(idx)
                              positionsById.set(it.id, entry)
                            })
                            const bannerItemIds = new Set<string>()
                            const bannerItems: ScheduleItem[] = []
                            positionsById.forEach(({ item, positions }, id) => {
                              if (positions.length <= 1) return
                              const sorted = [...positions].sort((a, b) => a - b)
                              const isContiguous = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1
                              if (!isContiguous) {
                                bannerItemIds.add(id)
                                bannerItems.push(item)
                              }
                            })

                            // Column row excludes banner items — their column slots show placeholder.
                            const colRow = row.map(it => (it && bannerItemIds.has(it.id) ? null : it))
                            const colRowEmpty = colRow.every(c => c === null)

                            // Build cells with merging for the remaining column items.
                            const cells: Array<{ item: ScheduleItem | null; span: number; startIdx: number }> = []
                            let i = 0
                            while (i < colRow.length) {
                              const item = colRow[i]
                              if (item === null) {
                                cells.push({ item: null, span: 1, startIdx: i })
                                i++
                              } else {
                                let span = 1
                                while (i + span < colRow.length && colRow[i + span]?.id === item.id) span++
                                cells.push({ item, span, startIdx: i })
                                i += span
                              }
                            }

                            return (
                              <React.Fragment key={`r-${rIdx}`}>
                                {bannerItems.map(it => (
                                  <div key={`r${rIdx}-banner-${it.id}`} className="bg-emerald-50/40 border-l-2 border-emerald-400/40">
                                    {renderItemRow(it, dayItems)}
                                  </div>
                                ))}
                                {!colRowEmpty && (
                                  <div className="flex" style={{ alignItems: 'stretch' }}>
                                    {cells.map(c => (
                                      <div
                                        key={`r${rIdx}-c${c.startIdx}`}
                                        className={`min-w-0 ${c.startIdx === 0 ? '' : 'border-l border-gray-200'}`}
                                        style={{ flex: `${c.span} 1 0` }}
                                      >
                                        {c.item ? renderItemRow(c.item, dayItems) : (
                                          <div className="h-full flex items-center justify-center py-6 min-h-[80px]">
                                            <span className="text-xs text-gray-200">—</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </React.Fragment>
                            )
                          })}
                        </div>
                      )
                    })}

                  </div>
                )}

                <div className="sticky bottom-0 z-20 bg-white border-t border-gray-100 rounded-b-2xl">
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <button onClick={() => addItem(day, true)} className="text-xs font-semibold text-[#0f4c35] hover:bg-green-50 px-2 py-1 rounded-lg border border-[#0f4c35]/30 hover:border-[#0f4c35] transition-colors">+ Add Item</button>
                  <FreeTimeMenu onPick={(kind) => addFreeTime(day, kind)} dropUp />
                  <PrayerMenu onPick={(prayer) => addPrayerTime(day, prayer)} dropUp />
                  <button onClick={() => fillTransfers(day)} className="text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg border border-blue-200 hover:bg-blue-50">⇄ Fill Transfers</button>
                </div>
                </div>
              </div>
              )
            })()}
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
          - Non-Subpackage (medical/beauty/etc): each (groupId, variantId) pair must be covered
            by a committed row. A Shared row covers ALL groups.
          - Regular Subpackage (non-Trip-Service): any one row with that variantId satisfies it.
          - Trip Services (interpreter/concierge/security/vehicle/hotel): must appear in
            `quantity` unique days (document_items.quantity = contracted days).
          Pending drafts don't count. */}
      {(() => {
        const committedItems = items.filter(i => !pendingItemIds.has(i.id) && !markedForRemoval.has(i.id))

        // --- Regular coverage (non-trip-service) ---
        const requiredKeys = new Map<string, CaseProduct>()
        for (const cp of caseProducts) {
          if (cp.isTripService) continue
          const key = cp.isSubpackage ? `sub:${cp.variantId}` : `${cp.groupId}:${cp.variantId}`
          if (!requiredKeys.has(key)) requiredKeys.set(key, cp)
        }
        const coveredKeys = new Set<string>()
        for (const it of committedItems) {
          if (!it.variantId) continue
          const v = it.variantId
          coveredKeys.add(`sub:${v}`)
          const gids = resolveGroupIds(it)
          if (gids === null) {
            for (const cp of caseProducts) {
              if (cp.variantId === v) coveredKeys.add(`${cp.groupId}:${v}`)
            }
          } else {
            gids.forEach(gid => coveredKeys.add(`${gid}:${v}`))
          }
        }
        const missingRegular = [...requiredKeys.entries()]
          .filter(([key]) => !coveredKeys.has(key))
          .map(([, cp]) => cp)

        // --- Trip Services n-day coverage ---
        // Hotels: count the SPAN of days from first appearance to last appearance
        //   (max - min + 1) on committed items, since the VIP stays at the hotel on
        //   every day between check-in and check-out even if the schedule only
        //   mentions it at the start/end.
        // Non-hotel trip services (interpreter / concierge / security / vehicle):
        //   count days listed in daySubpackages (day-level concierge selector) +
        //   any day where a committed item directly carries the variantId in
        //   `variantId` (vehicle items linked to that variant). Item-level
        //   `tripServiceVariantIds` are informational overrides only — not counted.
        const scheduledDaysByVariant = new Map<string, Set<number>>()
        // Hours actually scheduled (sum across days) — used for Trip Services summary.
        const scheduledHoursByVariant = new Map<string, number>()
        // Day-level subpackage selections (the source of truth for non-hotel count)
        for (const [dayStr, entries] of Object.entries(daySubpackages)) {
          const day = Number(dayStr)
          for (const e of entries) {
            if (!scheduledDaysByVariant.has(e.variantId)) scheduledDaysByVariant.set(e.variantId, new Set())
            scheduledDaysByVariant.get(e.variantId)!.add(day)
            scheduledHoursByVariant.set(e.variantId, (scheduledHoursByVariant.get(e.variantId) ?? 0) + (e.hours ?? 0))
          }
        }
        // Item-direct variantId coverage (so hotel-day span & vehicle-linked transfers still count)
        for (const it of committedItems) {
          if (!it.variantId) continue
          if (!scheduledDaysByVariant.has(it.variantId)) scheduledDaysByVariant.set(it.variantId, new Set())
          scheduledDaysByVariant.get(it.variantId)!.add(it.day)
        }
        // Deduplicate trip service products by variantId (quantity is the same across groups)
        const tripServiceProducts = new Map<string, CaseProduct>()
        for (const cp of caseProducts) {
          if (!cp.isTripService) continue
          if (!tripServiceProducts.has(cp.variantId)) tripServiceProducts.set(cp.variantId, cp)
        }
        type TripMissing = { cp: CaseProduct; required: number; scheduled: number }
        type TripSummary = {
          cp: CaseProduct
          scheduledDays: number
          requiredDays: number
          scheduledHours: number
          contractedHours: number
          hasHours: boolean
          overage: number  // positive = overage; 0 = matches; negative = under (not used)
        }
        const missingTripServices: TripMissing[] = []
        const tripSummary: TripSummary[] = []
        for (const [vid, cp] of tripServiceProducts) {
          const daySet = scheduledDaysByVariant.get(vid)
          let scheduledDays = 0
          if (daySet && daySet.size > 0) {
            if (cp.isHotel) {
              const days = [...daySet]
              scheduledDays = Math.max(...days) - Math.min(...days) + 1
            } else {
              scheduledDays = daySet.size
            }
          }
          if (scheduledDays < cp.quantity) missingTripServices.push({ cp, required: cp.quantity, scheduled: scheduledDays })
          const hasHours = (cp.durationUnit ?? '').toLowerCase().startsWith('h')
          const baseHours = hasHours ? (cp.durationValue ?? 0) : 0
          const contractedHours = baseHours * cp.quantity
          const scheduledHours = scheduledHoursByVariant.get(vid) ?? 0
          tripSummary.push({
            cp,
            scheduledDays,
            requiredDays: cp.quantity,
            scheduledHours,
            contractedHours,
            hasHours,
            overage: Math.max(0, scheduledHours - contractedHours),
          })
        }
        tripSummary.sort((a, b) => (a.cp.partnerName ?? a.cp.productName).localeCompare(b.cp.partnerName ?? b.cp.productName))

        const hasPending = pendingItemIds.size > 0
        const hasUnsetGroup = unsetGroupItemIds.size > 0
        const allCovered = missingRegular.length === 0 && missingTripServices.length === 0
        const canSave = !saving && allCovered && !hasPending && !hasUnsetGroup && items.length > 0

        return (
          <div className="space-y-2">
            {missingRegular.length > 0 && (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                <p className="font-semibold text-amber-700">
                  {missingRegular.length} product{missingRegular.length !== 1 ? 's' : ''} not yet in schedule
                </p>
                <ul className="text-amber-900 space-y-0.5 pl-3 list-disc">
                  {missingRegular.map(p => (
                    <li key={p.isSubpackage ? `sub:${p.variantId}` : `${p.groupId}:${p.variantId}`}>
                      {!p.isSubpackage && <span className="text-amber-600">{p.groupName} — </span>}
                      {p.partnerName && <span className="text-amber-700">{p.partnerName} · </span>}
                      {p.productName}{p.variantLabel ? ` · ${p.variantLabel}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {missingTripServices.length > 0 && (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                <p className="font-semibold text-amber-700">Trip services not fully scheduled</p>
                <ul className="text-amber-900 space-y-0.5 pl-3 list-disc">
                  {missingTripServices.map(({ cp, required, scheduled }) => (
                    <li key={cp.variantId}>
                      {cp.partnerName && <span className="text-amber-700">{cp.partnerName} · </span>}
                      {cp.productName}{cp.variantLabel ? ` · ${cp.variantLabel}` : ''}
                      <span className="ml-1 text-amber-600">({scheduled}/{required} days)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tripSummary.length > 0 && (
              <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-y-1">
                <p className="font-semibold text-gray-700">Trip Services Summary</p>
                <ul className="text-gray-700 space-y-0.5 pl-3 list-disc">
                  {tripSummary.map(s => {
                    const dayOK = s.scheduledDays >= s.requiredDays
                    const hourOK = !s.hasHours || s.scheduledHours <= s.contractedHours
                    return (
                      <li key={s.cp.variantId}>
                        {s.cp.partnerName && <span className="text-gray-500">{s.cp.partnerName} · </span>}
                        <span className="text-gray-900">{s.cp.productName}</span>{s.cp.variantLabel ? <span className="text-gray-500"> · {s.cp.variantLabel}</span> : null}
                        <span className={`ml-1 ${dayOK ? 'text-gray-500' : 'text-amber-700'}`}>
                          · {s.scheduledDays}/{s.requiredDays} days
                        </span>
                        {s.hasHours && (
                          <span className={`ml-1 ${hourOK ? 'text-gray-500' : 'text-amber-700 font-semibold'}`}>
                            · {s.scheduledHours}h / {s.contractedHours}h
                            {s.overage > 0 && <span className="ml-1">(+{s.overage}h overage)</span>}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {hasPending && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {pendingItemIds.size} item{pendingItemIds.size !== 1 ? 's' : ''} still in draft — Save or Cancel each before sending.
              </p>
            )}
            {hasUnsetGroup && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {unsetGroupItemIds.size} item{unsetGroupItemIds.size !== 1 ? 's' : ''} missing a group — choose a group (or Shared) for each before sending.
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
                className="text-sm font-medium bg-gray-700 text-white hover:bg-gray-600 px-4 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingDraft ? 'Saving…' : draftSaved ? 'Draft saved' : 'Save Draft'}
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                title={!allCovered ? 'Schedule all products and trip services before sending' : (hasPending ? 'Resolve pending drafts first' : (hasUnsetGroup ? 'Choose a group for every item first' : ''))}
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

// ?? Free time menu ????????????????????????????????????????????????????????????

// Small dropdown next to "Add Item" ??three preset options. Half-day picks
// drop a single "Free time" row in that block; full-day drops three (morning
// + afternoon + evening) so the editorial render shows the full day blank.
function FreeTimeMenu({
  onPick, dropUp,
}: {
  onPick: (kind: 'night' | 'morning' | 'afternoon' | 'evening' | 'full') => void
  dropUp?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-xs font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50"
      >
        + Free time ▾
      </button>
      {open && (
        <div className={`absolute right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[150px] divide-y divide-gray-100 ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          {[
            { k: 'night' as const, label: 'Night free' },
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

// ?? Prayer time menu ?????????????????????????????????????????????????????????

function PrayerMenu({ onPick, dropUp }: { onPick: (prayer: string) => void; dropUp?: boolean }) {
  const [open, setOpen] = useState(false)
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-xs font-medium text-orange-600 hover:text-orange-800 px-2 py-1 rounded-lg border border-orange-200 hover:bg-orange-50"
      >
        + Prayer ▾
      </button>
      {open && (
        <div className={`absolute right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[130px] divide-y divide-gray-100 ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
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

// ?? Group multi-select ????????????????????????????????????????????????????????

function LocationCombobox({
  value, onChange, options, disabled, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <input type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full text-xs border border-gray-200 rounded-lg pl-2 pr-7 py-1.5 text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
      />
      {!disabled && options.length > 0 && (
        <button type="button"
          onClick={() => setOpen(o => !o)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      )}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map(opt => (
            <button key={opt}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${opt === value ? 'bg-green-50 text-[#0f4c35] font-medium' : 'text-gray-700'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupMultiSelect({
  groupIds, caseGroups, isPending, isGroupUnset, onChange, onGroupChosen,
}: {
  groupIds: string[] | null
  caseGroups: Array<{ id: string; name: string }>
  isPending: boolean
  isGroupUnset: boolean
  onChange: (gids: string[] | null) => void
  onGroupChosen: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const isShared = groupIds === null

  // Render individual colored chips for each assigned group ID.
  function renderGroupChips(gids: string[]) {
    return gids.map(gid => {
      const group = caseGroups.find(g => g.id === gid)
      const idx = caseGroups.findIndex(g => g.id === gid)
      const t = idx >= 0 ? GROUP_TONES[idx % GROUP_TONES.length] : { chip: 'bg-gray-100 border-gray-300', chipText: 'text-gray-700' }
      return (
        <span key={gid} className={`text-xs font-semibold px-2 py-0.5 rounded border ${t.chip} ${t.chipText}`}>
          {group?.name ?? '?'}
        </span>
      )
    })
  }

  // Committed (read-only) display
  if (!isPending) {
    if (isGroupUnset) {
      return <span className="text-xs font-semibold px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700">— Choose —</span>
    }
    if (isShared || !groupIds || groupIds.length === 0) {
      return <span className="text-xs font-semibold px-2 py-0.5 rounded border bg-white border-gray-800 text-gray-900">Shared</span>
    }
    return <span className="flex items-center gap-1">{renderGroupChips(groupIds)}</span>
  }

  // Pending state ??button that opens dropdown.
  // Always shows the current selection; amber border signals "not yet confirmed".
  const buttonContent = isShared ? (
    <span className={`text-xs font-semibold ${isGroupUnset ? 'text-amber-700' : 'text-gray-900'}`}>
      {isGroupUnset ? '— Choose group —' : 'Shared (all)'}
    </span>
  ) : (
    <span className="flex items-center gap-1">{renderGroupChips(groupIds!)}</span>
  )

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1 border rounded-lg px-2 py-1 focus:outline-none ${
          isGroupUnset ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-400'
        }`}
      >
        {buttonContent}
        <svg className="w-3 h-3 text-gray-400 ml-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] py-1">
          <label className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              checked={isShared && !isGroupUnset}
              onChange={() => { onChange(null); onGroupChosen(); setOpen(false) }}
              className="accent-[#0f4c35]"
            />
            <span className="text-xs font-medium text-gray-700">Shared (all)</span>
          </label>
          <div className="border-t border-gray-100 my-0.5" />
          {caseGroups.map((g, idx) => {
            const checked = !isShared && !!(groupIds?.includes(g.id))
            const t = GROUP_TONES[idx % GROUP_TONES.length]
            return (
              <label key={g.id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const current = isShared ? [] : (groupIds ?? [])
                    const next = e.target.checked
                      ? [...current, g.id]
                      : current.filter(id => id !== g.id)
                    onChange(next.length > 0 ? next : null)
                    onGroupChosen()
                  }}
                  className="accent-[#0f4c35]"
                />
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${t.chip} ${t.chipText}`}>{g.name}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ?? Item row ??????????????????????????????????????????????????????????????????

// Color palette for group accents ??repeats if there are more groups.
// Used as a left border stripe + select chip tint so admin can see at a
// glance which group each row belongs to.
// Group palette: blue / emerald / pink / purple (orange reserved for prayer).
const GROUP_TONES: Array<{ hex: string; chip: string; chipText: string }> = [
  { hex: '#60a5fa', chip: 'bg-blue-50 border-blue-200',    chipText: 'text-blue-700' },
  { hex: '#34d399', chip: 'bg-emerald-50 border-emerald-200', chipText: 'text-emerald-700' },
  { hex: '#f472b6', chip: 'bg-pink-50 border-pink-200',    chipText: 'text-pink-700' },
  { hex: '#c084fc', chip: 'bg-purple-50 border-purple-200',  chipText: 'text-purple-700' },
]
const SHARED_TONE = { hex: '#111827', chip: 'bg-white border-gray-800', chipText: 'text-gray-900' }
const PRAYER_HEX = '#fb923c'

function ItemRow({
  item, caseProducts, caseGroups, availableLocations, sharedVariantIds, committedVariantContexts,
  isPending, isEditSession, isGroupUnset, highlightEmptyTitle, showResultsSuggestion, isNew, isMarkedForRemoval,
  canMoveUp, canMoveDown,
  onUpdate, onApplyVariant, onRemove, onMove,
  onEdit, onCommit, onCancelDraft, onGroupChosen,
}: {
  item: ScheduleItem
  caseProducts: CaseProduct[]
  caseGroups: Array<{ id: string; name: string }>
  availableLocations: string[]
  sharedVariantIds: Set<string>
  committedVariantContexts: Map<string, Set<string | null>>
  isPending: boolean
  isEditSession: boolean
  isGroupUnset: boolean
  highlightEmptyTitle: boolean
  showResultsSuggestion?: boolean
  isNew?: boolean
  isMarkedForRemoval?: boolean
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
}) {
  // Resolve group tone and left border style.
  const itemGroupIds = resolveGroupIds(item)
  const firstGroupId = itemGroupIds?.[0] ?? null
  const groupIdx = firstGroupId ? caseGroups.findIndex(g => g.id === firstGroupId) : -1
  const tone = item.isPrayer
    ? { hex: PRAYER_HEX, chip: '', chipText: '' }
    : groupIdx >= 0 ? GROUP_TONES[groupIdx % GROUP_TONES.length] : SHARED_TONE

  // Left stripe: solid color or top?뭕ottom gradient for multi-group.
  const stripeBackground = (() => {
    if (item.isPrayer) return PRAYER_HEX
    if (itemGroupIds === null || itemGroupIds.length <= 1) return tone.hex
    const hexColors = itemGroupIds.map(gid => {
      const idx = caseGroups.findIndex(g => g.id === gid)
      return idx >= 0 ? GROUP_TONES[idx % GROUP_TONES.length].hex : '#9ca3af'
    })
    const pct = 100 / hexColors.length
    const stops = hexColors.map((c, i) => `${c} ${i * pct}% ${(i + 1) * pct}%`).join(', ')
    return `linear-gradient(to bottom, ${stops})`
  })()

  const showGroupSelect = caseGroups.length > 1

  const vehicleProducts = useMemo(() => caseProducts.filter(cp => cp.isVehicle), [caseProducts])

  const pickerProducts = useMemo(() => {
    if (isGroupUnset) return []
    const filtered = caseProducts.filter(cp => {
      if (cp.isVehicle) return false  // hotel products are now included in appointment picker
const inScope = itemGroupIds === null
        ? cp.isSubpackage || sharedVariantIds.has(cp.variantId)
        : itemGroupIds.some(gid => cp.groupId === gid) || cp.isSubpackage
      return inScope
    })
    const seen = new Set<string>()
    return filtered.filter(cp => {
      if (seen.has(cp.variantId)) return false
      seen.add(cp.variantId)
      return true
    })
  }, [isGroupUnset, caseProducts, itemGroupIds, sharedVariantIds])

  // For Shared rows: show which groups this row covers (via linked variant).
  const coversGroups = useMemo(() => {
    if (itemGroupIds !== null || !item.variantId) return []
    const names = caseProducts
      .filter(cp => cp.variantId === item.variantId && !cp.isSubpackage)
      .map(cp => cp.groupName)
    return [...new Set(names)]
  }, [itemGroupIds, item.variantId, caseProducts])

  const itemType = item.itemType ?? 'appointment'
  const [detailsOpen, setDetailsOpen] = useState(false)
  const canCommit =
    itemType === 'free'     ? true :
    itemType === 'transfer' ? !!(item.fromLocation?.trim() && item.toLocation?.trim()) || item.title.trim().length > 0 :
    itemType === 'hotel'    ? !!(item.hotelCheckType) || item.title.trim().length > 0 :
    item.title.trim().length > 0

  const showTitleAlert = highlightEmptyTitle && !item.title.trim() && itemType !== 'free'

  const isTransportType = itemType === 'transfer' || itemType === 'hotel'
  // Transport rows (transfer/hotel) are visually dimmed vs appointment rows
  const transportDim = isTransportType && !isPending

  return (
    <div className={`flex ${isPending ? 'bg-amber-50/40 border border-dashed border-amber-300 m-2 rounded-lg overflow-hidden' : isMarkedForRemoval ? 'bg-rose-50/60 opacity-60' : showTitleAlert ? 'bg-rose-50/60' : isNew ? 'bg-green-50/50' : isTransportType ? 'bg-gray-100/60' : 'bg-white'}`}>
      {/* Left gutter: 4px stripe */}
      <div style={{ width: 4, flexShrink: 0, background: stripeBackground, alignSelf: 'stretch' }} />
      {/* Main content */}
      <div className="flex-1 py-4 pl-4 pr-4 space-y-2 min-w-0">
      {/* Row 1: committed = compact text labels; pending = full selects */}
      <div className="flex items-center gap-2">
        {isPending ? (
          /* Pending: full select inputs */
          <div className="flex items-center gap-1.5">
            <select
              value={item.itemType ?? 'appointment'}
              onChange={(e) => {
                const t = e.target.value as ScheduleItemType
                const updates: Partial<ScheduleItem> = { itemType: t }
                if (t === 'free' && !item.title.trim()) updates.title = 'Free time'
                if (t === 'hotel') {
                  if (item.hotelCheckType && !item.title.trim())
                    updates.title = item.hotelCheckType === 'checkin' ? 'Hotel Check-in' : item.hotelCheckType === 'checkout' ? 'Hotel Check-out' : 'Hotel Stay'
                  const hotelProduct = caseProducts.find(cp => cp.isHotel)
                  if (hotelProduct && !item.variantId) updates.variantId = hotelProduct.variantId
                }
                onUpdate(updates)
              }}
              className="text-xs font-medium border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35]"
              title="Item type"
            >
              {SCHEDULE_ITEM_TYPES.map(t => (
                <option key={t} value={t}>{SCHEDULE_ITEM_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <span className="text-gray-200">|</span>
            <select
              value={item.block}
              onChange={(e) => onUpdate({ block: e.target.value as ScheduleItemBlock })}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35]"
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
              title="End block"
            >
              <option value="">Same</option>
              {SCHEDULE_BLOCKS.map(b => (
                <option key={b} value={b}>{SCHEDULE_BLOCK_LABEL[b]}</option>
              ))}
            </select>
            <span className="text-gray-200">|</span>
            <Time24Input value={item.time ?? null} onChange={(v) => onUpdate({ time: v, ...(v ? { block: blockFromTime(v) } : {}) })} />
            <span className="text-xs text-gray-400">→</span>
            <Time24Input value={item.endTime ?? null} onChange={(v) => onUpdate({ endTime: v })} />
          </div>
        ) : (
          /* Committed: compact read-only text */
          <div className="flex items-center gap-2 text-xs">
            <span className={`font-semibold ${transportDim ? 'text-gray-400 italic' : 'text-gray-900'}`}>
              {SCHEDULE_ITEM_TYPE_LABEL[itemType]}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400">
              {SCHEDULE_BLOCK_LABEL[item.block]}
              {item.endBlock && item.endBlock !== item.block && ` → ${SCHEDULE_BLOCK_LABEL[item.endBlock]}`}
            </span>
            {item.time && (
              <>
                <span className="text-gray-300">·</span>
                <span className="tabular-nums text-gray-400">
                  {item.time}{item.endTime ? ` → ${item.endTime}` : ''}
                </span>
              </>
            )}
          </div>
        )}
        {/* Spacer */}
        <div className="flex-1" />
        {isMarkedForRemoval && (
          <span className="shrink-0 text-[9px] font-semibold text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded mr-1">REMOVE</span>
        )}
        {isNew && !isMarkedForRemoval && (
          <span className="shrink-0 text-[9px] font-semibold text-green-700 bg-green-100 border border-green-200 px-1.5 py-0.5 rounded mr-1">NEW</span>
        )}
        {/* Right cluster ??always pinned to far right */}
        {!isPending && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onMove(-1)}
              disabled={!canMoveUp}
              className="text-gray-500 hover:text-gray-900 disabled:opacity-20 disabled:hover:text-gray-500 w-6 h-6 flex items-center justify-center"
              title="Move up"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
            </button>
            <button
              onClick={() => onMove(1)}
              disabled={!canMoveDown}
              className="text-gray-500 hover:text-gray-900 disabled:opacity-20 disabled:hover:text-gray-500 w-6 h-6 flex items-center justify-center"
              title="Move down"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <button
              onClick={onEdit}
              className="flex items-center gap-1 text-xs font-semibold bg-green-700 text-white hover:bg-green-800 px-2.5 py-1 rounded-lg transition-colors"
              title="Edit row"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.071-6.071a2 2 0 112.828 2.829L11.828 13.83a2 2 0 01-.707.464l-3.535 1.06 1.06-3.535A2 2 0 019 11z" /></svg>
              Edit
            </button>
            <button
              onClick={() => {
                if (isMarkedForRemoval || window.confirm('Remove this item from the schedule?')) onRemove()
              }}
              className={`w-6 h-6 flex items-center justify-center ${isMarkedForRemoval ? 'text-rose-400 hover:text-rose-600' : 'text-gray-300 hover:text-red-500'}`}
              title={isMarkedForRemoval ? 'Undo removal' : 'Remove item'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Row 2: FOR group + hotel check-in/out + product picker + covers chip */}
      {(showGroupSelect || itemType === 'hotel' || (itemType === 'appointment' && !item.isPrayer) || coversGroups.length > 1) && (
        <div className="flex flex-wrap items-center gap-2">
          {showGroupSelect && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">For</span>
              <GroupMultiSelect
                groupIds={itemGroupIds}
                caseGroups={caseGroups}
                isPending={isPending}
                isGroupUnset={isGroupUnset}
                onChange={(gids) => {
                  if (gids === null || gids.length === 0) {
                    onApplyVariant(null) // reset product when switching to shared
                  }
                  onUpdate({ groupIds: gids, groupId: gids === null ? null : (gids[0] ?? null) })
                }}
                onGroupChosen={onGroupChosen}
              />
            </span>
          )}
          {(itemType === 'appointment' || itemType === 'hotel') && !item.isPrayer && (() => {
            // Regular products + hotels. Other trip services (vehicle = transfer picker,
            // concierge/interpreter/security = Day concierge selector) stay out of this dropdown.
            const regularProducts = pickerProducts.filter(cp => !cp.isTripService || cp.isHotel)
            // Subpackage selector lists concierge-type trip services (interpreter, concierge, security, etc.)
            // Hotel & vehicle are excluded — hotel is its own appointment type with hotelCheckType,
            // vehicle is selected on transfer items separately.
            const allTripServices = caseProducts.filter(cp => cp.isTripService && !cp.isVehicle && !cp.isHotel)
            // Detect if selected product is a hotel product
            const selectedHotelProduct = item.variantId
              ? caseProducts.find(cp => cp.variantId === item.variantId && cp.isHotel) ?? null
              : null
            const uniqueTripServices = [...new Map(allTripServices.map(cp => [cp.variantId, cp])).values()]
            const renderOption = (cp: CaseProduct) => {
              const isCommitted = cp.variantId !== item.variantId && committedVariantContexts.has(cp.variantId)
              const label = `${cp.partnerName ? `${cp.partnerName} · ` : ''}${cp.productName}${cp.variantLabel ? ` · ${cp.variantLabel}` : ''}`
              const dur = cp.durationValue && cp.durationUnit ? ` (${cp.durationValue}${cp.durationUnit})` : ''
              return <option key={cp.variantId} value={cp.variantId}>{isCommitted ? `✓ ${label}${dur}` : `${label}${dur}`}</option>
            }
            return (
              <>
                <select
                  value={item.variantId ?? (item.title === 'Results Consultation' ? '__results_consultation__' : '')}
                  onChange={(e) => {
                    if (e.target.value === '__results_consultation__') {
                      onUpdate({ title: 'Results Consultation', variantId: null })
                    } else {
                      onApplyVariant(e.target.value || null)
                    }
                  }}
                  disabled={!isPending}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] flex-1 min-w-[180px] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
                >
                  <option value="">— Link a product (optional) —</option>
                  {regularProducts.map(renderOption)}
                  {showResultsSuggestion && (
                    <option value="__results_consultation__">Results Consultation</option>
                  )}
                </select>
                {selectedHotelProduct && (
                  <select
                    value={item.hotelCheckType ?? ''}
                    onChange={(e) => {
                      const v = (e.target.value || null) as ScheduleItem['hotelCheckType']
                      const autoTitles: Record<string, string> = { checkin: 'Hotel Check-in', checkout: 'Hotel Check-out', stay: 'Hotel Stay' }
                      const updates: Partial<ScheduleItem> = { hotelCheckType: v }
                      const currentTitle = item.title.trim()
                      if (!currentTitle || Object.values(autoTitles).includes(currentTitle))
                        updates.title = v ? (autoTitles[v] ?? '') : ''
                      onUpdate(updates)
                    }}
                    disabled={!isPending}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
                  >
                    <option value="">— Hotel type —</option>
                    <option value="checkin">Check-in</option>
                    <option value="checkout">Check-out</option>
                    <option value="stay">Stay</option>
                  </select>
                )}
                {uniqueTripServices.length > 0 && (() => {
                  const selectedIds = item.tripServiceVariantIds ?? []
                  const toggle = (vid: string) => {
                    const next = selectedIds.includes(vid)
                      ? selectedIds.filter(x => x !== vid)
                      : [...selectedIds, vid]
                    onUpdate({ tripServiceVariantIds: next.length ? next : null })
                  }
                  return (
                    <div className="flex flex-wrap items-center gap-1">
                      {uniqueTripServices.map(cp => {
                        const label = `${cp.partnerName ? `${cp.partnerName} · ` : ''}${cp.productName}`
                        const checked = selectedIds.includes(cp.variantId)
                        return (
                          <button
                            key={cp.variantId}
                            type="button"
                            disabled={!isPending}
                            onClick={() => toggle(cp.variantId)}
                            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors disabled:cursor-default ${
                              checked
                                ? 'bg-[#0f4c35] text-white border-[#0f4c35]'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-[#0f4c35] hover:text-[#0f4c35]'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
              </>
            )
          })()}
          {coversGroups.length > 1 && (
            <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">
              Covers {coversGroups.join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Partner eyebrow + title ??appointment/free only (other types handle title above) */}
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
                className={`flex-1 text-sm border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#0f4c35] disabled:cursor-default ${
                  highlightEmptyTitle && !item.title.trim()
                    ? 'border-rose-400 bg-rose-100 text-rose-500 placeholder:text-rose-400'
                    : 'border-gray-200 bg-white disabled:bg-gray-50 text-gray-900 disabled:text-gray-600'
                }`}
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

      {/* Type-specific fields */}
      {itemType === 'transfer' && (
        <>
          {/* From / To — free text input + visible ▾ dropdown pick from case product locations.
              Airports and ad-hoc locations stay as free-text since they aren't products. */}
          <div className="grid grid-cols-2 gap-2">
            <LocationCombobox
              value={item.fromLocation ?? ''}
              onChange={(v) => onUpdate({ fromLocation: v || null })}
              options={availableLocations}
              disabled={!isPending}
              placeholder="From (type or pick)"
            />
            <LocationCombobox
              value={item.toLocation ?? ''}
              onChange={(v) => onUpdate({ toLocation: v || null })}
              options={availableLocations}
              disabled={!isPending}
              placeholder="To (type or pick)"
            />
          </div>
          {/* Transport mode + vehicle (or label override) — in Details for committed rows */}
          {(isPending || detailsOpen) && (
            <div className="grid grid-cols-2 gap-2">
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
              {vehicleProducts.length > 0 ? (
                <select
                  value={item.variantId ?? ''}
                  onChange={(e) => onApplyVariant(e.target.value || null)}
                  disabled={!isPending}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
                >
                  <option value="">— Vehicle —</option>
                  {vehicleProducts.map(cp => (
                    <option key={cp.variantId} value={cp.variantId}>
                      {cp.partnerName ? `${cp.partnerName} · ` : ''}{cp.productName}{cp.variantLabel ? ` · ${cp.variantLabel}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="text" value={item.title}
                  onChange={(e) => onUpdate({ title: e.target.value })}
                  disabled={!isPending}
                  placeholder="Label override (optional)"
                  className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400 disabled:cursor-default"
                />
              )}
            </div>
          )}
        </>
      )}
      {/* Hotel label override ??only in Details for committed rows (check-in/out is already in row 2) */}
      {itemType === 'hotel' && (isPending || detailsOpen) && (
        <input type="text" value={item.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          disabled={!isPending} placeholder="Label override (optional)"
          className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-700 bg-gray-50 focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-400 disabled:cursor-default w-full"
        />
      )}
      {itemType === 'meal' && (
        <>
          {/* Meal type ??always visible */}
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
          {/* Restaurant + cuisine ??in Details for committed rows */}
          {(isPending || detailsOpen) && (
            <div className="grid grid-cols-2 gap-2">
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
        </>
      )}

      {/* Expand/collapse toggle for optional detail fields ??only shown on committed rows */}
      {!isPending && (
        <button
          type="button"
          onClick={() => setDetailsOpen(v => !v)}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-800 py-0.5 font-medium"
        >
          <svg className={`w-3 h-3 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {detailsOpen ? 'Hide details' : 'Details'}
          {!detailsOpen && (() => {
            const filledCount = [
              item.notes, item.location, item.internalNotes, item.address, item.partnerContact, item.driverInfo,
              item.transportMode, item.restaurantName, item.cuisine,
              itemType === 'hotel' && item.title,
              itemType === 'transfer' && item.title,
            ].filter(Boolean).length
            return filledCount > 0 ? (
              <span className="ml-1 text-[9px] bg-gray-200 text-gray-500 rounded-full px-1.5 py-0.5">
                {filledCount} filled
              </span>
            ) : null
          })()}
        </button>
      )}

      {/* Notes + internal fields ??always visible when editing (isPending), collapsible when committed */}
      {(isPending || detailsOpen) && (
        <>
          {/* Notes ??VIP-facing */}
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
        </>
      )}

      {isPending && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="text-[10px] text-amber-700 mr-auto">Draft — not counted toward schedule coverage until saved</span>
          <button
            type="button"
            onClick={() => {
              if (isEditSession) {
                // Restores original ??no data loss, no confirmation needed
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
    </div>
  )
}

