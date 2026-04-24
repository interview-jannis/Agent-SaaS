'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { notifyAgent } from '@/lib/notifications'
import { logAsCurrentUser } from '@/lib/audit'

// ── Types ─────────────────────────────────────────────────────────────────────

type Agent = {
  id: string
  agent_number: string | null
  name: string
  email: string | null
  bank_info: Record<string, string> | null
}

type CompletedCase = {
  id: string
  case_number: string
  travel_start_date: string | null
  travel_end_date: string | null
  agent_id: string
  agents: Agent | Agent[] | null
  case_members: { is_lead: boolean; clients: { name: string } | null }[]
  quotes: { total_price: number; agent_margin_rate: number }[]
}

type Settlement = {
  id: string
  settlement_number: string | null
  agent_id: string
  case_id: string | null
  amount: number
  paid_at: string | null
  created_at: string
  agents: Agent | Agent[] | null
}

function pickAgent(a: Agent | Agent[] | null | undefined): Agent | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function fmtKRW(n: number) { return '₩' + n.toLocaleString('ko-KR') }
function fmtUSD(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function commissionKrw(totalKrw: number, agentMargin: number): number {
  if (!agentMargin || agentMargin <= 0) return 0
  return Math.round(totalKrw * agentMargin / (1 + agentMargin))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminSettlementPage() {
  const [loading, setLoading] = useState(true)
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [cases, setCases] = useState<CompletedCase[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])

  // Settle modal state
  const [settlingCase, setSettlingCase] = useState<CompletedCase | null>(null)
  const [settlePaidDate, setSettlePaidDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')

  const fetchData = useCallback(async () => {
    const [casesRes, settlementsRes, rateRes] = await Promise.all([
      supabase.from('cases')
        .select('id, case_number, travel_start_date, travel_end_date, agent_id, agents!cases_agent_id_fkey(id, agent_number, name, email, bank_info), case_members(is_lead, clients(name)), quotes(total_price, agent_margin_rate)')
        .eq('status', 'travel_completed')
        .order('travel_end_date', { ascending: false }),
      supabase.from('settlements')
        .select('id, settlement_number, agent_id, case_id, amount, paid_at, created_at, agents!settlements_agent_id_fkey(id, agent_number, name, email, bank_info)')
        .order('created_at', { ascending: false }),
      supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
    ])
    if (casesRes.error) console.error('[settlement] cases error:', casesRes.error)
    if (settlementsRes.error) console.error('[settlement] settlements error:', settlementsRes.error)
    setCases((casesRes.data as unknown as CompletedCase[]) ?? [])
    setSettlements((settlementsRes.data as unknown as Settlement[]) ?? [])
    const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
    if (r) setExchangeRate(r)
  }, [])

  useEffect(() => {
    async function init() { await fetchData(); setLoading(false) }
    init()
  }, [fetchData])

  // ── Derive ─────────────────────────────────────────────────────────────────

  const settledCaseIds = new Set(settlements.filter(s => s.case_id).map(s => s.case_id!))
  const unsettled = cases.filter(c => !settledCaseIds.has(c.id))

  const caseCommissionKrw = (c: CompletedCase) => {
    const q = c.quotes?.[0]
    return q ? commissionKrw(q.total_price, q.agent_margin_rate) : 0
  }

  const toUsd = (krw: number) => krw / exchangeRate

  // ── Actions ────────────────────────────────────────────────────────────────

  function openSettleModal(c: CompletedCase) {
    setSettlingCase(c)
    setSettlePaidDate(new Date().toISOString().slice(0, 10))
    setModalError('')
  }

  function closeSettleModal() {
    setSettlingCase(null)
    setModalError('')
  }

  async function confirmSettle() {
    if (!settlingCase) return
    if (!settlePaidDate) { setModalError('Paid date is required.'); return }
    setSaving(true); setModalError('')
    try {
      // Generate settlement_number: #S-NNN (count+1, zero-padded)
      const { count } = await supabase.from('settlements').select('*', { count: 'exact', head: true })
      const next = (count ?? 0) + 1
      const settlementNumber = `#S-${String(next).padStart(3, '0')}`

      // Commission is deterministic (total × margin / (1+margin)) — store in KRW.
      const amountKrw = caseCommissionKrw(settlingCase)

      const { error } = await supabase.from('settlements').insert({
        settlement_number: settlementNumber,
        agent_id: settlingCase.agent_id,
        case_id: settlingCase.id,
        amount: amountKrw,
        paid_at: settlePaidDate,
      })
      if (error) throw error
      await notifyAgent(settlingCase.agent_id, `${settlingCase.case_number} Settlement paid — ${fmtUSD(toUsd(amountKrw))}`, '/agent/payouts')
      await logAsCurrentUser('settlement.paid',
        { type: 'case', id: settlingCase.id, label: settlingCase.case_number },
        { amount_krw: amountKrw, paid_at: settlePaidDate, settlement_number: settlementNumber })
      await fetchData()
      closeSettleModal()
    } catch (e: unknown) {
      setModalError((e as { message?: string })?.message ?? 'Failed.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-900">Settlement</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-12 py-8 space-y-6">

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
          ) : (
            <>
              {/* Unsettled cases */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Unsettled Cases</h3>
                  <span className="text-[10px] text-gray-400">{unsettled.length}</span>
                </div>
                {unsettled.length === 0 ? (
                  <div className="bg-gray-50 rounded-2xl p-6 text-center">
                    <p className="text-sm text-gray-400">No cases awaiting settlement.</p>
                  </div>
                ) : (
                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Agent', 'Case #', 'Lead Client', 'Travel', 'Margin', 'Commission', ''].map(h => (
                            <th key={h} className="py-2.5 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {unsettled.map(c => {
                          const agent = pickAgent(c.agents)
                          const lead = c.case_members?.find(m => m.is_lead)
                          const commKrw = caseCommissionKrw(c)
                          const margin = c.quotes?.[0]?.agent_margin_rate ?? 0
                          return (
                            <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                              <td className="py-3 px-4">
                                <p className="text-sm font-medium text-gray-800">{agent?.name ?? '—'}</p>
                                <p className="text-[10px] font-mono text-gray-400">{agent?.agent_number ?? ''}</p>
                              </td>
                              <td className="py-3 px-4 font-mono text-xs text-gray-500">{c.case_number}</td>
                              <td className="py-3 px-4 text-gray-800">{lead?.clients?.name ?? '—'}</td>
                              <td className="py-3 px-4 text-gray-500 text-xs">
                                {c.travel_start_date || c.travel_end_date
                                  ? `${c.travel_start_date ?? '—'} ~ ${c.travel_end_date ?? '—'}`
                                  : '—'}
                              </td>
                              <td className="py-3 px-4 text-gray-600 text-xs">{(margin * 100).toFixed(0)}%</td>
                              <td className="py-3 px-4">
                                <p className="font-semibold text-gray-900">{fmtUSD(toUsd(commKrw))}</p>
                                <p className="text-[10px] text-gray-400">{fmtKRW(commKrw)}</p>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button onClick={() => openSettleModal(c)}
                                  className="px-3 py-1 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828]">
                                  Settle
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
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
                          {['#', 'Agent', 'Case', 'Paid On', 'Margin', 'Amount'].map(h => (
                            <th key={h} className="py-2.5 px-4 text-xs font-medium text-gray-400 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {settlements.map(s => {
                          const agent = pickAgent(s.agents)
                          const linkedCase = cases.find(c => c.id === s.case_id)
                          const lead = linkedCase?.case_members?.find(m => m.is_lead)
                          const margin = linkedCase?.quotes?.[0]?.agent_margin_rate
                          return (
                            <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                              <td className="py-3 px-4 font-mono text-xs text-gray-400">{s.settlement_number ?? '—'}</td>
                              <td className="py-3 px-4 text-gray-800">{agent?.name ?? '—'}</td>
                              <td className="py-3 px-4 text-xs">
                                {linkedCase
                                  ? <span className="text-gray-500">{linkedCase.case_number} · {lead?.clients?.name ?? '—'}</span>
                                  : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="py-3 px-4 text-gray-500 text-xs">{s.paid_at?.slice(0, 10) ?? '—'}</td>
                              <td className="py-3 px-4 text-gray-600 text-xs">{margin != null ? `${(margin * 100).toFixed(0)}%` : '—'}</td>
                              <td className="py-3 px-4">
                                <p className="font-semibold text-gray-900">{fmtUSD(toUsd(s.amount))}</p>
                                <p className="text-[10px] text-gray-400">{fmtKRW(s.amount)}</p>
                              </td>
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

      {/* Settle Modal */}
      {settlingCase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && closeSettleModal()}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Log Settlement</h3>
              <p className="text-xs text-gray-500 mt-1">Record a payout after sending the bank transfer.</p>
            </div>

            {/* Case & agent info */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-xs">
              {(() => {
                const agent = pickAgent(settlingCase.agents)
                const lead = settlingCase.case_members?.find(m => m.is_lead)
                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Agent</span>
                      <span className="text-gray-900 font-medium">{agent?.name ?? '—'} <span className="font-mono text-gray-400">{agent?.agent_number ?? ''}</span></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Case</span>
                      <span className="text-gray-900">{settlingCase.case_number} · {lead?.clients?.name ?? '—'}</span>
                    </div>
                    {agent?.bank_info && Object.keys(agent.bank_info).length > 0 && (
                      <div className="pt-2 mt-2 border-t border-gray-200 space-y-1">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Bank Details</p>
                        {Object.entries(agent.bank_info).map(([k, v]) => (
                          <div key={k} className="flex justify-between">
                            <span className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}</span>
                            <span className="text-gray-800 font-mono">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(!agent?.bank_info || Object.keys(agent.bank_info).length === 0) && (
                      <p className="pt-2 mt-2 border-t border-gray-200 text-[11px] text-amber-700">
                        ⚠ No bank details on file. Agent must update their profile.
                      </p>
                    )}
                  </>
                )
              })()}
            </div>

            {(() => {
              const amountKrw = caseCommissionKrw(settlingCase)
              return (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="block text-xs text-gray-500 mb-1">Amount</p>
                    <p className="text-lg font-bold text-[#0f4c35]">{fmtUSD(toUsd(amountKrw))}</p>
                    <p className="text-[10px] text-gray-400">{fmtKRW(amountKrw)}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Paid Date *</label>
                    <input type="date" value={settlePaidDate}
                      onChange={e => setSettlePaidDate(e.target.value)}
                      min={settlingCase.travel_end_date ?? undefined}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                </div>
              )
            })()}

            {modalError && <p className="text-xs text-red-500">{modalError}</p>}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={closeSettleModal} disabled={saving}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg disabled:opacity-40">
                Cancel
              </button>
              <button onClick={confirmSettle} disabled={saving}
                className="text-xs font-medium bg-[#0f4c35] text-white hover:bg-[#0a3828] px-3 py-1.5 rounded-lg disabled:opacity-40">
                {saving ? 'Logging...' : 'Confirm Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
