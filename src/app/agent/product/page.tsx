'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DOBPicker from '@/components/DOBPicker'
import { getMarkupRate, isHotelItem, nightsBetween, daysBetween, variantPriceUsd, type MarkupRatesConfig, DEFAULT_MARKUP_RATES } from '@/lib/pricing'
import { COUNTRIES } from '@/lib/countries'

// ── Types ─────────────────────────────────────────────────────────────────────

type Variant = {
  id: string
  variant_label: string | null
  base_price: number
  price_currency: 'KRW' | 'USD'
  sort_order: number
  is_active: boolean
  overtime_rate_krw: number | null
}

type Product = {
  id: string
  name: string
  description: string
  base_price: number
  price_currency: 'KRW' | 'USD'
  duration_value: number
  duration_unit: 'minutes' | 'hours' | 'days' | 'nights'
  quantity_type: 'per_person' | 'per_night' | 'per_day' | 'flat' | null
  price_per_tooth: number | null
  partner_name: string | null
  has_female_doctor: boolean
  has_prayer_room: boolean
  dietary_type: string
  tertiary_category: string | null
  category_id: string
  subcategory_id: string | null
  product_categories: { name: string } | null
  product_subcategories: { name: string } | null
  product_subcategory_tags: { product_subcategories: { name: string } | null }[]
  product_images: { image_url: string; is_primary: boolean }[]
  product_variants: Variant[]
}

type Category = { id: string; name: string }

type Client = {
  id: string
  client_number: string
  name: string
  nationality: string
}

// Non-Subpackage products go into a Group (or Shared).
type CartItem = { productId: string; variantId: string; toothCount?: number; agentNote?: string }

// Subpackage products (interpreter, car, hotel, concierge…) go into Trip Services.
// days: user-set number of days/nights. Hotel auto-syncs to nightsBetween on render.
type TripServiceItem = { productId: string; variantId: string; days: number; agentNote?: string }

type Group = {
  id: string
  name: string
  memberCount: number
  items: CartItem[]
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

function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const CART_VERSION = 4  // bump to invalidate old localStorage carts

// Subcategories where products are grouped by partner_name in the catalog grid
const PARTNER_GROUPED_SUBCATEGORIES = new Set(['Health Screening'])

// Custom sort for K-Wellness Row 2 subcategory pills: SPA first, then alpha.
function sortKWellnessSubs(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const aSpa = /^SPA/i.test(a) ? 0 : 1
    const bSpa = /^SPA/i.test(b) ? 0 : 1
    return aSpa - bSpa || a.localeCompare(b)
  })
}

