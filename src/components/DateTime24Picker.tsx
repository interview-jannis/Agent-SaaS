'use client'

import { useEffect, useState } from 'react'
import Time24Input from './Time24Input'

type Props = {
  value: string
  onChange: (v: string) => void
  className?: string
  highlight?: boolean
  minDate?: string
  maxDate?: string
}

function parse(v: string): { date: string; time: string } {
  if (!v) return { date: '', time: '' }
  const [date = '', time = ''] = v.split('T')
  const hhmm = time.length >= 5 ? time.slice(0, 5) : time
  return { date, time: hhmm }
}

function compose(date: string, time: string): string {
  if (!date || !time) return ''
  return `${date}T${time}`
}

export default function DateTime24Picker({ value, onChange, className = '', highlight = false, minDate, maxDate }: Props) {
  const parsed = parse(value)
  const [date, setDate] = useState(parsed.date)
  const [time, setTime] = useState(parsed.time)

  useEffect(() => {
    const p = parse(value)
    setDate(p.date)
    setTime(p.time)
  }, [value])

  function update(nd: string, nt: string) {
    setDate(nd); setTime(nt)
    onChange(compose(nd, nt))
  }

  const borderClass = highlight ? 'border-red-200' : 'border-gray-200'
  const base = `border ${borderClass} rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0f4c35] bg-white text-gray-900`

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <input
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={e => update(e.target.value, time)}
        className={`${base} flex-1 min-w-0`}
      />
      <Time24Input
        value={time || null}
        onChange={(v) => update(date, v ?? '')}
        highlight={highlight}
      />
    </div>
  )
}
