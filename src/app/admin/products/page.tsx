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
  subcategory_id: string | null
  product_categories: { name: string } | null
  product_subcategories: { name: string } | null
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

  // Excel upload — bulk upsert from spreadsheet (two-step: dry-run preview → confirm)
  type UploadCounts = { inserted: number; updated: number; unchanged: number }
  type UploadChange = { field: string; before: unknown; after: unknown }
  type UploadUpdate = { kind: 'product' | 'variant'; label: string; changes: UploadChange[] }
  type UploadMissing = { label: string; category: string }
  type UploadResp = {
    products: UploadCounts; variants: UploadCounts;
    updates?: UploadUpdate[]; missingInUpload?: UploadMissing[]; errors: string[]
  }
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewResult, setPreviewResult] = useState<UploadResp | null>(null)
  const [uploadResult, setUploadResult] = useState<UploadResp | null>(null)

  async function loadAll() {
    const [{ data: cats }, { data: prods }, { data: cmSetting }, { data: rateSetting }] = await Promise.all([
      supabase.from('product_categories').select('id, name').order('sort_order').order('name'),
      supabase
        .from('products')
        .select('id, product_number, name, description, partner_name, base_price, price_currency, is_active, category_id, subcategory_id, product_categories(name), product_subcategories(name), product_images(image_url, is_primary)')
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

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Mobile renders a separate cards section; desktop renders the table section. Pick whichever is visible.
    const mobileEl = document.getElementById(`cat-section-mobile-${catId}`)
    const desktopEl = document.getElementById(`cat-section-${catId}`)
    const target = mobileEl && mobileEl.offsetParent !== null ? mobileEl : desktopEl
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  // Two-step upload: file → dry-run preview → user confirms → real commit.
  // Step 1 — file selected, ask server "what would happen" without writing.
  async function handlePreviewExcel(file: File) {
    setUploading(true); setPreviewResult(null); setUploadResult(null); setPendingFile(file)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not signed in.')
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/products/upload-excel?dryRun=true', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Preview failed.')
      setPreviewResult(data)
    } catch (e: unknown) {
      setPreviewResult({
        products: { inserted: 0, updated: 0, unchanged: 0 },
        variants: { inserted: 0, updated: 0, unchanged: 0 },
        errors: [(e as { message?: string })?.message ?? 'Preview failed.'],
      })
    } finally {
      setUploading(false)
    }
  }

  // Step 2 — user confirmed, actually commit.
  async function handleConfirmUpload() {
    if (!pendingFile) return
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not signed in.')
      const fd = new FormData()
      fd.append('file', pendingFile)
      const res = await fetch('/api/admin/products/upload-excel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Upload failed.')
      setUploadResult(data)
      setPreviewResult(null)
      setPendingFile(null)
      await loadAll()
    } catch (e: unknown) {
      setUploadResult({
        products: { inserted: 0, updated: 0, unchanged: 0 },
        variants: { inserted: 0, updated: 0, unchanged: 0 },
        errors: [(e as { message?: string })?.message ?? 'Upload failed.'],
      })
    } finally {
      setUploading(false)
    }
  }

  function handleCancelUpload() {
    setPreviewResult(null)
    setPendingFile(null)
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
      <div className="shrink-0 border-b border-gray-100 px-4 md:px-6 py-3 md:py-0 md:h-14 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
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
        <div className="flex items-center gap-2 flex-wrap md:shrink-0 md:ml-auto">
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
          <label className={`flex items-center gap-1.5 px-3 py-1.5 bg-[#0f4c35] text-white text-xs font-medium rounded-lg transition-colors ${uploading ? 'opacity-40 cursor-wait' : 'hover:bg-[#0a3828] cursor-pointer'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 7.5m0 0l4.5 4.5M12 7.5v9" />
            </svg>
            {uploading ? 'Uploading…' : 'Upload Excel'}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''  // reset so re-uploading the same file fires onChange
                if (f) handlePreviewExcel(f)
              }}
            />
          </label>
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
        <div className="px-4 md:px-6 xl:px-12 py-6 md:py-8 space-y-6">

        {/* Excel upload preview modal — shows what would change before commit */}
        {previewResult && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !uploading && handleCancelUpload()}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Review changes</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {pendingFile?.name} · No changes have been written yet.
                </p>
              </div>

              <div className="space-y-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Products</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-emerald-700 font-medium">+{previewResult.products.inserted} new</span>
                    <span className="text-blue-700 font-medium">{previewResult.products.updated} updated</span>
                    <span className="text-gray-500">{previewResult.products.unchanged} unchanged</span>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Variants</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-emerald-700 font-medium">+{previewResult.variants.inserted} new</span>
                    <span className="text-blue-700 font-medium">{previewResult.variants.updated} updated</span>
                    <span className="text-gray-500">{previewResult.variants.unchanged} unchanged</span>
                  </div>
                </div>
              </div>

              {(previewResult.updates ?? []).length > 0 && (
                <div className="border border-blue-200 rounded-xl overflow-hidden">
                  <div className="bg-blue-50 px-3 py-2 border-b border-blue-200">
                    <p className="text-xs font-semibold text-blue-800">
                      {(previewResult.updates ?? []).length} item{(previewResult.updates ?? []).length > 1 ? 's' : ''} will be updated
                    </p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-blue-50/40 sticky top-0">
                        <tr className="text-left text-blue-700">
                          <th className="px-3 py-1.5 font-medium w-16">Type</th>
                          <th className="px-3 py-1.5 font-medium">Item</th>
                          <th className="px-3 py-1.5 font-medium">Field</th>
                          <th className="px-3 py-1.5 font-medium">Before</th>
                          <th className="px-3 py-1.5 font-medium">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-50">
                        {(previewResult.updates ?? []).flatMap((u, i) =>
                          u.changes.map((c, j) => (
                            <tr key={`${i}-${j}`} className="hover:bg-blue-50/30">
                              {j === 0 && (
                                <>
                                  <td className="px-3 py-1.5 align-top text-[10px] uppercase text-blue-700" rowSpan={u.changes.length}>{u.kind}</td>
                                  <td className="px-3 py-1.5 align-top font-medium text-gray-900" rowSpan={u.changes.length}>{u.label}</td>
                                </>
                              )}
                              <td className="px-3 py-1.5 font-mono text-gray-600 whitespace-nowrap">{c.field}</td>
                              <td className="px-3 py-1.5 text-gray-500 line-through max-w-[160px] truncate" title={String(c.before ?? '')}>{String(c.before ?? '∅')}</td>
                              <td className="px-3 py-1.5 font-medium text-gray-900 max-w-[160px] truncate" title={String(c.after ?? '')}>{String(c.after ?? '∅')}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(previewResult.missingInUpload ?? []).length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-700">
                    {(previewResult.missingInUpload ?? []).length} item{(previewResult.missingInUpload ?? []).length > 1 ? 's' : ''} in DB are not in this upload
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">These will be left alone — delete via product detail if intended.</p>
                  <details className="mt-1">
                    <summary className="text-[11px] text-gray-600 cursor-pointer">Show list</summary>
                    <ul className="mt-1 text-[10px] text-gray-600 space-y-0.5 list-disc pl-4 max-h-32 overflow-y-auto">
                      {(previewResult.missingInUpload ?? []).map((m, i) => (
                        <li key={i}><span className="text-gray-400">[{m.category}]</span> {m.label}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}

              {previewResult.errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1">{previewResult.errors.length} notice{previewResult.errors.length > 1 ? 's' : ''}</p>
                  <ul className="text-[11px] text-amber-700 space-y-0.5 list-disc pl-4 max-h-32 overflow-y-auto">
                    {previewResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button onClick={handleCancelUpload} disabled={uploading}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">Cancel</button>
                <button onClick={handleConfirmUpload} disabled={uploading}
                  className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                  {uploading ? 'Saving…' : 'Confirm Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload result banner */}
        {uploadResult && (
          <div className={`rounded-xl border p-4 text-sm ${uploadResult.errors.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className={`font-semibold ${uploadResult.errors.length > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                  {uploadResult.errors.length > 0 ? 'Upload finished with notices' : 'Upload complete'}
                </p>
                <div className="text-xs text-gray-700 mt-1 space-y-0.5">
                  <p>
                    Products — <span className="font-medium text-emerald-700">{uploadResult.products.inserted} new</span>
                    {' · '}
                    <span className="font-medium text-blue-700">{uploadResult.products.updated} updated</span>
                    {' · '}
                    <span className="text-gray-500">{uploadResult.products.unchanged} unchanged</span>
                  </p>
                  <p>
                    Variants — <span className="font-medium text-emerald-700">{uploadResult.variants.inserted} new</span>
                    {' · '}
                    <span className="font-medium text-blue-700">{uploadResult.variants.updated} updated</span>
                    {' · '}
                    <span className="text-gray-500">{uploadResult.variants.unchanged} unchanged</span>
                  </p>
                </div>
                {uploadResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-amber-800 cursor-pointer">{uploadResult.errors.length} notice{uploadResult.errors.length > 1 ? 's' : ''}</summary>
                    <ul className="mt-1 text-xs text-amber-700 space-y-0.5 list-disc pl-4 max-h-40 overflow-y-auto">
                      {uploadResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
              </div>
              <button onClick={() => setUploadResult(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0">×</button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
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

        {/* Mobile card view */}
        <div className="md:hidden space-y-4">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">No products found</div>
          ) : (
            categories.map((cat) => {
              const items = groupedByCategory.get(cat.id) ?? []
              if (items.length === 0) return null
              return (
                <section key={cat.id} id={`cat-section-mobile-${cat.id}`} className="space-y-2 scroll-mt-20">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-800 font-semibold">{cat.name}</span>
                    <span className="text-[10px] tabular-nums text-gray-500">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((p) => {
                      const imgs = p.product_images ?? []
                      const sorted = [...imgs].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
                      const primary = sorted[0]
                      return (
                        <div key={p.id} onClick={() => router.push(`/admin/products/${p.id}`)}
                          className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex gap-3 active:bg-gray-50 cursor-pointer">
                          <div className="shrink-0">
                            {primary ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={primary.image_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                            ) : (
                              <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                              <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                p.is_active ? 'bg-green-50 text-[#0f4c35]' : 'bg-gray-100 text-gray-400'
                              }`}>
                                {p.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{p.partner_name ?? '—'}</p>
                            <p className="text-[10px] font-mono text-gray-400 mt-0.5">{p.product_number}</p>
                            <div className="mt-1.5 tabular-nums">
                              <span className="text-sm font-semibold text-gray-900">{fmtPrice(p.base_price, p.price_currency)}</span>
                              {p.price_currency !== 'USD' && (
                                <span className="ml-1.5 text-[11px] text-gray-400">≈ {fmtUSD(toUSD(p.base_price, p.price_currency))}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">No products found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-3 xl:px-6 py-3.5 text-left text-[11px] xl:text-xs font-medium text-gray-400 whitespace-nowrap">Number</th>
                  <th className="px-2 xl:px-4 py-3.5" />
                  <th className="px-3 xl:px-6 py-3.5 text-left text-[11px] xl:text-xs font-medium text-gray-400 max-w-[140px]">Partner Name</th>
                  <th className="px-3 xl:px-6 py-3.5 text-left text-[11px] xl:text-xs font-medium text-gray-400 whitespace-nowrap min-w-[160px] max-w-[240px] xl:w-auto w-full">Product Name</th>
                  <th className="hidden xl:table-cell px-6 py-3.5 text-left text-xs font-medium text-gray-400 w-full">Description</th>
                  <th className="px-3 xl:px-6 py-3.5 text-left text-[11px] xl:text-xs font-medium text-gray-400 whitespace-nowrap">Category</th>
                  <th className="px-3 xl:px-6 py-3.5 text-[11px] xl:text-xs font-medium text-gray-400 whitespace-nowrap">
                    <div className="flex">
                      <div className="min-w-[80px] xl:min-w-[100px] text-left pl-3">Price</div>
                      <div className="hidden xl:block min-w-[110px]" />
                    </div>
                  </th>
                  <th className="px-3 xl:px-6 py-3.5 text-center text-[11px] xl:text-xs font-medium text-gray-400 whitespace-nowrap">Status</th>
                  <th className="px-3 xl:px-6 py-3.5" />
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
                    <td className="px-3 xl:px-6 py-4 text-[10px] xl:text-xs font-mono text-gray-400 whitespace-nowrap">{p.product_number}</td>
                    <td className="px-2 xl:px-4 py-3">
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
                    <td className="px-3 xl:px-6 py-4 text-xs xl:text-sm text-gray-700 max-w-[140px]">
                      <p className="line-clamp-2 break-words">{p.partner_name ?? '—'}</p>
                    </td>
                    <td className="px-3 xl:px-6 py-4 text-xs xl:text-sm font-medium text-gray-900 min-w-[160px] max-w-[240px]">
                      <p className="line-clamp-2 break-words">{p.name}</p>
                    </td>
                    <td className="hidden xl:table-cell px-6 py-4 text-sm text-gray-500 max-w-md">
                      <p className="line-clamp-3 whitespace-pre-line break-words">{p.description ?? '—'}</p>
                    </td>
                    <td className="px-3 xl:px-6 py-4 text-xs xl:text-sm text-gray-500 whitespace-nowrap">
                      <p>{p.product_categories?.name ?? '—'}</p>
                      {p.product_subcategories?.name && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{p.product_subcategories.name}</p>
                      )}
                    </td>
                    <td className="px-3 xl:px-6 py-4 tabular-nums whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="min-w-[110px] xl:min-w-[140px] text-right pr-2 xl:pr-4">
                          <div className="text-xs xl:text-base font-semibold text-gray-900">
                            {fmtPrice(p.base_price, p.price_currency)}
                          </div>
                          {p.price_currency !== 'USD' && (
                            <div className="text-[10px] xl:text-[11px] text-gray-400 mt-0.5">
                              ≈ {fmtUSD(toUSD(p.base_price, p.price_currency))}
                            </div>
                          )}
                        </div>
                        <div className="hidden xl:block min-w-[160px] text-left pl-4 border-l border-gray-100 space-y-0.5">
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
                    <td className="px-3 xl:px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2 xl:px-2.5 py-0.5 xl:py-1 rounded-full text-[10px] xl:text-xs font-medium ${
                        p.is_active
                          ? 'bg-green-50 text-[#0f4c35]'
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-6 py-4 text-right">
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
