'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { notifyAssignedAdmin } from '@/lib/notifications'
import { logAsCurrentUser } from '@/lib/audit'
import {
  createDocument,
  addDocumentGroup,
  addDocumentItem,
  addDocumentGroupMember,
} from '@/lib/documents'
import { createCaseContract } from '@/lib/caseContracts'
import { appliesMargin, isHotelItem, nightsBetween, variantPriceUsd, variantPriceKrw } from '@/lib/pricing'

// ── Types ─────────────────────────────────────────────────────────────────────

type CartItem = { productId: string; variantId: string }
type CartGroup = { id: string; name: string; memberCount: number; items: CartItem[] }
type CartDraft = { clientId: string; dateStart: string; dateEnd: string; groups: CartGroup[] }

type Client = {
  id: string
  client_number: string
  name: string
  nationality: string
  gender: string
  needs_muslim_friendly: boolean
  dietary_restriction: string
}

type Variant = {
  id: string
  variant_label: string | null
  base_price: number
  price_currency: 'KRW' | 'USD'
  sort_order: number
}

type Product = {
  id: string
  name: string
  product_categories: { name: string } | null
  product_subcategories: { name: string } | null
  product_variants: Variant[]
}

type NewClientForm = {
  name: string; nationality: string; gender: 'male' | 'female'
  date_of_birth: string; phone: string; email: string
  needs_muslim_friendly: boolean
  dietary_restriction: 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'
  special_requests: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUP_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-700',
  'bg-emerald-50 border-emerald-200 text-emerald-700',
  'bg-orange-50 border-orange-200 text-orange-700',
  'bg-purple-50 border-purple-200 text-purple-700',
]

