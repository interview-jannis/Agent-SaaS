'use client'

import { useState } from 'react'

export type SparklineCardProps = {
  label: string
  color: string
  kind: 'money' | 'count'
  value: number
  prev: number
  values: number[]
  labels: string[]
  /** Override formatter for `kind: 'money'` (default: $1,234) */
  fmtMoney?: (n: number) => string
  /** Override formatter for the small "peak" badge (default: short, e.g. $12K) */
  fmtMoneyShort?: (n: number) => string
}

const defaultFmtMoney = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const defaultFmtMoneyShort = (n: number): string => {
  if (n === 0) return '$0'
  if (n >= 1_000_000) {
    const v = n / 1_000_000
    return `$${v.toFixed(v < 10 ? 1 : 0).replace(/\.0$/, '')}M`
  }
  if (n >= 1000) {
    const v = n / 1000
    return `$${v.toFixed(v < 10 ? 1 : 0).replace(/\.0$/, '')}K`
  }
  return `$${Math.round(n)}`
}

export default function SparklineCard({
  label,
  color,
  kind,
  value,
  prev,
  values,
  labels,
  fmtMoney = defaultFmtMoney,
  fmtMoneyShort = defaultFmtMoneyShort,
}: SparklineCardProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const delta = prev > 0 ? ((value - prev) / prev) * 100 : value > 0 ? 100 : 0
  const formatVal = (v: number) => (kind === 'money' ? fmtMoney(v) : v.toString())
  const formatPeak = kind === 'money' ? fmtMoneyShort(max) : max.toString()
  const hover = hoverIdx !== null ? { v: values[hoverIdx], l: labels[hoverIdx] } : null

  return (
    <div className="bg-gray-50 rounded-xl p-4 relative">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-[10px] text-gray-400 tabular-nums">peak {formatPeak}</p>
      </div>

      <p className="text-2xl font-bold tracking-tight tabular-nums" style={{ color }}>
        {hover !== null ? formatVal(hover.v) : formatVal(value)}
      </p>

      <div className="flex items-baseline justify-between mt-1 mb-2 h-4">
        <p className="text-[10px] text-gray-400">{hover !== null ? hover.l : 'this month'}</p>
        {hover === null && (
          <p className={`text-[10px] tabular-nums ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
          </p>
        )}
      </div>

      <div className="relative h-10">
        <svg viewBox="0 0 100 30" className="w-full h-full overflow-visible" preserveAspectRatio="none">
          <line x1="0" y1="29" x2="100" y2="29" stroke="#e5e7eb" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polygon
            fill={color}
            opacity="0.08"
            points={`0,30 ${values.map((v, i) => {
              const x = (i / (values.length - 1)) * 100
              const y = 30 - ((v - min) / (max - min || 1)) * 28
              return `${x},${y}`
            }).join(' ')} 100,30`}
          />
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            points={values.map((v, i) => {
              const x = (i / (values.length - 1)) * 100
              const y = 30 - ((v - min) / (max - min || 1)) * 28
              return `${x},${y}`
            }).join(' ')}
          />
        </svg>

        {values.map((v, i) => {
          const left = (i / (values.length - 1)) * 100
          const bottom = ((v - min) / (max - min || 1)) * 90 + 3
          const isLast = i === values.length - 1
          const isHov = hoverIdx === i
          return (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={{ left: `${left}%`, bottom: `${bottom}%`, transform: 'translate(-50%, 50%)' }}
            >
              <div
                className={`rounded-full border-2 border-white transition-all ${isHov ? 'w-3 h-3' : isLast ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'}`}
                style={{ background: color, opacity: isHov || isLast ? 1 : 0.5 }}
              />
            </div>
          )
        })}

        <div className="absolute inset-0 flex">
          {values.map((_, i) => (
            <div
              key={i}
              className="flex-1 cursor-pointer"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          ))}
        </div>
      </div>

      <div className="flex mt-1">
        {labels.map((l, i) => (
          <p
            key={i}
            className={`flex-1 text-center text-[9px] ${i === labels.length - 1 ? 'font-semibold' : 'text-gray-400'}`}
            style={i === labels.length - 1 ? { color } : undefined}
          >
            {l}
          </p>
        ))}
      </div>
    </div>
  )
}
