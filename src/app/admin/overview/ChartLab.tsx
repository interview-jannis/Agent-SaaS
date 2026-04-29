'use client'

import SparklineCard, { type SparklineCardProps } from '@/components/SparklineCard'

type MonthRow = {
  key: string
  label: string
  revenue: number
  earnings: number
  partner: number
  agent: number
  patients: number
  newClients: number
  activeAgents: number
}

// Unified palette — money charts use brand green, count charts use neutral gray.
// Avoids rainbow effect when many sparklines stack on one page.
const MONEY_COLOR = '#0f4c35'
const COUNT_COLOR = '#374151' // gray-700, dark enough to read against gray-50 card bg
const COLORS = {
  revenue: MONEY_COLOR,
  earnings: MONEY_COLOR,
  partner: MONEY_COLOR,
  agent: MONEY_COLOR,
  patients: COUNT_COLOR,
  newClients: COUNT_COLOR,
  activeAgents: COUNT_COLOR,
}

export default function ChartLab({
  monthly,
  exchangeRate,
}: {
  monthly: MonthRow[]
  exchangeRate: number
}) {
  const toUsd = (krw: number) => krw / exchangeRate
  const current = monthly[monthly.length - 1]
  const prev = monthly[monthly.length - 2]
  const labels = monthly.map(m => m.label)

  const moneyCards: SparklineCardProps[] = [
    { label: 'Revenue', color: COLORS.revenue, kind: 'money', value: toUsd(current.revenue), prev: toUsd(prev?.revenue ?? 0), values: monthly.map(m => toUsd(m.revenue)), labels },
    { label: 'Earnings', color: COLORS.earnings, kind: 'money', value: toUsd(current.earnings), prev: toUsd(prev?.earnings ?? 0), values: monthly.map(m => toUsd(m.earnings)), labels },
    { label: 'Partner Cost', color: COLORS.partner, kind: 'money', value: toUsd(current.partner), prev: toUsd(prev?.partner ?? 0), values: monthly.map(m => toUsd(m.partner)), labels },
    { label: 'Agent Payouts', color: COLORS.agent, kind: 'money', value: toUsd(current.agent), prev: toUsd(prev?.agent ?? 0), values: monthly.map(m => toUsd(m.agent)), labels },
  ]

  const volumeCards: SparklineCardProps[] = [
    { label: 'Paying Clients', color: COLORS.patients, kind: 'count', value: current.patients, prev: prev?.patients ?? 0, values: monthly.map(m => m.patients), labels },
    { label: 'New Clients', color: COLORS.newClients, kind: 'count', value: current.newClients, prev: prev?.newClients ?? 0, values: monthly.map(m => m.newClients), labels },
    { label: 'Active Agents', color: COLORS.activeAgents, kind: 'count', value: current.activeAgents, prev: prev?.activeAgents ?? 0, values: monthly.map(m => m.activeAgents), labels },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Performance · Last 6 Months</h2>
        <span className="text-xs text-gray-400">vs last month</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {moneyCards.map(c => <SparklineCard key={c.label} {...c} />)}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {volumeCards.map(c => <SparklineCard key={c.label} {...c} />)}
      </div>
    </div>
  )
}
