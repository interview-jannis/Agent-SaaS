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
  blockFromTime,
  compareScheduleItems,
  dateForDay,
  formatDayHeader,
  resolveGroupIds,
} from '@/types/schedule'

const TRANSPORT_MODE_LABEL: Record<string, string> = {
  car:     'Private car',
  shuttle: 'Shuttle',
  taxi:    'Taxi',
  bus:     'Bus',
  walk:    'Walking',
}

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
  tripName?: string | null
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
  if (!time && !endTime) return null
  if (!time) return `→ ${endTime}`
  if (endTime) return `${time} – ${endTime}`
  return time
}

export default function ScheduleDocument({
  items, caseNumber, tripName, leadName, travelStartDate, travelEndDate,
  hotelName, concierge_name, concierge_phone,
  version, createdAt,
  showInternalNotes = false,
  initialGroupId,
  outboundFlight, inboundFlight, groups = [],
}: Props) {
  // null = "All groups" tab
  const [activeGroupId, setActiveGroupId] = useState<string | null>(initialGroupId ?? null)
  const [isMobile, setIsMobile] = useState(false)
  // Viewer mode toggle — only available when opened with ?internal=1 (admin link).
  // 'admin' shows internal notes/details; 'client' simulates what agent/client sees.
  const [viewerMode, setViewerMode] = useState<'admin' | 'client'>('admin')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 600)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // On mobile, "All" column view isn't usable — auto-select first group
  useEffect(() => {
    if (isMobile && activeGroupId === null && groups.length > 0) {
      setActiveGroupId(groups[0].id)
    }
  }, [isMobile]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const showTabs = true   // always show — ALL tab at minimum, group tabs when available
  const isAllView = activeGroupId === null && isMultiGroup
  // When admin opens with ?internal=1, they can toggle between admin view and client view.
  // effectiveShowInternal drives all internal-note rendering downstream.
  const effectiveShowInternal = showInternalNotes && viewerMode === 'admin'

  // Filter items by active tab: null = all, group id = that group + shared items
  const filtered = activeGroupId
    ? items.filter(it => {
        const gids = resolveGroupIds(it)
        return gids === null || gids.includes(activeGroupId)
      })
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
          .sch-all-tab      { display: none !important; }
          .sch-col-grid     { display: block !important; }
          .sch-col-grid > * { margin-bottom: 24px; }
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
          .sch-flights-grid { gap: 14px !important; }
          .sch-flight-detail { line-height: 1.5 !important; }
        }
      `}</style>

      {/* ── Sticky tab header (screen only) ── */}
      <div className="sch-tabs sch-no-print" style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#e8e4de',
        padding: '10px 24px',
        display: 'flex', flexDirection: 'column', gap: '6px',
      }}>
        {/* When internal=1: two labeled rows (Admin / Agent), clicking sets both viewerMode + group */}
        {showInternalNotes ? (
          <>
            {(['admin', 'client'] as const).map(mode => {
              const isActiveRow = viewerMode === mode
              const rowLabel = mode === 'admin' ? 'Admin' : 'Agent'
              return (
                <div key={mode} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '10px', fontWeight: 600,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: isActiveRow ? '#0f4c35' : '#aaa',
                    minWidth: '46px',
                  }}>
                    {rowLabel}:
                  </span>
                  {/* ALL tab */}
                  <button
                    className="sch-all-tab"
                    onClick={() => { setViewerMode(mode); setActiveGroupId(null) }}
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '11px', fontWeight: 600,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      padding: '5px 14px', borderRadius: '4px', border: '1px solid',
                      cursor: 'pointer', transition: 'all 0.15s',
                      background: isActiveRow && activeGroupId === null ? '#1a1a1a' : '#fff',
                      color:      isActiveRow && activeGroupId === null ? '#fff'    : '#888',
                      borderColor: isActiveRow && activeGroupId === null ? '#1a1a1a' : '#ddd',
                    }}
                  >
                    All
                  </button>
                  {/* Group tabs */}
                  {groups.map((g, gi) => {
                    const col = GROUP_COLORS[gi % GROUP_COLORS.length]
                    const isActive = isActiveRow && activeGroupId === g.id
                    return (
                      <button key={g.id} onClick={() => { setViewerMode(mode); setActiveGroupId(g.id) }} style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '11px', fontWeight: 600,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        padding: '5px 14px', borderRadius: '4px', border: '1px solid',
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
              )
            })}
          </>
        ) : (
          /* No internal flag: just a plain group filter row */
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="sch-all-tab"
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
      </div>

      <div className="sch-outer" style={{ maxWidth: isAllView ? '1200px' : '720px', margin: '0 auto', padding: showTabs ? '16px 24px 48px' : '32px 24px 48px' }}>

        {/* ── Cover page ── */}
        <div className="sch-page" style={{ background: '#fff', marginBottom: '28px' }}>
          <div className="sch-cover-inner" style={{ padding: '60px 64px 52px' }}>
            <p className="sch-sans" style={{ fontSize: '10px', letterSpacing: '0.32em', color: '#b0a898', textTransform: 'uppercase', marginBottom: '20px' }}>
              TikkTakk · Personal Itinerary
            </p>
            <h1 className="sch-serif sch-cover-title" style={{ fontSize: '56px', fontWeight: 400, lineHeight: 1.05, color: '#1a1a1a' }}>
              {tripName || leadName || 'Travel Itinerary'}
            </h1>
            {leadName && (
              <p className="sch-sans" style={{ fontSize: '13px', color: '#9a9088', marginTop: '8px', letterSpacing: '0.04em' }}>{leadName}</p>
            )}
            {caseNumber && (
              <p className="sch-sans" style={{ fontSize: '11px', color: '#c0b8ae', marginTop: '4px', letterSpacing: '0.06em' }}>{caseNumber}</p>
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
            const dayItemsRaw = sorted.filter(i => i.day === day)
            const dayItems    = splitAroundPrayers(dayItemsRaw)
            const dateObj     = dateForDay(travelStartDate, day)

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

                  {/* All-view: shared and group items interleaved by time */}
                  {isAllView ? (() => {
                    const sharedRaw = sorted.filter(i => i.day === day && resolveGroupIds(i) === null)
                    const sharedItems = splitAroundPrayers(sharedRaw)

                    const groupItemsMap: Record<string, ScheduleItem[]> = {}
                    for (const g of groups) {
                      const gRaw = sorted.filter(i => {
                        if (i.day !== day) return false
                        const gids = resolveGroupIds(i)
                        return gids !== null && gids.includes(g.id)
                      })
                      groupItemsMap[g.id] = splitGroupItemsAroundShared(gRaw, sharedItems)
                    }

                    const sections = buildInterleavedSections(sharedItems, groupItemsMap, groups)

                    if (sections.length === 0) {
                      return <p className="sch-sans" style={{ fontSize: '13px', color: '#bbb', fontStyle: 'italic' }}>At leisure</p>
                    }

                    return (
                      <>
                        {sections.map((section, si) => {
                          if (section.type === 'shared') {
                            return (
                              <div key={si} style={{ marginBottom: '20px' }}>
                                <DayBlocks
                                  dayItems={section.items}
                                  showInternalNotes={effectiveShowInternal}
                                  isMultiGroup={false}
                                  groupColorById={groupColorById}
                                  groupNameById={groupNameById}
                                />
                              </div>
                            )
                          }

                          const hasAnyItems = groups.some(g => (section.groupItems[g.id] ?? []).length > 0)
                          if (!hasAnyItems) return null

                          return (
                            <div key={si} style={{ marginBottom: '20px' }}>
                              <div className="sch-col-grid" style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))`,
                                gap: '24px',
                                alignItems: 'start',
                              }}>
                                {groups.map((g, gi) => {
                                  const col = GROUP_COLORS[gi % GROUP_COLORS.length]
                                  const colItems = section.groupItems[g.id] ?? []
                                  return (
                                    <div key={g.id} style={{ minWidth: 0 }}>
                                      <div style={{ borderBottom: `2px solid ${col.accent}`, paddingBottom: '8px', marginBottom: '16px' }}>
                                        <span className="sch-sans" style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: col.text }}>
                                          {g.name}
                                        </span>
                                        {g.members.length > 0 && (
                                          <span className="sch-sans" style={{ fontSize: '10px', color: '#9a9088', marginLeft: '8px' }}>
                                            {g.members.join(' · ')}
                                          </span>
                                        )}
                                      </div>
                                      {colItems.length === 0 ? (
                                        <p className="sch-sans" style={{ fontSize: '12px', color: '#bbb', fontStyle: 'italic' }}>—</p>
                                      ) : (
                                        <DayBlocks
                                          dayItems={colItems}
                                          showInternalNotes={effectiveShowInternal}
                                          isMultiGroup={false}
                                          groupColorById={groupColorById}
                                          groupNameById={groupNameById}
                                        />
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )
                  })() : dayItems.length === 0 ? (
                    <p className="sch-sans" style={{ fontSize: '13px', color: '#bbb', fontStyle: 'italic' }}>At leisure</p>
                  ) : (
                    <DayBlocks
                      dayItems={dayItems}
                      showInternalNotes={effectiveShowInternal}
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

// ── Compute endBlock for a time segment ──────────────────────────────────────
function segEndBlock(segStart: string, segEnd: string): ScheduleItemBlock | null {
  const s = blockFromTime(segStart, 'start')
  const e = blockFromTime(segEnd, 'end')
  return e !== s ? e : null
}

// ── Split shared items around internal prayer items (render-time only) ────────
// Non-prayer shared items with time+endTime are split whenever a prayer's
// start time falls within them.
function splitAroundPrayers(dayItems: ScheduleItem[]): ScheduleItem[] {
  const prayerItems = dayItems.filter(it => it.isPrayer && it.time)
  if (prayerItems.length === 0) return dayItems

  const result: ScheduleItem[] = []

  for (const item of dayItems) {
    if (item.isPrayer || !item.time || !item.endTime) {
      result.push(item)
      continue
    }

    const intersecting = prayerItems
      .filter(p => p.time! > item.time! && p.time! < item.endTime!)
      .sort((a, b) => a.time!.localeCompare(b.time!))

    if (intersecting.length === 0) {
      result.push(item)
      continue
    }

    let segStart = item.time
    let segIdx = 0

    for (const prayer of intersecting) {
      if (segStart < prayer.time!) {
        result.push({
          ...item,
          id: `${item.id}-seg-${segIdx}`,
          time: segStart,
          endTime: prayer.time,
          block: blockFromTime(segStart),
          endBlock: segEndBlock(segStart, prayer.time!),
        })
        segIdx++
      }
      segStart = prayer.endTime ?? prayer.time!
    }

    if (segStart < item.endTime!) {
      result.push({
        ...item,
        id: `${item.id}-seg-${segIdx}`,
        time: segStart,
        endTime: item.endTime,
        block: blockFromTime(segStart),
        endBlock: segEndBlock(segStart, item.endTime!),
      })
    }
  }

  return result.sort(compareScheduleItems)
}

// ── Split group items around shared items (cross-source, render-time only) ────
// Group items with time+endTime are split at each shared item's time boundary,
// so that shared (All Groups) items can be interleaved at their correct position.
// Only applies when the same person's schedule overlaps (shared item falls inside
// a group item's time range).
function splitGroupItemsAroundShared(
  groupItems: ScheduleItem[],
  sharedItems: ScheduleItem[],
): ScheduleItem[] {
  const splitPoints = sharedItems.filter(it => it.time)
  if (splitPoints.length === 0) return groupItems

  const result: ScheduleItem[] = []

  for (const item of groupItems) {
    if (!item.time || !item.endTime) {
      result.push(item)
      continue
    }

    const intersecting = splitPoints
      .filter(p => p.time! > item.time! && p.time! < item.endTime!)
      .sort((a, b) => a.time!.localeCompare(b.time!))

    if (intersecting.length === 0) {
      result.push(item)
      continue
    }

    let segStart = item.time
    let segIdx = 0

    for (const sp of intersecting) {
      if (segStart < sp.time!) {
        result.push({
          ...item,
          id: `${item.id}-gseg-${segIdx}`,
          time: segStart,
          endTime: sp.time,
          block: blockFromTime(segStart),
          endBlock: segEndBlock(segStart, sp.time!),
        })
        segIdx++
      }
      segStart = sp.endTime ?? sp.time!
    }

    if (segStart < item.endTime!) {
      result.push({
        ...item,
        id: `${item.id}-gseg-${segIdx}`,
        time: segStart,
        endTime: item.endTime,
        block: blockFromTime(segStart),
        endBlock: segEndBlock(segStart, item.endTime!),
      })
    }
  }

  return result.sort(compareScheduleItems)
}

// ── Interleaved section builder ───────────────────────────────────────────────
// Merges shared (full-width) and per-group items into time-ordered sections.
// Consecutive shared items → one SharedSection (rendered full-width).
// Consecutive group items  → one ColumnsSection (rendered as column grid).
type InterleaveSection =
  | { type: 'shared'; items: ScheduleItem[] }
  | { type: 'columns'; groupItems: Record<string, ScheduleItem[]> }

function buildInterleavedSections(
  sharedItems: ScheduleItem[],
  groupItemsMap: Record<string, ScheduleItem[]>,
  groups: GroupData[],
): InterleaveSection[] {
  type Tagged = { item: ScheduleItem; source: 'shared' | 'group'; groupId?: string }
  const tagged: Tagged[] = []

  for (const item of sharedItems) tagged.push({ item, source: 'shared' })
  for (const g of groups) {
    for (const item of (groupItemsMap[g.id] ?? [])) {
      tagged.push({ item, source: 'group', groupId: g.id })
    }
  }

  tagged.sort((a, b) => compareScheduleItems(a.item, b.item))

  const sections: InterleaveSection[] = []

  for (const t of tagged) {
    const last = sections[sections.length - 1]

    if (t.source === 'shared') {
      if (last?.type === 'shared') {
        last.items.push(t.item)
      } else {
        sections.push({ type: 'shared', items: [t.item] })
      }
    } else {
      if (last?.type === 'columns') {
        if (!last.groupItems[t.groupId!]) last.groupItems[t.groupId!] = []
        last.groupItems[t.groupId!].push(t.item)
      } else {
        const groupItems: Record<string, ScheduleItem[]> = {}
        for (const g of groups) groupItems[g.id] = []
        groupItems[t.groupId!] = [t.item]
        sections.push({ type: 'columns', groupItems })
      }
    }
  }

  return sections
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
  const itemGroupIds = resolveGroupIds(item)
  const firstGroupId = itemGroupIds?.[0] ?? null
  const groupCol  = firstGroupId ? groupColorById[firstGroupId] : null
  const isPrayer  = item.isPrayer === true
  const itemType  = item.itemType ?? 'appointment'
  const showStripe = isMultiGroup && itemGroupIds !== null && !!groupCol
  const hasInternalDetail = showInternalNotes && (item.address || item.partnerContact || item.driverInfo || item.location || item.internalNotes)

  // Stripe gradient (solid or top→bottom split for multi-group)
  const stripeBackground = (() => {
    if (!showStripe || !itemGroupIds) return 'transparent'
    if (itemGroupIds.length <= 1) return groupCol?.accent ?? 'transparent'
    const stops = itemGroupIds.map((gid, i) => {
      const col = groupColorById[gid] ?? GROUP_COLORS[0]
      const pct = 100 / itemGroupIds!.length
      return `${col.accent} ${i * pct}% ${(i + 1) * pct}%`
    }).join(', ')
    return `linear-gradient(to bottom, ${stops})`
  })()

  // Derived display values per type
  const transferRoute = (item.fromLocation || item.toLocation)
    ? `${item.fromLocation || '—'} → ${item.toLocation || '—'}`
    : null
  const transportLabel = item.transportMode ? TRANSPORT_MODE_LABEL[item.transportMode] : null
  const isHospitalStay = itemType === 'hotel' && item.accommodationType === 'hospital'
  const eyebrow =
    itemType === 'transfer' ? null
    : itemType === 'meal'   ? (item.restaurantName ?? item.partner ?? null)
    : itemType === 'hotel'  ? (item.partner ?? null)   // show partner as eyebrow for all accommodation
    : itemType === 'free'   ? null
    : (item.partner ?? null)

  return (
    <div style={{ display: 'flex', padding: '11px 0', alignItems: 'flex-start' }}>
      {/* Left gutter: 2px stripe + vertical group name (multi-group only) */}
      {showStripe && (
        <div style={{ width: 38, flexShrink: 0, alignSelf: 'stretch', display: 'flex', marginRight: 16, opacity: itemType === 'transfer' ? 0.3 : 1 }}>
          <div style={{ width: 2, flexShrink: 0, background: stripeBackground }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {itemGroupIds!.length === 1 ? (
              <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: groupCol!.text }}>
                {groupNameById[firstGroupId!] ?? '?'}
              </span>
            ) : (
              itemGroupIds!.map(gid => {
                const col = groupColorById[gid] ?? GROUP_COLORS[0]
                return (
                  <span key={gid} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: col.text }}>
                    {groupNameById[gid] ?? '?'}
                  </span>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Main block: time line above, content indented below */}
      <div className="sch-row" style={{ flex: 1 }}>
      {/* Time line */}
      <div className="sch-sans" style={{
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
        marginBottom: '3px',
        whiteSpace: 'nowrap',
      }}>
        <span style={{
          fontSize: '10.5px',
          fontWeight: isPrayer ? 400 : (itemType === 'transfer' ? 400 : 500),
          color: isPrayer ? '#c07830' : itemType === 'transfer' ? '#ccc' : (timeStr ? '#888' : '#ddd'),
        }}>
          {timeStr ?? '—'}
        </span>
      </div>

      {/* Content — indented */}
      <div style={{ paddingLeft: '14px', paddingTop: '0' }}>
        {/* Eyebrow — partner for appointments, restaurant for meals */}
        {eyebrow && (
          <div style={{ marginBottom: '3px' }}>
            <span className="sch-sans" style={{ fontSize: '9.5px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c0b8ae' }}>
              {eyebrow}
            </span>
          </div>
        )}

        {/* Transfer — compact logistics row, visually quieter than activities */}
        {itemType === 'transfer' ? (
          <div>
            {transferRoute && (
              <p className="sch-sans" style={{ fontSize: '13px', fontWeight: 400, color: '#ccc', letterSpacing: '0.01em', lineHeight: 1.4 }}>
                {transferRoute}
              </p>
            )}
            {transportLabel && (
              <span className="sch-sans" style={{
                fontSize: '9.5px', fontWeight: 500, color: '#ccc',
                border: '1px solid #e8e4de', borderRadius: '3px', padding: '1px 6px',
                letterSpacing: '0.04em', display: 'inline-block', marginTop: '4px',
              }}>
                {transportLabel}
              </span>
            )}
            {item.title && (
              <p className="sch-sans" style={{ fontSize: '12px', color: '#ccc', marginTop: '2px' }}>
                {item.title}
              </p>
            )}
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <p className="sch-serif sch-item-title" style={{
                fontSize: '19px', fontWeight: isPrayer ? 400 : 500, lineHeight: 1.3,
                color: isPrayer ? '#c07830' : itemType === 'hotel' ? '#555' : '#1a1a1a',
                fontStyle: isPrayer ? 'italic' : 'normal',
              }}>
                {itemType === 'hotel'
                  ? (item.hotelCheckType === 'checkin'  ? 'Check-in'
                    : item.hotelCheckType === 'checkout' ? 'Check-out'
                    : 'Overnight Stay')   // 'stay', hospital, or unset → all same label
                  : (item.title || (itemType === 'free' ? 'At leisure' : '—'))
                }
              </p>
            </div>
            {(item.variantTag || (itemType === 'meal' && item.cuisine)) && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                {item.variantTag && (
                  <span className="sch-sans" style={{
                    fontSize: '9.5px', fontWeight: 500, color: '#aaa',
                    border: '1px solid #ddd8d2', borderRadius: '3px', padding: '1px 6px',
                    letterSpacing: '0.04em',
                  }}>
                    {item.variantTag}
                  </span>
                )}
                {itemType === 'meal' && item.cuisine && (
                  <span className="sch-sans" style={{
                    fontSize: '9.5px', fontWeight: 500, color: '#aaa',
                    border: '1px solid #ddd8d2', borderRadius: '3px', padding: '1px 6px',
                    letterSpacing: '0.04em',
                  }}>
                    {item.cuisine}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

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
