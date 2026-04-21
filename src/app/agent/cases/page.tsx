'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type CaseStatus = 'payment_pending' | 'payment_completed' | 'schedule_reviewed' | 'schedule_confirmed' | 'travel_completed'
type DietaryType = 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'

type CaseRow = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  case_members: { is_lead: boolean; clients: { name: string } | null }[]
  quotes: { total_price: number; quote_groups: { member_count: number }[] }[]
}

type AgentClient = { id: string; name: string; nationality: string }
type NewClientForm = {
  name: string; nationality: string; gender: 'male' | 'female'; date_of_birth: string
  phone: string; email: string; dietary_restriction: DietaryType; needs_muslim_friendly: boolean
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
const DIETARY_OPTIONS = [
  { value: 'halal_certified', label: 'Halal Certified' }, { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' }, { value: 'pork_free', label: 'Pork Free' }, { value: 'none', label: 'None' },
]
const DEFAULT_FORM: NewClientForm = { name: '', nationality: '', gender: 'male', date_of_birth: '', phone: '', email: '', dietary_restriction: 'none', needs_muslim_friendly: false }

export default function AgentCasesPage() {
  const router = useRouter()
  const [agentId, setAgentId] = useState('')
  const [cases, setCases] = useState<CaseRow[]>([])
  const [agentClients, setAgentClients] = useState<AgentClient[]>([])
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [loading, setLoading] = useState(true)

  // New Case modal
  const [showModal, setShowModal] = useState(false)
  const [leadId, setLeadId] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const [regForm, setRegForm] = useState<NewClientForm>(DEFAULT_FORM)
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const fetchCases = useCallback(async (aid: string) => {
    const { data } = await supabase
      .from('cases')
      .select('id, case_number, status, travel_start_date, case_members(is_lead, clients(name)), quotes(total_price, quote_groups(member_count))')
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
      setAgentId(aid)
      const { data: ss } = await supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single()
      const rate = (ss?.value as { usd_krw?: number } | null)?.usd_krw
      if (typeof rate === 'number' && rate > 0) setExchangeRate(rate)
      if (aid) {
        await fetchCases(aid)
        const { data: cl } = await supabase.from('clients').select('id, name, nationality').eq('agent_id', aid).order('name')
        setAgentClients(cl ?? [])
      }
      setLoading(false)
    }
    load()
  }, [fetchCases])

  async function handleCreate() {
    if (!agentId) return
    if (!leadId && !showRegister) { setCreateError('Select or register a lead client.'); return }
    if (showRegister && !regForm.name.trim()) { setCreateError('Name is required.'); return }
    if (dateEnd && dateStart && dateEnd <= dateStart) { setCreateError('End date must be after start date.'); return }
    setCreating(true); setCreateError('')
    try {
      let clientId = leadId
      if (showRegister) {
        const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true })
        const { data: nc, error: ce } = await supabase.from('clients')
          .insert({ client_number: `#CL-${String((count ?? 0) + 1).padStart(3, '0')}`, agent_id: agentId, ...regForm })
          .select('id, name, nationality').single()
        if (ce) throw ce
        clientId = nc.id
        setAgentClients(p => [...p, { id: nc.id, name: nc.name, nationality: nc.nationality }])
      }
      const { count: cc } = await supabase.from('cases').select('*', { count: 'exact', head: true })
      const { data: cd, error: caseErr } = await supabase.from('cases')
        .insert({ case_number: `#C-${String((cc ?? 0) + 1).padStart(3, '0')}`, agent_id: agentId, status: 'payment_pending', travel_start_date: dateStart || null, travel_end_date: dateEnd || null })
        .select('id').single()
      if (caseErr) throw caseErr
      await supabase.from('case_members').insert({ case_id: cd.id, client_id: clientId, is_lead: true })
      router.push(`/agent/cases/${cd.id}`)
    } catch (e: unknown) {
      setCreateError((e as { message?: string })?.message ?? 'Failed.')
      setCreating(false)
    }
  }

  function openModal() {
    setShowModal(true); setLeadId(''); setShowRegister(false); setRegForm(DEFAULT_FORM)
    setDateStart(''); setDateEnd(''); setCreateError('')
  }

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-gray-900">Cases</h1>
          {!loading && <span className="text-xs text-gray-400">{cases.length}</span>}
        </div>
        <button onClick={openModal} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Case
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
        ) : cases.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-sm text-gray-400">No cases yet.</p>
            <button onClick={openModal} className="mt-3 text-xs font-medium text-[#0f4c35] hover:underline">Create your first case</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 sticky top-0">
              <tr>
                {['Case #', 'Lead Client', 'Status', 'Members', 'Travel Start', 'Amount (USD)'].map((h, i) => (
                  <th key={h} className={`py-3 px-4 text-xs font-medium text-gray-400 ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
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
                    <td className="py-3.5 px-4 text-xs text-gray-500">{c.travel_start_date ?? '—'}</td>
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

      {/* New Case Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">New Case</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Lead Client */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead Client</p>
                {!showRegister ? (
                  <div className="space-y-2">
                    <select value={leadId} onChange={e => setLeadId(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                      <option value="">Select existing client</option>
                      {agentClients.map(c => <option key={c.id} value={c.id}>{c.name}{c.nationality ? ` (${c.nationality})` : ''}</option>)}
                    </select>
                    <button onClick={() => { setShowRegister(true); setLeadId('') }} className="text-xs font-medium text-[#0f4c35] hover:underline">
                      + Register new client
                    </button>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {([['Name *', 'name', 'text'], ['Nationality', 'nationality', 'text'], ['Phone', 'phone', 'text'], ['Email', 'email', 'email']] as const).map(([label, field, type]) => (
                        <div key={field}>
                          <label className="block text-xs text-gray-500 mb-1">{label}</label>
                          <input type={type} value={(regForm as Record<string, string>)[field]}
                            onChange={e => setRegForm(p => ({ ...p, [field]: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                        <input type="date" value={regForm.date_of_birth} onChange={e => setRegForm(p => ({ ...p, date_of_birth: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Gender</label>
                        <div className="flex gap-3 mt-1">
                          {(['male', 'female'] as const).map(g => (
                            <label key={g} className="flex items-center gap-1 cursor-pointer text-sm">
                              <input type="radio" checked={regForm.gender === g} onChange={() => setRegForm(p => ({ ...p, gender: g }))} className="accent-[#0f4c35]" />
                              <span className="capitalize">{g}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Dietary Restriction</label>
                      <select value={regForm.dietary_restriction} onChange={e => setRegForm(p => ({ ...p, dietary_restriction: e.target.value as DietaryType }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                        {DIETARY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={regForm.needs_muslim_friendly} onChange={e => setRegForm(p => ({ ...p, needs_muslim_friendly: e.target.checked }))} className="accent-[#0f4c35]" />
                      <span className="text-xs text-gray-600">Needs Muslim Friendly services</span>
                    </label>
                    <button onClick={() => { setShowRegister(false); setRegForm(DEFAULT_FORM) }} className="text-xs text-gray-400 hover:text-gray-600">← Back to existing</button>
                  </div>
                )}
              </div>

              {/* Travel Dates */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Travel Dates (Optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start</label>
                    <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End</label>
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                </div>
              </div>

              {createError && <p className="text-xs text-red-500">{createError}</p>}

              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
                <button onClick={handleCreate} disabled={creating} className="flex-1 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40">
                  {creating ? 'Creating...' : 'Create Case'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
