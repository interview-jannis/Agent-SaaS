// Editorial schedule renderer — customer-facing /schedule/[slug] and admin preview.
// Redesigned 2026-05-06: cover includes flight info + group members; day sections
// separate shared vs per-group items visually; variantTag shown as a chip.

import {
  type ScheduleItem,
  SCHEDULE_BLOCKS,
  SCHEDULE_BLOCK_LABEL,
  compareScheduleItems,
  dateForDay,
  formatDayHeader,
  groupDayByBlock,
} from '@/types/schedule'

type FlightData = {
  departure_airport?: string | null
  arrival_airport?: string | null
  departure_datetime?: string | null
  arrival_datetime?: string | null
  flight_number?: string | null
} | null

type GroupData = {
  id: string
  name: string
  members: string[]
}

type Props = {
  items: ScheduleItem[]
  caseNumber: string | null
  leadName: string | null
  travelStartDate: string | null
  travelEndDate: string | null
  hotelName: string | null
  agentName: string | null
  agentPhone: string | null
  version: number
  createdAt: string | null
  showInternalNotes?: boolean
  filterGroupId?: string | null
  groupNameById?: Record<string, string>
  // New
  outboundFlight?: FlightData
  inboundFlight?: FlightData
  groups?: GroupData[]
}

// Accent colors for group sections (matches admin editor GROUP_TONES palette)
const GROUP_PALETTE = [
  { accent: '#60a5fa', bg: '#eff6ff', text: '#1d4ed8' },
  { accent: '#34d399', bg: '#ecfdf5', text: '#065f46' },
  { accent: '#fb923c', bg: '#fff7ed', text: '#9a3412' },
  { accent: '#a78bfa', bg: '#f5f3ff', text: '#5b21b6' },
]

function formatRange(start: string | null, end: string | null): string {
  if (!start || !end) return ''
  const s = new Date(start), e = new Date(end)
  if (!isFinite(s.getTime()) || !isFinite(e.getTime())) return ''
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function nightsBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  const s = new Date(start).getTime(), e = new Date(end).getTime()
  if (!isFinite(s) || !isFinite(e) || e <= s) return 0
  return Math.round((e - s) / 86400000)
}

function formatFlightDateTime(dt: string | null | undefined): { date: string; time: string } | null {
  if (!dt) return null
  const d = new Date(dt)
  if (!isFinite(d.getTime())) return null
  return {
    date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  }
}

