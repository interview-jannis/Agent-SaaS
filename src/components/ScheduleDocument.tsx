'use client'

// Customer-facing schedule renderer — /schedule/[slug]
// Layout: block-as-section headers, 2-column time/content, group tab filter.
// Modes:
//   public  (default)        — full groups, group chips inline, no internal info
//   internal (?internal=1)   — public + address / partnerContact / driverInfo per item

import React, { useState, useEffect } from 'react'
import {
  type ScheduleItem,
  type ScheduleItemBlock,
  SCHEDULE_BLOCKS,
  SCHEDULE_BLOCK_LABEL,
  compareScheduleItems,
  dateForDay,
  formatDayHeader,
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
  concierge_name: string | null
  concierge_phone: string | null
  version: number
  createdAt: string | null
  showInternalNotes?: boolean
  initialGroupId?: string | null   // from ?group= URL param — pre-selects a tab
  outboundFlight?: FlightData
  inboundFlight?: FlightData
  groups?: GroupData[]
}

// Group tab accent colours (same palette as editor GROUP_TONES)
const GROUP_COLORS = [
  { accent: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  { accent: '#10b981', bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' },
  { accent: '#f97316', bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  { accent: '#8b5cf6', bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe' },
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

function formatTimeRange(time: string | null, endTime: string | null | undefined): string | null {
  if (!time) return null
  if (endTime) return `${time} – ${endTime}`
  return time
}

export default function ScheduleDocument({
  items, caseNumber, leadName, travelStartDate, travelEndDate,
  hotelName, concierge_name, concierge_phone,
  version, createdAt,
  showInternalNotes = false,
  initialGroupId,
  outboundFlight, inboundFlight, groups = [],
}: Props) {
  // null = "All groups" tab
  const [activeGroupId, setActiveGroupId] = useState<string | null>(initialGroupId ?? null)

  // Sync URL ?group= param when tab changes (without full navigation)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (activeGroupId) {
      url.searchParams.set('group', activeGroupId)
    } else {
      url.searchParams.delete('group')
    }
    window.history.replaceState(null, '', url.toString())
  }, [activeGroupId])

  const isMultiGroup = groups.length > 1
  const showTabs = isMultiGroup

  // Filter items by active tab: null = all, group id = that group + shared (groupId===null)
  const filtered = activeGroupId
    ? items.filter(it => !it.groupId || it.groupId === activeGroupId)
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

  const outDep = formatFlightDateTime(outboundFlight?.departure_datetime)
  const outArr = formatFlightDateTime(outboundFlight?.arrival_datetime)
  const inDep  = formatFlightDateTime(inboundFlight?.departure_datetime)
  const inArr  = formatFlightDateTime(inboundFlight?.arrival_datetime)
  const hasFlights = !!(outboundFlight?.departure_airport || inboundFlight?.departure_airport)

  // Group colour + name lookup by id
  const groupColorById: Record<string, typeof GROUP_COLORS[0]> = {}
  const groupNameById:  Record<string, string> = {}
  groups.forEach((g, i) => {
    groupColorById[g.id] = GROUP_COLORS[i % GROUP_COLORS.length]
    groupNameById[g.id]  = g.name
  })

  return (
    <div style={{ background: '#e8e4de', minHeight: '100vh', padding: '0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400;500;600&display=swap');
        @page { size: A4; margin: 16mm; }
        * { box-sizing: border-box; }
        .sch-serif { font-family: 'Cormorant Garamond', Georgia, serif; }
        .sch-sans  { font-family: 'Inter', system-ui, sans-serif; }
        @media print {
          body { background: white !important; }
          .sch-page { box-shadow: none !important; margin-bottom: 0 !important; }
          .sch-tabs { display: none !important; }
          .sch-no-print { display: none !important; }
        }
        @media (max-width: 600px) {
          .sch-outer        { padding: 0 !important; }
          .sch-page         { margin-bottom: 10px !important; }
          .sch-tabs         { padding: 14px 16px 0 !important; gap: 6px !important; }
          .sch-cover-inner  { padding: 40px 24px 32px !important; }
          .sch-day-inner    { padding: 32px 24px 24px !important; }
          .sch-footer       { padding: 14px 24px !important; }
          .sch-cover-title  { font-size: 34px !important; line-height: 1.1 !important; }
          .sch-cover-date   { font-size: 16px !important; }
          .sch-day-num      { font-size: 42px !important; min-width: 50px !important; }
          .sch-day-date     { font-size: 18px !important; }
          .sch-item-title   { font-size: 15px !important; }
          .sch-row          { grid-template-columns: 64px 1fr !important; gap: 0 10px !important; }
          .sch-flights-grid { gap: 14px !important; }
          .sch-flight-detail { line-height: 1.5 !important; }
        }
      `}</style>

      {/* ── Group tab filter (screen only) ── */}
      {showTabs && (
        <div className="sch-tabs sch-no-print" style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: '#e8e4de',
          padding: '12px 24px',
          display: 'flex', gap: '8px', flexWrap: 'wrap',
        }}>
          <button
            onClick={() => setActiveGroupId(null)}
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '11px', fontWeight: 600,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              padding: '6px 16px', borderRadius: '4px', border: '1px solid',
              cursor: 'pointer', transition: 'all 0.15s',
              background: activeGroupId === null ? '#1a1a1a' : '#fff',
              color:      activeGroupId === null ? '#fff'    : '#888',
              borderColor: activeGroupId === null ? '#1a1a1a' : '#ddd',
            }}
          >
            All
          </button>
          {groups.map((g, gi) => {
            const col = GROUP_COLORS[gi % GROUP_COLORS.length]
            const isActive = activeGroupId === g.id
            return (
              <button key={g.id} onClick={() => setActiveGroupId(g.id)} style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '11px', fontWeight: 600,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                padding: '6px 16px', borderRadius: '4px', border: '1px solid',
                cursor: 'pointer', transition: 'all 0.15s',
                background: isActive ? col.accent : '#fff',
                color:      isActive ? '#fff'     : col.text,
                borderColor: isActive ? col.accent : col.border,
              }}>
                {g.name}
              </button>
            )
          })}
        </div>
      )}

      <div className="sch-outer" style={{ maxWidth: '720px', margin: '0 auto', padding: showTabs ? '16px 24px 48px' : '32px 24px 48px' }}>

        {/* ── Cover page ── */}
        <div className="sch-page" style={{ background: '#fff', marginBottom: '28px' }}>
          <div className="sch-cover-inner" style={{ padding: '60px 64px 52px' }}>
            <p className="sch-sans" style={{ fontSize: '10px', letterSpacing: '0.32em', color: '#b0a898', textTransform: 'uppercase', marginBottom: '20px' }}>
              TikkTakk · Personal Itinerary
            </p>
            <h1 className="sch-serif sch-cover-title" style={{ fontSize: '56px', fontWeight: 400, lineHeight: 1.05, color: '#1a1a1a' }}>
              {leadName || 'Guest'}
            </h1>
            {caseNumber && (
              <p className="sch-sans" style={{ fontSize: '11px', color: '#c0b8ae', marginTop: '6px', letterSpacing: '0.06em' }}>{caseNumber}</p>
            )}
            {(travelStartDate || travelEndDate) && (
              <p className="sch-serif sch-cover-date" style={{ fontSize: '22px', color: '#9a9088', marginTop: '10px', fontStyle: 'italic' }}>
                {formatRange(travelStartDate, travelEndDate)}
                {nights > 0 && (
                  <span className="sch-sans" style={{ fontStyle: 'normal', fontSize: '13px', color: '#c0b8ae', marginLeft: '10px' }}>
                    · {nights} {nights === 1 ? 'night' : 'nights'}
                  </span>
                )}
              </p>
            )}

            {/* Groups — shown when multi-group and "All" tab active (or print) */}
            {isMultiGroup && (
              <div style={{ marginTop: '30px', paddingTop: '26px', borderTop: '1px solid #f0ece6',
                display: 'grid', gridTemplateColumns: `repeat(${Math.min(groups.length, 4)}, minmax(0,1fr))`, gap: '20px' }}>
                {groups.map((g, gi) => {
                  const col = GROUP_COLORS[gi % GROUP_COLORS.length]
                  return (
                    <div key={g.id} style={{ borderLeft: `3px solid ${col.accent}`, paddingLeft: '12px' }}>
                      <p className="sch-sans" style={{ fontSize: '10px', letterSpacing: '0.24em', textTransform: 'uppercase', fontWeight: 600, color: col.text, marginBottom: '6px' }}>
                        {g.name}
                      </p>
                      {g.members.length === 0
                        ? <p className="sch-sans" style={{ fontSize: '13px', color: '#bbb', fontStyle: 'italic' }}>—</p>
                        : g.members.map(m => (
                          <p key={m} className="sch-sans" style={{ fontSize: '13px', color: '#666', lineHeight: 1.75 }}>· {m}</p>
                        ))
                      }
                    </div>
                  )
                })}
              </div>
            )}

            {/* Flights */}
            {hasFlights && (
              <div className="sch-flights-grid" style={{ marginTop: '30px', paddingTop: '26px', borderTop: '1px solid #f0ece6',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px' }}>
                {outboundFlight?.departure_airport && (
                  <div>
                    <p className="sch-sans" style={{ fontSize: '10px', letterSpacing: '0.24em', color: '#c0b8ae', textTransform: 'uppercase', marginBottom: '6px' }}>Outbound Flight</p>
                    <p className="sch-sans" style={{ fontSize: '15px', fontWeight: 500, color: '#1a1a1a', marginBottom: '4px' }}>
                      {outboundFlight.departure_airport} → {outboundFlight.arrival_airport ?? '—'}
                      {outboundFlight.flight_number && <span style={{ fontSize: '12px', color: '#bbb', marginLeft: '8px' }}>{outboundFlight.flight_number}</span>}
                    </p>
                    {outDep && <p className="sch-sans sch-flight-detail" style={{ fontSize: '12px', color: '#999', lineHeight: 1.9 }}><b style={{ color: '#666', fontWeight: 500 }}>Dep</b>&nbsp;&nbsp;{outDep.date} · {outDep.time}</p>}
                    {outArr && <p className="sch-sans sch-flight-detail" style={{ fontSize: '12px', color: '#999', lineHeight: 1.9 }}><b style={{ color: '#666', fontWeight: 500 }}>Arr</b>&nbsp;&nbsp;&nbsp;{outArr.date} · {outArr.time}</p>}
                  </div>
                )}
                {inboundFlight?.departure_airport && (
                  <div>
                    <p className="sch-sans" style={{ fontSize: '10px', letterSpacing: '0.24em', color: '#c0b8ae', textTransform: 'uppercase', marginBottom: '6px' }}>Return Flight</p>
                    <p className="sch-sans" style={{ fontSize: '15px', fontWeight: 500, color: '#1a1a1a', marginBottom: '4px' }}>
                      {inboundFlight.departure_airport} → {inboundFlight.arrival_airport ?? '—'}
                      {inboundFlight.flight_number && <span style={{ fontSize: '12px', color: '#bbb', marginLeft: '8px' }}>{inboundFlight.flight_number}</span>}
                    </p>
                    {inDep && <p className="sch-sans sch-flight-detail" style={{ fontSize: '12px', color: '#999', lineHeight: 1.9 }}><b style={{ color: '#666', fontWeight: 500 }}>Dep</b>&nbsp;&nbsp;{inDep.date} · {inDep.time}</p>}
                    {inArr && <p className="sch-sans sch-flight-detail" style={{ fontSize: '12px', color: '#999', lineHeight: 1.9 }}><b style={{ color: '#666', fontWeight: 500 }}>Arr</b>&nbsp;&nbsp;&nbsp;{inArr.date} · {inArr.time}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Arrival / Departure / Stay */}
            <div style={{ marginTop: '30px', paddingTop: '26px', borderTop: '1px solid #f0ece6', display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
              {travelStartDate && (
                <div>
                  <p className="sch-sans" style={{ fontSize: '10px', letterSpacing: '0.24em', color: '#c0b8ae', textTransform: 'uppercase', marginBottom: '4px' }}>Arrival</p>
                  <p className="sch-sans" style={{ fontSize: '13px', color: '#1a1a1a' }}>
                    {new Date(travelStartDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              )}
              {travelEndDate && (
                <div>
                  <p className="sch-sans" style={{ fontSize: '10px', letterSpacing: '0.24em', color: '#c0b8ae', textTransform: 'uppercase', marginBottom: '4px' }}>Departure</p>
                  <p className="sch-sans" style={{ fontSize: '13px', color: '#1a1a1a' }}>
                    {new Date(travelEndDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              )}
              {hotelName && (
                <div>
                  <p className="sch-sans" style={{ fontSize: '10px', letterSpacing: '0.24em', color: '#c0b8ae', textTransform: 'uppercase', marginBottom: '4px' }}>Accommodation</p>
                  <p className="sch-sans" style={{ fontSize: '13px', color: '#1a1a1a' }}>{hotelName}</p>
                </div>
              )}
            </div>
          </div>

          <Footer concierge_name={concierge_name} concierge_phone={concierge_phone} versionLabel={versionLabel} createdLabel={createdLabel} />
        </div>

        {/* ── Day pages ── */}
        {allDays.length === 0 ? (
          <div className="sch-page" style={{ background: '#fff', padding: '48px 64px', textAlign: 'center' }}>
            <p className="sch-sans" style={{ fontSize: '13px', color: '#bbb' }}>Your itinerary will appear here.</p>
          </div>
        ) : (
          allDays.map((day, dayIdx) => {
            const dayItems = sorted.filter(i => i.day === day)
            const dateObj  = dateForDay(travelStartDate, day)

            return (
              <div key={day} className="sch-page" style={{ background: '#fff', marginBottom: dayIdx === allDays.length - 1 ? 0 : '28px' }}>
                <div className="sch-day-inner" style={{ padding: '50px 64px 44px' }}>

                  {/* Day header */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '18px', marginBottom: '36px' }}>
                    <span className="sch-serif sch-day-num" style={{ fontSize: '70px', fontWeight: 400, lineHeight: 1, color: '#1a1a1a', minWidth: '80px' }}>
                      {String(day).padStart(2, '0')}
                    </span>
                    <span className="sch-serif sch-day-date" style={{ fontSize: '26px', color: '#6a6058' }}>
                      {dateObj ? formatDayHeader(dateObj) : `Day ${day}`}
                    </span>
                  </div>

                  {/* Empty day */}
                  {dayItems.length === 0 ? (
                    <p className="sch-sans" style={{ fontSize: '13px', color: '#bbb', fontStyle: 'italic' }}>At leisure</p>
                  ) : (
                    <DayBlocks
                      dayItems={dayItems}
                      showInternalNotes={showInternalNotes}
                      isMultiGroup={isMultiGroup && !activeGroupId}
                      groupColorById={groupColorById}
                      groupNameById={groupNameById}
                    />
                  )}
                </div>
                <Footer concierge_name={concierge_name} concierge_phone={concierge_phone} versionLabel={versionLabel} createdLabel={createdLabel} />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Block sections for one day ────────────────────────────────────────────────

function DayBlocks({
  dayItems,
  showInternalNotes,
  isMultiGroup,
  groupColorById,
  groupNameById,
}: {
  dayItems: ScheduleItem[]
  showInternalNotes: boolean
  isMultiGroup: boolean
  groupColorById: Record<string, typeof GROUP_COLORS[0]>
  groupNameById: Record<string, string>
}) {
  // Group items by (block, endBlock) pair — each unique combo gets its own section header.
  // Key format: "morning" | "afternoon" | "afternoon→evening" etc.
  const sectionMap = new Map<string, ScheduleItem[]>()
  for (const item of dayItems) {
    const key = (item.endBlock && item.endBlock !== item.block)
      ? `${item.block}→${item.endBlock}`
      : item.block
    if (!sectionMap.has(key)) sectionMap.set(key, [])
    sectionMap.get(key)!.push(item)
  }

  // Sort section keys: by start block index, then no-span before span, then end block index
  const sortedKeys = Array.from(sectionMap.keys()).sort((a, b) => {
    const [aStart, aEnd] = a.split('→') as [string, string | undefined]
    const [bStart, bEnd] = b.split('→') as [string, string | undefined]
    const ai = SCHEDULE_BLOCKS.indexOf(aStart as ScheduleItemBlock)
    const bi = SCHEDULE_BLOCKS.indexOf(bStart as ScheduleItemBlock)
    if (ai !== bi) return ai - bi
    if (!aEnd && bEnd) return -1
    if (aEnd && !bEnd) return 1
    if (aEnd && bEnd) return SCHEDULE_BLOCKS.indexOf(aEnd as ScheduleItemBlock) - SCHEDULE_BLOCKS.indexOf(bEnd as ScheduleItemBlock)
    return 0
  })

  function sectionLabel(key: string): string {
    const [start, end] = key.split('→') as [string, string | undefined]
    if (end) return `${SCHEDULE_BLOCK_LABEL[start as ScheduleItemBlock]} → ${SCHEDULE_BLOCK_LABEL[end as ScheduleItemBlock]}`
    return SCHEDULE_BLOCK_LABEL[start as ScheduleItemBlock]
  }

  return (
    <>
      {sortedKeys.map(key => {
        const sectionItems = sectionMap.get(key)!
        return (
          <div key={key} style={{ marginBottom: '32px' }}>
            <p className="sch-sans" style={{
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: '#9a9088',
              paddingBottom: '9px', marginBottom: '2px',
              borderBottom: '2px solid #d8d2ca',
            }}>
              {sectionLabel(key)}
            </p>
            {sectionItems.map((item, idx) => (
              <ScheduleRow
                key={item.id}
                item={item}
                isLast={idx === sectionItems.length - 1}
                showInternalNotes={showInternalNotes}
                isMultiGroup={isMultiGroup}
                groupColorById={groupColorById}
                groupNameById={groupNameById}
              />
            ))}
          </div>
        )
      })}
    </>
  )
}

// ── Single schedule row ───────────────────────────────────────────────────────

function ScheduleRow({
  item, isLast, showInternalNotes, isMultiGroup, groupColorById, groupNameById,
}: {
  item: ScheduleItem
  isLast: boolean
  showInternalNotes: boolean
  isMultiGroup: boolean
  groupColorById: Record<string, typeof GROUP_COLORS[0]>
  groupNameById: Record<string, string>
}) {
  const timeStr   = formatTimeRange(item.time, item.endTime)
  const groupCol  = item.groupId ? groupColorById[item.groupId] : null
  const isPrayer  = item.isPrayer === true
  const showStripe = isMultiGroup && !!item.groupId && !!groupCol
  const hasEyebrow = !!item.partner
  const hasInternalDetail = showInternalNotes && (item.address || item.partnerContact || item.driverInfo || item.location || item.internalNotes)

  return (
    <div className="sch-row" style={{
      display: 'grid',
      gridTemplateColumns: '118px 1fr',
      gap: '0 20px',
      padding: '11px 0',
      paddingLeft: showStripe ? '12px' : '0',
      borderBottom: 'none',
      borderLeft: showStripe ? `2px solid ${groupCol!.accent}` : 'none',
      alignItems: 'start',
    }}>
      {/* Time column */}
      <div className="sch-sans" style={{
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
        paddingTop: '4px',
        whiteSpace: 'nowrap',
      }}>
        <span style={{
          fontSize: '11.5px',
          color: isPrayer ? '#c07830' : (timeStr ? '#b0a898' : '#ddd'),
        }}>
          {timeStr ?? '—'}
        </span>
      </div>

      {/* Content column */}
      <div style={{ paddingTop: '1px' }}>
        {hasEyebrow && (
          <div style={{ marginBottom: '3px' }}>
            <span className="sch-sans" style={{ fontSize: '9.5px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c0b8ae' }}>
              {item.partner}
            </span>
          </div>
        )}

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <p className="sch-serif sch-item-title" style={{
            fontSize: '19px', fontWeight: 400, lineHeight: 1.3,
            color: isPrayer ? '#c07830' : '#1a1a1a',
            fontStyle: isPrayer ? 'italic' : 'normal',
          }}>
            {item.title || '—'}
          </p>
          {item.variantTag && (
            <span className="sch-sans" style={{
              fontSize: '10px', color: '#999', background: '#f5f2ee',
              border: '1px solid #ede9e3', borderRadius: '20px', padding: '1px 8px',
            }}>
              {item.variantTag}
            </span>
          )}
        </div>

        {/* Public notes */}
        {item.notes && (
          <p className="sch-sans" style={{ fontSize: '12px', color: '#999', marginTop: '3px', lineHeight: 1.6 }}>
            {item.notes}
          </p>
        )}

        {/* Internal details (admin ?internal=1 mode) */}
        {hasInternalDetail && (
          <div style={{ marginTop: '6px', paddingTop: '5px', borderTop: '1px dashed #ede9e3' }}>
            {item.address && <InternalRow label="Address" value={item.address} />}
            {item.location && !item.address && <InternalRow label="Location" value={item.location} />}
            {item.partnerContact && <InternalRow label="Contact" value={item.partnerContact} />}
            {item.driverInfo && <InternalRow label="Driver" value={item.driverInfo} />}
            {item.internalNotes && <InternalRow label="Note" value={item.internalNotes} />}
          </div>
        )}
      </div>
    </div>
  )
}

function InternalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', marginTop: '3px' }}>
      <span className="sch-sans" style={{ fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8c0b8', minWidth: '58px', flexShrink: 0 }}>
        {label}
      </span>
      <span className="sch-sans" style={{ fontSize: '11.5px', color: '#aaa', lineHeight: 1.55, fontStyle: 'italic' }}>
        {value}
      </span>
    </div>
  )
}

function Footer({ concierge_name, concierge_phone, versionLabel, createdLabel }: {
  concierge_name: string | null
  concierge_phone: string | null
  versionLabel: string
  createdLabel: string
}) {
  return (
    <div className="sch-footer" style={{
      padding: '18px 64px',
      background: '#faf8f5',
      borderTop: '1px solid #ede9e3',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    }}>
      <div>
        <p className="sch-sans" style={{ fontSize: '9.5px', letterSpacing: '0.24em', color: '#c0b8ae', textTransform: 'uppercase', marginBottom: '4px' }}>Concierge</p>
        {concierge_name && <p className="sch-sans" style={{ fontSize: '13px', color: '#555' }}>{concierge_name}</p>}
        {concierge_phone && <p className="sch-sans" style={{ fontSize: '11px', color: '#bbb', marginTop: '2px' }}>{concierge_phone}</p>}
      </div>
      <p className="sch-sans" style={{ fontSize: '10px', color: '#c8c0b8' }}>
        {versionLabel}{createdLabel ? ` · prepared ${createdLabel}` : ''}
      </p>
    </div>
  )
}
