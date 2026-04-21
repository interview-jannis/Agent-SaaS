'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Category = {
  id: string
  name: string
}

type Product = {
  id: string
  product_number: string
  name: string
  description: string | null
  partner_name: string | null
  base_price: number
  price_currency: 'KRW' | 'USD' | null
  is_active: boolean
  category_id: string
  product_categories: { name: string } | null
  product_images: { image_url: string; is_primary: boolean }[]
}

const AGENT_TIERS = [0.15, 0.20, 0.25] as const

export default function AdminProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [companyMargin, setCompanyMargin] = useState(0.5)
  const [exchangeRate, setExchangeRate] = useState(1350)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [imageIndexes, setImageIndexes] = useState<Record<string, number>>({})

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: prods }, { data: cmSetting }, { data: rateSetting }] = await Promise.all([
        supabase.from('product_categories').select('id, name').order('name'),
        supabase
          .from('products')
          .select('id, product_number, name, description, partner_name, base_price, price_currency, is_active, category_id, product_categories(name), product_images(image_url, is_primary)')
          .order('product_number', { ascending: false }),
        supabase.from('system_settings').select('value').eq('key', 'company_margin_rate').single(),
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
      ])
      setCategories(cats ?? [])
      setProducts((prods as unknown as Product[]) ?? [])
      const cm = (cmSetting?.value as { rate?: number } | null)?.rate
      if (typeof cm === 'number') setCompanyMargin(cm)
      const rate = (rateSetting?.value as { usd_krw?: number } | null)?.usd_krw
      if (typeof rate === 'number') setExchangeRate(rate)
      setLoading(false)
    }
    load()
  }, [])

  function fmtPrice(amount: number, currency: 'KRW' | 'USD' | null): string {
    return currency === 'USD'
      ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `₩${Math.round(amount).toLocaleString('ko-KR')}`
  }

  function fmtUSD(amount: number): string {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function toUSD(amount: number, currency: 'KRW' | 'USD' | null): number {
    return currency === 'USD' ? amount : amount / exchangeRate
  }

  // Partners available in the current category scope
  const availablePartners = Array.from(
    new Set(
      products
        .filter((p) => categoryFilter === '' || p.category_id === categoryFilter)
        .map((p) => p.partner_name)
        .filter((n): n is string => !!n)
    )
  ).sort()

  const filtered = products.filter((p) => {
    const matchSearch =
      search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.product_number.toLowerCase().includes(search.toLowerCase())
    const matchCategory = categoryFilter === '' || p.category_id === categoryFilter
    const matchPartner = partnerFilter === '' || p.partner_name === partnerFilter
    const matchActive =
      activeFilter === '' ||
      (activeFilter === 'active' && p.is_active) ||
      (activeFilter === 'inactive' && !p.is_active)
    return matchSearch && matchCategory && matchPartner && matchActive
  })

  // Reset partner filter if current selection is no longer in scope
  useEffect(() => {
    if (partnerFilter && !availablePartners.includes(partnerFilter)) {
      setPartnerFilter('')
    }
  }, [categoryFilter, partnerFilter, availablePartners])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-12 py-10 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Products</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/admin/categories')}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Manage Categories
            </button>
            <button
              onClick={() => router.push('/admin/products/new')}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#0f4c35] text-white text-sm font-medium rounded-xl hover:bg-[#0a3828] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Product
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all bg-white"
            />
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#0f4c35] bg-white text-gray-700"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Partner filter */}
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#0f4c35] bg-white text-gray-700"
          >
            <option value="">All Partners</option>
            {availablePartners.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          {/* Active filter */}
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#0f4c35] bg-white text-gray-700"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">No products found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Number</th>
                  <th className="px-4 py-3.5" />
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Partner Name</th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Product Name</th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-400 w-full">Description</th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Category</th>
                  <th className="px-6 py-3.5 text-xs font-medium text-gray-400 whitespace-nowrap">
                    <div className="flex">
                      <div className="min-w-[140px] text-left pl-3">Price</div>
                      <div className="min-w-[160px]" />
                    </div>
                  </th>
                  <th className="px-6 py-3.5 text-center text-xs font-medium text-gray-400 whitespace-nowrap">Status</th>
                  <th className="px-6 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/admin/products/${p.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 text-xs font-mono text-gray-400 whitespace-nowrap">{p.product_number}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const imgs = p.product_images ?? []
                        if (imgs.length === 0) {
                          return (
                            <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                              </svg>
                            </div>
                          )
                        }
                        const sorted = [...imgs].sort((a, b) =>
                          (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)
                        )
                        const idx = imageIndexes[p.id] ?? 0
                        const current = sorted[idx % sorted.length]
                        return (
                          <div className="relative w-16 h-16 group/img">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={current.image_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                            {sorted.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setImageIndexes((prev) => ({
                                      ...prev,
                                      [p.id]: (idx - 1 + sorted.length) % sorted.length,
                                    }))
                                  }}
                                  className="absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-[10px] opacity-0 group-hover/img:opacity-100 transition-opacity"
                                >
                                  ‹
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setImageIndexes((prev) => ({
                                      ...prev,
                                      [p.id]: (idx + 1) % sorted.length,
                                    }))
                                  }}
                                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-[10px] opacity-0 group-hover/img:opacity-100 transition-opacity"
                                >
                                  ›
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                      {p.partner_name ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {p.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <p className="whitespace-pre-line">{p.description ?? '—'}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {p.product_categories?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4 tabular-nums whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="min-w-[140px] text-right pr-4">
                          <div className="text-base font-semibold text-gray-900">
                            {fmtPrice(p.base_price, p.price_currency)}
                          </div>
                          {p.price_currency !== 'USD' && (
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              ≈ {fmtUSD(toUSD(p.base_price, p.price_currency))}
                            </div>
                          )}
                        </div>
                        <div className="min-w-[160px] text-left pl-4 border-l border-gray-100 space-y-0.5">
                          {AGENT_TIERS.map((tier) => {
                            const finalUSD = toUSD(p.base_price, p.price_currency) * (1 + companyMargin) * (1 + tier)
                            return (
                              <div key={tier} className="text-xs text-gray-500">
                                <span className="text-gray-400">{Math.round(tier * 100)}%</span>
                                <span className="ml-2 font-medium text-gray-700">{fmtUSD(finalUSD)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        p.is_active
                          ? 'bg-green-50 text-[#0f4c35]'
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-[#0f4c35] transition-colors ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
