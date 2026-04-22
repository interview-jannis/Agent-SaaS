'use client'

import { useMemo, useState, useEffect } from 'react'

// Year / Month / Day dropdowns — easier than native date input for DOB (avoids scrolling through decades).
// Value is a YYYY-MM-DD string (or empty).
export default function DOBPicker({
  value,
  onChange,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const thisYear = new Date().getFullYear()
  const years = useMemo(() => Array.from({ length: 100 }, (_, i) => thisYear - i), [thisYear])
  const months = [
    { v: 1, l: 'Jan' }, { v: 2, l: 'Feb' }, { v: 3, l: 'Mar' }, { v: 4, l: 'Apr' },
    { v: 5, l: 'May' }, { v: 6, l: 'Jun' }, { v: 7, l: 'Jul' }, { v: 8, l: 'Aug' },
    { v: 9, l: 'Sep' }, { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dec' },
  ]

  // Local state preserves partial picks (e.g. user picked year but not month/day yet).
  // Parent only receives a value once all three are set.
  const [y, setY] = useState<number | ''>('')
  const [m, setM] = useState<number | ''>('')
  const [d, setD] = useState<number | ''>('')

  // Sync from incoming value (e.g. loaded from DB, or reset)
  useEffect(() => {
    if (!value) {
      // Only blank out if the parent explicitly cleared — but preserve partial local picks
      // when value was never set. Heuristic: if all three already chosen, user likely committed
      // and external clear is intentional.
      return
    }
    const [ys, ms, ds] = value.split('-')
    const ny = Number(ys) || 0
    const nm = Number(ms) || 0
    const nd = Number(ds) || 0
    if (ny) setY(ny)
    if (nm) setM(nm)
    if (nd) setD(nd)
  }, [value])

  const daysInMonth = y && m ? new Date(Number(y), Number(m), 0).getDate() : 31
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  function update(ny: number | '', nm: number | '', nd: number | '') {
    let clampedD = nd
    if (ny && nm && nd) {
      const maxD = new Date(Number(ny), Number(nm), 0).getDate()
      if (Number(nd) > maxD) clampedD = maxD
    }
    setY(ny)
    setM(nm)
    setD(clampedD)
    if (ny && nm && clampedD) {
      onChange(`${ny}-${String(nm).padStart(2, '0')}-${String(clampedD).padStart(2, '0')}`)
    } else {
      onChange('')
    }
  }

  const selectCls = 'border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white text-gray-900'

  return (
    <div className={`flex gap-2 ${className}`}>
      <select value={y === '' ? '' : y} onChange={e => update(e.target.value ? Number(e.target.value) : '', m, d)} className={`${selectCls} flex-1`}>
        <option value="">Year</option>
        {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
      </select>
      <select value={m === '' ? '' : m} onChange={e => update(y, e.target.value ? Number(e.target.value) : '', d)} className={`${selectCls} flex-1`}>
        <option value="">Month</option>
        {months.map(mo => <option key={mo.v} value={mo.v}>{mo.l}</option>)}
      </select>
      <select value={d === '' ? '' : d} onChange={e => update(y, m, e.target.value ? Number(e.target.value) : '')} className={`${selectCls} flex-1`}>
        <option value="">Day</option>
        {days.map(dn => <option key={dn} value={dn}>{dn}</option>)}
      </select>
    </div>
  )
}
