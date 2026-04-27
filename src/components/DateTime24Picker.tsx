'use client'

import { useEffect, useMemo, useState } from 'react'

type Props = {
  value: string
  onChange: (v: string) => void
  className?: string
  minDate?: string
  maxDate?: string
}

function parse(v: string): { date: string; hour: string; minute: string } {
  if (!v) return { date: '', hour: '', minute: '' }
  const [date = '', time = ''] = v.split('T')
  const [hour = '', minute = ''] = time.split(':')
  return { date, hour, minute }
}

function compose(date: string, hour: string, minute: string): string {
  if (!date || hour === '' || minute === '') return ''
  return `${date}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
}

export default function DateTime24Picker({ value, onChange, className = '', minDate, maxDate }: Props) {
  const parsed = parse(value)
  const [date, setDate] = useState(parsed.date)
  const [hour, setHour] = useState(parsed.hour)
  const [minute, setMinute] = useState(parsed.minute)

  // Re-sync when parent value changes externally (e.g. cancel, refetch)
  useEffect(() => {
    const p = parse(value)
    setDate(p.date)
    setHour(p.hour)
    setMinute(p.minute)
  }, [value])

  function update(nd: string, nh: string, nm: string) {
    setDate(nd); setHour(nh); setMinute(nm)
    onChange(compose(nd, nh, nm))
  }

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), [])
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')), [])

  const base = 'border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0f4c35] bg-white text-gray-900'

  return (
    <div className={`flex gap-1 ${className}`}>
      <input
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={e => update(e.target.value, hour, minute)}
        className={`${base} flex-1 min-w-0`}
      />
      <select
        value={hour}
        onChange={e => update(date, e.target.value, minute)}
        className={`${base} w-14`}
      >
        <option value="">HH</option>
        {hours.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <select
        value={minute}
        onChange={e => update(date, hour, e.target.value)}
        className={`${base} w-14`}
      >
        <option value="">MM</option>
        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  )
}
