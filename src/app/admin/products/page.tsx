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
  base_price: number
  price_currency: 'KRW' | 'USD' | null
  is_active: boolean
  category_id: string
  product_categories: { name: string } | null
  product_images: { image_url: string; is_primary: boolean }[]
}

export default function AdminProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [exchangeRate, setExchangeRate] = useState(1350)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: prods }, { data: rateSetting }] = await Promise.all([
        supabase.from('product_categories').select('id, name').order('name'),
        supabase
          .from('products')
          .select('id, product_number, name, base_price, price_currency, is_active, category_id, product_categories(name), product_images(image_url, is_primary)')
          .order('product_number', { ascending: false }),
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
      ])
      setCategories(cats ?? [])
      setProducts((prods as unknown as Product[]) ?? [])
      const rate = (rateSetting?.value as { usd_krw?: number } | null)?.usd_krw
      if (rate) setExchangeRate(rate)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = products.filter((p) => {
    const matchSearch =
      search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.product_number.toLowerCase().includes(search.toLowerCase())
    const matchCategory = categoryFilter === '' || p.category_id === categoryFilter
    const matchActive =
      activeFilter === '' ||
      (activeFilter === 'active' && p.is_active) ||
      (activeFilter === 'inactive' && !p.is_active)
    return matchSearch && matchCategory && matchActive
  })

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
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-400">Number</th>
                  <th className="px-4 py-3.5" />
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-400">Product Name</th>
                  <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-400">Category</th>
                  <th className="px-6 py-3.5 text-right text-xs font-medium text-gray-400">Price</th>
                  <th className="px-6 py-3.5 text-center text-xs font-medium text-gray-400">Status</th>
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
                    <td className="px-6 py-4 text-xs font-mono text-gray-400">{p.product_number}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const primary = p.product_images?.find((img) => img.is_primary) ?? p.product_images?.[0]
                        return primary ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={primary.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                            </svg>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{p.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {p.product_categories?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right tabular-nums">
                      {p.price_currency === 'USD'
                        ? `$${Math.round(p.base_price / exchangeRate).toLocaleString()}`
                        : `₩${p.base_price.toLocaleString('ko-KR')}`}
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
