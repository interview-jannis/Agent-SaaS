'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type CaseStatus = 'payment_pending' | 'payment_completed' | 'schedule_reviewed' | 'schedule_confirmed' | 'travel_completed'

type CaseMember = {
  id: string
  is_lead: boolean
  clients: {
    id: string
    client_number: string
    name: string
    nationality: string
    gender: string
    dietary_restriction: string
    needs_muslim_friendly: boolean
  }
}

type Quote = {
  id: string
  quote_number: string
  total_price: number
  payment_due_date: string
}

type Case = {
  id: string
  case_number: string
  status: CaseStatus
  travel_start_date: string | null
  travel_end_date: string | null
  created_at: string
  case_members: CaseMember[]
  quotes: Quote[]
}

type AgentClient = {
  id: string
  name: string
  nationality: string
}

type NewClientForm = {
  name: string
  nationality: string
  gender: 'male' | 'female'
  date_of_birth: string
  phone: string
  email: string
  dietary_restriction: 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'
  special_requests: string
  needs_muslim_friendly: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<CaseStatus, string> = {
  payment_pending: 'Awaiting Payment',
  payment_completed: 'Payment Confirmed',
  schedule_reviewed: 'Schedule Reviewed',
  schedule_confirmed: 'Schedule Confirmed',
  travel_completed: 'Travel Completed',
}

const STATUS_STYLES: Record<CaseStatus, string> = {
  payment_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  payment_completed: 'bg-blue-50 text-blue-700 border-blue-200',
  schedule_reviewed: 'bg-violet-50 text-violet-700 border-violet-200',
  schedule_confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  travel_completed: 'bg-gray-50 text-gray-500 border-gray-200',
}

const DIETARY_OPTIONS = [
  { value: 'halal_certified', label: 'Halal Certified' },
  { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' },
  { value: 'pork_free', label: 'Pork Free' },
  { value: 'none', label: 'None' },
]

const DEFAULT_NEW_CLIENT: NewClientForm = {
  name: '', nationality: '', gender: 'male', date_of_birth: '',
  phone: '', email: '', dietary_restriction: 'none',
  special_requests: '', needs_muslim_friendly: false,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentCasesPage() {
  const [cases, setCases] = useState<Case[]>([])
  const [agentId, setAgentId] = useState('')
  const [agentClients, setAgentClients] = useState<AgentClient[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCase, setSelectedCase] = useState<Case | null>(null)

  // Companion management
  const [selectingCompanion, setSelectingCompanion] = useState(false)
  const [showNewClientForm, setShowNewClientForm] = useState(false)
  const [newClientForm, setNewClientForm] = useState<NewClientForm>(DEFAULT_NEW_CLIENT)
  const [savingNewClient, setSavingNewClient] = useState(false)
  const [newClientError, setNewClientError] = useState('')
  const [addingExisting, setAddingExisting] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)

  // New Case creation
  const [showNewCase, setShowNewCase] = useState(false)
  const [newCaseLeadId, setNewCaseLeadId] = useState('')
  const [newCaseShowRegister, setNewCaseShowRegister] = useState(false)
  const [newCaseDateStart, setNewCaseDateStart] = useState('')
  const [newCaseDateEnd, setNewCaseDateEnd] = useState('')
  const [newCaseRegForm, setNewCaseRegForm] = useState<NewClientForm>(DEFAULT_NEW_CLIENT)
  const [creatingCase, setCreatingCase] = useState(false)
  const [newCaseError, setNewCaseError] = useState('')

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchCases = useCallback(async (aid: string) => {
    const { data } = await supabase
      .from('cases')
      .select(`
        id, case_number, status, travel_start_date, travel_end_date, created_at,
        case_members(
          id, is_lead,
          clients(id, client_number, name, nationality, gender, dietary_restriction, needs_muslim_friendly)
        ),
        quotes(id, quote_number, total_price, payment_due_date)
      `)
      .eq('agent_id', aid)
      .order('created_at', { ascending: false })

    const fetched = (data as unknown as Case[]) ?? []
    setCases(fetched)
    setSelectedCase((prev) => {
      if (!prev) return null
      return fetched.find((c) => c.id === prev.id) ?? null
    })
  }, [])

  const fetchClients = useCallback(async (aid: string) => {
    const { data } = await supabase
      .from('clients').select('id, name, nationality').eq('agent_id', aid).order('name')
    setAgentClients(data ?? [])
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return

      const { data: agentData } = await supabase
        .from('agents').select('id').eq('auth_user_id', userId).single()
      const aid = agentData?.id ?? ''
      setAgentId(aid)

      if (aid) {
        await Promise.all([fetchCases(aid), fetchClients(aid)])
      }
      setLoading(false)
    }
    load()
  }, [fetchCases, fetchClients])

  // ── New Case creation ──────────────────────────────────────────────────────

  async function handleCreateCase() {
    if (!agentId) return
    if (!newCaseLeadId && !newCaseShowRegister) {
      setNewCaseError('Please select or register a lead client.')
      return
    }
    if (newCaseShowRegister && !newCaseRegForm.name.trim()) {
      setNewCaseError('Client name is required.')
      return
    }
    if (newCaseDateEnd && newCaseDateStart && newCaseDateEnd <= newCaseDateStart) {
      setNewCaseError('End date must be after start date.')
      return
    }

    setCreatingCase(true)
    setNewCaseError('')
    try {
      let leadClientId = newCaseLeadId

      // Register new client if needed
      if (newCaseShowRegister) {
        const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true })
        const { data: newClient, error: clientErr } = await supabase
          .from('clients')
          .insert({
            client_number: `#CL-${String((count ?? 0) + 1).padStart(3, '0')}`,
            agent_id: agentId,
            ...newCaseRegForm,
          })
          .select('id, name, nationality').single()
        if (clientErr) throw clientErr
        leadClientId = newClient.id
        setAgentClients((prev) => [...prev, { id: newClient.id, name: newClient.name, nationality: newClient.nationality }])
      }

      // Create case
      const { count: caseCount } = await supabase.from('cases').select('*', { count: 'exact', head: true })
      const { data: caseData, error: caseErr } = await supabase
        .from('cases')
        .insert({
          case_number: `#C-${String((caseCount ?? 0) + 1).padStart(3, '0')}`,
          agent_id: agentId,
          status: 'payment_pending',
          travel_start_date: newCaseDateStart || null,
          travel_end_date: newCaseDateEnd || null,
        })
        .select('id').single()
      if (caseErr) throw caseErr

      // Add lead member
      await supabase.from('case_members').insert({
        case_id: caseData.id, client_id: leadClientId, is_lead: true,
      })

      await fetchCases(agentId)

      // Reset form and close
      setShowNewCase(false)
      setNewCaseLeadId('')
      setNewCaseShowRegister(false)
      setNewCaseDateStart('')
      setNewCaseDateEnd('')
      setNewCaseRegForm(DEFAULT_NEW_CLIENT)
    } catch (e: unknown) {
      setNewCaseError((e as { message?: string })?.message ?? 'Failed to create case.')
    } finally {
      setCreatingCase(false)
    }
  }

  // ── Companion actions ──────────────────────────────────────────────────────

  async function addExistingCompanion(clientId: string) {
    if (!selectedCase) return
    setAddingExisting(true)
    try {
      await supabase.from('case_members').insert({
        case_id: selectedCase.id, client_id: clientId, is_lead: false,
      })
      await fetchCases(agentId)
      setSelectingCompanion(false)
    } finally {
      setAddingExisting(false)
    }
  }

  async function removeCompanion(caseMemberId: string) {
    setRemovingMemberId(caseMemberId)
    try {
      await supabase.from('case_members').delete().eq('id', caseMemberId)
      await fetchCases(agentId)
    } finally {
      setRemovingMemberId(null)
    }
  }

  async function handleAddNewClient() {
    if (!newClientForm.name.trim()) { setNewClientError('Name is required.'); return }
    if (!agentId || !selectedCase) return
    setSavingNewClient(true)
    setNewClientError('')
    try {
      const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true })
      const { data: newClient, error: clientErr } = await supabase
        .from('clients')
        .insert({
          client_number: `#CL-${String((count ?? 0) + 1).padStart(3, '0')}`,
          agent_id: agentId,
          ...newClientForm,
        })
        .select('id').single()
      if (clientErr) throw clientErr

      await supabase.from('case_members').insert({
        case_id: selectedCase.id, client_id: newClient.id, is_lead: false,
      })
      setAgentClients((prev) => [...prev, { id: newClient.id, name: newClientForm.name, nationality: newClientForm.nationality }])
      await fetchCases(agentId)
      setNewClientForm(DEFAULT_NEW_CLIENT)
      setShowNewClientForm(false)
    } catch (e: unknown) {
      setNewClientError((e as { message?: string })?.message ?? 'Failed to register client.')
    } finally {
      setSavingNewClient(false)
    }
  }

  function openCase(c: Case) {
    setSelectedCase(c)
    setSelectingCompanion(false)
    setShowNewClientForm(false)
    setNewClientError('')
    setNewClientForm(DEFAULT_NEW_CLIENT)
    setShowNewCase(false)
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const lead = selectedCase?.case_members?.find((m) => m.is_lead)
  const companions = selectedCase?.case_members?.filter((m) => !m.is_lead) ?? []
  const existingMemberIds = new Set(selectedCase?.case_members?.map((m) => m.clients?.id) ?? [])
  const availableClients = agentClients.filter((c) => !existingMemberIds.has(c.id))
  const latestQuote = selectedCase?.quotes?.[0] ?? null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Cases List ── */}
      <div className={`${selectedCase ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-96 shrink-0 border-r border-gray-100 bg-gray-50`}>
        <div className="h-14 flex items-center px-5 border-b border-gray-100 bg-white">
          <h1 className="text-sm font-semibold text-gray-900">Cases</h1>
          {!loading && <span className="ml-2 text-xs text-gray-400">{cases.length}</span>}
          <button
            onClick={() => { setShowNewCase(true); setSelectedCase(null) }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Case
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-12">Loading...</p>
          ) : cases.length === 0 ? (
            <div className="text-center py-16 px-6">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">No cases yet.</p>
              <p className="text-xs text-gray-300 mt-1">Click "New Case" to get started.</p>
            </div>
          ) : (
            cases.map((c) => {
              const caseLead = c.case_members?.find((m) => m.is_lead)
              const companionCount = c.case_members?.filter((m) => !m.is_lead).length ?? 0
              const quote = c.quotes?.[0]
              const isSelected = selectedCase?.id === c.id

              return (
                <button
                  key={c.id}
                  onClick={() => openCase(c)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-[#0f4c35]/5 border-[#0f4c35]/20'
                      : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] font-mono text-gray-400">{c.case_number}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${STATUS_STYLES[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1.5">
                    {caseLead?.clients?.name ?? '—'}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    {(c.travel_start_date || c.travel_end_date) && (
                      <span>{c.travel_start_date ?? '—'} ~ {c.travel_end_date ?? '—'}</span>
                    )}
                    {companionCount > 0 && (
                      <span>+{companionCount} companion{companionCount > 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {quote && (
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100">
                      <span className="text-[10px] font-mono text-gray-400">{quote.quote_number}</span>
                      <span className="text-xs font-medium text-gray-700">
                        ₩{quote.total_price?.toLocaleString('ko-KR')}
                      </span>
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── New Case Panel ── */}
      {showNewCase && !selectedCase && (
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-lg mx-auto px-6 py-8 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">New Case</h2>
              <p className="text-xs text-gray-400 mt-1">Select a lead client to open a case. Companions can be added later.</p>
            </div>

            {/* Lead Client Selection */}
            <section className="bg-gray-50 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead Client</h3>

              {!newCaseShowRegister ? (
                <div className="space-y-3">
                  <select
                    value={newCaseLeadId}
                    onChange={(e) => setNewCaseLeadId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white"
                  >
                    <option value="">Select existing client</option>
                    {agentClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.nationality ? ` (${c.nationality})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => { setNewCaseShowRegister(true); setNewCaseLeadId('') }}
                    className="text-xs font-medium text-[#0f4c35] hover:underline"
                  >
                    + Register new client
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Name *</label>
                      <input type="text" value={newCaseRegForm.name}
                        onChange={(e) => setNewCaseRegForm((p) => ({ ...p, name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nationality</label>
                      <input type="text" value={newCaseRegForm.nationality}
                        onChange={(e) => setNewCaseRegForm((p) => ({ ...p, nationality: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Gender</label>
                      <div className="flex gap-3 pt-1">
                        {(['male', 'female'] as const).map((g) => (
                          <label key={g} className="flex items-center gap-1 cursor-pointer text-sm">
                            <input type="radio" checked={newCaseRegForm.gender === g}
                              onChange={() => setNewCaseRegForm((p) => ({ ...p, gender: g }))}
                              className="accent-[#0f4c35]" />
                            <span className="capitalize">{g}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                      <input type="date" value={newCaseRegForm.date_of_birth}
                        onChange={(e) => setNewCaseRegForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Phone</label>
                      <input type="text" value={newCaseRegForm.phone}
                        onChange={(e) => setNewCaseRegForm((p) => ({ ...p, phone: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Email</label>
                      <input type="email" value={newCaseRegForm.email}
                        onChange={(e) => setNewCaseRegForm((p) => ({ ...p, email: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dietary Restriction</label>
                    <select value={newCaseRegForm.dietary_restriction}
                      onChange={(e) => setNewCaseRegForm((p) => ({ ...p, dietary_restriction: e.target.value as NewClientForm['dietary_restriction'] }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                      {DIETARY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newCaseRegForm.needs_muslim_friendly}
                      onChange={(e) => setNewCaseRegForm((p) => ({ ...p, needs_muslim_friendly: e.target.checked }))}
                      className="accent-[#0f4c35]" />
                    <span className="text-xs text-gray-600">Needs Muslim Friendly services</span>
                  </label>
                  <button
                    onClick={() => { setNewCaseShowRegister(false); setNewCaseRegForm(DEFAULT_NEW_CLIENT) }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    ← Back to existing clients
                  </button>
                </div>
              )}
            </section>

            {/* Travel Dates */}
            <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Travel Dates (Optional)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input type="date" value={newCaseDateStart}
                    onChange={(e) => setNewCaseDateStart(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input type="date" value={newCaseDateEnd}
                    onChange={(e) => setNewCaseDateEnd(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35]" />
                </div>
              </div>
            </section>

            {newCaseError && <p className="text-xs text-red-500 px-1">{newCaseError}</p>}

            <div className="flex items-center gap-3 pb-10">
              <button
                onClick={() => { setShowNewCase(false); setNewCaseError('') }}
                className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCase}
                disabled={creatingCase}
                className="flex-1 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors"
              >
                {creatingCase ? 'Creating...' : 'Create Case'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Panel ── */}
      {selectedCase ? (
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">

            {/* Header */}
            <div className="flex items-start gap-3">
              <button
                onClick={() => setSelectedCase(null)}
                className="md:hidden mt-0.5 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-base font-semibold text-gray-900">{selectedCase.case_number}</h2>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${STATUS_STYLES[selectedCase.status]}`}>
                    {STATUS_LABELS[selectedCase.status]}
                  </span>
                </div>
                {(selectedCase.travel_start_date || selectedCase.travel_end_date) && (
                  <p className="text-xs text-gray-400 mt-1">
                    Travel: {selectedCase.travel_start_date ?? '—'} ~ {selectedCase.travel_end_date ?? '—'}
                  </p>
                )}
              </div>
            </div>

            {/* Lead Client */}
            {lead && (
              <section className="bg-gray-50 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead Client</h3>
                  <span className="text-[10px] text-gray-400 font-mono">{lead.clients?.client_number}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{lead.clients?.name}</span>
                  {lead.clients?.nationality && (
                    <><span className="text-gray-300">·</span><span className="text-xs text-gray-500">{lead.clients.nationality}</span></>
                  )}
                  {lead.clients?.gender && (
                    <><span className="text-gray-300">·</span><span className="text-xs text-gray-500 capitalize">{lead.clients.gender}</span></>
                  )}
                  {lead.clients?.needs_muslim_friendly && (
                    <><span className="text-gray-300">·</span><span className="text-xs text-emerald-600">Muslim Friendly</span></>
                  )}
                </div>
              </section>
            )}

            {/* Companions */}
            <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Companions
                  {companions.length > 0 && (
                    <span className="ml-1 text-gray-400 normal-case font-normal">({companions.length})</span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setSelectingCompanion(true); setShowNewClientForm(false) }}
                    className="text-xs font-medium text-[#0f4c35] hover:underline"
                  >
                    + Add existing
                  </button>
                  <span className="text-gray-200">|</span>
                  <button
                    onClick={() => { setShowNewClientForm(true); setSelectingCompanion(false) }}
                    className="text-xs font-medium text-[#0f4c35] hover:underline"
                  >
                    + Register new
                  </button>
                </div>
              </div>

              {selectingCompanion && (
                <div className="flex items-center gap-2">
                  <select
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) addExistingCompanion(e.target.value) }}
                    disabled={addingExisting}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#0f4c35] bg-white"
                  >
                    <option value="" disabled>Select a client</option>
                    {availableClients.length === 0 ? (
                      <option disabled>No other clients available</option>
                    ) : availableClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.nationality ? ` (${c.nationality})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSelectingCompanion(false)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {showNewClientForm && (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
                  <p className="text-xs font-medium text-gray-600">Register new client</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Name *</label>
                      <input type="text" value={newClientForm.name}
                        onChange={(e) => setNewClientForm((p) => ({ ...p, name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nationality</label>
                      <input type="text" value={newClientForm.nationality}
                        onChange={(e) => setNewClientForm((p) => ({ ...p, nationality: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Gender</label>
                      <div className="flex gap-3 pt-1">
                        {(['male', 'female'] as const).map((g) => (
                          <label key={g} className="flex items-center gap-1 cursor-pointer text-sm">
                            <input type="radio" checked={newClientForm.gender === g}
                              onChange={() => setNewClientForm((p) => ({ ...p, gender: g }))}
                              className="accent-[#0f4c35]" />
                            <span className="capitalize">{g}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                      <input type="date" value={newClientForm.date_of_birth}
                        onChange={(e) => setNewClientForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Phone</label>
                      <input type="text" value={newClientForm.phone}
                        onChange={(e) => setNewClientForm((p) => ({ ...p, phone: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Email</label>
                      <input type="email" value={newClientForm.email}
                        onChange={(e) => setNewClientForm((p) => ({ ...p, email: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dietary Restriction</label>
                    <select value={newClientForm.dietary_restriction}
                      onChange={(e) => setNewClientForm((p) => ({ ...p, dietary_restriction: e.target.value as NewClientForm['dietary_restriction'] }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                      {DIETARY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Special Requests</label>
                    <textarea value={newClientForm.special_requests}
                      onChange={(e) => setNewClientForm((p) => ({ ...p, special_requests: e.target.value }))}
                      rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] resize-none" />
                  </div>
                  {newClientError && <p className="text-xs text-red-500">{newClientError}</p>}
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowNewClientForm(false); setNewClientError('') }}
                      className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    <button onClick={handleAddNewClient} disabled={savingNewClient}
                      className="px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                      {savingNewClient ? 'Saving...' : 'Add Companion'}
                    </button>
                  </div>
                </div>
              )}

              {companions.length === 0 && !selectingCompanion && !showNewClientForm ? (
                <p className="text-xs text-gray-400">No companions added yet.</p>
              ) : (
                <div className="space-y-2">
                  {companions.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-xl border border-gray-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-800">{m.clients?.name}</span>
                        {m.clients?.nationality && (
                          <span className="text-xs text-gray-400">{m.clients.nationality}</span>
                        )}
                        {m.clients?.needs_muslim_friendly && (
                          <span className="text-xs text-emerald-600">Muslim Friendly</span>
                        )}
                      </div>
                      <button onClick={() => removeCompanion(m.id)} disabled={removingMemberId === m.id}
                        className="text-gray-300 hover:text-red-400 text-lg leading-none transition-colors disabled:opacity-40 ml-2">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Quote */}
            {latestQuote && (
              <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quote</h3>
                  <span className="text-[10px] font-mono text-gray-400">{latestQuote.quote_number}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Amount</span>
                  <span className="text-sm font-semibold text-gray-900">
                    ₩{latestQuote.total_price?.toLocaleString('ko-KR')}
                  </span>
                </div>
                {latestQuote.payment_due_date && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Payment Due</span>
                    <span className={`text-sm ${
                      selectedCase.status === 'payment_pending' && new Date(latestQuote.payment_due_date) < new Date()
                        ? 'text-red-500 font-medium'
                        : 'text-gray-700'
                    }`}>
                      {latestQuote.payment_due_date}
                    </span>
                  </div>
                )}
              </section>
            )}

          </div>
        </div>
      ) : !showNewCase ? (
        <div className="hidden md:flex flex-1 items-center justify-center bg-white">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">Select a case or create a new one</p>
          </div>
        </div>
      ) : null}

    </div>
  )
}