// Custom sort for K-Medical Row 2 subcategory pills:
// Health Screening → Stem Cell Clinic → Dermatology Clinic → alpha.
function sortKMedicalSubs(names: string[]): string[] {
  const rank = (n: string) => {
    if (/^Health Screening$/i.test(n)) return 0
    if (/^Stem Cell Clinic$/i.test(n)) return 1
    if (/^Dermatology Clinic$/i.test(n)) return 2
    return 3
  }
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

// Custom sort for Row 3 (tertiary) pills, per (category, subcategory).
function sortTertiaries(catName: string, subName: string, values: string[]): string[] {
  if (catName === 'K-Wellness' && subName === 'Tour') {
    const rank = (n: string) => {
      if (/^Seoul$/i.test(n)) return 0
      if (/^Near Seoul$/i.test(n)) return 1
      if (/^Regional$/i.test(n)) return 2
      if (/^Jeju$/i.test(n)) return 3
      return 4
    }
    return [...values].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }
  if (catName === 'Subpackage' && subName === 'Hotel') {
    const rank = (n: string) => {
      if (n === 'Seoul · Jamsil') return 0
      if (n === 'Seoul · Downtown') return 1
      if (n === 'Seoul · Gangnam') return 2
      if (n === 'Incheon · Songdo') return 3
      if (n === 'Incheon · Yeongjong') return 4
      if (n === 'Andong · Hanok') return 5
      return 6
    }
    return [...values].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }
  return [...values].sort()
}

const HOTEL_REGION_RANK: Record<string, number> = {
  'Seoul · Jamsil': 0,
  'Seoul · Downtown': 1,
  'Seoul · Gangnam': 2,
  'Incheon · Songdo': 3,
  'Incheon · Yeongjong': 4,
  'Andong · Hanok': 5,
}

function hotelPartnerRank(partner: string, region: string): number {
  switch (region) {
    case 'Seoul · Jamsil':
      if (/SIGNIEL/i.test(partner)) return 0
      return 99
    case 'Seoul · Downtown':
      if (/SHILLA/i.test(partner)) return 0
      if (/FOUR SEASONS/i.test(partner)) return 1
      return 99
    case 'Seoul · Gangnam':
      if (/InterContinental/i.test(partner)) return 0
      if (/PARK HYATT/i.test(partner)) return 1
      return 99
    case 'Incheon · Songdo':
      if (/PARK HYATT/i.test(partner)) return 0
      return 99
    case 'Incheon · Yeongjong':
      if (/PARADISE/i.test(partner)) return 0
      if (/INSPIRE/i.test(partner)) return 1
      return 99
    default:
      return 99
  }
}

const GROUP_PALETTE = Array(8).fill({
  border: 'border-gray-200',
  tab: 'bg-[#0f4c35] text-white',
  tabOff: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50',
  btn: 'bg-[#0f4c35] hover:bg-[#0a3526] text-white',
  btnOff: 'border border-gray-300 text-gray-600 hover:bg-gray-50',
})

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

export default function AgentProductPage() {
  const router = useRouter()

  // Agent info
  const [agentId, setAgentId] = useState('')
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [markupRatesConfig, setMarkupRatesConfig] = useState<MarkupRatesConfig>(DEFAULT_MARKUP_RATES)

  // DB data
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<{ id: string; category_id: string; name: string; sort_order: number }[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  // Top bar
  const [selectedClientId, setSelectedClientId] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [selectedSubcategoryName, setSelectedSubcategoryName] = useState<string>('')
  const [selectedPartnerName, setSelectedPartnerName] = useState<string>('')
  const [pinnedProductIds, setPinnedProductIds] = useState<Set<string>>(new Set())
  const [filterPrayerRoom, setFilterPrayerRoom] = useState(false)
  const [filterDietary, setFilterDietary] = useState<string[]>([])
  const [filterFemaleMedical, setFilterFemaleMedical] = useState(false)

  // Trip identity
  const [tripName, setTripName] = useState('')

  // Cart — 'shared' group is permanent (index 0), user groups follow.
  // Shared items apply to ALL members (× total pax).
  const [groups, setGroups] = useState<Group[]>([
    { id: 'shared', name: 'Shared Activities', memberCount: 0, items: [] },
    { id: 'g1', name: 'Group 1', memberCount: 1, items: [] },
  ])
  const [activeGroupId, setActiveGroupId] = useState('g1')

  // Trip Services — Subpackage products only. Separate from group-based cart.
  // Hotel items use nightsBetween(dateStart, dateEnd) at render; other services use item.days.
  const [tripServices, setTripServices] = useState<TripServiceItem[]>([])

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
  const [expandedVariantGroup, setExpandedVariantGroup] = useState<Record<string, boolean>>({})
  const [modalImageIndex, setModalImageIndex] = useState(0)
  const [cartRestoredBanner, setCartRestoredBanner] = useState(false)
  const [showCartDrawer, setShowCartDrawer] = useState(false)
  const [modalToothCount, setModalToothCount] = useState(1)
  const [modalNote, setModalNote] = useState('')

  function openDetail(product: Product) {
    setModalImageIndex(imageIndexes[product.id] ?? 0)
    let tc = 1
    for (const g of groups) {
      const it = g.items.find(x => x.productId === product.id)
      if (it) { tc = it.toothCount ?? 1; break }
    }
    setModalToothCount(tc)
    const svc = tripServices.find(it => it.productId === product.id)
    setModalNote(svc?.agentNote ?? '')
    setDetailProduct(product)
  }

  function isSubpackageProduct(p: Product): boolean {
    return p.product_categories?.name === 'Subpackage'
  }

  // Cart restore is done inside load() after agentId is known.

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return

      const [agentRes, rateRes, markupRatesRes, productsRes, catsRes, subcatsRes] = await Promise.all([
        supabase.from('agents').select('id, margin_rate').eq('auth_user_id', userId).single(),
        supabase.from('system_settings').select('value').eq('key', 'product_price_rate').single(),
        supabase.from('system_settings').select('value').eq('key', 'markup_rates').maybeSingle(),
        supabase
          .from('products')
          .select('id, name, description, base_price, price_currency, duration_value, duration_unit, quantity_type, price_per_tooth, partner_name, has_female_doctor, has_prayer_room, dietary_type, tertiary_category, category_id, subcategory_id, product_categories(name), product_subcategories!products_subcategory_id_fkey(name), product_subcategory_tags(product_subcategories!product_subcategory_tags_subcategory_id_fkey(name)), product_images(image_url, is_primary), product_variants(id, variant_label, base_price, price_currency, sort_order, is_active, overtime_rate_krw)')
          .eq('is_active', true),
        supabase.from('product_categories').select('id, name').order('sort_order').order('name'),
        supabase.from('product_subcategories').select('id, category_id, name, sort_order').order('sort_order').order('name'),
      ])

      const aid = agentRes.data?.id ?? ''
      setAgentId(aid)

      const rate = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (rate) setExchangeRate(rate)

      const mr = markupRatesRes.data?.value as MarkupRatesConfig | null
      if (mr) setMarkupRatesConfig({ ...DEFAULT_MARKUP_RATES, ...mr })

      setProducts((productsRes.data as unknown as Product[]) ?? [])
      setCategories(catsRes.data ?? [])
      setSubcategories((subcatsRes.data as unknown as { id: string; category_id: string; name: string; sort_order: number }[]) ?? [])

      // Cart restore — keyed by agentId so carts don't bleed across accounts.
      if (aid) {
        try {
          const cartKey = `agent-cart-${aid}`
          const raw = localStorage.getItem(cartKey)
          if (raw) {
            const savedCart = JSON.parse(raw) as {
              version?: number
              clientId?: string; dateStart?: string; dateEnd?: string; tripName?: string
              groups?: Array<{id: string; name: string; memberCount: number; items?: CartItem[]}>
              tripServices?: TripServiceItem[]
            }
            if (!savedCart.version || savedCart.version < CART_VERSION) {
              localStorage.removeItem(cartKey)
            } else {
              if (savedCart.clientId) setSelectedClientId(savedCart.clientId)
              if (savedCart.dateStart) setDateStart(savedCart.dateStart)
              if (savedCart.dateEnd) setDateEnd(savedCart.dateEnd)
              if (savedCart.tripName) setTripName(savedCart.tripName)
              if (savedCart.tripServices) setTripServices(savedCart.tripServices)
              if (savedCart.groups && savedCart.groups.length > 0) {
                const valid = savedCart.groups.every(g => Array.isArray(g.items))
                if (!valid) {
                  localStorage.removeItem(cartKey)
                } else {
                  const restored: Group[] = savedCart.groups.map(g => ({
                    id: g.id, name: g.name, memberCount: g.memberCount, items: g.items as CartItem[],
                  }))
                  if (!restored.find(g => g.id === 'shared')) {
                    restored.unshift({ id: 'shared', name: 'Shared Activities', memberCount: 0, items: [] })
                  }
                  setGroups(restored)
                  setActiveGroupId(restored.find(g => g.id !== 'shared')?.id ?? restored[0].id)
                  const hasItems = restored.some(g => g.items.length > 0) || (savedCart.tripServices ?? []).length > 0
                  if (hasItems) setCartRestoredBanner(true)
                }
              }
            }
          }
        } catch { /* ignore malformed cart */ }
      }

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

  // Auto-save cart to localStorage whenever relevant state changes
  useEffect(() => {
    if (!agentId) return
    const cart = { version: CART_VERSION, clientId: selectedClientId, dateStart, dateEnd, tripName, groups, tripServices }
    localStorage.setItem(`agent-cart-${agentId}`, JSON.stringify(cart))
  }, [agentId, selectedClientId, dateStart, dateEnd, tripName, groups, tripServices])


  // ── Derived ────────────────────────────────────────────────────────────────

  function passesCrossFilters(p: Product): boolean {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterPrayerRoom && !p.has_prayer_room) return false
    if (filterFemaleMedical && !p.has_female_doctor) return false
    if (filterDietary.length && !filterDietary.includes(p.dietary_type)) return false
    return true
  }

  const nights = useMemo(() => nightsBetween(dateStart, dateEnd), [dateStart, dateEnd])
  const daysLive = useMemo(() => daysBetween(dateStart, dateEnd), [dateStart, dateEnd])

  // Total pax across all non-shared groups — Shared group's price multiplier.
  const sharedMemberCount = groups.filter(g => g.id !== 'shared').reduce((s, g) => s + g.memberCount, 0)

  function priceSortKey(p: Product): number {
    const variants = (p.product_variants ?? []).filter(v => v.is_active)
    if (variants.length === 0) return -1
    const cat = p.product_categories?.name
    const sub = p.product_subcategories?.name
    const isSubpkg = cat === 'Subpackage'
    let max = 0
    for (const v of variants) {
      const usd = variantPriceUsd({
        basePrice: v.base_price, priceCurrency: v.price_currency, exchangeRate,
        markupRate: getMarkupRate(cat, sub, markupRatesConfig),
      })
      if (usd > max) max = usd
    }
    return max
  }

  const filteredProducts = useMemo(() => {
    const list = products.filter((p) => {
      if (selectedCategoryId && p.category_id !== selectedCategoryId) return false
      if (selectedSubcategoryName && !productTagNames(p).includes(selectedSubcategoryName)) return false
      if (selectedPartnerName) {
        if (p.tertiary_category !== selectedPartnerName) return false
      }
      return passesCrossFilters(p)
    })

    const catName = categories.find(c => c.id === selectedCategoryId)?.name ?? ''

    // Subpackage > Hotel: region → hotel → price desc
    if (catName === 'Subpackage' && selectedSubcategoryName === 'Hotel') {
      return list.sort((a, b) => {
        const ra = HOTEL_REGION_RANK[a.tertiary_category ?? ''] ?? 99
        const rb = HOTEL_REGION_RANK[b.tertiary_category ?? ''] ?? 99
        if (ra !== rb) return ra - rb
        const ha = hotelPartnerRank(a.partner_name ?? '', a.tertiary_category ?? '')
        const hb = hotelPartnerRank(b.partner_name ?? '', b.tertiary_category ?? '')
        if (ha !== hb) return ha - hb
        return priceSortKey(b) - priceSortKey(a)
      })
    }

    // Subcategory selected (no partner pill): group by partner (max price desc), then partner name alpha (tiebreaker to keep partners together), then price desc within partner
    if (selectedSubcategoryName && !selectedPartnerName) {
      const partnerMaxPrice = new Map<string, number>()
      for (const p of list) {
        const partner = p.partner_name ?? ''
        const price = priceSortKey(p)
        if (price > (partnerMaxPrice.get(partner) ?? -1)) partnerMaxPrice.set(partner, price)
      }
      return list.sort((a, b) => {
        const pa = partnerMaxPrice.get(a.partner_name ?? '') ?? 0
        const pb = partnerMaxPrice.get(b.partner_name ?? '') ?? 0
        if (pa !== pb) return pb - pa
        const nameA = a.partner_name ?? ''
        const nameB = b.partner_name ?? ''
        if (nameA !== nameB) return nameA.localeCompare(nameB)
        return priceSortKey(b) - priceSortKey(a)
      })
    }

    return list.sort((a, b) => priceSortKey(b) - priceSortKey(a))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, selectedCategoryId, selectedSubcategoryName, selectedPartnerName, filterPrayerRoom, filterDietary, filterFemaleMedical, exchangeRate, markupRatesConfig, categories])

  // Helper: get subcategory tag names for a product (falls back to primary subcategory)
  function productTagNames(p: Product): string[] {
    const tags = (p.product_subcategory_tags ?? [])
      .map(t => t.product_subcategories?.name)
      .filter((n): n is string => !!n)
    if (tags.length > 0) return tags
    const primary = p.product_subcategories?.name
    return primary ? [primary] : []
  }

  const availableSubcategories = useMemo(() => {
    if (!selectedCategoryId) return [] as string[]
    const names = new Set<string>()
    for (const p of products) {
      if (p.category_id !== selectedCategoryId) continue
      for (const n of productTagNames(p)) names.add(n)
    }
    const out: string[] = []
    const seenName = new Set<string>()
    for (const s of subcategories) {
      if (s.category_id !== selectedCategoryId) continue
      if (!names.has(s.name)) continue
      if (seenName.has(s.name)) continue
      seenName.add(s.name)
      out.push(s.name)
    }
    const selectedCatName = categories.find(c => c.id === selectedCategoryId)?.name ?? ''
    if (selectedCatName === 'K-Wellness') return sortKWellnessSubs(out)
    if (selectedCatName === 'K-Medical') return sortKMedicalSubs(out)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, subcategories, selectedCategoryId])

  const productsBySubcategory = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const sub of availableSubcategories) map.set(sub, [])
    const seen = new Map<string, Set<string>>() // sub → product ids already added
    for (const sub of availableSubcategories) seen.set(sub, new Set())
    for (const p of products) {
      if (p.category_id !== selectedCategoryId) continue
      if (!passesCrossFilters(p)) continue
      for (const sub of productTagNames(p)) {
        if (!map.has(sub)) continue
        if (seen.get(sub)!.has(p.id)) continue
        map.get(sub)!.push(p)
        seen.get(sub)!.add(p.id)
      }
    }
    for (const bucket of map.values()) {
      const partnerMaxPrice = new Map<string, number>()
      for (const p of bucket) {
        const partner = p.partner_name ?? ''
        const price = priceSortKey(p)
        if (price > (partnerMaxPrice.get(partner) ?? -1)) partnerMaxPrice.set(partner, price)
      }
      bucket.sort((a, b) => {
        const pa = partnerMaxPrice.get(a.partner_name ?? '') ?? 0
        const pb = partnerMaxPrice.get(b.partner_name ?? '') ?? 0
        if (pa !== pb) return pb - pa
        const nameA = a.partner_name ?? ''
        const nameB = b.partner_name ?? ''
        if (nameA !== nameB) return nameA.localeCompare(nameB)
        return priceSortKey(b) - priceSortKey(a)
      })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, selectedCategoryId, availableSubcategories, search, filterPrayerRoom, filterDietary, filterFemaleMedical, exchangeRate, markupRatesConfig])

  // Row 3 pills = tertiary_category values for the selected (category, subcategory).
  // Only shown once a subcategory is picked. If no products in scope have tertiary_category,
  // Row 3 stays hidden — we do NOT fall back to partner_name.
  const availablePartnerNames = useMemo(() => {
    if (!selectedCategoryId) return [] as string[]
    if (selectedSubcategoryName === '') return [] as string[]
    const relevant = products.filter(p => {
      if (p.category_id !== selectedCategoryId) return false
      if (!productTagNames(p).includes(selectedSubcategoryName)) return false
      return true
    })
    const values = new Set<string>()
    for (const p of relevant) { if (p.tertiary_category) values.add(p.tertiary_category) }
    const catName = categories.find(c => c.id === selectedCategoryId)?.name ?? ''
    return sortTertiaries(catName, selectedSubcategoryName, Array.from(values))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, categories, selectedCategoryId, selectedSubcategoryName])

  const productsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const cat of categories) map.set(cat.id, [])
    for (const p of products) {
      if (!passesCrossFilters(p)) continue
      const bucket = map.get(p.category_id)
      if (bucket) bucket.push(p)
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => {
        const ap = pinnedProductIds.has(a.id) ? 0 : 1
        const bp = pinnedProductIds.has(b.id) ? 0 : 1
        if (ap !== bp) return ap - bp
        return priceSortKey(b) - priceSortKey(a)
      })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, categories, search, filterPrayerRoom, filterDietary, filterFemaleMedical, pinnedProductIds, exchangeRate, markupRatesConfig])

  useEffect(() => {
    if (selectedCategoryId === '') {
      setPinnedProductIds(new Set([
        ...groups.flatMap(g => g.items.map(it => it.productId)),
        ...tripServices.map(it => it.productId),
      ]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId])

  const activeGroupIndex = groups.findIndex((g) => g.id === activeGroupId)

  // Upgrade cost above cheapest variant (KRW), converted to USD for display.
  function subpkgUpgradeUsd(p: Product, v: Variant): number {
    const variants = p.product_variants ?? []
    const toKrw = (x: { base_price: number; price_currency: string }) =>
      x.price_currency === 'USD' ? Math.round(x.base_price * exchangeRate) : x.base_price
    const minKrw = variants.length > 0 ? Math.min(...variants.map(toKrw)) : toKrw(v)
    return Math.max(0, toKrw(v) - minKrw) / exchangeRate
  }

  const totalUSD = useMemo(() => {
    const groupTotal = groups.reduce((total, g) => {
      return total + g.items.reduce((sum, it) => {
        const p = products.find(x => x.id === it.productId)
        const v = p?.product_variants?.find(x => x.id === it.variantId)
        if (!p || !v) return sum
        const cat = p.product_categories?.name
        const sub = p.product_subcategories?.name
        const mr = getMarkupRate(cat, sub, markupRatesConfig)
        const usd = cat === 'Subpackage' && mr === 0
          ? subpkgUpgradeUsd(p, v)
          : variantPriceUsd({ basePrice: v.base_price, priceCurrency: v.price_currency, exchangeRate, markupRate: mr })
        const memberCount = g.id === 'shared' ? sharedMemberCount : g.memberCount
        return sum + usd * memberCount
      }, 0)
    }, 0)

    const servicesTotal = tripServices.reduce((sum, it) => {
      const p = products.find(x => x.id === it.productId)
      const v = p?.product_variants?.find(x => x.id === it.variantId)
      if (!p || !v) return sum
      const cat = p.product_categories?.name
      const sub = p.product_subcategories?.name
      const mr = getMarkupRate(cat, sub, markupRatesConfig)
      const usd = cat === 'Subpackage' && mr === 0
        ? subpkgUpgradeUsd(p, v)
        : variantPriceUsd({ basePrice: v.base_price, priceCurrency: v.price_currency, exchangeRate, markupRate: mr })
      const daysForItem = isHotelItem(cat, sub) ? nights : (p.quantity_type === 'per_day' ? daysLive : it.days)
      return sum + usd * daysForItem
    }, 0)

    return groupTotal + servicesTotal
  }, [groups, tripServices, products, exchangeRate, markupRatesConfig, nights, daysLive, sharedMemberCount])

  // ── Cart handlers — groups ─────────────────────────────────────────────────

  function defaultVariantId(p: Product): string | null {
    const active = (p.product_variants ?? []).filter(v => v.is_active)
    return [...active].sort((a, b) => a.sort_order - b.sort_order)[0]?.id ?? null
  }

  function toggleProduct(productId: string, note?: string, toothCount?: number) {
    const p = products.find(x => x.id === productId)
    if (!p) return
    if (isSubpackageProduct(p)) {
      const variantId = defaultVariantId(p)
      if (variantId) toggleServiceItem(productId, variantId, note)
      return
    }
    const variantId = defaultVariantId(p)
    if (!variantId) return
    toggleItem(productId, variantId, p.product_subcategories?.name === 'Dental Clinic' ? (toothCount ?? 1) : undefined)
  }

  function toggleItem(productId: string, variantId: string, toothCount?: number) {
    setGroups(prev =>
      prev.map(g => {
        if (g.id !== activeGroupId) return g
        const idx = g.items.findIndex(it => it.productId === productId && it.variantId === variantId)
        if (idx >= 0) return { ...g, items: g.items.filter((_, i) => i !== idx) }
        return { ...g, items: [...g.items, { productId, variantId, ...(toothCount != null ? { toothCount } : {}) }] }
      })
    )
  }

  // Remove a specific item from a specific group (used by cart drawer, which targets any group).
  function removeFromGroup(groupId: string, productId: string, variantId: string) {
    setGroups(prev =>
      prev.map(g => g.id !== groupId ? g : {
        ...g, items: g.items.filter(it => !(it.productId === productId && it.variantId === variantId))
      })
    )
  }

  // ── Cart handlers — trip services ──────────────────────────────────────────

  function toggleServiceItem(productId: string, variantId: string, agentNote?: string) {
    setTripServices(prev => {
      const idx = prev.findIndex(it => it.productId === productId && it.variantId === variantId)
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      const p = products.find(x => x.id === productId)
      const isHotel = isHotelItem(p?.product_categories?.name, p?.product_subcategories?.name)
      const note = agentNote ? { agentNote } : {}
      if (isHotel) {
        return [...prev, { productId, variantId, days: Math.max(nights, 1), ...note }]
      }
      return [...prev, { productId, variantId, days: Math.max(daysBetween(dateStart, dateEnd), 1), ...note }]
    })
  }

  function setServiceDays(productId: string, variantId: string, days: number) {
    setTripServices(prev => prev.map(it =>
      it.productId === productId && it.variantId === variantId ? { ...it, days: Math.max(1, days) } : it
    ))
  }

  function updateServiceNote(productId: string, variantId: string, note: string) {
    setTripServices(prev => prev.map(it =>
      it.productId === productId && it.variantId === variantId ? { ...it, agentNote: note } : it
    ))
  }

  function updateItemToothCount(productId: string, variantId: string, count: number) {
    setGroups(prev => prev.map(g => ({
      ...g,
      items: g.items.map(it =>
        it.productId === productId && it.variantId === variantId ? { ...it, toothCount: Math.max(1, count) } : it
      ),
    })))
  }

  // ── Group management ───────────────────────────────────────────────────────

  function addGroup() {
    const nonShared = groups.filter(g => g.id !== 'shared')
    if (nonShared.length >= GROUP_PALETTE.length - 1) return
    const newGroup: Group = {
      id: `g-${Date.now()}`,
      name: `Group ${nonShared.length + 1}`,
      memberCount: 1,
      items: [],
    }
    setGroups(prev => [...prev, newGroup])
    setActiveGroupId(newGroup.id)
  }

  function removeGroup(groupId: string) {
    if (groupId === 'shared') return
    const nonShared = groups.filter(g => g.id !== 'shared')
    if (nonShared.length <= 1) return
    setGroups(prev => prev.filter(g => g.id !== groupId))
    if (activeGroupId === groupId) setActiveGroupId(groups.find(g => g.id !== groupId)?.id ?? '')
  }

  function setMemberCount(groupId: string, delta: number) {
    if (groupId === 'shared') return
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, memberCount: Math.max(1, g.memberCount + delta) } : g))
  }

  function commitRename() {
    if (!renamingGroupId) return
    const trimmed = renameValue.trim()
    if (trimmed) setGroups(prev => prev.map(g => g.id === renamingGroupId ? { ...g, name: trimmed } : g))
    setRenamingGroupId(null)
  }

  // ── Quote flow ─────────────────────────────────────────────────────────────

  function handleCreateQuote() {
    const hasProducts = groups.some(g => g.items.length > 0) || tripServices.length > 0
    if (!hasProducts) return
    if (!dateStart || !dateEnd) return
    if (!selectedClientId) { setShowClientModal(true); return }
    goToReview(selectedClientId)
  }

  function goToReview(clientId: string) {
    const cart = { version: CART_VERSION, clientId, dateStart, dateEnd, tripName, groups, tripServices }
    localStorage.setItem(`agent-cart-${agentId}`, JSON.stringify(cart))
    router.push('/agent/product/review')
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
    if (!agentId) { setClientError('Agent profile not loaded. Please refresh.'); return }
    setSavingClient(true); setClientError('')
    try {
      const { data: maxCLRow } = await supabase.from('clients').select('client_number').order('client_number', { ascending: false }).limit(1).maybeSingle()
      const maxCLNum = maxCLRow?.client_number ? (parseInt(maxCLRow.client_number.replace(/\D/g, ''), 10) || 0) : 0
      const { data, error } = await supabase
        .from('clients')
        .insert({
          client_number: `#CL-${String(maxCLNum + 1).padStart(3, '0')}`,
          agent_id: agentId,
          name: f.name.trim(), nationality: f.nationality.trim(), gender: f.gender,
          date_of_birth: f.date_of_birth, phone: f.phone.trim(), email: f.email.trim(),
          needs_muslim_friendly: f.needs_muslim_friendly,
          dietary_restriction: f.dietary_restriction,
          special_requests: f.special_requests || null,
        })
        .select('id, client_number, name, nationality')
        .single()
      if (error) throw error
      setClients(prev => [...prev, data])
      setSelectedClientId(data.id)
      setShowClientModal(false)
      setClientForm(DEFAULT_CLIENT_FORM)
      goToReview(data.id)
    } catch (e: unknown) {
      setClientError((e as { message?: string })?.message ?? 'Failed to register client.')
    } finally { setSavingClient(false) }
  }

  function setField<K extends keyof ClientForm>(key: K, val: ClientForm[K]) {
    setClientForm(prev => ({ ...prev, [key]: val }))
  }

  // ── Price helpers ──────────────────────────────────────────────────────────

  function priceLabel(p: Product): string {
    const variants = (p.product_variants ?? []).filter(v => v.is_active)
    if (variants.length === 0) return '—'
    const cat = p.product_categories?.name
    const sub = p.product_subcategories?.name
    const markupRate = getMarkupRate(cat, sub, markupRatesConfig)
    const isSubpkgFree = cat === 'Subpackage' && markupRate === 0
    const prices = isSubpkgFree
      ? variants.map(v => subpkgUpgradeUsd(p, v))
      : variants.map(v => variantPriceUsd({
          basePrice: v.base_price, priceCurrency: v.price_currency, exchangeRate,
          markupRate,
        }))
    const min = Math.min(...prices), max = Math.max(...prices)
    if (min === 0 && max === 0) return cat === 'Subpackage' ? 'Free' : 'Price on request'
    const fmt = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    if (isSubpkgFree) {
      return max === 0 ? 'Free' : `Free – ${fmt(max)}`
    }
    if (min === max) return `$${min.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `${fmt(min)} – ${fmt(max)}`
  }

  function toUSD(p: Product): string { return priceLabel(p) }

  // ── Product card ───────────────────────────────────────────────────────────

  function renderProductCard(product: Product, compact = false) {
    const isSubpkg = isSubpackageProduct(product)
    const inServices = isSubpkg && tripServices.some(it => it.productId === product.id)
    const isHotelProduct = isHotelItem(product.product_categories?.name, product.product_subcategories?.name)
    const activeGroup = groups[activeGroupIndex]
    const inActiveGroup = !isSubpkg && (activeGroup?.items.some(it => it.productId === product.id) ?? false)
    const otherGroupsWithProduct = isSubpkg ? [] : groups.filter(
      g => g.id !== activeGroupId && g.items.some(it => it.productId === product.id)
    )
    const inOtherGroup = otherGroupsWithProduct.length > 0
    const variantCount = (product.product_variants ?? []).filter(v => v.is_active).length
    const activePalette = GROUP_PALETTE[activeGroupIndex]
    const imgs = [...(product.product_images ?? [])].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
    const imgIdx = imageIndexes[product.id] ?? 0
    const currentImg = imgs[imgIdx]

    const isSelected = isSubpkg ? inServices : inActiveGroup

    return (
      <div
        key={product.id}
        className={`bg-white rounded-2xl border-2 overflow-hidden flex flex-col transition-all ${
          isSelected
            ? 'border-[#0f4c35]'
            : inOtherGroup
            ? 'border-[#0f4c35] border-dashed'
            : 'border-gray-100'
        }`}
      >
        {/* Image */}
        <div
          className="aspect-[16/10] bg-gray-100 overflow-hidden relative group/img cursor-pointer"
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
          {imgs.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setImageIndexes(prev => ({ ...prev, [product.id]: (imgIdx - 1 + imgs.length) % imgs.length })) }}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity text-xs">‹</button>
              <button onClick={(e) => { e.stopPropagation(); setImageIndexes(prev => ({ ...prev, [product.id]: (imgIdx + 1) % imgs.length })) }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity text-xs">›</button>
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                {imgs.map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === imgIdx ? 'bg-white' : 'bg-white/40'}`} />)}
              </div>
            </>
          )}
          {inOtherGroup && !inActiveGroup && (
            <div className="absolute top-1.5 left-1.5 flex gap-1 z-10">
              {otherGroupsWithProduct.map(g => {
                const gIdx = groups.findIndex(x => x.id === g.id)
                const label = g.name.length <= 6 ? g.name : `G${gIdx + 1}`
                return <span key={g.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#0f4c35] text-white">{label}</span>
              })}
            </div>
          )}
          {/* Trip Services badge */}
          {inServices && (
            <div className="absolute top-1.5 right-1.5 z-10">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#0f4c35] text-white">Services</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-2.5 flex flex-col flex-1 gap-1">
          {product.product_subcategories?.name && (
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide truncate">{product.product_subcategories.name}</p>
          )}
          {product.partner_name && (
            <p className="text-[10px] text-gray-500 truncate">{product.partner_name}</p>
          )}
          <button onClick={() => openDetail(product)}
            className="text-sm font-semibold text-gray-900 leading-tight text-left hover:text-[#0f4c35] transition-colors line-clamp-1">
            {product.name}
          </button>

          <div className="mt-auto min-w-0">
            <p className={`text-sm font-bold leading-tight truncate ${priceLabel(product) === 'Price on request' ? 'text-amber-600' : 'text-gray-900'}`}>{priceLabel(product)}</p>
            {product.duration_value && (
              <p className="text-[10px] text-gray-400">{product.duration_value} {product.duration_unit}</p>
            )}
          </div>

          {(product.has_female_doctor || product.has_prayer_room) && (
            <div className="flex flex-wrap gap-x-2 text-[10px] text-gray-500">
              {product.has_female_doctor && <span className="inline-flex items-center gap-0.5"><svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Female</span>}
              {product.has_prayer_room && <span className="inline-flex items-center gap-0.5"><svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Prayer</span>}
            </div>
          )}

          {/* Action button */}
          {isSubpkg ? (
            // Subpackage → Trip Services
            variantCount > 1 ? (
              <button onClick={() => openDetail(product)}
                className={`mt-1 w-full py-1 rounded-lg text-[11px] font-medium transition-all ${
                  inServices ? 'bg-[#0f4c35] hover:bg-[#0a3526] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {inServices ? '✓ In Services · pick more' : `Choose · ${variantCount} options`}
              </button>
            ) : (
              <button onClick={() => toggleProduct(product.id)}
                className={`mt-1 w-full py-1 rounded-lg text-[11px] font-medium transition-all ${
                  inServices ? 'bg-[#0f4c35] hover:bg-[#0a3526] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {inServices ? '✓ In Services' : '+ Add to Services'}
              </button>
            )
          ) : (
            // Non-Subpackage → Group
            variantCount > 1 ? (
              <button onClick={() => openDetail(product)}
                className={`mt-1 w-full py-1 rounded-lg text-[11px] font-medium transition-all ${
                  inActiveGroup ? activePalette.btn : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {inActiveGroup ? `✓ in ${groups[activeGroupIndex]?.name} · pick more` : `Choose · ${variantCount} options`}
              </button>
            ) : (
              <button onClick={() => toggleProduct(product.id)}
                className={`mt-1 w-full py-1 rounded-lg text-[11px] font-medium transition-all ${
                  inActiveGroup ? activePalette.btn : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {inActiveGroup ? `✓ ${groups[activeGroupIndex]?.name}` : `+ ${groups[activeGroupIndex]?.name ?? 'Group'}`}
              </button>
            )
          )}
        </div>
      </div>
    )
    void compact
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  )

  const selectedCategoryName = categories.find(c => c.id === selectedCategoryId)?.name ?? ''
  const isSubpackageCategoryActive = selectedCategoryName === 'Subpackage'

  return (
    <div className="flex flex-col h-full">

      {/* Cart restored banner */}
      {cartRestoredBanner && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-green-50 border-b border-green-200">
          <p className="text-xs text-green-800">In-progress cart restored.</p>
          <button
            onClick={() => {
              localStorage.removeItem(`agent-cart-${agentId}`)
              setGroups([{ id: 'shared', name: 'Shared Activities', memberCount: 0, items: [] }, { id: 'g1', name: 'Group 1', memberCount: 1, items: [] }])
              setTripServices([])
              setActiveGroupId('g1')
              setSelectedClientId(''); setDateStart(''); setDateEnd(''); setTripName('')
              setCartRestoredBanner(false)
            }}
            className="text-xs font-medium text-green-700 hover:text-green-900 underline shrink-0">
            Clear &amp; start fresh
          </button>
        </div>
      )}

      {/* ── Top Bar ── */}
      <div className="shrink-0 bg-white border-b border-gray-100 flex flex-col md:flex-row md:items-center md:h-14 gap-2 md:gap-4 px-4 md:px-6 py-3 md:py-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 whitespace-nowrap">Trip Name</span>
          <input type="text" value={tripName} onChange={e => setTripName(e.target.value)}
            placeholder="e.g. Interview's Family"
            className="flex-1 md:flex-none text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f4c35] text-gray-900 md:w-48" />
        </div>
        <div className="hidden md:block h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 whitespace-nowrap">Client</span>
          <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
            className="flex-1 md:flex-none text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f4c35] bg-white text-gray-700 md:max-w-[180px]">
            <option value="">Select client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="hidden md:block h-4 w-px bg-gray-200" />
        {(() => {
          const today = new Date().toISOString().slice(0, 10)
          return (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-gray-400 whitespace-nowrap">Date *</span>
              <input type="date" value={dateStart} min={today}
                onChange={e => { setDateStart(e.target.value); if (dateEnd && e.target.value > dateEnd) setDateEnd(e.target.value) }}
                className="flex-1 md:flex-none min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#0f4c35] text-gray-700" />
              <span className="text-xs text-gray-300">~</span>
              <input type="date" value={dateEnd} min={dateStart || today}
                onChange={e => setDateEnd(e.target.value)}
                className="flex-1 md:flex-none min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#0f4c35] text-gray-700" />
            </div>
          )
        })()}
      </div>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Filter Bar */}
        <div className="shrink-0 bg-white border-b border-gray-100 px-4 md:px-6 py-2.5 flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input type="text" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#0f4c35] bg-white" />
            </div>
            {(() => {
              const activeCount = (filterPrayerRoom ? 1 : 0) + (filterFemaleMedical ? 1 : 0) + filterDietary.length
              return (
                <div className="relative ml-auto shrink-0">
                  <button onClick={() => setFilterOpen(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${activeCount > 0 ? 'border-[#0f4c35] text-[#0f4c35] bg-[#0f4c35]/5' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6 12h12M10 19.5h4" /></svg>
                    Muslim Friendly{activeCount > 0 ? ` · ${activeCount}` : ''}
                    <svg className={`w-3 h-3 transition-transform ${filterOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  {filterOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                      <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-3 w-60">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={filterPrayerRoom} onChange={e => setFilterPrayerRoom(e.target.checked)} className="accent-[#0f4c35] w-3.5 h-3.5" />
                          <span className="text-xs text-gray-700">Prayer room</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={filterFemaleMedical} onChange={e => setFilterFemaleMedical(e.target.checked)} className="accent-[#0f4c35] w-3.5 h-3.5" />
                          <span className="text-xs text-gray-700">Female medical staff</span>
                        </label>
                        <div className="border-t border-gray-100 pt-2">
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Dietary</p>
                          <div className="space-y-1.5">
                            {DIETARY_FILTER_OPTIONS.map(opt => (
                              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={filterDietary.includes(opt.value)}
                                  onChange={e => setFilterDietary(prev => e.target.checked ? [...prev, opt.value] : prev.filter(v => v !== opt.value))}
                                  className="accent-[#0f4c35] w-3.5 h-3.5" />
                                <span className="text-xs text-gray-700">{opt.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        {activeCount > 0 && (
                          <button onClick={() => { setFilterPrayerRoom(false); setFilterFemaleMedical(false); setFilterDietary([]) }}
                            className="text-[11px] text-gray-500 hover:text-gray-800 underline">Clear all</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Category pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1">
            {[{ id: '', name: 'All' }, ...categories].map(cat => (
              <button key={cat.id || 'all'}
                onClick={() => { setSelectedCategoryId(cat.id); setSelectedSubcategoryName(''); setSelectedPartnerName('') }}
                className={`shrink-0 px-3 py-1.5 text-xs rounded-full border transition-colors ${selectedCategoryId === cat.id ? 'bg-[#0f4c35] border-[#0f4c35] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Subcategory pills */}
        {selectedCategoryId && availableSubcategories.length > 0 && (
          <div className="shrink-0 bg-white border-b border-gray-100 px-4 md:px-6 py-2 flex items-center gap-1.5 overflow-x-auto">
            <button onClick={() => { setSelectedSubcategoryName(''); setSelectedPartnerName('') }}
              className={`shrink-0 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${selectedSubcategoryName === '' ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              All
            </button>
            {availableSubcategories.map(sub => (
              <button key={sub} onClick={() => { setSelectedSubcategoryName(sub); setSelectedPartnerName('') }}
                className={`shrink-0 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${selectedSubcategoryName === sub ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {sub}
              </button>
            ))}
          </div>
        )}

        {/* Partner pills — 3rd tier, only for partner-grouped subcategories */}
        {selectedCategoryId && availablePartnerNames.length > 1 && (
          <div className="shrink-0 bg-white border-b border-gray-100 px-4 md:px-6 py-2 flex items-center gap-1.5 overflow-x-auto">
            <button onClick={() => setSelectedPartnerName('')}
              className={`shrink-0 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${selectedPartnerName === '' ? 'bg-[#0f4c35] border-[#0f4c35] text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              All
            </button>
            {availablePartnerNames.map(tertiary => (
              <button key={tertiary} onClick={() => setSelectedPartnerName(tertiary)}
                className={`shrink-0 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${selectedPartnerName === tertiary ? 'bg-[#0f4c35] border-[#0f4c35] text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {tertiary}
              </button>
            ))}
          </div>
        )}

        {/* Subpackage context banner */}
        {isSubpackageCategoryActive && (
          <div className="shrink-0 bg-[#0f4c35]/5 border-b border-[#0f4c35]/10 px-4 md:px-6 py-2">
            <p className="text-xs text-[#0f4c35]">These items go to <strong>Trip Services</strong> — priced by days or nights, not per person.</p>
          </div>
        )}

        {/* Product grid */}
        <div className="flex-1 bg-gray-50 p-4 md:p-6 overflow-y-auto">
          {selectedCategoryId === '' ? (
            Array.from(productsByCategory.values()).every(arr => arr.length === 0) ? (
              <div className="flex items-center justify-center h-48"><p className="text-sm text-gray-400">No products found</p></div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {categories.map(cat => {
                  const items = productsByCategory.get(cat.id) ?? []
                  if (items.length === 0) return null
                  const PREVIEW = 3
                  const preview = items.slice(0, PREVIEW)
                  const hasMore = items.length > PREVIEW
                  return (
                    <section key={cat.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col">
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                        <h2 className="text-sm font-semibold text-gray-800">{cat.name}</h2>
                        <button onClick={() => setSelectedCategoryId(cat.id)} className="text-xs text-[#0f4c35] font-medium hover:underline">
                          {hasMore ? `See all (${items.length}) →` : 'See all →'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {preview.map(p => renderProductCard(p, true))}
                      </div>
                    </section>
                  )
                })}
              </div>
            )
          ) : selectedSubcategoryName === '' && selectedPartnerName === '' && availableSubcategories.length > 1 ? (
            // Category "All" view — group by subcategory
            Array.from(productsBySubcategory.values()).every(arr => arr.length === 0) ? (
              <div className="flex items-center justify-center h-48"><p className="text-sm text-gray-400">No products found</p></div>
            ) : (
              <div className="space-y-6">
                {availableSubcategories.map(sub => {
                  const items = productsBySubcategory.get(sub) ?? []
                  if (items.length === 0) return null
                  const PREVIEW = 6
                  const preview = items.slice(0, PREVIEW)
                  const hasMore = items.length > PREVIEW
                  return (
                    <div key={sub}>
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                        <h2 className="text-sm font-semibold text-gray-700">{sub}</h2>
                        <button onClick={() => setSelectedSubcategoryName(sub)} className="text-xs text-[#0f4c35] font-medium hover:underline">
                          {hasMore ? `See all (${items.length}) →` : 'See all →'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {preview.map(p => renderProductCard(p, true))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : filteredProducts.length === 0 ? (
            <div className="flex items-center justify-center h-48"><p className="text-sm text-gray-400">No products found</p></div>
          ) : (() => {
            const selectedCatName = categories.find(c => c.id === selectedCategoryId)?.name ?? ''
            const isKBeautyWithSub = selectedCatName === 'K-Beauty' && selectedSubcategoryName !== ''
            return PARTNER_GROUPED_SUBCATEGORIES.has(selectedSubcategoryName) ||
              isKBeautyWithSub ||
              (selectedSubcategoryName === '' && filteredProducts.length > 0 &&
                filteredProducts.every(p => productTagNames(p).some(n => PARTNER_GROUPED_SUBCATEGORIES.has(n))))
          })() ? (
            (() => {
              const byPartner = new Map<string, Product[]>()
              for (const p of filteredProducts) {
                const partner = p.partner_name ?? 'Other'
                if (!byPartner.has(partner)) byPartner.set(partner, [])
                byPartner.get(partner)!.push(p)
              }
              const showHeaders = byPartner.size > 1
              return (
                <div className="space-y-6">
                  {Array.from(byPartner.entries()).map(([partner, partnerProducts]) => (
                    <div key={partner}>
                      {showHeaders && (
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-200">{partner}</h3>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {partnerProducts.map(p => renderProductCard(p))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {filteredProducts.map(p => renderProductCard(p))}
            </div>
          )}
        </div>
      </div>

      {/* ── Trip Services Row ── shown when Subpackage is active OR services exist */}
      {(isSubpackageCategoryActive || tripServices.length > 0) && (
        <div className="shrink-0 bg-white border-t border-gray-100 px-4 md:px-6 py-2 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-gray-500 whitespace-nowrap shrink-0">Trip Services</span>
          {tripServices.length === 0 ? (
            <span className="text-xs text-gray-400">Select from Subpackage category above</span>
          ) : (
            (() => {
              return tripServices.map(it => {
              const p = products.find(x => x.id === it.productId)
              const v = p?.product_variants?.find(x => x.id === it.variantId)
              if (!p || !v) return null
              const isHotel = isHotelItem(p.product_categories?.name, p.product_subcategories?.name)
              const label = v.variant_label ? `${p.name} · ${v.variant_label}` : p.name
              const unit = isHotel ? 'n' : 'd'
              const maxDays = isHotel ? Infinity : Math.max(daysLive, 1)
              return (
                <div key={`${it.productId}:${it.variantId}`}
                  className="flex items-center gap-1 px-2.5 py-1 bg-[#0f4c35]/5 border border-[#0f4c35]/20 rounded-lg text-xs text-[#0f4c35] whitespace-nowrap shrink-0">
                  <span className="truncate max-w-[120px]">{label}</span>
                  <span className="mx-0.5 opacity-40">·</span>
                  <button onClick={() => setServiceDays(it.productId, it.variantId, it.days - 1)}
                    disabled={it.days <= 1}
                    className="opacity-60 hover:opacity-100 disabled:opacity-20 font-bold px-0.5">−</button>
                  <span className="min-w-[20px] text-center">{it.days}{unit}</span>
                  <button onClick={() => setServiceDays(it.productId, it.variantId, it.days + 1)}
                    disabled={it.days >= maxDays}
                    className="opacity-60 hover:opacity-100 disabled:opacity-20 font-bold px-0.5">+</button>
                  <button onClick={() => toggleServiceItem(it.productId, it.variantId)}
                    className="ml-1 opacity-50 hover:opacity-100 text-base leading-none">×</button>
                </div>
              )
            })})()
          )}
        </div>
      )}

      {/* ── Bottom Bar ── */}
      <div className="shrink-0 bg-white border-t border-gray-100 flex flex-col md:flex-row md:items-center md:h-14 gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-0">
        {/* Groups */}
        <div className="flex items-center gap-2 flex-1 overflow-x-auto">
          {groups.map((group, idx) => {
            const palette = GROUP_PALETTE[idx]
            const isActive = group.id === activeGroupId
            return (
              <div key={group.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all shrink-0 ${isActive ? palette.tab : palette.tabOff}`}
                onClick={() => setActiveGroupId(group.id)}>
                {renamingGroupId === group.id ? (
                  <input autoFocus value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingGroupId(null) }}
                    onClick={e => e.stopPropagation()}
                    className="w-28 bg-transparent border-b border-current outline-none text-xs" />
                ) : (
                  <>
                    <span
                      onDoubleClick={e => {
                        // Shared group is not renameable — its name is used as a convention
                        if (group.id === 'shared') return
                        e.stopPropagation()
                        setRenamingGroupId(group.id)
                        setRenameValue(group.name)
                      }}>
                      {group.name}
                    </span>
                    {isActive && group.id !== 'shared' && (
                      <button onClick={e => { e.stopPropagation(); setRenamingGroupId(group.id); setRenameValue(group.name) }}
                        title="Rename group" className="opacity-60 hover:opacity-100 ml-0.5">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                    )}
                  </>
                )}
                {/* Member count — Shared auto-sums; others are editable */}
                {group.id === 'shared' ? (
                  <span className="ml-1 text-[10px] opacity-70">{sharedMemberCount} pax</span>
                ) : (
                  <div className="flex items-center gap-0.5 ml-1">
                    <button onClick={e => { e.stopPropagation(); setMemberCount(group.id, -1) }} className="w-4 h-4 flex items-center justify-center rounded opacity-70 hover:opacity-100">−</button>
                    <span className="min-w-[14px] text-center">{group.memberCount}</span>
                    <button onClick={e => { e.stopPropagation(); setMemberCount(group.id, 1) }} className="w-4 h-4 flex items-center justify-center rounded opacity-70 hover:opacity-100">+</button>
                  </div>
                )}
                {group.id !== 'shared' && groups.filter(g => g.id !== 'shared').length > 1 && isActive && (
                  <button onClick={e => { e.stopPropagation(); removeGroup(group.id) }} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
                )}
              </div>
            )
          })}
          {groups.length < GROUP_PALETTE.length && (
            <button onClick={addGroup}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-600 transition-all shrink-0">
              + Add Group
            </button>
          )}
        </div>

        {/* Total + CTA */}
        {(() => {
          const hasProducts = groups.some(g => g.items.length > 0) || tripServices.length > 0
          const missingDates = !dateStart || !dateEnd
          const hint = !hasProducts ? 'Add at least one product to continue'
            : missingDates ? 'Select travel dates to continue'
            : ''
          const totalItemCount = groups.reduce((n, g) => n + g.items.length, 0) + tripServices.length
          return (
            <div className="flex items-center gap-3 md:gap-4 shrink-0">
              {hint && <p className="hidden md:block text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">{hint}</p>}
              {/* Cart summary button */}
              <button
                onClick={() => setShowCartDrawer(true)}
                disabled={!hasProducts}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                <span>Cart</span>
                {totalItemCount > 0 && (
                  <span className="bg-[#0f4c35] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{totalItemCount}</span>
                )}
              </button>
              <div className="text-left md:text-right flex-1 md:flex-none">
                <p className="text-[10px] text-gray-400">Total</p>
                <p className="text-sm font-bold text-gray-900">${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <button onClick={handleCreateQuote} disabled={!hasProducts || missingDates} title={hint}
                className="px-5 py-2 bg-[#0f4c35] text-white text-sm font-medium rounded-xl hover:bg-[#0a3828] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Create Quote
              </button>
            </div>
          )
        })()}
      </div>

      {/* ── Cart Drawer ── */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowCartDrawer(false)}>
          <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Cart</h2>
              <button onClick={() => setShowCartDrawer(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none p-1 -m-1">×</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* Group items */}
              {groups.map(group => {
                if (group.items.length === 0) return null
                const palette = GROUP_PALETTE[groups.indexOf(group)]
                const memberCount = group.id === 'shared' ? sharedMemberCount : group.memberCount
                return (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${palette.tab}`}>{group.name}</span>
                      <span className="text-[10px] text-gray-400">{memberCount} pax</span>
                    </div>
                    <div className="space-y-1">
                      {group.items.map(item => {
                        const p = products.find(x => x.id === item.productId)
                        const v = p?.product_variants?.find(x => x.id === item.variantId)
                        if (!p || !v) return null
                        const cat = p.product_categories?.name
                        const sub = p.product_subcategories?.name
                        const isDentalItem = sub === 'Dental Clinic'
                        const mr = getMarkupRate(cat, sub, markupRatesConfig)
                        const usd = cat === 'Subpackage' && mr === 0
                          ? subpkgUpgradeUsd(p, v)
                          : variantPriceUsd({ basePrice: v.base_price, priceCurrency: v.price_currency, exchangeRate, markupRate: mr })
                        const toothCount = item.toothCount ?? 1
                        return (
                          <div key={`${item.productId}-${item.variantId}`} className="px-3 py-2 bg-gray-50 rounded-lg space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-800 truncate font-medium">{p.name}</p>
                                <p className="text-[10px] text-gray-400 truncate">
                                  {v.variant_label ? `${v.variant_label} · ` : ''}{usd === 0 ? 'Free' : `${fmtUSD(usd)} × ${isDentalItem ? `${toothCount} teeth` : memberCount}`}
                                </p>
                              </div>
                              <p className="text-xs font-semibold text-gray-700 shrink-0">{usd === 0 ? 'Free' : fmtUSD(usd * (isDentalItem ? toothCount : memberCount))}</p>
                              <button onClick={() => removeFromGroup(group.id, item.productId, item.variantId)}
                                className="text-gray-300 hover:text-red-400 shrink-0 text-base leading-none ml-1">×</button>
                            </div>
                            {isDentalItem && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400">Teeth:</span>
                                <button onClick={() => updateItemToothCount(item.productId, item.variantId, toothCount - 1)}
                                  className="w-5 h-5 rounded border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-xs font-bold">−</button>
                                <span className="text-xs font-semibold text-gray-800 min-w-[1.25rem] text-center">{toothCount}</span>
                                <button onClick={() => updateItemToothCount(item.productId, item.variantId, toothCount + 1)}
                                  className="w-5 h-5 rounded border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-xs font-bold">+</button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Trip Services */}
              {tripServices.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">Trip Services</span>
                  </div>
                  <div className="space-y-1">
                    {tripServices.map(it => {
                      const p = products.find(x => x.id === it.productId)
                      const v = p?.product_variants?.find(x => x.id === it.variantId)
                      if (!p || !v) return null
                      const cat = p.product_categories?.name
                      const sub = p.product_subcategories?.name
                      const isHotel = isHotelItem(cat, sub)
                      const unit = isHotel ? 'n' : 'd'
                      const qty = isHotel ? nights : (p.quantity_type === 'per_day' ? daysLive : it.days)
                      const mr = getMarkupRate(cat, sub, markupRatesConfig)
                      const usd = cat === 'Subpackage' && mr === 0
                        ? subpkgUpgradeUsd(p, v)
                        : variantPriceUsd({ basePrice: v.base_price, priceCurrency: v.price_currency, exchangeRate, markupRate: mr })
                      return (
                        <div key={`${it.productId}-${it.variantId}`} className="px-3 py-2 bg-gray-50 rounded-lg space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-800 truncate font-medium">{p.name}</p>
                              <p className="text-[10px] text-gray-400 truncate">
                                {v.variant_label ? `${v.variant_label} · ` : ''}{qty}{unit}
                              </p>
                            </div>
                            <p className="text-xs font-semibold text-gray-700 shrink-0">
                              {usd === 0 ? 'Free' : fmtUSD(usd * qty)}
                            </p>
                            <button
                              onClick={() => toggleServiceItem(it.productId, it.variantId)}
                              className="text-gray-300 hover:text-red-400 shrink-0 text-base leading-none ml-1">×</button>
                          </div>
                          <textarea
                            value={it.agentNote ?? ''}
                            onChange={e => updateServiceNote(it.productId, it.variantId, e.target.value)}
                            placeholder={isHotel ? 'e.g. 2 adults, non-smoking' : 'Agent note (admin only)'}
                            rows={1}
                            className="w-full border border-gray-200 rounded-md px-2 py-1 text-[11px] text-gray-700 resize-none focus:outline-none focus:border-[#0f4c35] placeholder:text-gray-300"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {groups.every(g => g.items.length === 0) && tripServices.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No items yet.</p>
              )}
            </div>

            {/* Footer total */}
            <div className="shrink-0 border-t border-gray-100 px-5 py-4 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Total</span>
                <span className="text-base font-bold text-[#0f4c35]">{fmtUSD(totalUSD)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Detail Modal ── */}
      {detailProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetailProduct(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                      <button onClick={() => setModalImageIndex((idx - 1 + imgs.length) % imgs.length)} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center text-lg">‹</button>
                      <button onClick={() => setModalImageIndex((idx + 1) % imgs.length)} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center text-lg">›</button>
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
                  <p className="text-xs text-gray-400 mb-1">
                    {detailProduct.product_categories?.name ?? '—'}
                    {detailProduct.product_subcategories?.name && ` · ${detailProduct.product_subcategories.name}`}
                  </p>
                  <h2 className="text-lg font-semibold text-gray-900">{detailProduct.name}</h2>
                  {detailProduct.partner_name && <p className="text-xs text-gray-500 mt-0.5">{detailProduct.partner_name}</p>}
                </div>
                <button onClick={() => setDetailProduct(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Variant picker */}
              {(() => {
                const isSubpkg = isSubpackageProduct(detailProduct)
                const detailCat = detailProduct.product_categories?.name
                const detailSub = detailProduct.product_subcategories?.name
                const detailIsSubpkg = isSubpkg
                const detailMarkupRate = getMarkupRate(detailCat, detailSub, markupRatesConfig)
                const allDetailVariants = (detailProduct.product_variants ?? []).filter(v => v.is_active)
                const toKrwDetail = (v: Variant) =>
                  v.price_currency === 'USD' ? Math.round(v.base_price * exchangeRate) : v.base_price
                const minDetailKrw = allDetailVariants.length > 0
                  ? Math.min(...allDetailVariants.map(toKrwDetail)) : 0
                const variantUsd = (v: Variant) => {
                  if (detailIsSubpkg && detailMarkupRate === 0)
                    return Math.max(0, toKrwDetail(v) - minDetailKrw) / exchangeRate
                  return variantPriceUsd({ basePrice: v.base_price, priceCurrency: v.price_currency, exchangeRate, markupRate: detailMarkupRate })
                }
                const subpkgFreeSort = detailIsSubpkg && detailMarkupRate === 0
                const variants = allDetailVariants
                  .sort((a, b) => (subpkgFreeSort
                    ? variantUsd(a) - variantUsd(b)
                    : variantUsd(b) - variantUsd(a)) || a.sort_order - b.sort_order)

                if (variants.length <= 1) {
                  return (
                    <div className="flex items-center gap-4">
                      <div className="bg-gray-50 rounded-xl px-4 py-2.5 text-center">
                        <p className={`text-lg font-bold ${toUSD(detailProduct) === 'Price on request' ? 'text-amber-600' : 'text-gray-900'}`}>{toUSD(detailProduct)}</p>
                        <p className="text-xs text-gray-400">{toUSD(detailProduct) === 'Price on request' ? 'contact us' : isSubpkg ? 'per day / unit' : 'per person'}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl px-4 py-2.5 text-center">
                        <p className="text-base font-semibold text-gray-900">{detailProduct.duration_value} {detailProduct.duration_unit}</p>
                        <p className="text-xs text-gray-400">duration</p>
                      </div>
                    </div>
                  )
                }

                const activeGroup = groups[activeGroupIndex]
                const usdFor = (v: typeof variants[number]) => variantUsd(v)

                const groupsByPrefix: { prefix: string; items: typeof variants }[] = []
                const prefixIdx = new Map<string, number>()
                for (const v of variants) {
                  const label = v.variant_label || 'Default'
                  const sepIdx = label.lastIndexOf(' · ')
                  const prefix = sepIdx >= 0 ? label.slice(0, sepIdx) : label
                  if (!prefixIdx.has(prefix)) { prefixIdx.set(prefix, groupsByPrefix.length); groupsByPrefix.push({ prefix, items: [] }) }
                  groupsByPrefix[prefixIdx.get(prefix)!].items.push(v)
                }
                const useTwoLevel = groupsByPrefix.length >= 2

                const renderVariantRow = (v: typeof variants[number], showFullLabel: boolean) => {
                  const inCart = isSubpkg
                    ? tripServices.some(it => it.productId === detailProduct.id && it.variantId === v.id)
                    : (activeGroup?.items.some(it => it.productId === detailProduct.id && it.variantId === v.id) ?? false)
                  const usd = usdFor(v)
                  const label = v.variant_label || 'Default'
                  const sepIdx = label.lastIndexOf(' · ')
                  const display = showFullLabel || sepIdx < 0 ? label : label.slice(sepIdx + 3)
                  return (
                    <button key={v.id}
                      onClick={() => isSubpkg ? toggleServiceItem(detailProduct.id, v.id, modalNote || undefined) : toggleItem(detailProduct.id, v.id, detailProduct.product_subcategories?.name === 'Dental Clinic' ? modalToothCount : undefined)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-colors ${inCart ? 'border-[#0f4c35] bg-[#0f4c35]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-900">{display}</p>
                      </div>
                      <div className="text-right">
                        {usd === 0 && detailIsSubpkg
                          ? <p className="text-sm font-semibold text-gray-500">Free</p>
                          : usd === 0
                            ? <p className="text-sm font-bold text-amber-600">Price on request</p>
                            : <p className={`text-sm font-bold ${inCart ? 'text-[#0f4c35]' : 'text-gray-900'}`}>${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        }
                        {v.overtime_rate_krw && detailIsSubpkg && (
                          <p className="text-[10px] text-gray-400">+₩{v.overtime_rate_krw.toLocaleString('ko-KR')}/h OT</p>
                        )}
                        <p className="text-[10px] text-gray-400">{inCart ? '✓ in cart' : 'tap to add'}</p>
                      </div>
                    </button>
                  )
                }

                if (!useTwoLevel) return (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500">Choose option</p>
                    {variants.map(v => renderVariantRow(v, true))}
                  </div>
                )

                return (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500">Choose option</p>
                    {groupsByPrefix.map((g, gi) => {
                      if (g.items.length === 1) return renderVariantRow(g.items[0], true)
                      const anyInCart = g.items.some(v =>
                        isSubpkg
                          ? tripServices.some(it => it.productId === detailProduct.id && it.variantId === v.id)
                          : (activeGroup?.items.some(it => it.productId === detailProduct.id && it.variantId === v.id) ?? false)
                      )
                      const expanded = expandedVariantGroup[`${detailProduct.id}::${gi}`] ?? anyInCart
                      const prices = g.items.map(usdFor)
                      const min = Math.min(...prices), max = Math.max(...prices)
                      const range = (detailIsSubpkg && min === 0 && max === 0) ? 'Free'
                        : (min === 0 && max === 0) ? 'Price on request'
                        : min === max ? `$${min.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                        : `$${min.toLocaleString('en-US', { maximumFractionDigits: 0 })} – $${max.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                      return (
                        <div key={g.prefix} className="space-y-2">
                          <button onClick={() => setExpandedVariantGroup(s => ({ ...s, [`${detailProduct.id}::${gi}`]: !expanded }))}
                            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-colors ${anyInCart ? 'border-[#0f4c35] bg-[#0f4c35]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                            <div className="text-left flex items-center gap-2">
                              <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                              <p className="text-sm font-medium text-gray-900">{g.prefix}</p>
                              <span className="text-[10px] text-gray-400">({g.items.length})</span>
                            </div>
                            <p className="text-sm font-semibold text-gray-700">{range}</p>
                          </button>
                          {expanded && <div className="pl-6 space-y-2">{g.items.map(v => renderVariantRow(v, false))}</div>}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Agent note — Subpackage */}
              {isSubpackageProduct(detailProduct) && (() => {
                const inCartServices = tripServices.filter(it => it.productId === detailProduct.id)
                return (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Agent Note <span className="font-normal text-gray-400">(admin only)</span></p>
                    {inCartServices.length > 0 ? (
                      <div className="space-y-2">
                        {inCartServices.map(svc => {
                          const v = (detailProduct.product_variants ?? []).find(x => x.id === svc.variantId)
                          return (
                            <div key={svc.variantId}>
                              {inCartServices.length > 1 && v?.variant_label && (
                                <p className="text-[11px] text-gray-400 mb-1">{v.variant_label}</p>
                              )}
                              <textarea
                                value={svc.agentNote ?? ''}
                                onChange={e => updateServiceNote(svc.productId, svc.variantId, e.target.value)}
                                placeholder="e.g. Fluent in Arabic, client prefers female interpreter"
                                rows={2}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:border-[#0f4c35]"
                              />
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <textarea
                        value={modalNote}
                        onChange={e => setModalNote(e.target.value)}
                        placeholder={detailProduct.product_subcategories?.name === 'Hotel'
                          ? 'e.g. 2 adults (parents), non-smoking room'
                          : 'e.g. Fluent in Arabic, client prefers female interpreter'}
                        rows={2}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:border-[#0f4c35]"
                      />
                    )}
                  </div>
                )
              })()}

              {/* Tooth count — Dental Clinic products */}
              {detailProduct.product_subcategories?.name === 'Dental Clinic' && (() => {
                let inCartItem: CartItem | undefined
                for (const g of groups) {
                  const found = g.items.find(it => it.productId === detailProduct.id)
                  if (found) { inCartItem = found; break }
                }
                const count = inCartItem ? (inCartItem.toothCount ?? 1) : modalToothCount
                const handleMinus = () => inCartItem
                  ? updateItemToothCount(detailProduct.id, inCartItem.variantId, count - 1)
                  : setModalToothCount(c => Math.max(1, c - 1))
                const handlePlus = () => inCartItem
                  ? updateItemToothCount(detailProduct.id, inCartItem.variantId, count + 1)
                  : setModalToothCount(c => c + 1)
                return (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Number of Teeth</p>
                    <div className="flex items-center gap-3">
                      <button onClick={handleMinus}
                        className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-50 font-bold text-base">−</button>
                      <span className="text-base font-semibold text-gray-900 min-w-[2rem] text-center">{count}</span>
                      <button onClick={handlePlus}
                        className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-50 font-bold text-base">+</button>
                      <span className="text-sm text-gray-500">
                        {(() => {
                          const vid = inCartItem?.variantId
                          const v = (detailProduct.product_variants ?? []).find(x => x.id === vid)
                            ?? (detailProduct.product_variants ?? []).find(x => x.is_active)
                          const unitKrw = v
                            ? (v.price_currency === 'KRW' ? v.base_price : Math.round(v.base_price * exchangeRate))
                            : detailProduct.base_price
                          return `= ₩${(count * unitKrw).toLocaleString('ko-KR')} base / person`
                        })()}
                      </span>
                    </div>
                  </div>
                )
              })()}

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
                        <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Prayer room
                      </span>
                    )}
                    {detailProduct.has_female_doctor && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
                        <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Female medical staff
                      </span>
                    )}
                    {detailProduct.dietary_type !== 'none' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
                        <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        {DIETARY_FILTER_OPTIONS.find(o => o.value === detailProduct.dietary_type)?.label ?? detailProduct.dietary_type}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom button */}
              {((detailProduct.product_variants ?? []).filter(v => v.is_active).length <= 1) && (() => {
                const isSubpkg = isSubpackageProduct(detailProduct)
                const inCart = isSubpkg
                  ? tripServices.some(it => it.productId === detailProduct.id)
                  : (groups[activeGroupIndex]?.items.some(it => it.productId === detailProduct.id) ?? false)
                const label = isSubpkg
                  ? (inCart ? '✓ In Trip Services' : 'Add to Trip Services')
                  : (inCart ? '✓ Added to ' + groups[activeGroupIndex]?.name : 'Add to ' + (groups[activeGroupIndex]?.name ?? 'Group'))
                return (
                  <button onClick={() => { toggleProduct(detailProduct.id, modalNote || undefined, modalToothCount); setDetailProduct(null) }}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-[#0f4c35] hover:bg-[#0a3828] text-white transition-all">
                    {label}
                  </button>
                )
              })()}
              {((detailProduct.product_variants ?? []).filter(v => v.is_active).length > 1) && (
                <button onClick={() => setDetailProduct(null)}
                  className="w-full py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Client Registration Modal ── */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !savingClient && setShowClientModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">New Client</h2>
              <button onClick={() => !savingClient && setShowClientModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input value={clientForm.name} onChange={e => setField('name', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nationality *</label>
                  <select value={clientForm.nationality} onChange={e => setField('nationality', e.target.value)}
                    className={`w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white ${!clientForm.nationality ? 'text-gray-400' : 'text-gray-900'}`}>
                    <option value="">Select country...</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Gender *</label>
                  <div className="flex gap-3 pt-1">
                    {(['male', 'female'] as const).map(g => (
                      <label key={g} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={clientForm.gender === g} onChange={() => setField('gender', g)} className="accent-[#0f4c35]" />
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
                  <input value={clientForm.phone} onChange={e => setField('phone', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Email *</label>
                  <input type="email" value={clientForm.email} onChange={e => setField('email', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Muslim?</label>
                <div className="flex gap-4">
                  {([true, false] as const).map(v => (
                    <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={clientForm.needs_muslim_friendly === v}
                        onChange={() => setClientForm(p => ({ ...p, needs_muslim_friendly: v, ...(v ? {} : { dietary_restriction: 'none' as DietaryRestriction }) }))}
                        className="accent-[#0f4c35]" />
                      <span className="text-sm text-gray-700">{v ? 'Yes' : 'No'}</span>
                    </label>
                  ))}
                </div>
              </div>
              {clientForm.needs_muslim_friendly && (
                <div className="space-y-3 rounded-xl border border-[#0f4c35]/15 bg-[#0f4c35]/[0.03] p-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Dietary Restriction</label>
                    <select value={clientForm.dietary_restriction} onChange={e => setField('dietary_restriction', e.target.value as DietaryRestriction)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white">
                      {DIETARY_FORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-500">Prayer preferences, medical info, and other details can be added on the client&apos;s detail page.</p>
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Special Requests</label>
                <textarea value={clientForm.special_requests} onChange={e => setField('special_requests', e.target.value)}
                  rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] resize-none" />
              </div>
              <p className="text-xs text-gray-400">* Travel details (passport, flights, etc.) can be added after payment.</p>
              {clientError && <p className="text-xs text-red-500">{clientError}</p>}
            </div>
            <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-2">
              <button onClick={() => { setShowClientModal(false); setClientError('') }} disabled={savingClient}
                className="px-4 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleRegisterClient} disabled={savingClient}
                className="px-4 py-1.5 text-sm bg-[#0f4c35] text-white font-medium rounded-lg hover:bg-[#0a3828] disabled:opacity-50">
                {savingClient ? 'Saving...' : 'Register & Review Quote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
