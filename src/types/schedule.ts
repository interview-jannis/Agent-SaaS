// Schedule item shape stored in `schedules.items` JSONB column.
//
// One row per schedule item (a single line in the rendered itinerary).
// Grouped at render time by (day, block, time, sortOrder).

export type ScheduleItemBlock = 'morning' | 'afternoon' | 'evening'

export const SCHEDULE_BLOCKS: ScheduleItemBlock[] = ['morning', 'afternoon', 'evening']

export const SCHEDULE_BLOCK_LABEL: Record<ScheduleItemBlock, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

export type ScheduleItem = {
  id: string                       // client-generated UUID for React key + reorder
  day: number                      // 1-indexed
  block: ScheduleItemBlock
  time: string | null              // "HH:MM" 24h, optional
  title: string                    // free text
  location: string | null
  notes: string | null
  variantId: string | null         // optional ref to product_variants for context
  sortOrder: number                // within (day, block, time) ties
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
