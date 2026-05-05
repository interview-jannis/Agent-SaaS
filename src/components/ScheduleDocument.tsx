// Editorial Option A schedule renderer — used by the customer-facing
// /schedule/[slug] page (and admin preview). Mirrors the mockup decision
// from 2026-05-05: serif Day 01/02/03 headers, Morning / Afternoon / Evening
// blocks, generous whitespace, no rigid time grid.
//
// Data source: schedules.items (JSONB).

import {
  type ScheduleItem,
  SCHEDULE_BLOCKS,
  SCHEDULE_BLOCK_LABEL,
  compareScheduleItems,
  dateForDay,
  formatDayHeader,
  groupDayByBlock,
} from '@/types/schedule'

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
}

function formatRange(start: string | null, end: string | null): string {
  if (!start || !end) return ''
  const s = new Date(start)
  const e = new Date(end)
  if (!isFinite(s.getTime()) || !isFinite(e.getTime())) return ''
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${sStr} – ${eStr}`
}

function nightsBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (!isFinite(s) || !isFinite(e) || e <= s) return 0
  return Math.round((e - s) / 86400000)
}

export default function ScheduleDocument(props: Props) {
  const {
    items, caseNumber, leadName, travelStartDate, travelEndDate,
    hotelName, agentName, agentPhone, version, createdAt,
  } = props

  const sorted = [...items].sort(compareScheduleItems)
  const daysWithItems = Array.from(new Set(sorted.map(i => i.day))).sort((a, b) => a - b)
  const nights = nightsBetween(travelStartDate, travelEndDate)
  const tripDays = nights + 1
  // If items reference days beyond travel range, show those too.
  const allDays = Array.from(new Set([
    ...Array.from({ length: Math.max(tripDays, 1) }, (_, i) => i + 1),
    ...daysWithItems,
  ])).sort((a, b) => a - b)

  const versionLabel = `v${version}`
  const createdLabel = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="bg-white text-gray-900 min-h-screen print:min-h-0">
      <style>{`
        @page { size: A4; margin: 18mm; }
        .schedule-serif { font-family: 'Cormorant Garamond', 'Noto Serif KR', Georgia, serif; }
      `}</style>

      <article className="max-w-4xl mx-auto bg-white">
        {/* Cover */}
        <header className="px-6 sm:px-12 lg:px-16 pt-12 sm:pt-16 pb-10 sm:pb-12 border-b border-gray-200">
          <p className="text-[10px] tracking-[0.3em] text-gray-500 uppercase">Tiktak · Personal Itinerary</p>
          <h1 className="schedule-serif text-3xl sm:text-4xl lg:text-5xl text-gray-900 mt-3 sm:mt-4 leading-tight">
            {leadName || 'Guest'}
          </h1>
          {caseNumber && (
            <p className="text-xs text-gray-400 mt-1">{caseNumber}</p>
          )}
          {(travelStartDate || travelEndDate) && (
            <p className="schedule-serif text-lg sm:text-xl lg:text-2xl text-gray-500 mt-2 italic">
              {formatRange(travelStartDate, travelEndDate)}
              {nights > 0 && <span className="text-gray-400 not-italic text-base ml-2">· {nights} {nights === 1 ? 'night' : 'nights'}</span>}
            </p>
          )}

          <div className="mt-6 sm:mt-8 flex flex-wrap gap-x-10 gap-y-4 text-sm">
            {travelStartDate && (
              <div>
                <p className="text-[10px] tracking-widest text-gray-400 uppercase">Arrival</p>
                <p className="text-gray-900 mt-1">
                  {new Date(travelStartDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
            )}
            {travelEndDate && (
              <div>
                <p className="text-[10px] tracking-widest text-gray-400 uppercase">Departure</p>
                <p className="text-gray-900 mt-1">
                  {new Date(travelEndDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
            )}
            {hotelName && (
              <div>
                <p className="text-[10px] tracking-widest text-gray-400 uppercase">Stay</p>
                <p className="text-gray-900 mt-1">{hotelName}</p>
              </div>
            )}
          </div>
        </header>

        {/* Day sections */}
        {allDays.length === 0 ? (
          <div className="px-6 sm:px-12 lg:px-16 py-16 text-center">
            <p className="text-sm text-gray-400">Your itinerary will appear here.</p>
          </div>
        ) : (
          allDays.map((day, idx) => {
            const dayItems = sorted.filter(i => i.day === day)
            const byBlock = groupDayByBlock(dayItems)
            const dateObj = dateForDay(travelStartDate, day)
            const isLast = idx === allDays.length - 1
            return (
              <section
                key={day}
                className={`px-6 sm:px-12 lg:px-16 py-10 sm:py-14 ${isLast ? '' : 'border-b border-gray-200'} print:break-inside-avoid`}
              >
                <div className="flex items-baseline gap-4 sm:gap-6 mb-8 sm:mb-10">
                  <p className="schedule-serif text-5xl sm:text-6xl lg:text-7xl text-gray-900 leading-none tabular-nums">
                    {String(day).padStart(2, '0')}
                  </p>
                  <div>
                    <p className="schedule-serif text-xl sm:text-2xl text-gray-900">
                      {dateObj ? formatDayHeader(dateObj) : `Day ${day}`}
                    </p>
                  </div>
                </div>

                {dayItems.length === 0 ? (
                  <p className="text-sm text-gray-400 italic pl-2">At leisure</p>
                ) : (
                  <div className="space-y-8 sm:space-y-10 pl-1 sm:pl-2">
                    {SCHEDULE_BLOCKS.map(block => {
                      const blockItems = byBlock.get(block) ?? []
                      if (blockItems.length === 0) return null
                      return blockItems.map((item, itemIdx) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 sm:gap-8"
                        >
                          {/* Block / time label — only on the first item of each block */}
                          {itemIdx === 0 ? (
                            <p className="text-[11px] tracking-[0.25em] text-gray-400 uppercase pt-1 sm:pt-2">
                              {item.time ? `${item.time} · ${SCHEDULE_BLOCK_LABEL[block]}` : SCHEDULE_BLOCK_LABEL[block]}
                            </p>
                          ) : item.time ? (
                            <p className="text-[11px] text-gray-400 pt-1 sm:pt-2 tabular-nums">{item.time}</p>
                          ) : (
                            <p className="text-[11px] text-gray-300 pt-1 sm:pt-2">·</p>
                          )}
                          <div>
                            <p className="schedule-serif text-lg sm:text-xl text-gray-900 leading-snug">
                              {item.title || '—'}
                            </p>
                            {(item.location || item.notes) && (
                              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed whitespace-pre-line">
                                {item.location}
                                {item.location && item.notes && <br />}
                                {item.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    })}
                  </div>
                )}
              </section>
            )
          })
        )}

        {/* Footer */}
        <footer className="px-6 sm:px-12 lg:px-16 py-6 sm:py-8 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
            <div>
              <p className="text-[10px] tracking-widest text-gray-400 uppercase">Concierge</p>
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