const DIETARY_LABELS: Record<string, string> = {
  halal_certified: 'Halal Certified', halal_friendly: 'Halal Friendly',
  muslim_friendly: 'Muslim Friendly', pork_free: 'Pork Free', none: 'None',
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
  phone: '', email: '', needs_muslim_friendly: false,
  dietary_restriction: 'none', special_requests: '',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuoteReviewPage() {
  const router = useRouter()

  // Cart + fetched data
  const [cart, setCart] = useState<CartDraft | null>(null)
  const [lead, setLead] = useState<Client | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [agentClients, setAgentClients] = useState<Client[]>([])
  const [agentId, setAgentId] = useState('')
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [companyMargin, setCompanyMargin] = useState(0.5)
  const [agentMargin, setAgentMargin] = useState(0.15)
  const [loading, setLoading] = useState(true)

  // Companions
  const [companions, setCompanions] = useState<Client[]>([])
  const [selectingCompanion, setSelectingCompanion] = useState(false)
  const [showNewClientForm, setShowNewClientForm] = useState(false)
  const [newClientForm, setNewClientForm] = useState<NewClientForm>(DEFAULT_NEW_CLIENT)
  const [savingNewClient, setSavingNewClient] = useState(false)
  const [newClientError, setNewClientError] = useState('')

  // Group assignments: groupId → clientId[]
  const [groupAssignments, setGroupAssignments] = useState<Record<string, string[]>>({})

  // Submit
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const raw = localStorage.getItem('agent-cart')
    if (!raw) { router.replace('/agent/home'); return }
    const draft: CartDraft = JSON.parse(raw)
    setCart(draft)

    const allProductIds = draft.groups.flatMap((g) => g.items.map(it => it.productId))

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return

      const [leadRes, productsRes, rateRes, companyRateRes, agentRes] = await Promise.all([
        supabase.from('clients').select('id, client_number, name, nationality, gender, needs_muslim_friendly, dietary_restriction').eq('id', draft.clientId).single(),
        allProductIds.length
          ? supabase.from('products').select('id, name, product_categories(name), product_subcategories(name), product_variants(id, variant_label, base_price, price_currency, sort_order)').in('id', allProductIds)
          : Promise.resolve({ data: [] }),
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
        supabase.from('system_settings').select('value').eq('key', 'company_margin_rate').single(),
        supabase.from('agents').select('id, margin_rate').eq('auth_user_id', userId).single(),
      ])

      setLead(leadRes.data)
      setProducts((productsRes.data as unknown as Product[]) ?? [])
      const rate = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (rate) setExchangeRate(rate)

      const cm = (companyRateRes.data?.value as { rate?: number } | null)?.rate
      if (typeof cm === 'number') setCompanyMargin(cm)

      const am = (agentRes.data as { margin_rate?: number } | null)?.margin_rate
      if (typeof am === 'number') setAgentMargin(am)

      const aid = agentRes.data?.id ?? ''
      setAgentId(aid)

      if (aid) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, client_number, name, nationality, gender, needs_muslim_friendly, dietary_restriction')
          .eq('agent_id', aid)
          .neq('id', draft.clientId)
          .order('name')
        setAgentClients(clientsData ?? [])
      }

      setLoading(false)
    }
    load()
  }, [router])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const marginMult = (1 + companyMargin) * (1 + agentMargin)
  const nights = nightsBetween(cart?.dateStart, cart?.dateEnd)

  function findVariant(productId: string, variantId: string): { product: Product; variant: Variant } | null {
    const p = products.find(x => x.id === productId)
    const v = p?.product_variants?.find(x => x.id === variantId)
    if (!p || !v) return null
    return { product: p, variant: v }
  }

  function isHotel(item: CartItem): boolean {
    const found = findVariant(item.productId, item.variantId)
    if (!found) return false
    return isHotelItem(found.product.product_categories?.name, found.product.product_subcategories?.name)
  }

  // Per-unit USD (per person, or per night for hotels).
  function itemUsd(item: CartItem): number {
    const found = findVariant(item.productId, item.variantId)
    if (!found) return 0
    return variantPriceUsd({
      basePrice: found.variant.base_price,
      priceCurrency: found.variant.price_currency,
      exchangeRate, marginMult,
      applyMargin: appliesMargin(found.product.product_categories?.name, found.product.product_subcategories?.name),
    })
  }

  // Per-line multiplier — nights for hotels, memberCount otherwise.
  function itemMultiplier(item: CartItem, group: CartGroup): number {
    return isHotel(item) ? nights : group.memberCount
  }

  function fmtUSD(n: number): string {
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function groupSubtotalUSD(group: CartGroup): number {
    return group.items.reduce((sum, it) => sum + itemUsd(it) * itemMultiplier(it, group), 0)
  }

  const totalUSD = cart?.groups.reduce((s, g) => s + groupSubtotalUSD(g), 0) ?? 0

  const allCaseMembers = lead ? [lead, ...companions] : companions
  const unassignedMembers = allCaseMembers.filter((c) =>
    !Object.values(groupAssignments).flat().includes(c.id)
  )

  // ── Companion management ───────────────────────────────────────────────────

  function addExistingCompanion(client: Client) {
    if (companions.find((c) => c.id === client.id)) return
    setCompanions((prev) => [...prev, client])
    setSelectingCompanion(false)
  }

  function removeCompanion(clientId: string) {
    setCompanions((prev) => prev.filter((c) => c.id !== clientId))
    setGroupAssignments((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((gid) => {
        next[gid] = next[gid].filter((id) => id !== clientId)
      })
      return next
    })
  }

  async function handleAddNewClient() {
    const f = newClientForm
    const missing: string[] = []
    if (!f.name.trim()) missing.push('Name')
    if (!f.nationality.trim()) missing.push('Nationality')
    if (!f.gender) missing.push('Gender')
    if (!f.date_of_birth) missing.push('Date of Birth')
    if (!f.phone.trim()) missing.push('Phone')
    if (!f.email.trim()) missing.push('Email')
    if (missing.length > 0) { setNewClientError(`Required: ${missing.join(', ')}`); return }
    if (!agentId) return
    setSavingNewClient(true)
    setNewClientError('')
    try {
      const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true })
      const { data, error: err } = await supabase
        .from('clients')
        .insert({
          client_number: `#CL-${String((count ?? 0) + 1).padStart(3, '0')}`,
          agent_id: agentId,
          name: f.name.trim(),
          nationality: f.nationality.trim(),
          gender: f.gender,
          date_of_birth: f.date_of_birth,
          phone: f.phone.trim(),
          email: f.email.trim(),
          needs_muslim_friendly: f.needs_muslim_friendly,
          dietary_restriction: f.dietary_restriction,
        })
        .select('id, client_number, name, nationality, gender, needs_muslim_friendly, dietary_restriction')
        .single()
      if (err) throw err
      setCompanions((prev) => [...prev, data])
      setAgentClients((prev) => [...prev, data])
      setNewClientForm(DEFAULT_NEW_CLIENT)
      setShowNewClientForm(false)
    } catch (e: unknown) {
      setNewClientError((e as { message?: string })?.message ?? 'Failed to register client.')
    } finally {
      setSavingNewClient(false)
    }
  }

  // ── Group assignment ───────────────────────────────────────────────────────

  function assignToGroup(clientId: string, groupId: string) {
    setGroupAssignments((prev) => {
      const next: Record<string, string[]> = {}
      Object.keys(prev).forEach((gid) => {
        next[gid] = prev[gid].filter((id) => id !== clientId)
      })
      next[groupId] = [...(next[groupId] ?? []), clientId]
      return next
    })
  }

  function removeFromGroup(clientId: string, groupId: string) {
    setGroupAssignments((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] ?? []).filter((id) => id !== clientId),
    }))
  }

  // ── Send Quote ─────────────────────────────────────────────────────────────

  async function handleSendQuote() {
    if (!cart || !lead) return
    setSending(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) throw new Error('Not authenticated')

      const { data: agentData } = await supabase
        .from('agents').select('id, name, country, margin_rate').eq('auth_user_id', session.user.id).single()
      if (!agentData) throw new Error('Agent not found')

      const { data: companyRateSetting } = await supabase
        .from('system_settings').select('value').eq('key', 'company_margin_rate').single()
      const companyMargin = (companyRateSetting?.value as { rate?: number } | null)?.rate ?? 0.2
      const agentMargin = agentData.margin_rate ?? 0.15

      // Create case
      const { count: caseCount } = await supabase.from('cases').select('*', { count: 'exact', head: true })
      const { data: caseData, error: caseErr } = await supabase
        .from('cases')
        .insert({
          case_number: `#C-${String((caseCount ?? 0) + 1).padStart(3, '0')}`,
          agent_id: agentData.id,
          // New SOP flow: case enters at awaiting_contract right after quote is
          // sent. Detailed client info / trip info is collected in parallel
          // during the contract + deposit phase, not before.
          status: 'awaiting_contract',
          travel_start_date: cart.dateStart || null,
          travel_end_date: cart.dateEnd || null,
        })
        .select('id').single()
      if (caseErr) throw caseErr

      // Create case members (lead + companions)
      const memberInserts = [
        { case_id: caseData.id, client_id: lead.id, is_lead: true },
        ...companions.map((c) => ({ case_id: caseData.id, client_id: c.id, is_lead: false })),
      ]
      const { data: caseMembersData } = await supabase
        .from('case_members').insert(memberInserts).select('id, client_id')

      // Build client_id → case_member_id map
      const memberIdMap: Record<string, string> = {}
      caseMembersData?.forEach((m) => { memberIdMap[m.client_id] = m.id })

      // Create quote — totalKRW respects per-category margin rule (Subpackage
      // and non-Spa Wellness pass through at cost; everything else gets margin).
      const totalKRW = cart.groups.reduce((sum, g) =>
        sum + g.items.reduce((gs, it) => {
          const found = findVariant(it.productId, it.variantId)
          if (!found) return gs
          const krwPer = variantPriceKrw({
            basePrice: found.variant.base_price,
            priceCurrency: found.variant.price_currency,
            exchangeRate, marginMult,
            applyMargin: appliesMargin(found.product.product_categories?.name, found.product.product_subcategories?.name),
          })
          const mult = isHotelItem(found.product.product_categories?.name, found.product.product_subcategories?.name)
            ? nights
            : g.memberCount
          return gs + krwPer * mult
        }, 0), 0)

      const paymentDue = new Date(); paymentDue.setDate(paymentDue.getDate() + 7)

      // Create the quotation document (replaces legacy quotes table)
      const quotation = await createDocument({
        caseId: caseData.id,
        type: 'quotation',
        fromParty: 'admin',
        toParty: 'client',
        totalPrice: totalKRW,
        companyMarginRate: companyMargin,
        agentMarginRate: agentMargin,
        paymentDueDate: paymentDue.toISOString().split('T')[0],
      })

      // Create document groups, items, and group members
      for (let i = 0; i < cart.groups.length; i++) {
        const group = cart.groups[i]
        if (group.items.length === 0) continue

        const dg = await addDocumentGroup(quotation.id, group.name, i, group.memberCount)

        // Items — one per cart variant, with margin per category rule.
        // Hotels multiply by nights (room × nights); everything else
        // multiplies by group memberCount (per-person × people).
        for (const it of group.items) {
          const found = findVariant(it.productId, it.variantId)
          if (!found) continue
          const apply = appliesMargin(found.product.product_categories?.name, found.product.product_subcategories?.name)
          const isHotelLine = isHotelItem(found.product.product_categories?.name, found.product.product_subcategories?.name)
          const multiplier = isHotelLine ? nights : group.memberCount
          const baseUnitKrw = found.variant.price_currency === 'USD'
            ? Math.round(found.variant.base_price * exchangeRate)
            : found.variant.base_price
          const finalUnitKrw = variantPriceKrw({
            basePrice: found.variant.base_price,
            priceCurrency: found.variant.price_currency,
            exchangeRate, marginMult,
            applyMargin: apply,
          })
          // Bake "· N nights" into the snapshot label so customer-facing
          // QuoteDocument and admin SelectedProductsSection render the
          // multiplier without having to re-derive nights from the case.
          const labelBase = found.variant.variant_label ?? null
          const labelWithNights = isHotelLine
            ? (labelBase ? `${labelBase} · ${nights} ${nights === 1 ? 'night' : 'nights'}` : `${nights} ${nights === 1 ? 'night' : 'nights'}`)
            : labelBase
          await addDocumentItem({
            documentId: quotation.id,
            groupId: dg.id,
            productId: it.productId,
            productNameSnapshot: found.product.name,
            basePrice: baseUnitKrw * multiplier,
            finalPrice: finalUnitKrw * multiplier,
            quantity: multiplier,
            variantId: it.variantId,
            variantLabelSnapshot: labelWithNights,
          })
        }

        // Group members
        const assignedClientIds = groupAssignments[group.id] ?? []
        for (const clientId of assignedClientIds) {
          const caseMemberId = memberIdMap[clientId]
          if (caseMemberId) {
            await addDocumentGroupMember(dg.id, caseMemberId)
          }
        }
      }

      localStorage.removeItem('agent-cart')
      const caseNumber = `#C-${String((caseCount ?? 0) + 1).padStart(3, '0')}`
      await logAsCurrentUser('case.created', { type: 'case', id: caseData.id, label: caseNumber }, { total_krw: totalKRW })

      // Auto-generate the 3-party contract immediately. Case enters
      // awaiting_contract right away — there's no in-between step where the
      // agent would want to delay generation, so don't make them click
      // "Generate Contract" on the case page. If creation fails, the case
      // page will show the manual generate button as a fallback.
      try {
        const { data: depositSetting } = await supabase
          .from('system_settings').select('value').eq('key', 'deposit_percentage').maybeSingle()
        const depositPct = String((depositSetting?.value as { percentage?: number } | null)?.percentage ?? 50)
        const totalDisplay = `₩${totalKRW.toLocaleString('ko-KR')}`
        await createCaseContract(caseData.id, 'three_party', {
          AGENT_NAME: agentData.name,
          AGENT_COUNTRY: (agentData as { country: string | null }).country ?? '',
          CLIENT_NAME: lead.name,
          CASE_NUMBER: caseNumber,
          QUOTE_NUMBER: quotation.document_number ?? '',
          TOTAL_AMOUNT: totalDisplay,
          DEPOSIT_PERCENTAGE: depositPct,
        })
      } catch (e: unknown) {
        // Non-fatal — agent can still hit "Generate Contract" on the case page.
        console.warn('[case.create] auto-create 3-party contract failed', (e as { message?: string })?.message)
      }

      // SOP: admin should know a new case exists. Admin will counter-sign the
      // 3-party contract after agent + client sign — that triggers the move
      // to awaiting_deposit.
      await notifyAssignedAdmin(
        { agent_id: agentData.id },
        `${caseNumber} new case from ${agentData.name} — awaiting 3-party contract`,
        `/admin/cases/${caseData.id}`
      )
      router.push(`/agent/cases/${caseData.id}`)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to create quote.')
    } finally {
      setSending(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex h-full items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div>
  }
  if (!cart || !lead) return null

  const availableToAdd = agentClients.filter((c) => !companions.find((cp) => cp.id === c.id))

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">

        {/* Header */}
        <div>
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-4 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            Back to Home
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Quote Review</h1>
        </div>

        {/* Lead Client */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Lead Client</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{lead.name}</span>
            {lead.nationality && <><span className="text-xs text-gray-300">·</span><span className="text-xs text-gray-500">{lead.nationality}</span></>}
            {lead.gender && <><span className="text-xs text-gray-300">·</span><span className="text-xs text-gray-500 capitalize">{lead.gender}</span></>}
            {lead.needs_muslim_friendly && <><span className="text-xs text-gray-300">·</span><span className="text-xs text-emerald-600">Muslim Friendly</span></>}
          </div>
          {(cart.dateStart || cart.dateEnd) && (
            <p className="text-xs text-gray-400">Travel: {cart.dateStart || '—'} ~ {cart.dateEnd || '—'}</p>
          )}
        </section>

        {/* Companions */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Companions</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectingCompanion(true); setShowNewClientForm(false) }}
                className="text-xs font-medium text-[#0f4c35] hover:underline"
              >+ Add existing</button>
              <span className="text-gray-200">|</span>
              <button
                onClick={() => { setShowNewClientForm(true); setSelectingCompanion(false) }}
                className="text-xs font-medium text-[#0f4c35] hover:underline"
              >+ Register new</button>
            </div>
          </div>

          {/* Existing client selector */}
          {selectingCompanion && (
            <div className="flex items-center gap-2">
              <select
                defaultValue=""
                onChange={(e) => {
                  const client = agentClients.find((c) => c.id === e.target.value)
                  if (client) addExistingCompanion(client)
                }}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#0f4c35] bg-white"
              >
                <option value="" disabled>Select a client</option>
                {availableToAdd.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.nationality ? ` (${c.nationality})` : ''}</option>
                ))}
              </select>
              <button onClick={() => setSelectingCompanion(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          )}

          {/* New client form */}
          {showNewClientForm && (
            <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
              <p className="text-xs font-medium text-gray-600">Register new client</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Name *</label>
                  <input type="text" value={newClientForm.name} onChange={(e) => setNewClientForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nationality</label>
                  <input type="text" value={newClientForm.nationality} onChange={(e) => setNewClientForm((p) => ({ ...p, nationality: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Gender</label>
                  <div className="flex gap-3 pt-1">
                    {(['male', 'female'] as const).map((g) => (
                      <label key={g} className="flex items-center gap-1 cursor-pointer text-sm">
                        <input type="radio" checked={newClientForm.gender === g} onChange={() => setNewClientForm((p) => ({ ...p, gender: g }))} className="accent-[#0f4c35]" />
                        <span className="capitalize">{g}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                  <input type="date" value={newClientForm.date_of_birth} onChange={(e) => setNewClientForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input type="text" value={newClientForm.phone} onChange={(e) => setNewClientForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
                  <input type="email" value={newClientForm.email} onChange={(e) => setNewClientForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Muslim?</label>
                <div className="flex gap-4">
                  {([true, false] as const).map(v => (
                    <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={newClientForm.needs_muslim_friendly === v}
                        onChange={() => setNewClientForm(p => ({
                          ...p,
                          needs_muslim_friendly: v,
                          ...(v ? {} : { dietary_restriction: 'none' as NewClientForm['dietary_restriction'] }),
                        }))}
                        className="accent-[#0f4c35]" />
                      <span className="text-sm text-gray-700">{v ? 'Yes' : 'No'}</span>
                    </label>
                  ))}
                </div>
              </div>
              {newClientForm.needs_muslim_friendly && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dietary Restriction</label>
                  <select value={newClientForm.dietary_restriction} onChange={(e) => setNewClientForm((p) => ({ ...p, dietary_restriction: e.target.value as NewClientForm['dietary_restriction'] }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white">
                    {DIETARY_OPTIONS.filter(o => o.value !== 'none').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Special Requests</label>
                <textarea value={newClientForm.special_requests} onChange={(e) => setNewClientForm((p) => ({ ...p, special_requests: e.target.value }))}
                  rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] resize-none" />
              </div>
              {newClientError && <p className="text-xs text-red-500">{newClientError}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowNewClientForm(false); setNewClientError('') }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                <button onClick={handleAddNewClient} disabled={savingNewClient}
                  className="px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                  {savingNewClient ? 'Saving...' : 'Add Companion'}
                </button>
              </div>
            </div>
          )}

          {/* Companions list */}
          {companions.length === 0 && !selectingCompanion && !showNewClientForm ? (
            <p className="text-xs text-gray-400">No companions added. You can add them now or after payment.</p>
          ) : (
            <div className="space-y-2">
              {companions.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-800">{c.name}</span>
                    {c.nationality && <span className="text-xs text-gray-400">{c.nationality}</span>}
                    {c.needs_muslim_friendly && <span className="text-xs text-emerald-600">Muslim Friendly</span>}
                    {c.dietary_restriction && c.dietary_restriction !== 'none' && (
                      <span className="text-xs text-amber-600">{DIETARY_LABELS[c.dietary_restriction]}</span>
                    )}
                  </div>
                  <button onClick={() => removeCompanion(c.id)} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Group Assignment */}
        {cart.groups.filter((g) => g.items.length > 0).length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Group Assignment</h2>
              {unassignedMembers.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">{unassignedMembers.length} member{unassignedMembers.length > 1 ? 's' : ''} not yet assigned</p>
              )}
            </div>

            {cart.groups.filter((g) => g.items.length > 0).map((group, idx) => {
              const assigned = (groupAssignments[group.id] ?? [])
                .map((id) => allCaseMembers.find((c) => c.id === id))
                .filter(Boolean) as Client[]
              const unassigned = allCaseMembers.filter((c) => !Object.values(groupAssignments).flat().includes(c.id))

              return (
                <div key={group.id}>
                  <div className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border mb-2 ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}>
                    {group.name}
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-[32px]">
                    {assigned.map((c) => (
                      <div key={c.id} className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-lg text-xs text-gray-700">
                        <span>{c.name}</span>
                        {c.id === lead?.id && <span className="text-gray-400">(Lead)</span>}
                        <button onClick={() => removeFromGroup(c.id, group.id)} className="text-gray-400 hover:text-gray-600 ml-0.5">×</button>
                      </div>
                    ))}
                    {unassigned.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => { if (e.target.value) assignToGroup(e.target.value, group.id) }}
                        className="text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-500 cursor-pointer"
                      >
                        <option value="">+ Assign member</option>
                        {unassigned.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}{c.id === lead?.id ? ' (Lead)' : ''}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {/* Quote Details */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
          <h2 className="text-sm font-semibold text-gray-900">Quote Details</h2>

          {cart.groups.filter((g) => g.items.length > 0).map((group, idx) => (
            <div key={group.id}>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border mb-3 ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}>
                {group.name}
                <span className="opacity-60">({group.memberCount} {group.memberCount === 1 ? 'person' : 'people'})</span>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5 px-1">
                <span>Product</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Amount</span>
              </div>

              <div className="space-y-1.5">
                {group.items.map((it, itIdx) => {
                  const found = findVariant(it.productId, it.variantId)
                  if (!found) return null
                  const hotel = isHotel(it)
                  const unitUSD = itemUsd(it)
                  const mult = itemMultiplier(it, group)
                  const totalItemUSD = unitUSD * mult
                  return (
                    <div key={`${it.productId}:${it.variantId}:${itIdx}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center py-2 px-3 bg-gray-50 rounded-xl">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{found.product.name}</p>
                        {found.variant.variant_label && (
                          <p className="text-[10px] text-gray-500 truncate">{found.variant.variant_label}</p>
                        )}
                      </div>
                      <span className="text-sm text-gray-600 tabular-nums text-right">{fmtUSD(unitUSD)}</span>
                      <span className="text-xs text-gray-400 text-center whitespace-nowrap">
                        {hotel ? `× ${mult} ${mult === 1 ? 'night' : 'nights'}` : `×${mult}`}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums text-right">{fmtUSD(totalItemUSD)}</span>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-gray-100">
                <span className="text-xs text-gray-400">Subtotal</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmtUSD(groupSubtotalUSD(group))}</span>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between pt-3 border-t-2 border-gray-200">
            <span className="text-sm font-bold text-gray-900">Total</span>
            <span className="text-lg font-bold text-gray-900 tabular-nums">{fmtUSD(totalUSD)}</span>
          </div>
          <p className="text-xs text-gray-400">Payment due within 7 days of quote creation.</p>
        </section>

        {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-10">
          <button onClick={() => { sessionStorage.setItem('agent-cart-restore', '1'); router.back() }}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
            Edit
          </button>
          <button onClick={handleSendQuote} disabled={sending}
            className="px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40">
            {sending ? 'Creating...' : 'Send Quote'}
          </button>
        </div>

      </div>
    </div>
  )
}
