'use client'

import { useEffect, useRef, useState } from 'react'

// 24-hour time input that doesn't depend on browser locale and doesn't use
// dropdowns. Two narrow number inputs (HH / MM): user can type, use the
// number spinner, or arrow keys. No dropdown means no scroll-bleed issue
// when the popup overflows; no <select> means no AM/PM display in en-US
// locale. Stored value is canonical "HH:MM" 24h or null when blank.
//
// On blur, the inputs are clamped (h ∈ [0,23], m ∈ [0,59]) and zero-padded
// to two digits. Free-form intermediate states (e.g., user typed "1") stay
// visible while focused so backspacing feels natural.

type Props = {
  value: string | null
  onChange: (v: string | null) => void
  className?: string
  disabled?: boolean
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export default function Time24Input({
  value, onChange, className = '', disabled = false,
}: Props) {
  const initial = (value ?? '').split(':')
  const [hRaw, setHRaw] = useState<string>(initial[0] ?? '')
  const [mRaw, setMRaw] = useState<string>(initial[1] ?? '')
  const hRef = useRef<HTMLInputElement | null>(null)
  const mRef = useRef<HTMLInputElement | null>(null)

  // Re-sync when parent value changes externally.
  useEffect(() => {
    const [h, m] = (value ?? '').split(':')
    setHRaw(h ?? '')
    setMRaw(m ?? '')
  }, [value])

  function emit(nextH: string, nextM: string) {
    if (nextH === '' || nextM === '') {
      onChange(null)
      return
    }
    onChange(`${nextH}:${nextM}`)
  }

  function commit(field: 'h' | 'm', raw: string) {
    if (raw === '') {
      if (field === 'h') { setHRaw(''); emit('', mRaw) }
      else { setMRaw(''); emit(hRaw, '') }
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const max = field === 'h' ? 23 : 59
    const clamped = Math.max(0, Math.min(max, Math.trunc(n)))
    const padded = pad2(clamped)
    if (field === 'h') {
      setHRaw(padded)
      if (mRaw !== '') {
        emit(padded, mRaw)
      } else {
        // MM is still empty — advance focus so user fills it naturally
        mRef.current?.focus()
        mRef.current?.select()
      }
    } else {
      setMRaw(padded)
      emit(hRaw || '00', padded)
    }
  }

  const base = 'border border-gray-200 rounded-lg text-xs bg-white text-gray-900 focus:outline-none focus:border-[#0f4c35] disabled:bg-gray-50 tabular-nums text-center'

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <input
        ref={hRef}
        type="number"
        inputMode="numeric"
        min={0}
        max={23}
        disabled={disabled}
        value={hRaw}
        placeholder="HH"
        aria-label="Hour"
        onChange={e => {
          // Strip non-digits, allow empty, cap to 2 chars while typing.
          const v = e.target.value.replace(/\D/g, '').slice(0, 2)
          setHRaw(v)
          // Only emit if both fields have valid values; otherwise let blur commit.
          if (v.length === 2 && mRaw.length === 2) emit(v, mRaw)
        }}
        onBlur={e => commit('h', e.target.value)}
        className={`${base} w-10 px-1 py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
      <span className="text-xs text-gray-400">:</span>
      <input
        ref={mRef}
        type="number"
        inputMode="numeric"
        min={0}
        max={59}
        disabled={disabled}
        value={mRaw}
        placeholder="MM"
        aria-label="Minute"
        onChange={e => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 2)
          setMRaw(v)
          if (hRaw.length === 2 && v.length === 2) emit(hRaw, v)
        }}
        onBlur={e => commit('m', e.target.value)}
        className={`${base} w-10 px-1 py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
    </span>
  )
}
