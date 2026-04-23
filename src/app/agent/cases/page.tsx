'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type CaseStatus = 'payment_pending' | 'payment_completed' | 'schedule_reviewed' | 'schedule_confirmed' | 'travel_completed'

type CaseRow = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  travel_end_date: string | null
  created_at: string
  case_members: { is_lead: boolean; clients: { name: string } | null }[]
  quotes: { total_price: number; quote_groups: { member_count: number }[] }[]
}

const STATUS_LABELS: Record<CaseStatus, string> = {
  payment_pending: 'Awaiting Payment', payment_completed: 'Payment Confirmed',
  schedule_reviewed: 'Schedule Reviewed', schedule_confirmed: 'Schedule Confirmed', travel_completed: 'Travel Completed',
}
const STATUS_STYLES: Record<CaseStatus, string> = {
  payment_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  payment_completed: 'bg-blue-50 text-blue-700 border-blue-200',
  schedule_reviewed: 'bg-violet-50 text-violet-700 border-violet-200',
  schedule_confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  travel_completed: 'bg-gray-50 text-gray-500 border-gray-200',
}

export default function AgentCasesPage() {
  const router = useRouter()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [loading, setLoading] = useState(true)

  const fetchCases = useCallback(async (aid: string) => {
    const { data } = await supabase
      .from('cases')
      .select('id, case_number, status, travel_start_date, travel_end_date, created_at, case_members(is_lead, clients(name)), quotes(total_price, quote_groups(member_count))')
      .eq('agent_id', aid)
      .order('created_at', { ascending: false })
    setCases((data as unknown as CaseRow[]) ?? [])
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      const { data: ag } = await supabase.from('agents').select('id').eq('auth_user_id', uid).single()
      const aid = ag?.id ?? ''
      const { data: ss } = await supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single()
      const rate = (ss?.value as { usd_krw?: number } | null)?.usd_krw
      if (typeof rate === 'number' && rate > 0) setExchangeRate(rate)
      if (aid) await fetchCases(aid)
      setLoading(false)
    }
    load()
  }, [fetchCases])

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-2 px-6 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-900">Cases</h1>
        {!loading && <span className="text-xs text-gray-400">{cases.length}</span>}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : cases.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-sm text-gray-400">No cases yet.</p>
            <p className="text-xs text-gray-300 mt-1">Create a quote from the Home tab to start a case.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
              <tr>
                {['Case #', 'Lead Client', 'Status', 'Members', 'Created', 'Travel Start', 'Travel End', 'Amount (USD)'].map((h, i) => (
                  <th key={h} className={`py-3 px-4 text-xs font-medium text-gray-400 ${i === 7 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const lead = c.case_members?.find(m => m.is_lead)
                const quote = c.quotes?.[0]
                const members = quote?.quote_groups?.reduce((s, g) => s + (g.member_count ?? 0), 0) ?? 0
                const amountUsd = quote ? quote.total_price / exchangeRate : null
                return (
                  <tr key={c.id} onClick={() => router.push(`/agent/cases/${c.id}`)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-400">{c.case_number}</td>
                    <td className="py-3.5 px-4 font-medium text-gray-900">{lead?.clients?.name ?? '—'}</td>
                    <td className="py-3.5 px-4">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-500">{members}</td>
                    <td className="py-3.5 px-4 text-xs text-gray-500">{c.created_at?.slice(0, 10) ?? '—'}</td>
                    <td className="py-3.5 px-4 text-xs text-gray-500">{c.travel_start_date ?? '—'}</td>
                    <td className="py-3.5 px-4 text-xs text-gray-500">{c.travel_end_date ?? '—'}</td>
                    <td className="py-3.5 px-4 text-right font-medium text-gray-900">
                      {amountUsd !== null ? `$${amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
