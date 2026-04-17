'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type CartGroup = {
  id: string
  name: string
  memberCount: number
  productIds: string[]
}

type CartDraft = {
  clientId: string
  dateStart: string
  dateEnd: string
  groups: CartGroup[]
}

type Client = {
  id: string
  client_number: string
  name: string
  nationality: string
  gender: string
  needs_muslim_friendly: boolean
  dietary_restriction: string
}

type Product = {
  id: string
  name: string
  base_price: number
  price_currency: 'KRW' | 'USD'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUP_COLORS = ['bg-blue-50 border-blue-200 text-blue-700', 'bg-emerald-50 border-emerald-200 text-emerald-700', 'bg-orange-50 border-orange-200 text-orange-700', 'bg-purple-50 border-purple-200 text-purple-700']

const DIETARY_LABELS: Record<string, string> = {
  halal_certified: 'Halal Certified',
  halal_friendly: 'Halal Friendly',
  muslim_friendly: 'Muslim Friendly',
  pork_free: 'Pork Free',
  none: 'None',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuoteReviewPage() {
  const router = useRouter()

  const [cart, setCart] = useState<CartDraft | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const raw = localStorage.getItem('agent-cart')
    if (!raw) { router.replace('/agent/home'); return }

    const draft: CartDraft = JSON.parse(raw)
    setCart(draft)

    const allProductIds = draft.groups.flatMap((g) => g.productIds)

    async function load() {
      const [clientRes, productsRes, rateRes] = await Promise.all([
        supabase.from('clients').select('id, client_number, name, nationality, gender, needs_muslim_friendly, dietary_restriction').eq('id', draft.clientId).single(),
        allProductIds.length
          ? supabase.from('products').select('id, name, base_price, price_currency').in('id', allProductIds)
          : Promise.resolve({ data: [] }),
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
      ])

      setClient(clientRes.data)
      setProducts((productsRes.data as Product[]) ?? [])
      const rate = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (rate) setExchangeRate(rate)
      setLoading(false)
    }
    load()
  }, [router])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toUSD(p: Product): number {
    return p.price_currency === 'USD' ? p.base_price : Math.round(p.base_price / exchangeRate)
  }

  function toKRW(p: Product): number {
    return p.price_currency === 'KRW' ? p.base_price : Math.round(p.base_price * exchangeRate)
  }

  function groupSubtotalUSD(group: CartGroup): number {
    return group.productIds.reduce((sum, pid) => {
      const p = products.find((x) => x.id === pid)
      return p ? sum + toUSD(p) * group.memberCount : sum
    }, 0)
  }

  const totalUSD = cart?.groups.reduce((sum, g) => sum + groupSubtotalUSD(g), 0) ?? 0

  // ── Send Quote ─────────────────────────────────────────────────────────────

  async function handleSendQuote() {
    if (!cart || !client) return
    setSending(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const { data: agentData } = await supabase
        .from('agents')
        .select('id, margin_rate')
        .eq('auth_user_id', userId)
        .single()
      if (!agentData) throw new Error('Agent not found')

      const { data: companyRateSetting } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'company_margin_rate')
        .single()
      const companyMargin = (companyRateSetting?.value as { rate?: number } | null)?.rate ?? 0.2
      const agentMargin = agentData.margin_rate ?? 0.15

      // Create case
      const { count: caseCount } = await supabase.from('cases').select('*', { count: 'exact', head: true })
      const caseNumber = `#C-${String((caseCount ?? 0) + 1).padStart(3, '0')}`
      const { data: caseData, error: caseErr } = await supabase
        .from('cases')
        .insert({
          case_number: caseNumber,
          agent_id: agentData.id,
          status: 'payment_pending',
          travel_start_date: cart.dateStart || null,
          travel_end_date: cart.dateEnd || null,
        })
        .select('id')
        .single()
      if (caseErr) throw caseErr

      // Create case member (lead)
      await supabase.from('case_members').insert({
        case_id: caseData.id,
        client_id: client.id,
        is_lead: true,
      })

      // Calculate total in KRW with margins
      const totalKRW = cart.groups.reduce((sum, g) => {
        return sum + g.productIds.reduce((gSum, pid) => {
          const p = products.find((x) => x.id === pid)
          if (!p) return gSum
          const baseKRW = toKRW(p) * g.memberCount
          return gSum + Math.round(baseKRW * (1 + companyMargin) * (1 + agentMargin))
        }, 0)
      }, 0)

      // Create quote
      const { count: quoteCount } = await supabase.from('quotes').select('*', { count: 'exact', head: true })
      const quoteNumber = `#Q-${String((quoteCount ?? 0) + 1).padStart(3, '0')}`
      const slug = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
      const paymentDue = new Date()
      paymentDue.setDate(paymentDue.getDate() + 7)

      const { data: quoteData, error: quoteErr } = await supabase
        .from('quotes')
        .insert({
          quote_number: quoteNumber,
          case_id: caseData.id,
          slug,
          company_margin_rate: companyMargin,
          agent_margin_rate: agentMargin,
          total_price: totalKRW,
          payment_due_date: paymentDue.toISOString().split('T')[0],
        })
        .select('id')
        .single()
      if (quoteErr) throw quoteErr

      // Create quote groups and items
      for (let i = 0; i < cart.groups.length; i++) {
        const group = cart.groups[i]
        if (group.productIds.length === 0) continue

        const { data: qgData } = await supabase
          .from('quote_groups')
          .insert({ quote_id: quoteData.id, name: group.name, order: i })
          .select('id')
          .single()
        if (!qgData) continue

        for (const pid of group.productIds) {
          const p = products.find((x) => x.id === pid)
          if (!p) continue
          const baseKRW = toKRW(p) * group.memberCount
          const finalKRW = Math.round(baseKRW * (1 + companyMargin) * (1 + agentMargin))
          await supabase.from('quote_items').insert({
            quote_id: quoteData.id,
            quote_group_id: qgData.id,
            product_id: pid,
            base_price: baseKRW,
            final_price: finalKRW,
          })
        }
      }

      localStorage.removeItem('agent-cart')
      router.push('/agent/home')
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to create quote.')
    } finally {
      setSending(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!cart || !client) return null

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to Home
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Quote Review</h1>
        </div>

        {/* Client info */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Client Information</h2>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{client.name}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{client.nationality}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500 capitalize">{client.gender}</span>
            </div>
            {(cart.dateStart || cart.dateEnd) && (
              <p className="text-xs text-gray-500">
                Travel: {cart.dateStart || '—'} ~ {cart.dateEnd || '—'}
                {' · '}
                {cart.groups.reduce((sum, g) => sum + g.memberCount, 0)} people
              </p>
            )}
            {client.needs_muslim_friendly && (
              <p className="text-xs text-gray-500">
                Muslim Friendly · {DIETARY_LABELS[client.dietary_restriction] ?? client.dietary_restriction}
              </p>
            )}
          </div>
        </section>

        {/* Quote items */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-900">Quote Details</h2>

          {cart.groups.filter((g) => g.productIds.length > 0).map((group, idx) => {
            const subtotal = groupSubtotalUSD(group)
            return (
              <div key={group.id}>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border mb-3 ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}>
                  {group.name}
                  <span className="opacity-60">({group.memberCount} {group.memberCount === 1 ? 'person' : 'people'})</span>
                </div>
                <div className="space-y-2">
                  {group.productIds.map((pid) => {
                    const p = products.find((x) => x.id === pid)
                    if (!p) return null
                    return (
                      <div key={pid} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{p.name}</span>
                        <span className="text-sm text-gray-900 tabular-nums">
                          ${(toUSD(p) * group.memberCount).toLocaleString()}
                          {group.memberCount > 1 && (
                            <span className="text-xs text-gray-400 ml-1">(${toUSD(p).toLocaleString()} × {group.memberCount})</span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">Subtotal</span>
                    <span className="text-sm font-medium text-gray-900 tabular-nums">${subtotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Total */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
            <span className="text-sm font-semibold text-gray-900">Total</span>
            <span className="text-base font-bold text-gray-900 tabular-nums">${totalUSD.toLocaleString()}</span>
          </div>

          <p className="text-xs text-gray-400">Payment due within 7 days of quote creation.</p>
        </section>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-10">
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={handleSendQuote}
            disabled={sending}
            className="px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40"
          >
            {sending ? 'Creating...' : 'Send Quote'}
          </button>
        </div>

      </div>
    </div>
  )
}
