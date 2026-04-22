'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type CompletedCase = {
  id: string
  case_number: string
  travel_start_date: string | null
  travel_end_date: string | null
  case_members: { is_lead: boolean; clients: { name: string } | null }[]
  quotes: { total_price: number; agent_margin_rate: number }[]
}

type Settlement = {
  id: string
  settlement_number: string | null
  case_id: string | null
  amount: number
  paid_at: string | null
  created_at: string
}

function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function commissionKrw(totalKrw: number, agentMargin: number): number {
  if (!agentMargin || agentMargin <= 0) return 0
  return Math.round(totalKrw * agentMargin / (1 + agentMargin))
}

export default function AgentPayoutsPage() {
  const [loading, setLoading] = useState(true)
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [cases, setCases] = useState<CompletedCase[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data: ag } = await supabase.from('agents').select('id').eq('auth_user_id', uid).single()
      const agentId = ag?.id
      if (!agentId) { setLoading(false); return }

      const { data: ss } = await supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single()
      const r = (ss?.value as { usd_krw?: number } | null)?.usd_krw
      if (r) setExchangeRate(r)

      const [casesRes, settlementsRes] = await Promise.all([
        supabase.from('cases')
          .select('id, case_number, travel_start_date, travel_end_date, case_members(is_lead, clients(name)), quotes(total_price, agent_margin_rate)')
          .eq('agent_id', agentId)
          .eq('status', 'travel_completed')
          .order('travel_end_date', { ascending: false }),
        supabase.from('settlements')
          .select('id, settlement_number, case_id, amount, paid_at, created_at')
          .eq('agent_id', agentId)
          .order('created_at', { ascending: false }),
      ])
      setCases((casesRes.data as unknown as CompletedCase[]) ?? [])
      setSettlements((settlementsRes.data as Settlement[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Derive ─────────────────────────────────────────────────────────────────

  const settledCaseIds = new Set(settlements.filter(s => s.case_id).map(s => s.case_id!))
  const unsettled = cases.filter(c => !settledCaseIds.has(c.id))
  const caseCommissionKrw = (c: CompletedCase) => {
    const q = c.quotes?.[0]
    return q ? commissionKrw(q.total_price, q.agent_margin_rate) : 0
  }
  const unsettledTotalKrw = unsettled.reduce((s, c) => s + caseCommissionKrw(c), 0)
  const settledTotalKrw = settlements.reduce((s, st) => s + (st.amount ?? 0), 0)

  // This month = settlements paid this month (money actually received)
  const thisMonth = new Date()
  const thisMonthKey = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}`
  const thisMonthKrw = settlements
    .filter(s => s.paid_at && s.paid_at.startsWith(thisMonthKey))
    .reduce((s, st) => s + (st.amount ?? 0), 0)

  const toUsd = (krw: number) => krw / exchangeRate

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-900">Payouts</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-[10px] text-amber-700 mb-1 uppercase tracking-wide">Unsettled</p>
                  <p className="text-lg font-bold text-amber-800">{fmtUSD(toUsd(unsettledTotalKrw))}</p>
                  <p className="text-[10px] text-amber-600 mt-1">{unsettled.length} case{unsettled.length !== 1 ? 's' : ''} awaiting payout</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Received This Month</p>
                  <p className="text-lg font-bold text-gray-900">{fmtUSD(toUsd(thisMonthKrw))}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <p className="text-[10px] text-emerald-700 mb-1 uppercase tracking-wide">Total Received</p>
                  <p className="text-lg font-bold text-emerald-800">{fmtUSD(toUsd(settledTotalKrw))}</p>
                  <p className="text-[10px] text-emerald-600 mt-1">{settlements.length} payout{settlements.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Unsettled cases */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Unsettled Cases</h3>
                  <span className="text-[10px] text-gray-400">{unsettled.length}</span>
                </div>
                {unsettled.length === 0 ? (
                  <div className="bg-gray-50 rounded-2xl p-6 text-center">
                    <p className="text-sm text-gray-400">No unsettled cases. All completed cases have been paid out.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">Admin processes payouts manually after each trip. Contact admin if you have questions.</p>
                    <div className="border border-gray-100 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            {['Case #', 'Lead Client', 'Travel', 'Commission'].map(h => (
                              <th key={h} className="py-2.5 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {unsettled.map(c => {
                            const lead = c.case_members?.find(m => m.is_lead)
                            const comm = caseCommissionKrw(c)
                            return (
                              <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                <td className="py-3 px-4">
                                  <Link href={`/agent/cases/${c.id}`} className="font-mono text-xs text-[#0f4c35] hover:underline">{c.case_number}</Link>
                                </td>
                                <td className="py-3 px-4 text-gray-800">{lead?.clients?.name ?? '—'}</td>
                                <td className="py-3 px-4 text-gray-500 text-xs">
                                  {c.travel_start_date || c.travel_end_date
                                    ? `${c.travel_start_date ?? '—'} ~ ${c.travel_end_date ?? '—'}`
                                    : '—'}
                                </td>
                                <td className="py-3 px-4 font-semibold text-gray-900">{fmtUSD(toUsd(comm))}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

              {/* Settlement history */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Settlement History</h3>
                  <span className="text-[10px] text-gray-400">{settlements.length}</span>
                </div>
                {settlements.length === 0 ? (
                  <div className="bg-gray-50 rounded-2xl p-6 text-center">
                    <p className="text-sm text-gray-400">No settlements yet.</p>
                  </div>
                ) : (
                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Settlement #', 'Case', 'Paid On', 'Amount'].map(h => (
                            <th key={h} className="py-2.5 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {settlements.map(s => {
                          const linkedCase = cases.find(c => c.id === s.case_id)
                          const lead = linkedCase?.case_members?.find(m => m.is_lead)
                          return (
                            <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                              <td className="py-3 px-4 font-mono text-xs text-gray-400">{s.settlement_number ?? '—'}</td>
                              <td className="py-3 px-4">
                                {linkedCase ? (
                                  <Link href={`/agent/cases/${linkedCase.id}`} className="text-xs text-[#0f4c35] hover:underline">
                                    {linkedCase.case_number} · {lead?.clients?.name ?? '—'}
                                  </Link>
                                ) : <span className="text-xs text-gray-400">—</span>}
                              </td>
                              <td className="py-3 px-4 text-gray-500 text-xs">{s.paid_at?.slice(0, 10) ?? '—'}</td>
                              <td className="py-3 px-4 font-semibold text-gray-900">{fmtUSD(toUsd(s.amount))}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
