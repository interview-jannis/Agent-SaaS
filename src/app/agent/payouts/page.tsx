'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import SparklineCard from '@/components/SparklineCard'

type CaseRow = {
  id: string
  case_number: string
  status: string
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

type BankInfo = {
  bank_name?: string
  account_number?: string
  account_holder?: string
  swift_code?: string
  bank_address?: string
}

const BANK_FIELDS: Array<[keyof BankInfo, string, string]> = [
  ['bank_name', 'Bank Name', 'e.g. Emirates NBD'],
  ['account_number', 'Account Number', ''],
  ['account_holder', 'Account Holder', 'Full name as on account'],
  ['swift_code', 'SWIFT Code', 'e.g. EBILAEAD'],
  ['bank_address', 'Bank Address', 'Branch or bank address'],
]

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  const [agentId, setAgentId] = useState('')
  const [cases, setCases] = useState<CaseRow[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])

  // Bank
  const [bankInfo, setBankInfo] = useState<BankInfo | null>(null)
  const [editBank, setEditBank] = useState(false)
  const [bankForm, setBankForm] = useState<BankInfo>({})
  const [savingBank, setSavingBank] = useState(false)
  const [bankError, setBankError] = useState('')

  async function fetchAll() {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return
    const { data: ag } = await supabase.from('agents')
      .select('id, bank_info')
      .eq('auth_user_id', uid).single()
    if (!ag) { setLoading(false); return }
    setAgentId(ag.id)
    setBankInfo((ag as { bank_info: BankInfo | null }).bank_info ?? null)

    const { data: ss } = await supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single()
    const r = (ss?.value as { usd_krw?: number } | null)?.usd_krw
    if (r) setExchangeRate(r)

    const [casesRes, settlementsRes] = await Promise.all([
      supabase.from('cases')
        .select('id, case_number, status, travel_start_date, travel_end_date, case_members(is_lead, clients(name)), quotes(total_price, agent_margin_rate)')
        .eq('agent_id', ag.id)
        .order('created_at', { ascending: false }),
      supabase.from('settlements')
        .select('id, settlement_number, case_id, amount, paid_at, created_at')
        .eq('agent_id', ag.id)
        .order('paid_at', { ascending: false, nullsFirst: false }),
    ])
    setCases((casesRes.data as unknown as CaseRow[]) ?? [])
    setSettlements((settlementsRes.data as Settlement[]) ?? [])
  }

  useEffect(() => {
    async function init() { await fetchAll(); setLoading(false) }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveBank() {
    if (!agentId) return
    setSavingBank(true); setBankError('')
    try {
      const cleaned: BankInfo = {}
      for (const [k] of BANK_FIELDS) {
        const v = (bankForm[k] ?? '').trim()
        if (v) cleaned[k] = v
      }
      const { error } = await supabase.from('agents')
        .update({ bank_info: Object.keys(cleaned).length > 0 ? cleaned : null })
        .eq('id', agentId)
      if (error) throw error
      await fetchAll()
      setEditBank(false)
    } catch (e: unknown) {
      setBankError((e as { message?: string })?.message ?? 'Failed to save.')
    } finally {
      setSavingBank(false)
    }
  }

  // ── Derive ─────────────────────────────────────────────────────────────────

  const settledCaseIds = new Set(settlements.filter(s => s.case_id).map(s => s.case_id!))
  const caseCommissionKrw = (c: CaseRow) => {
    const q = c.quotes?.[0]
    return q ? commissionKrw(q.total_price, q.agent_margin_rate) : 0
  }

  const unsettled = cases.filter(c => c.status === 'completed' && !settledCaseIds.has(c.id))
  const unsettledTotalKrw = unsettled.reduce((s, c) => s + caseCommissionKrw(c), 0)

  const paidSettlements = settlements.filter(s => s.paid_at)
  const totalReceivedKrw = paidSettlements.reduce((s, st) => s + (st.amount ?? 0), 0)
  const now = new Date()
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonthKrw = paidSettlements
    .filter(s => s.paid_at?.startsWith(thisMonthKey))
    .reduce((s, st) => s + (st.amount ?? 0), 0)

  const toUsd = (krw: number) => krw / exchangeRate
  const bankConfigured = bankInfo && Object.keys(bankInfo).length > 0

  // 6-month monthly breakdown
  const monthly: { key: string; label: string; amount: number; count: number; avg: number; avgDaysToReceive: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthPayouts = paidSettlements.filter(s => s.paid_at?.startsWith(key))
    const amount = monthPayouts.reduce((sum, st) => sum + (st.amount ?? 0), 0)
    const count = monthPayouts.length
    const avg = count > 0 ? amount / count : 0
    const daysSamples = monthPayouts
      .map(s => {
        const c = cases.find(x => x.id === s.case_id)
        const end = c?.travel_end_date
        if (!end || !s.paid_at) return null
        return Math.max(0, Math.floor((new Date(s.paid_at).getTime() - new Date(end).getTime()) / 86400000))
      })
      .filter((v): v is number => v !== null)
    const avgDaysToReceive = daysSamples.length > 0 ? Math.round(daysSamples.reduce((a, b) => a + b, 0) / daysSamples.length) : 0
    monthly.push({ key, label: MONTH_SHORT[d.getMonth()], amount, count, avg, avgDaysToReceive })
  }
  const cur = monthly[monthly.length - 1]
  const prv = monthly[monthly.length - 2]
  const sparkLabels = monthly.map(m => m.label)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-900">Payouts</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-12 py-8 space-y-8">

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
          ) : (
            <>
              {/* HERO — received */}
              <section className="bg-gray-50 rounded-2xl p-6">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Total Received</p>
                <p className="text-5xl font-bold text-gray-900 tracking-tight leading-none">{fmtUSD(toUsd(totalReceivedKrw))}</p>
                <div className="mt-4 flex items-baseline gap-6 flex-wrap">
                  <p className="text-sm text-gray-500">
                    across <span className="font-semibold text-gray-700">{paidSettlements.length}</span> payout{paidSettlements.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wide">This Month</span>
                    <span className="text-lg font-semibold text-[#0f4c35]">{fmtUSD(toUsd(thisMonthKrw))}</span>
                  </div>
                </div>
              </section>

              {/* Settlement History — the star of this page */}
              <section className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-sm font-semibold text-gray-900">Settlement History</h2>
                  <span className="text-xs text-gray-400">{settlements.length}</span>
                </div>
                {settlements.length === 0 ? (
                  <div className="bg-gray-50 rounded-2xl p-8 text-center">
                    <p className="text-sm text-gray-400">No settlements yet. Payouts will appear here once processed.</p>
                  </div>
                ) : (
                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Paid On', 'Settlement #', 'Case', 'Amount'].map(h => (
                            <th key={h} className="py-3 px-4 text-xs font-medium text-gray-500 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {settlements.map(s => {
                          const linkedCase = cases.find(c => c.id === s.case_id)
                          const lead = linkedCase?.case_members?.find(m => m.is_lead)
                          return (
                            <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                              <td className="py-3 px-4 text-gray-800 text-sm">{s.paid_at?.slice(0, 10) ?? '—'}</td>
                              <td className="py-3 px-4 font-mono text-xs text-gray-500">{s.settlement_number ?? '—'}</td>
                              <td className="py-3 px-4">
                                {linkedCase ? (
                                  <Link href={`/agent/cases/${linkedCase.id}`} className="text-sm text-[#0f4c35] hover:underline">
                                    {linkedCase.case_number} · {lead?.clients?.name ?? '—'}
                                  </Link>
                                ) : <span className="text-sm text-gray-400">—</span>}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="text-base font-semibold text-gray-900">{fmtUSD(toUsd(s.amount))}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Waiting — secondary */}
              <section className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-sm font-semibold text-gray-900">Waiting to be Paid</h2>
                  <span className="text-xs text-gray-400">
                    {unsettled.length > 0
                      ? `${fmtUSD(toUsd(unsettledTotalKrw))} · ${unsettled.length} case${unsettled.length !== 1 ? 's' : ''}`
                      : 'none'}
                  </span>
                </div>
                {unsettled.length === 0 ? (
                  <div className="bg-gray-50 rounded-2xl p-6 text-center">
                    <p className="text-sm text-gray-400">All completed cases have been paid out.</p>
                  </div>
                ) : (
                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Case #', 'Lead Client', 'Travel', 'Commission'].map(h => (
                            <th key={h} className="py-2.5 px-4 text-xs font-medium text-gray-500 text-left">{h}</th>
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
                              <td className="py-3 px-4 text-right font-semibold text-gray-900">{fmtUSD(toUsd(comm))}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Performance — 6 month sparklines */}
              <section className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Performance · Last 6 Months</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SparklineCard label="Received" color="#0f4c35" kind="money"
                    value={toUsd(cur.amount)} prev={toUsd(prv?.amount ?? 0)}
                    values={monthly.map(m => toUsd(m.amount))} labels={sparkLabels} />
                  <SparklineCard label="Avg per Payout" color="#10b981" kind="money"
                    value={toUsd(cur.avg)} prev={toUsd(prv?.avg ?? 0)}
                    values={monthly.map(m => toUsd(m.avg))} labels={sparkLabels} />
                  <SparklineCard label="Payouts" color="#a855f7" kind="count"
                    value={cur.count} prev={prv?.count ?? 0}
                    values={monthly.map(m => m.count)} labels={sparkLabels} />
                  <SparklineCard label="Avg Days to Receive" color="#3b82f6" kind="count"
                    value={cur.avgDaysToReceive} prev={prv?.avgDaysToReceive ?? 0}
                    values={monthly.map(m => m.avgDaysToReceive)} labels={sparkLabels} />
                </div>
              </section>

              {/* Bank Account */}
              <div className="lg:max-w-md">
                <section className={`rounded-2xl p-5 ${bankConfigured ? 'bg-gray-50' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bank Information</h3>
                      {!bankConfigured && (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Required</span>
                      )}
                    </div>
                    {!editBank ? (
                      <button onClick={() => { setEditBank(true); setBankForm(bankInfo ?? {}); setBankError('') }}
                        className="text-xs font-medium text-[#0f4c35] hover:underline">
                        {bankConfigured ? 'Edit' : 'Add info'}
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button onClick={() => { setEditBank(false); setBankError('') }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        <button onClick={saveBank} disabled={savingBank}
                          className="text-xs font-medium text-[#0f4c35] hover:underline disabled:opacity-40">
                          {savingBank ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>

                  {bankError && <p className="text-xs text-red-500 mb-3">{bankError}</p>}

                  {!bankConfigured && !editBank && (
                    <p className="text-xs text-amber-800 mb-3">
                      Admin needs these details to send commission payouts.
                    </p>
                  )}

                  {!editBank ? (
                    <div className="space-y-2 text-sm">
                      {BANK_FIELDS.map(([key, label]) => (
                        <div key={key} className="flex justify-between items-start gap-2">
                          <p className="text-[11px] text-gray-500">{label}</p>
                          <p className="text-gray-800 font-mono text-xs text-right break-all">
                            {bankInfo?.[key] || <span className="text-gray-300">—</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {BANK_FIELDS.map(([key, label, placeholder]) => (
                        <div key={key}>
                          <label className="block text-[11px] text-gray-500 mb-1">{label}</label>
                          <input value={bankForm[key] ?? ''}
                            onChange={e => setBankForm(p => ({ ...p, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
