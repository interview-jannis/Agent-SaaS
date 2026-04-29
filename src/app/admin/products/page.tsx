'use client'

import { Fragment, useEffect, useState } from 'react'
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
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: prods }, { data: cmSetting }, { data: rateSetting }] = await Promise.all([
        supabase.from('product_categories').select('id, name').order('sort_order').order('name'),
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

  // Group filtered products by category (in category sort_order)
  const groupedByCategory = new Map<string, Product[]>()
  for (const cat of categories) groupedByCategory.set(cat.id, [])
  for (const p of filtered) {
    const bucket = groupedByCategory.get(p.category_id)
    if (bucket) bucket.push(p)
  }

  function scrollToCategory(catId: string) {
    const el = document.getElementById(`cat-section-${catId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function extFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/)
      return match ? match[1].toLowerCase() : 'jpg'
    } catch {
      return 'jpg'
    }
  }

  async function handleExportBackup() {
    setExporting(true)
    setExportProgress('preparing…')
    try {
      const [{ default: JSZip }, XLSX] = await Promise.all([
        import('jszip'),
        import('xlsx'),
      ])
      const zip = new JSZip()
      const imagesFolder = zip.folder('images')!

      // Build ordered product list (category sort_order) + collect image tasks
      const orderedProducts: Product[] = []
      for (const cat of categories) {
        const items = groupedByCategory.get(cat.id) ?? []
        orderedProducts.push(...items)
      }

      // Fetch images in parallel with limited concurrency
      type ImgTask = { productNumber: string; index: number; isPrimary: boolean; url: string; filename: string }
      const imgTasks: ImgTask[] = []
      for (const p of orderedProducts) {
        const sorted = [...(p.product_images ?? [])].sort(
          (a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)
        )
        sorted.forEach((img, idx) => {
          const tag = img.is_primary ? 'primary' : String(idx + 1)
          const ext = extFromUrl(img.image_url)
          imgTasks.push({
            productNumber: p.product_number,
            index: idx,
            isPrimary: img.is_primary,
            url: img.image_url,
            filename: `${p.product_number}_${tag}.${ext}`,
          })
        })
      }

      // Track filenames per product for the excel
      const filenamesByProduct = new Map<string, string[]>()

      let done = 0
      const CONCURRENCY = 6
      async function worker(queue: ImgTask[]) {
        while (queue.length > 0) {
          const task = queue.shift()
          if (!task) return
          try {
            const res = await fetch(task.url)
            if (res.ok) {
              const blob = await res.blob()
              imagesFolder.file(task.filename, blob)
              const arr = filenamesByProduct.get(task.productNumber) ?? []
              arr.push(task.filename)
              filenamesByProduct.set(task.productNumber, arr)
            }
          } catch {
            // skip failed
          }
          done += 1
          setExportProgress(`images ${done}/${imgTasks.length}`)
        }
      }
      const queue = [...imgTasks]
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)))

      // Build excel rows
      setExportProgress('writing excel…')
      const rows: Record<string, string | number>[] = []
      for (const cat of categories) {
        const items = groupedByCategory.get(cat.id) ?? []
        for (const p of items) {
          const baseUSD = toUSD(p.base_price, p.price_currency)
          const files = filenamesByProduct.get(p.product_number) ?? []
          rows.push({
            'Number': p.product_number,
            'Category': cat.name,
            'Partner': p.partner_name ?? '',
            'Product Name': p.name,
            'Description': p.description ?? '',
            'Base Price': Number(p.base_price),
            'Currency': p.price_currency ?? 'KRW',
            'Base (USD)': Number(baseUSD.toFixed(2)),
            'Tier 15% (USD)': Number((baseUSD * (1 + companyMargin) * 1.15).toFixed(2)),
            'Tier 20% (USD)': Number((baseUSD * (1 + companyMargin) * 1.20).toFixed(2)),
            'Tier 25% (USD)': Number((baseUSD * (1 + companyMargin) * 1.25).toFixed(2)),
            'Status': p.is_active ? 'Active' : 'Inactive',
            'Image Count': files.length,
            'Image Files': files.join(' | '),
          })
        }
      }

      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [
        { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 32 }, { wch: 48 },
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 40 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Products')
      const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      zip.file('products.xlsx', excelBuffer)

      // README
      const readme = [
        'Products Backup',
        '===============',
        '',
        'products.xlsx — product data (filtered view at export time)',
        'images/       — all product images, named {product_number}_{primary|N}.{ext}',
        '',
        'To restore: re-upload images to Supabase Storage bucket "product-images"',
        'and re-insert rows from the spreadsheet.',
        '',
        `Exported: ${new Date().toISOString()}`,
        `Products: ${orderedProducts.length}`,
        `Images:   ${imgTasks.length}`,
      ].join('\n')
      zip.file('README.txt', readme)

      setExportProgress('zipping…')
      const blob = await zip.generateAsync({ type: 'blob' })

      const now = new Date()
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `products_backup_${stamp}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
      setExportProgress('')
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-base font-semibold text-gray-900 shrink-0">Products</h1>
        {!loading && filtered.length > 0 && (
          <div className="flex-1 min-w-0 flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 overflow-x-auto no-scrollbar">
            <span className="shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wider pr-1.5 mr-0.5 border-r border-gray-200">Jump</span>
            {categories.map((cat) => {
              const count = groupedByCategory.get(cat.id)?.length ?? 0
              if (count === 0) return null
              return (
                <button
                  key={cat.id}
                  onClick={() => scrollToCategory(cat.id)}
                  className="shrink-0 px-2 py-0.5 rounded text-[11px] text-gray-700 hover:bg-white hover:text-[#0f4c35] cursor-pointer transition-colors"
                  title={`Jump to ${cat.name}`}
                >
                  {cat.name}
                  <span className="ml-1 font-medium text-gray-400">{count}</span>
                </button>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button
            onClick={handleExportBackup}
            disabled={loading || exporting || filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {exporting ? `Exporting… ${exportProgress}` : 'Export Backup'}
          </button>
          <button
            onClick={() => router.push('/admin/categories')}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Manage Categories
          </button>
          <button
            onClick={() => router.push('/admin/products/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f4c35] text-white text-xs font-medium rounded-lg hover:bg-[#0a3828] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Product
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-12 py-8 space-y-6">

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
                {categories.map((cat) => {
                  const items = groupedByCategory.get(cat.id) ?? []
                  if (items.length === 0) return null
                  return (
                    <Fragment key={cat.id}>
                      <tr id={`cat-section-${cat.id}`} className="scroll-mt-20 bg-gray-100">
                        <td colSpan={9} className="border-b border-gray-200 px-6 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wide text-gray-800 font-semibold">{cat.name}</span>
                            <span className="text-[10px] tabular-nums text-gray-500">{items.length}</span>
                          </div>
                        </td>
                      </tr>
                      {items.map((p) => (
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
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        </div>
      </div>
    </div>
  )
}
