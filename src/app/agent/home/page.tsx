'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DOBPicker from '@/components/DOBPicker'

// ── Types ─────────────────────────────────────────────────────────────────────

type Product = {
  id: string
  name: string
  description: string
  base_price: number
  price_currency: 'KRW' | 'USD'
  duration_value: number
  duration_unit: 'hours' | 'days' | 'nights'
  partner_name: string | null
  has_female_doctor: boolean
  has_prayer_room: boolean
  dietary_type: string
  category_id: string
  product_categories: { name: string } | null
  product_images: { image_url: string; is_primary: boolean }[]
}

type Category = { id: string; name: string }

type Client = {
  id: string
  client_number: string
  name: string
  nationality: string
}

type Group = {
  id: string
  name: string
  memberCount: number
  productIds: string[]
}

type DietaryRestriction = 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'

type ClientForm = {
  name: string
  nationality: string
  gender: 'male' | 'female'
  date_of_birth: string
  phone: string
  email: string
  needs_muslim_friendly: boolean
  dietary_restriction: DietaryRestriction
  special_requests: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUP_PALETTE = [
  { border: 'border-blue-400', tab: 'bg-blue-500 text-white', tabOff: 'bg-white text-blue-600 border border-blue-200', btn: 'bg-blue-500 hover:bg-blue-600 text-white', btnOff: 'border border-blue-300 text-blue-600 hover:bg-blue-50' },
  { border: 'border-emerald-400', tab: 'bg-emerald-500 text-white', tabOff: 'bg-white text-emerald-600 border border-emerald-200', btn: 'bg-emerald-500 hover:bg-emerald-600 text-white', btnOff: 'border border-emerald-300 text-emerald-600 hover:bg-emerald-50' },
  { border: 'border-orange-400', tab: 'bg-orange-500 text-white', tabOff: 'bg-white text-orange-600 border border-orange-200', btn: 'bg-orange-500 hover:bg-orange-600 text-white', btnOff: 'border border-orange-300 text-orange-600 hover:bg-orange-50' },
  { border: 'border-purple-400', tab: 'bg-purple-500 text-white', tabOff: 'bg-white text-purple-600 border border-purple-200', btn: 'bg-purple-500 hover:bg-purple-600 text-white', btnOff: 'border border-purple-300 text-purple-600 hover:bg-purple-50' },
]

const DIETARY_FILTER_OPTIONS = [
  { value: 'halal_certified', label: 'Halal Certified' },
  { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' },
  { value: 'pork_free', label: 'Pork Free' },
]

const DIETARY_FORM_OPTIONS: { value: DietaryRestriction; label: string }[] = [
  { value: 'halal_certified', label: 'Halal Certified' },
  { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' },
  { value: 'pork_free', label: 'Pork Free' },
  { value: 'none', label: 'None' },
]

const DEFAULT_CLIENT_FORM: ClientForm = {
  name: '',
  nationality: '',
  gender: 'male',
  date_of_birth: '',
  phone: '',
  email: '',
  needs_muslim_friendly: false,
  dietary_restriction: 'none',
  special_requests: '',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentHomePage() {
  const router = useRouter()

  // Agent info
  const [agentId, setAgentId] = useState('')
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [companyMargin, setCompanyMargin] = useState(0.5)
  const [agentMargin, setAgentMargin] = useState(0.15)

  // DB data
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  // Top bar
  const [selectedClientId, setSelectedClientId] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  // Snapshot of cart product IDs at the moment of entering section view — used to pin
  // already-selected products to the front of each section so they stay visible after
  // un-filtering. Updated only when transitioning into section view, not on every add.
  const [pinnedProductIds, setPinnedProductIds] = useState<Set<string>>(new Set())
  const [filterPrayerRoom, setFilterPrayerRoom] = useState(false)
  const [filterDietary, setFilterDietary] = useState<string[]>([])
  const [filterFemaleMedical, setFilterFemaleMedical] = useState(false)

  // Cart
  const [groups, setGroups] = useState<Group[]>([
    { id: 'g1', name: 'Group 1', memberCount: 1, productIds: [] },
  ])
  const [activeGroupId, setActiveGroupId] = useState('g1')

  // UI
  const [showClientModal, setShowClientModal] = useState(false)
  const [clientForm, setClientForm] = useState<ClientForm>(DEFAULT_CLIENT_FORM)
  const [savingClient, setSavingClient] = useState(false)
  const [clientError, setClientError] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [imageIndexes, setImageIndexes] = useState<Record<string, number>>({})
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [modalImageIndex, setModalImageIndex] = useState(0)

  function openDetail(product: Product) {
    setModalImageIndex(imageIndexes[product.id] ?? 0)
    setDetailProduct(product)
  }

  // Restore cart only when returning from Review via the Edit button (which sets the flag).
  // Any other entry to Home (from another tab, fresh login, etc.) starts with an empty cart.
  useEffect(() => {
    const shouldRestore = sessionStorage.getItem('agent-cart-restore') === '1'
    sessionStorage.removeItem('agent-cart-restore')
    if (!shouldRestore) {
      localStorage.removeItem('agent-cart')
      return
    }
    try {
      const raw = localStorage.getItem('agent-cart')
      if (!raw) return
      const cart = JSON.parse(raw) as { clientId?: string; dateStart?: string; dateEnd?: string; groups?: Group[] }
      if (cart.clientId) setSelectedClientId(cart.clientId)
      if (cart.dateStart) setDateStart(cart.dateStart)
      if (cart.dateEnd) setDateEnd(cart.dateEnd)
      if (cart.groups && cart.groups.length > 0) {
        setGroups(cart.groups)
        setActiveGroupId(cart.groups[0].id)
      }
    } catch { /* ignore malformed cart */ }
  }, [])

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return

      const [agentRes, rateRes, companyRateRes, productsRes, catsRes] = await Promise.all([
        supabase.from('agents').select('id, margin_rate').eq('auth_user_id', userId).single(),
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
        supabase.from('system_settings').select('value').eq('key', 'company_margin_rate').single(),
        supabase
          .from('products')
          .select('id, name, description, base_price, price_currency, duration_value, duration_unit, partner_name, has_female_doctor, has_prayer_room, dietary_type, category_id, product_categories(name), product_images(image_url, is_primary)')
          .eq('is_active', true),
        supabase.from('product_categories').select('id, name').order('sort_order').order('name'),
      ])

      const aid = agentRes.data?.id ?? ''
      setAgentId(aid)

      const rate = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (rate) setExchangeRate(rate)

      const cm = (companyRateRes.data?.value as { rate?: number } | null)?.rate
      if (typeof cm === 'number') setCompanyMargin(cm)

      const am = (agentRes.data as { margin_rate?: number } | null)?.margin_rate
      if (typeof am === 'number') setAgentMargin(am)

      setProducts((productsRes.data as unknown as Product[]) ?? [])
      setCategories(catsRes.data ?? [])

      if (aid) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, client_number, name, nationality')
          .eq('agent_id', aid)
          .order('name')
        setClients(clientsData ?? [])
      }

      setLoading(false)
    }
    load()
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────

  // Cross-category filters (everything except the category itself)
  function passesCrossFilters(p: Product): boolean {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterPrayerRoom && !p.has_prayer_room) return false
    if (filterFemaleMedical && !p.has_female_doctor) return false
    if (filterDietary.length && !filterDietary.includes(p.dietary_type)) return false
    return true
  }

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategoryId && p.category_id !== selectedCategoryId) return false
      return passesCrossFilters(p)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, selectedCategoryId, filterPrayerRoom, filterDietary, filterFemaleMedical])

  // Products grouped by category, with cart-pinned items first. Used in section view.
  const productsByCategory = useMemo(() => {
    const cartIds = new Set(groups.flatMap((g) => g.productIds))
    const map = new Map<string, Product[]>()
    for (const cat of categories) map.set(cat.id, [])
    for (const p of products) {
      if (!passesCrossFilters(p)) continue
      const bucket = map.get(p.category_id)
      if (bucket) bucket.push(p)
    }
    // Sort each bucket: pinned (was in cart at snapshot time) first, rest keeps original order.
    // Items added to cart AFTER snapshot are NOT re-pinned (prevents cards jumping while user clicks).
    for (const bucket of map.values()) {
      bucket.sort((a, b) => {
        const ap = pinnedProductIds.has(a.id) ? 0 : 1
        const bp = pinnedProductIds.has(b.id) ? 0 : 1
        if (ap !== bp) return ap - bp
        return 0
      })
      // Still useful: if user JUST added an item (not in snapshot) keep it in original position.
      // But if the only pinned items are already at front, nothing changes.
      void cartIds
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, categories, search, filterPrayerRoom, filterDietary, filterFemaleMedical, pinnedProductIds])

  // When entering section view (selectedCategoryId cleared), snapshot current cart.
  useEffect(() => {
    if (selectedCategoryId === '') {
      setPinnedProductIds(new Set(groups.flatMap((g) => g.productIds)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId])

  const productGroupIndex = useMemo(() => {
    const map = new Map<string, number>()
    groups.forEach((g, idx) => g.productIds.forEach((pid) => map.set(pid, idx)))
    return map
  }, [groups])

  const marginMult = (1 + companyMargin) * (1 + agentMargin)

  const totalUSD = useMemo(() => {
    return groups.reduce((total, g) => {
      return total + g.productIds.reduce((sum, pid) => {
        const p = products.find((x) => x.id === pid)
        if (!p) return sum
        const baseUSD = p.price_currency === 'USD' ? p.base_price : p.base_price / exchangeRate
        return sum + baseUSD * marginMult * g.memberCount
      }, 0)
    }, 0)
  }, [groups, products, exchangeRate, marginMult])

  const activeGroupIndex = groups.findIndex((g) => g.id === activeGroupId)

  // ── Cart handlers ──────────────────────────────────────────────────────────

  function toggleProduct(productId: string) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === activeGroupId) {
          const isIn = g.productIds.includes(productId)
          return { ...g, productIds: isIn ? g.productIds.filter((id) => id !== productId) : [...g.productIds, productId] }
        }
        return g
      })
    )
  }

  function addGroup() {
    if (groups.length >= GROUP_PALETTE.length) return
    const newGroup: Group = {
      id: `g-${Date.now()}`,
      name: `Group ${groups.length + 1}`,
      memberCount: 1,
      productIds: [],
    }
    setGroups((prev) => [...prev, newGroup])
    setActiveGroupId(newGroup.id)
  }

  function removeGroup(groupId: string) {
    if (groups.length === 1) return
    setGroups((prev) => prev.filter((g) => g.id !== groupId))
    if (activeGroupId === groupId) {
      setActiveGroupId(groups.find((g) => g.id !== groupId)?.id ?? '')
    }
  }

  function setMemberCount(groupId: string, delta: number) {
    setGroups((prev) =>
      prev.map((g) => g.id === groupId ? { ...g, memberCount: Math.max(1, g.memberCount + delta) } : g)
    )
  }

  function commitRename() {
    if (!renamingGroupId) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      setGroups((prev) => prev.map((g) => g.id === renamingGroupId ? { ...g, name: trimmed } : g))
    }
    setRenamingGroupId(null)
  }

  // ── Quote flow ─────────────────────────────────────────────────────────────

  function handleCreateQuote() {
    const hasProducts = groups.some((g) => g.productIds.length > 0)
    if (!hasProducts) return
    if (!dateStart || !dateEnd) return

    if (!selectedClientId) {
      setShowClientModal(true)
      return
    }
    goToReview(selectedClientId)
  }

  function goToReview(clientId: string) {
    const cart = { clientId, dateStart, dateEnd, groups }
    localStorage.setItem('agent-cart', JSON.stringify(cart))
    router.push('/agent/home/review')
  }

  // ── Client registration ────────────────────────────────────────────────────

  async function handleRegisterClient() {
    const f = clientForm
    const missing: string[] = []
    if (!f.name.trim()) missing.push('Name')
    if (!f.nationality.trim()) missing.push('Nationality')
    if (!f.gender) missing.push('Gender')
    if (!f.date_of_birth) missing.push('Date of Birth')
    if (!f.phone.trim()) missing.push('Phone')
    if (!f.email.trim()) missing.push('Email')
    if (missing.length > 0) { setClientError(`Required: ${missing.join(', ')}`); return }
    if (!agentId) {
      setClientError('Agent profile not loaded. Please refresh the page and try again.')
      return
    }
    setSavingClient(true)
    setClientError('')
    try {
      const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true })
      const next = (count ?? 0) + 1
      const { data, error } = await supabase
        .from('clients')
        .insert({
          client_number: `#CL-${String(next).padStart(3, '0')}`,
          agent_id: agentId,
          name: f.name.trim(),
          nationality: f.nationality.trim(),
          gender: f.gender,
          date_of_birth: f.date_of_birth,
          phone: f.phone.trim(),
          email: f.email.trim(),
          needs_muslim_friendly: f.needs_muslim_friendly,
          dietary_restriction: f.dietary_restriction,
          special_requests: f.special_requests || null,
        })
        .select('id, client_number, name, nationality')
        .single()
      if (error) throw error
      setClients((prev) => [...prev, data])
      setSelectedClientId(data.id)
      setShowClientModal(false)
      setClientForm(DEFAULT_CLIENT_FORM)
      goToReview(data.id)
    } catch (e: unknown) {
      setClientError((e as { message?: string })?.message ?? 'Failed to register client.')
    } finally {
      setSavingClient(false)
    }
  }

  function setField<K extends keyof ClientForm>(key: K, val: ClientForm[K]) {
    setClientForm((prev) => ({ ...prev, [key]: val }))
  }

  // ── Price helper ───────────────────────────────────────────────────────────

  function toUSD(p: Product): string {
    const baseUSD = p.price_currency === 'USD' ? p.base_price : p.base_price / exchangeRate
    const withMargin = baseUSD * marginMult
    return `$${withMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function renderProductCard(product: Product, compact = false) {
    const inActiveGroup = groups[activeGroupIndex]?.productIds.includes(product.id)
    const activePalette = GROUP_PALETTE[activeGroupIndex]
    const imgs = product.product_images ?? []
    const sortedImgs = [...imgs].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
    const imgIdx = imageIndexes[product.id] ?? 0
    const currentImg = sortedImgs[imgIdx]

    return (
      <div
        key={product.id}
        className={`bg-white rounded-2xl border-2 overflow-hidden flex flex-col transition-all ${
          inActiveGroup ? activePalette.border : 'border-gray-100'
        }`}
      >
        {/* Image with carousel */}
        <div
          className={`${compact ? 'aspect-[16/10]' : 'aspect-[16/10]'} bg-gray-100 overflow-hidden relative group/img cursor-pointer`}
          onClick={() => openDetail(product)}
        >
          {currentImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentImg.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
              </svg>
            </div>
          )}
          {sortedImgs.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setImageIndexes((prev) => ({ ...prev, [product.id]: (imgIdx - 1 + sortedImgs.length) % sortedImgs.length }))
                }}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity text-xs"
              >‹</button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setImageIndexes((prev) => ({ ...prev, [product.id]: (imgIdx + 1) % sortedImgs.length }))
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity text-xs"
              >›</button>
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                {sortedImgs.map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === imgIdx ? 'bg-white' : 'bg-white/40'}`} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Content — compact: name + price/duration row + tag row + add button */}
        <div className="p-2.5 flex flex-col flex-1 gap-1">
          <button
            onClick={() => openDetail(product)}
            className="text-xs font-semibold text-gray-900 leading-tight text-left hover:text-[#0f4c35] transition-colors line-clamp-1"
          >
            {product.name}
          </button>

          <div className="flex items-baseline justify-between gap-2 mt-auto">
            <p className="text-sm font-bold text-gray-900 truncate">{toUSD(product)}</p>
            <p className="text-[10px] text-gray-400 shrink-0">{product.duration_value} {product.duration_unit}</p>
          </div>

          {(product.has_female_doctor || product.has_prayer_room) && (
            <div className="flex flex-wrap gap-x-2 gap-y-0 text-[10px] text-gray-500">
              {product.has_female_doctor && (
                <span title="Female medical staff" className="inline-flex items-center gap-0.5 whitespace-nowrap">
                  <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Female
                </span>
              )}
              {product.has_prayer_room && (
                <span title="Prayer room" className="inline-flex items-center gap-0.5 whitespace-nowrap">
                  <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Prayer
                </span>
              )}
            </div>
          )}

          <button
            onClick={() => toggleProduct(product.id)}
            className={`mt-1 w-full py-1 rounded-lg text-[11px] font-medium transition-all ${
              inActiveGroup ? activePalette.btn : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {inActiveGroup ? `✓ ${groups[activeGroupIndex]?.name}` : `+ ${groups[activeGroupIndex]?.name ?? 'Group'}`}
          </button>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Top Bar ── */}
      <div className="shrink-0 bg-white border-b border-gray-100 flex flex-col md:flex-row md:items-center md:h-14 gap-2 md:gap-4 px-4 md:px-6 py-3 md:py-0">
        {/* Client */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 whitespace-nowrap">Client</span>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="flex-1 md:flex-none text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-700 md:max-w-[180px]"
          >
            <option value="">Select client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="hidden md:block h-4 w-px bg-gray-200" />

        {/* Date range */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10)
          return (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 whitespace-nowrap">Date *</span>
          <input
            type="date"
            value={dateStart}
            min={today}
            onChange={(e) => {
              setDateStart(e.target.value)
              if (dateEnd && e.target.value > dateEnd) setDateEnd(e.target.value)
            }}
            className="flex-1 md:flex-none min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#0f4c35] text-gray-700"
          />
          <span className="text-xs text-gray-300">~</span>
          <input
            type="date"
            value={dateEnd}
            min={dateStart || today}
            onChange={(e) => setDateEnd(e.target.value)}
            className="flex-1 md:flex-none min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#0f4c35] text-gray-700"
          />
        </div>
          )
        })()}
      </div>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* ── Top Filter Bar ── horizontal toolbar replaces the old left sidebar
            so the product grid can use the full window width. Categories are
            pills inline, Muslim/dietary filters are tucked behind a popover
            so they don't crowd the bar. */}
        <div className="shrink-0 bg-white border-b border-gray-100 px-4 md:px-6 py-2.5 flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#0f4c35] bg-white"
            />
          </div>

          {/* Category pills — horizontal scroll on narrow widths */}
          <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1">
            {[{ id: '', name: 'All' }, ...categories].map(cat => {
              const active = selectedCategoryId === cat.id
              return (
                <button
                  key={cat.id || 'all'}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`shrink-0 px-3 py-1.5 text-xs rounded-full border transition-colors ${active
                    ? 'bg-[#0f4c35] border-[#0f4c35] text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  {cat.name}
                </button>
              )
            })}
          </div>

          {/* Muslim/Dietary filters — popover */}
          {(() => {
            const activeCount = (filterPrayerRoom ? 1 : 0) + (filterFemaleMedical ? 1 : 0) + filterDietary.length
            return (
              <div className="relative ml-auto">
                <button
                  onClick={() => setFilterOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${activeCount > 0
                    ? 'border-[#0f4c35] text-[#0f4c35] bg-[#0f4c35]/5'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6 12h12M10 19.5h4" />
                  </svg>
                  Muslim Friendly{activeCount > 0 ? ` · ${activeCount}` : ''}
                  <svg className={`w-3 h-3 transition-transform ${filterOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {filterOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-3 w-60">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={filterPrayerRoom} onChange={(e) => setFilterPrayerRoom(e.target.checked)}
                          className="accent-[#0f4c35] w-3.5 h-3.5" />
                        <span className="text-xs text-gray-700">Prayer room</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={filterFemaleMedical} onChange={(e) => setFilterFemaleMedical(e.target.checked)}
                          className="accent-[#0f4c35] w-3.5 h-3.5" />
                        <span className="text-xs text-gray-700">Female medical staff</span>
                      </label>
                      <div className="border-t border-gray-100 pt-2">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Dietary</p>
                        <div className="space-y-1.5">
                          {DIETARY_FILTER_OPTIONS.map(opt => (
                            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={filterDietary.includes(opt.value)}
                                onChange={(e) => setFilterDietary(prev => e.target.checked ? [...prev, opt.value] : prev.filter(v => v !== opt.value))}
                                className="accent-[#0f4c35] w-3.5 h-3.5" />
                              <span className="text-xs text-gray-700">{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {activeCount > 0 && (
                        <button onClick={() => { setFilterPrayerRoom(false); setFilterFemaleMedical(false); setFilterDietary([]) }}
                          className="text-[11px] text-gray-500 hover:text-gray-800 underline">
                          Clear all
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })()}
        </div>

        {/* ── Product Area: sections (no category filter) OR flat grid (category selected) ── */}
        <div className={`flex-1 bg-gray-50 p-4 md:p-6 ${selectedCategoryId === '' ? 'overflow-y-auto md:overflow-hidden' : 'overflow-y-auto'}`}>
          {selectedCategoryId === '' ? (
            Array.from(productsByCategory.values()).every((arr) => arr.length === 0) ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-sm text-gray-400">No products found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-4 md:h-full">
                {categories.map((cat) => {
                  const items = productsByCategory.get(cat.id) ?? []
                  if (items.length === 0) return null
                  const PREVIEW = 3
                  const preview = items.slice(0, PREVIEW)
                  const hasMore = items.length > PREVIEW
                  return (
                    <section key={cat.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 shrink-0">
                        <h2 className="text-sm font-semibold text-gray-800">{cat.name}</h2>
                        <button
                          onClick={() => setSelectedCategoryId(cat.id)}
                          className="text-xs text-[#0f4c35] font-medium hover:underline"
                        >
                          {hasMore ? `See all (${items.length}) →` : 'See all →'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 flex-1 min-h-0">
                        {preview.map((product) => renderProductCard(product, true))}
                      </div>
                    </section>
                  )
                })}
              </div>
            )
          ) : filteredProducts.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-gray-400">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map((product) => renderProductCard(product))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Bar ── */}
      <div className="shrink-0 bg-white border-t border-gray-100 flex flex-col md:flex-row md:items-center md:h-14 gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-0">
        {/* Groups */}
        <div className="flex items-center gap-2 flex-1 overflow-x-auto">
          {groups.map((group, idx) => {
            const palette = GROUP_PALETTE[idx]
            const isActive = group.id === activeGroupId

            return (
              <div
                key={group.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all shrink-0 ${
                  isActive ? palette.tab : palette.tabOff
                }`}
                onClick={() => setActiveGroupId(group.id)}
              >
                {renamingGroupId === group.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingGroupId(null) }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-28 bg-transparent border-b border-current outline-none text-xs"
                  />
                ) : (
                  <>
                    <span
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setRenamingGroupId(group.id)
                        setRenameValue(group.name)
                      }}
                    >
                      {group.name}
                    </span>
                    {isActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenamingGroupId(group.id)
                          setRenameValue(group.name)
                        }}
                        title="Rename group"
                        className="opacity-60 hover:opacity-100 ml-0.5"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                    )}
                  </>
                )}

                {/* Member count */}
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMemberCount(group.id, -1) }}
                    className="w-4 h-4 flex items-center justify-center rounded opacity-70 hover:opacity-100"
                  >−</button>
                  <span className="min-w-[14px] text-center">{group.memberCount}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMemberCount(group.id, 1) }}
                    className="w-4 h-4 flex items-center justify-center rounded opacity-70 hover:opacity-100"
                  >+</button>
                </div>

                {/* Remove group */}
                {groups.length > 1 && isActive && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeGroup(group.id) }}
                    className="ml-0.5 opacity-60 hover:opacity-100"
                  >×</button>
                )}
              </div>
            )
          })}

          {groups.length < GROUP_PALETTE.length && (
            <button
              onClick={addGroup}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-600 transition-all shrink-0"
            >
              + Add Group
            </button>
          )}
        </div>

        {/* Total + CTA */}
        {(() => {
          const hasProducts = groups.some((g) => g.productIds.length > 0)
          const missingDates = !dateStart || !dateEnd
          const hint = !hasProducts ? 'Add at least one product to continue'
            : missingDates ? 'Select travel dates to continue'
            : ''
          return (
        <div className="flex items-center gap-3 md:gap-4 shrink-0">
          {hint && (
            <p className="hidden md:block text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
              {hint}
            </p>
          )}
          <div className="text-left md:text-right flex-1 md:flex-none">
            <p className="text-[10px] text-gray-400">Total</p>
            <p className="text-sm font-bold text-gray-900">${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <button
            onClick={handleCreateQuote}
            disabled={!hasProducts || missingDates}
            title={hint}
            className="px-5 py-2 bg-[#0f4c35] text-white text-sm font-medium rounded-xl hover:bg-[#0a3828] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Create Quote
          </button>
        </div>
          )
        })()}
      </div>

      {/* ── Product Detail Modal ── */}
      {detailProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetailProduct(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Images */}
            {(() => {
              const imgs = [...(detailProduct.product_images ?? [])].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
              const idx = modalImageIndex % Math.max(imgs.length, 1)
              return imgs.length > 0 ? (
                <div className="relative aspect-video bg-gray-100 overflow-hidden rounded-t-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgs[idx].image_url} alt="" className="w-full h-full object-cover" />
                  {imgs.length > 1 && (
                    <>
                      <button onClick={() => setModalImageIndex((idx - 1 + imgs.length) % imgs.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center text-lg">‹</button>
                      <button onClick={() => setModalImageIndex((idx + 1) % imgs.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center text-lg">›</button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {imgs.map((_, i) => <div key={i} className={`w-2 h-2 rounded-full ${i === idx ? 'bg-white' : 'bg-white/40'}`} />)}
                      </div>
                    </>
                  )}
                </div>
              ) : null
            })()}

            <div className="p-6 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-400 mb-1">{detailProduct.product_categories?.name ?? '—'}</p>
                  <h2 className="text-lg font-semibold text-gray-900">{detailProduct.name}</h2>
                </div>
                <button onClick={() => setDetailProduct(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Price + Duration */}
              <div className="flex items-center gap-4">
                <div className="bg-gray-50 rounded-xl px-4 py-2.5 text-center">
                  <p className="text-lg font-bold text-gray-900">{toUSD(detailProduct)}</p>
                  <p className="text-xs text-gray-400">per person</p>
                </div>
                <div className="bg-gray-50 rounded-xl px-4 py-2.5 text-center">
                  <p className="text-base font-semibold text-gray-900">{detailProduct.duration_value} {detailProduct.duration_unit}</p>
                  <p className="text-xs text-gray-400">duration</p>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{detailProduct.description}</p>
              </div>

              {/* Muslim Friendly */}
              {(detailProduct.has_prayer_room || detailProduct.has_female_doctor || detailProduct.dietary_type !== 'none') && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Muslim Friendly</p>
                  <div className="flex flex-wrap gap-2">
                    {detailProduct.has_prayer_room && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
                        <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Prayer room
                      </span>
                    )}
                    {detailProduct.has_female_doctor && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
                        <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Female medical staff
                      </span>
                    )}
                    {detailProduct.dietary_type !== 'none' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
                        <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {DIETARY_FILTER_OPTIONS.find(o => o.value === detailProduct.dietary_type)?.label ?? detailProduct.dietary_type}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Add button */}
              <button
                onClick={() => { toggleProduct(detailProduct.id); setDetailProduct(null) }}
                className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
                  groups[activeGroupIndex]?.productIds.includes(detailProduct.id)
                    ? GROUP_PALETTE[activeGroupIndex].btn
                    : 'bg-[#0f4c35] hover:bg-[#0a3828] text-white'
                }`}
              >
                {groups[activeGroupIndex]?.productIds.includes(detailProduct.id) ? '✓ Added to ' + groups[activeGroupIndex]?.name : 'Add to ' + (groups[activeGroupIndex]?.name ?? 'Group')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Client Registration Modal ── */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !savingClient && setShowClientModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">New Client</h2>
              <button onClick={() => !savingClient && setShowClientModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-3">
              {/* Name */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input value={clientForm.name} onChange={(e) => setField('name', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nationality *</label>
                  <input value={clientForm.nationality} onChange={(e) => setField('nationality', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Gender *</label>
                  <div className="flex gap-3 pt-1">
                    {(['male', 'female'] as const).map((g) => (
                      <label key={g} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={clientForm.gender === g}
                          onChange={() => setField('gender', g)}
                          className="accent-[#0f4c35]" />
                        <span className="text-sm text-gray-700 capitalize">{g}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date of Birth *</label>
                  <DOBPicker value={clientForm.date_of_birth} onChange={v => setField('date_of_birth', v)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone *</label>
                  <input value={clientForm.phone} onChange={(e) => setField('phone', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Email *</label>
                  <input type="email" value={clientForm.email} onChange={(e) => setField('email', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
              </div>

              {/* Muslim? */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Muslim?</label>
                <div className="flex gap-4">
                  {([true, false] as const).map((v) => (
                    <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={clientForm.needs_muslim_friendly === v}
                        onChange={() => setClientForm((p) => ({
                          ...p,
                          needs_muslim_friendly: v,
                          // Reset Muslim-specific fields when switching to No
                          ...(v ? {} : { dietary_restriction: 'none' as DietaryRestriction }),
                        }))}
                        className="accent-[#0f4c35]" />
                      <span className="text-sm text-gray-700">{v ? 'Yes' : 'No'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Conditional: only shown when Muslim = Yes */}
              {clientForm.needs_muslim_friendly && (
                <div className="space-y-3 rounded-xl border border-[#0f4c35]/15 bg-[#0f4c35]/[0.03] p-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dietary Restriction</label>
                    <select value={clientForm.dietary_restriction}
                      onChange={(e) => setField('dietary_restriction', e.target.value as DietaryRestriction)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white">
                      {DIETARY_FORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-500">Prayer preferences, medical info, and other details can be added on the client&apos;s detail page.</p>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Special Requests</label>
                <textarea value={clientForm.special_requests}
                  onChange={(e) => setField('special_requests', e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] resize-none" />
              </div>

              <p className="text-xs text-gray-400">* Travel details (passport, flights, etc.) can be added after payment.</p>

              {clientError && <p className="text-xs text-red-500">{clientError}</p>}
            </div>

            <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
              <button onClick={() => { setShowClientModal(false); setClientError('') }} disabled={savingClient}
                className="px-4 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleRegisterClient} disabled={savingClient}
                className="px-4 py-1.5 text-sm bg-[#0f4c35] text-white font-medium rounded-lg hover:bg-[#0a3828] disabled:opacity-50 transition-colors">
                {savingClient ? 'Saving...' : 'Register & Review Quote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