export default function ScheduleDocument(props: Props) {
  const {
    items, caseNumber, leadName, travelStartDate, travelEndDate,
    hotelName, agentName, agentPhone, version, createdAt,
    showInternalNotes = false,
    filterGroupId, groupNameById,
    outboundFlight, inboundFlight, groups = [],
  } = props

  const filtered = filterGroupId
    ? items.filter(it => !it.groupId || it.groupId === filterGroupId)
    : items
  const sorted = [...filtered].sort(compareScheduleItems)
  const nights = nightsBetween(travelStartDate, travelEndDate)
  const tripDays = nights + 1
  const daysWithItems = Array.from(new Set(sorted.map(i => i.day)))
  const allDays = Array.from(new Set([
    ...Array.from({ length: Math.max(tripDays, 1) }, (_, i) => i + 1),
    ...daysWithItems,
  ])).sort((a, b) => a - b)

  const versionLabel = `v${version}`
  const createdLabel = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  // Multi-group admin view: groups visible, items separated
  const isMultiGroup = !filterGroupId && groups.length > 1

  const outDep = formatFlightDateTime(outboundFlight?.departure_datetime)
  const outArr = formatFlightDateTime(outboundFlight?.arrival_datetime)
  const inDep = formatFlightDateTime(inboundFlight?.departure_datetime)
  const inArr = formatFlightDateTime(inboundFlight?.arrival_datetime)
  const hasFlights = !!(outboundFlight?.departure_airport || inboundFlight?.departure_airport)

  return (
    <div className="bg-white text-gray-900 min-h-screen print:min-h-0">
      <style>{`
        @page { size: A4; margin: 18mm; }
        .sch-serif { font-family: 'Cormorant Garamond', 'Noto Serif KR', Georgia, serif; }
      `}</style>

      <article className="max-w-4xl mx-auto bg-white">

        {/* ── Cover ── */}
        <header className="px-6 sm:px-12 lg:px-16 pt-12 sm:pt-16 pb-10 sm:pb-14">

          <p className="text-[10px] tracking-[0.3em] text-gray-400 uppercase">Tiktak · Personal Itinerary</p>
          <h1 className="sch-serif text-4xl sm:text-5xl lg:text-6xl text-gray-900 mt-3 leading-tight">
            {leadName || 'Guest'}
          </h1>
          {caseNumber && <p className="text-xs text-gray-400 mt-1">{caseNumber}</p>}
          {(travelStartDate || travelEndDate) && (
            <p className="sch-serif text-xl sm:text-2xl text-gray-400 mt-2 italic">
              {formatRange(travelStartDate, travelEndDate)}
              {nights > 0 && <span className="not-italic text-base ml-2 text-gray-400">· {nights} {nights === 1 ? 'night' : 'nights'}</span>}
            </p>
          )}

          {/* Groups */}
          {isMultiGroup && (
            <div className="mt-8 pt-8 border-t border-gray-100 grid gap-4"
              style={{ gridTemplateColumns: `repeat(${Math.min(groups.length, 4)}, minmax(0, 1fr))` }}>
              {groups.map((g, gi) => {
                const pal = GROUP_PALETTE[gi % GROUP_PALETTE.length]
                return (
                  <div key={g.id} style={{ borderLeft: `3px solid ${pal.accent}`, paddingLeft: '12px' }}>
                    <p className="text-[10px] tracking-[0.2em] uppercase font-semibold mb-1.5"
                      style={{ color: pal.text }}>{g.name}</p>
                    {g.members.length === 0
                      ? <p className="text-xs text-gray-400 italic">—</p>
                      : g.members.map(m => (
                        <p key={m} className="text-sm text-gray-700">· {m}</p>
                      ))
                    }
                  </div>
                )
              })}
            </div>
          )}

          {/* Flights */}
          {hasFlights && (
            <div className="mt-8 pt-8 border-t border-gray-100 grid grid-cols-2 gap-8">
              {outboundFlight?.departure_airport && (
                <div>
                  <p className="text-[10px] tracking-[0.25em] text-gray-400 uppercase mb-2">Outbound Flight</p>
                  <p className="text-base font-medium text-gray-900">
                    {outboundFlight.departure_airport} → {outboundFlight.arrival_airport ?? '—'}
                    {outboundFlight.flight_number && <span className="text-sm text-gray-400 ml-2">{outboundFlight.flight_number}</span>}
                  </p>
                  {outDep && <p className="text-sm text-gray-600 mt-0.5">Dep&nbsp;&nbsp;{outDep.date} · {outDep.time}</p>}
                  {outArr && <p className="text-sm text-gray-400">Arr&nbsp;&nbsp;&nbsp;{outArr.date} · {outArr.time}</p>}
                </div>
              )}
              {inboundFlight?.departure_airport && (
                <div>
                  <p className="text-[10px] tracking-[0.25em] text-gray-400 uppercase mb-2">Return Flight</p>
                  <p className="text-base font-medium text-gray-900">
                    {inboundFlight.departure_airport} → {inboundFlight.arrival_airport ?? '—'}
                    {inboundFlight.flight_number && <span className="text-sm text-gray-400 ml-2">{inboundFlight.flight_number}</span>}
                  </p>
                  {inDep && <p className="text-sm text-gray-600 mt-0.5">Dep&nbsp;&nbsp;{inDep.date} · {inDep.time}</p>}
                  {inArr && <p className="text-sm text-gray-400">Arr&nbsp;&nbsp;&nbsp;{inArr.date} · {inArr.time}</p>}
                </div>
              )}
            </div>
          )}

          {/* Arrival / Departure / Stay */}
          <div className="mt-8 pt-8 border-t border-gray-100 flex flex-wrap gap-x-10 gap-y-4">
            {travelStartDate && (
              <div>
                <p className="text-[10px] tracking-[0.25em] text-gray-400 uppercase">Arrival</p>
                <p className="text-sm text-gray-900 mt-1">
                  {new Date(travelStartDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
            )}
            {travelEndDate && (
              <div>
                <p className="text-[10px] tracking-[0.25em] text-gray-400 uppercase">Departure</p>
                <p className="text-sm text-gray-900 mt-1">
                  {new Date(travelEndDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
            )}
            {hotelName && (
              <div>
                <p className="text-[10px] tracking-[0.25em] text-gray-400 uppercase">Stay</p>
                <p className="text-sm text-gray-900 mt-1">{hotelName}</p>
              </div>
            )}
          </div>
        </header>

        {/* ── Day sections ── */}
        <div className="border-t border-gray-200">
          {allDays.length === 0 ? (
            <div className="px-6 sm:px-12 lg:px-16 py-16 text-center">
              <p className="text-sm text-gray-400">Your itinerary will appear here.</p>
            </div>
          ) : (
            allDays.map((day, idx) => {
              const dayItems = sorted.filter(i => i.day === day)
              const dateObj = dateForDay(travelStartDate, day)
              const isLast = idx === allDays.length - 1

              // Split into shared and per-group
              const sharedItems = dayItems.filter(i => !i.groupId)
              const groupSections = groups
                .map((g, gi) => ({ g, gi, items: dayItems.filter(i => i.groupId === g.id) }))
                .filter(s => s.items.length > 0)

              return (
                <section
                  key={day}
                  className={`px-6 sm:px-12 lg:px-16 py-10 sm:py-14 ${isLast ? '' : 'border-b border-gray-200'} print:break-inside-avoid`}
                >
                  {/* Day header */}
                  <div className="flex items-baseline gap-4 sm:gap-6 mb-8 sm:mb-10">
                    <p className="sch-serif text-5xl sm:text-6xl lg:text-7xl text-gray-900 leading-none tabular-nums">
                      {String(day).padStart(2, '0')}
                    </p>
                    <p className="sch-serif text-xl sm:text-2xl text-gray-900">
                      {dateObj ? formatDayHeader(dateObj) : `Day ${day}`}
                    </p>
                  </div>

                  {dayItems.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">At leisure</p>
                  ) : isMultiGroup ? (
                    // Multi-group admin view
                    <div className="space-y-8">
                      {sharedItems.length > 0 && (
                        <DayItems items={sharedItems} showInternalNotes={showInternalNotes} />
                      )}
                      {groupSections.map(({ g, gi, items: gItems }) => {
                        const pal = GROUP_PALETTE[gi % GROUP_PALETTE.length]
                        return (
                          <div key={g.id}>
                            <div className="flex items-center gap-3 mb-5">
                              <div className="h-px flex-1 bg-gray-100" />
                              <span className="text-[10px] tracking-[0.25em] uppercase font-semibold px-2"
                                style={{ color: pal.text }}>{g.name}</span>
                              <div className="h-px flex-1 bg-gray-100" />
                            </div>
                            <div style={{ borderLeft: `2px solid ${pal.accent}`, paddingLeft: '16px' }}>
                              <DayItems items={gItems} showInternalNotes={showInternalNotes} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    // Single-group or filtered client view
                    <DayItems
                      items={dayItems}
                      showInternalNotes={showInternalNotes}
                      groupNameById={!filterGroupId ? groupNameById : undefined}
                    />
                  )}
                </section>
              )
            })
          )}
        </div>

        {/* ── Footer ── */}
        <footer className="px-6 sm:px-12 lg:px-16 py-6 sm:py-8 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
            <div>
              <p className="text-[10px] tracking-[0.25em] text-gray-400 uppercase">Concierge</p>
              {agentName && <p className="text-sm text-gray-900 mt-1">{agentName}</p>}
              {agentPhone && <p className="text-xs text-gray-500">{agentPhone}</p>}
            </div>
            <p className="text-[10px] text-gray-400 tabular-nums">
              {versionLabel}{createdLabel ? ` · prepared ${createdLabel}` : ''}
            </p>
          </div>
        </footer>

      </article>
    </div>
  )
}

// ── Day items renderer ────────────────────────────────────────────────────────

function DayItems({
  items,
  showInternalNotes,
  groupNameById,
}: {
  items: ScheduleItem[]
  showInternalNotes: boolean
  groupNameById?: Record<string, string>
}) {
  const byBlock = groupDayByBlock(items)

  return (
    <div className="space-y-7 sm:space-y-9">
      {SCHEDULE_BLOCKS.map(block => {
        const blockItems = byBlock.get(block) ?? []
        if (blockItems.length === 0) return null
        return blockItems.map((item, itemIdx) => {
          const timeStr = item.time && item.endTime
            ? `${item.time} – ${item.endTime}`
            : (item.time ?? null)
          const blockStr = item.endBlock && item.endBlock !== block
            ? `${SCHEDULE_BLOCK_LABEL[block]} → ${SCHEDULE_BLOCK_LABEL[item.endBlock]}`
            : SCHEDULE_BLOCK_LABEL[block]

          return (
            <div
              key={item.id}
              className="grid grid-cols-1 sm:grid-cols-[130px_1fr] gap-1 sm:gap-8"
            >
              {/* Time / block label */}
              <div className="pt-0.5 sm:pt-1">
                {itemIdx === 0 ? (
                  <p className="text-[11px] tracking-[0.2em] text-gray-400 uppercase">
                    {timeStr
                      ? <><span className="tabular-nums">{timeStr}</span><span className="mx-1 text-gray-300">·</span>{blockStr}</>
                      : blockStr}
                  </p>
                ) : timeStr ? (
                  <p className="text-[11px] text-gray-400 tabular-nums">{timeStr}</p>
                ) : (
                  <p className="text-[11px] text-gray-200">·</p>
                )}
              </div>

              {/* Content */}
              <div>
                {/* Eyebrow: partner + group badge (single-group admin view) */}
                {(item.partner || (groupNameById && item.groupId && groupNameById[item.groupId])) && (
                  <p className="text-[10px] tracking-[0.2em] text-gray-400 uppercase mb-1 flex items-center gap-2 flex-wrap">
                    {item.partner && <span>{item.partner}</span>}
                    {groupNameById && item.groupId && groupNameById[item.groupId] && (
                      <span className="text-[9px] font-semibold bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full text-gray-500 normal-case tracking-normal">
                        {groupNameById[item.groupId]}
                      </span>
                    )}
                  </p>
                )}

                {/* Title + variantTag chip */}
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="sch-serif text-lg sm:text-xl text-gray-900 leading-snug">
                    {item.title || '—'}
                  </p>
                  {item.variantTag && (
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5 shrink-0">
                      {item.variantTag}
                    </span>
                  )}
                </div>

                {item.notes && (
                  <p className="text-sm text-gray-500 mt-1.5 leading-relaxed whitespace-pre-line">
                    {item.notes}
                  </p>
                )}

                {showInternalNotes && (item.location || item.internalNotes) && (
                  <div className="mt-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 leading-relaxed">
                    <span className="font-semibold tracking-wide uppercase text-[9px] text-amber-600 block mb-0.5">Internal</span>
                    {item.location && <span className="block">{item.location}</span>}
                    {item.internalNotes && <span className="block mt-0.5">{item.internalNotes}</span>}
                  </div>
                )}
              </div>
            </div>
          )
        })
      })}
    </div>
  )
}
