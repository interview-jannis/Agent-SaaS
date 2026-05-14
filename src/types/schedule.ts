// Schedule item shape stored in `schedules.items` JSONB column.
//
// One row per schedule item (a single line in the rendered itinerary).
// Grouped at render time by (day, block, time, sortOrder).

export type ScheduleItemBlock = 'morning' | 'afternoon' | 'evening'

export type ScheduleItemType = 'appointment' | 'transfer' | 'meal' | 'hotel' | 'free'  // hotel/free kept for backward-compat read; new items use appointment/transfer/meal only

export const SCHEDULE_ITEM_TYPES: ScheduleItemType[] = ['appointment', 'transfer', 'meal']

export const SCHEDULE_ITEM_TYPE_LABEL: Record<ScheduleItemType, string> = {
  appointment: 'Appointment',
  transfer:    'Transfer',
  meal:        'Meal',
  hotel:       'Hotel',   // legacy
  free:        'Free time', // legacy
}

export const SCHEDULE_BLOCKS: ScheduleItemBlock[] = ['morning', 'afternoon', 'evening']

export const SCHEDULE_BLOCK_LABEL: Record<ScheduleItemBlock, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

export type ScheduleItem = {
  id: string                       // client-generated UUID for React key + reorder
  day: number                      // 1-indexed
  block: ScheduleItemBlock          // start block
  endBlock?: ScheduleItemBlock | null  // end block (optional). Different from
                                       //   `block` means the activity spans
                                       //   blocks (e.g. Morning → Afternoon).
                                       //   null/missing = single block.
  time: string | null              // "HH:MM" 24h, optional — start time
  endTime?: string | null           // "HH:MM" 24h, optional — end time
  title: string                    // free text — the activity itself
  variantTag?: string | null        // variant label stored separately so renderer can show as chip
  partner?: string | null           // partner brand (e.g. "Gil Hospital") — eyebrow above title
  location: string | null
  notes: string | null              // VIP-facing — rendered on client schedule
  internalNotes?: string | null     // admin/concierge only — never rendered to client
  // Admin internal-only operational details (shown in ?internal=1 mode)
  address?: string | null          // exact address of venue
  partnerContact?: string | null   // partner contact person + phone
  driverInfo?: string | null       // driver name + phone + pickup instruction
  isPrayer?: boolean               // marks item as Islamic prayer time (orange italic styling)
  itemType?: ScheduleItemType      // default: 'appointment'
  // transfer-specific
  fromLocation?: string | null
  toLocation?: string | null
  transportMode?: 'car' | 'shuttle' | 'taxi' | 'bus' | 'walk' | null
  // meal-specific
  restaurantName?: string | null
  cuisine?: string | null
  // hotel-specific — 3-enum (legacy 'depart'/'return' are read-tolerated and normalized to 'stay' on edit)
  hotelCheckType?: 'checkin' | 'checkout' | 'stay' | null
  variantId: string | null         // optional ref to product_variants for context
  tripServiceVariantIds?: string[] | null  // trip services (interpreter/concierge/security) assigned to this appointment
  groupId?: string | null           // legacy single-group field — kept for backward compat
  groupIds?: string[] | null        // null = shared (all groups), string[] = subset of groups
                                    // groupIds takes precedence over groupId when both present
  sortOrder: number                // within (day, block, time) ties
}

// Resolve which groups an item is assigned to.
// null = shared (visible to all groups); string[] = specific groups.
// Handles backward-compat with old single-groupId items.
export function resolveGroupIds(item: Pick<ScheduleItem, 'groupId' | 'groupIds'>): string[] | null {
  if (item.groupIds !== undefined) return item.groupIds   // new multi-group field
  if (item.groupId) return [item.groupId]                 // legacy single-group
  return null                                             // shared
}

// Compare two items for stable ordering within a day.
// Block order: morning → afternoon → evening.
// Within block: explicit time first (sorted), then null-time items by sortOrder.
export function compareScheduleItems(a: ScheduleItem, b: ScheduleItem): number {
  if (a.day !== b.day) return a.day - b.day
  const blockA = SCHEDULE_BLOCKS.indexOf(a.block)
  const blockB = SCHEDULE_BLOCKS.indexOf(b.block)
  if (blockA !== blockB) return blockA - blockB
  // Items with explicit time sort before items without
  if (a.time && !b.time) return -1
  if (!a.time && b.time) return 1
  if (a.time && b.time) {
    const cmp = a.time.localeCompare(b.time)
    if (cmp !== 0) return cmp
  }
  return a.sortOrder - b.sortOrder
}

// Group items by day for rendering.
export function groupItemsByDay(items: ScheduleItem[]): Map<number, ScheduleItem[]> {
  const sorted = [...items].sort(compareScheduleItems)
  const out = new Map<number, ScheduleItem[]>()
  for (const it of sorted) {
    const arr = out.get(it.day) ?? []
    arr.push(it)
    out.set(it.day, arr)
  }
  return out
}

// Group a single day's items by block (preserving sort order).
export function groupDayByBlock(dayItems: ScheduleItem[]): Map<ScheduleItemBlock, ScheduleItem[]> {
  const out = new Map<ScheduleItemBlock, ScheduleItem[]>()
  for (const block of SCHEDULE_BLOCKS) out.set(block, [])
  for (const it of dayItems) {
    out.get(it.block)?.push(it)
  }
  return out
}

// Generate a UUID for new items. Falls back to Math.random for older runtimes.
export function generateScheduleItemId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `sch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Derive the date for day N given the trip's travel_start_date.
// Returns null if the start date is missing or invalid.
export function dateForDay(travelStartDate: string | null | undefined, day: number): Date | null {
  if (!travelStartDate) return null
  const start = new Date(travelStartDate)
  if (!isFinite(start.getTime())) return null
  const d = new Date(start)
  d.setDate(d.getDate() + (day - 1))
  return d
}

// Format a date as "Saturday, May 18" (Option A header style).
export function formatDayHeader(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}
