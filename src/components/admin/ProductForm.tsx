'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = { id: string; name: string }
type ContactChannel = { type: string; value: string }

export type ImageItem = {
  id?: string
  url: string
  is_primary: boolean
  order: number
  file?: File
}

export type FormState = {
  name: string
  category_id: string
  subcategory_id: string
  description: string
  base_price: string        // stored in KRW
  price_currency: 'KRW' | 'USD'
  duration_value: string
  duration_unit: 'hours' | 'days' | 'nights'
  partner_name: string
  location_address: string
  contact_channels: ContactChannel[]
  has_prayer_room: boolean
  dietary_type: 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'
  has_female_doctor: boolean
  is_active: boolean
}

export type ProductFormInitial = {
  form: FormState
  images: ImageItem[]
}

type Props = {
  productId?: string
  productNumber?: string
  categories: Category[]
  initial?: ProductFormInitial
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_TYPES = ['WhatsApp', 'Email', 'WeChat', 'Line', 'Telegram', 'Other']

const DIETARY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'halal_certified', label: 'Halal Certified' },
  { value: 'halal_friendly', label: 'Halal Friendly' },
  { value: 'muslim_friendly', label: 'Muslim Friendly' },
  { value: 'pork_free', label: 'Pork Free' },
]

const DURATION_UNITS = [
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'nights', label: 'Nights' },
]

const DEFAULT_FORM: FormState = {
  name: '',
  category_id: '',
  subcategory_id: '',
  description: '',
  base_price: '',
  price_currency: 'KRW',
  duration_value: '',
  duration_unit: 'hours',
  partner_name: '',
  location_address: '',
  contact_channels: [],
  has_prayer_room: false,
  dietary_type: 'none',
  has_female_doctor: false,
  is_active: true,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductForm({ productId, productNumber, categories, initial }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(initial?.form ?? DEFAULT_FORM)
  const [images, setImages] = useState<ImageItem[]>(initial?.images ?? [])
  const [toDeleteImageIds, setToDeleteImageIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  // Sub-categories — loaded once, filtered by selected category
  const [subcategories, setSubcategories] = useState<{ id: string; category_id: string; name: string }[]>([])

  // Exchange rate (KRW per 1 USD)
  const [exchangeRate, setExchangeRate] = useState(1350)
  const [companyMargin, setCompanyMargin] = useState(0.5)

  useEffect(() => {
    Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
      supabase.from('system_settings').select('value').eq('key', 'company_margin_rate').single(),
      supabase.from('product_subcategories').select('id, category_id, name').order('sort_order'),
    ]).then(([rateRes, cmRes, subRes]) => {
      const rate = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (rate) setExchangeRate(rate)
      const cm = (cmRes.data?.value as { rate?: number } | null)?.rate
      if (typeof cm === 'number') setCompanyMargin(cm)
      setSubcategories((subRes.data as { id: string; category_id: string; name: string }[] | null) ?? [])
    })
  }, [])

  const filteredSubs = subcategories.filter(s => s.category_id === form.category_id)

  // ── Field helper ─────────────────────────────────────────────

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── Price ────────────────────────────────────────────────────

  function fmtNum(raw: string): string {
    if (!raw) return ''
    const n = parseInt(raw, 10)
    return isNaN(n) ? '' : n.toLocaleString('ko-KR')
  }

  function handlePriceChange(val: string) {
    set('base_price', val.replace(/[^0-9]/g, ''))
  }

  function priceHint(): string {
    if (!form.base_price) return ''
    const n = Number(form.base_price)
    if (form.price_currency === 'KRW') {
      return `≈ $${(n / exchangeRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (₩${exchangeRate.toLocaleString()}/$)`
    }
    return `≈ ₩${Math.round(n * exchangeRate).toLocaleString()} (₩${exchangeRate.toLocaleString()}/$)`
  }

  // ── Contact channels ─────────────────────────────────────────

  function addChannel() {
    set('contact_channels', [...form.contact_channels, { type: 'WhatsApp', value: '' }])
  }

  function updateChannel(idx: number, field: 'type' | 'value', val: string) {
    set('contact_channels', form.contact_channels.map((ch, i) =>
      i === idx ? { ...ch, [field]: val } : ch
    ))
  }

  function removeChannel(idx: number) {
    set('contact_channels', form.contact_channels.filter((_, i) => i !== idx))
  }

  // ── Images ───────────────────────────────────────────────────

  function handleFiles(files: FileList | null) {
    if (!files) return
    const newItems: ImageItem[] = Array.from(files).map((file, i) => ({
      url: URL.createObjectURL(file),
      is_primary: images.length === 0 && i === 0,
      order: images.length + i,
      file,
    }))
    setImages((prev) => [...prev, ...newItems])
  }

  function setPrimary(idx: number) {
    setImages((prev) => prev.map((img, i) => ({ ...img, is_primary: i === idx })))
  }

  function removeImage(idx: number) {
    setImages((prev) => {
      const removed = prev[idx]
      if (removed.id) {
        setToDeleteImageIds((ids) => [...ids, removed.id!])
      }
      const updated = prev.filter((_, i) => i !== idx).map((img, i) => ({ ...img, order: i }))
      if (updated.length > 0 && !updated.some((img) => img.is_primary)) {
        updated[0] = { ...updated[0], is_primary: true }
      }
      return updated
    })
  }

  // ── Validation ───────────────────────────────────────────────

  function validate(): string | null {
    if (!form.name.trim()) return 'Product name is required.'
    if (!form.category_id) return 'Category is required.'
    if (!form.description.trim()) return 'Description is required.'
    if (!form.base_price) return 'Price is required.'
    if (!form.duration_value) return 'Duration is required.'
    if (!form.partner_name.trim()) return 'Partner name is required.'
    if (!form.location_address.trim()) return 'Address is required.'
    if (form.contact_channels.length === 0) return 'At least one contact channel is required.'
    if (form.contact_channels.some((ch) => !ch.value.trim())) return 'All contact channel values must be filled in.'
    return null
  }

  // ── Save ─────────────────────────────────────────────────────

  async function handleSave() {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setSaving(true)
    setError('')

    try {
      const payload = {
        name: form.name.trim(),
        category_id: form.category_id,
        subcategory_id: form.subcategory_id || null,
        description: form.description.trim(),
        base_price: Number(form.base_price),
        price_currency: form.price_currency,
        duration_value: Number(form.duration_value),
        duration_unit: form.duration_unit,
        partner_name: form.partner_name.trim(),
        location_address: form.location_address.trim(),
        contact_channels: form.contact_channels,
        has_prayer_room: form.has_prayer_room,
        dietary_type: form.dietary_type,
        has_female_doctor: form.has_female_doctor,
        is_active: form.is_active,
      }

      let savedId = productId

      if (productId) {
        const { error: err } = await supabase.from('products').update(payload).eq('id', productId)
        if (err) throw err
      } else {
        const { count } = await supabase.from('products').select('*', { count: 'exact', head: true })
        const next = (count ?? 0) + 1
        const productNum = `#P-${String(next).padStart(3, '0')}`
        const { data, error: err } = await supabase
          .from('products')
          .insert({ ...payload, product_number: productNum })
          .select('id')
          .single()
        if (err) throw err
        savedId = data.id
      }

      // Delete removed images
      for (const imgId of toDeleteImageIds) {
        await supabase.from('product_images').delete().eq('id', imgId)
      }

      // Update existing image metadata
      for (const img of images) {
        if (!img.id) continue
        await supabase
          .from('product_images')
          .update({ is_primary: img.is_primary, order: img.order })
          .eq('id', img.id)
      }

      // Upload new images
      for (const img of images) {
        if (!img.file) continue
        const ext = img.file.name.split('.').pop()
        const path = `${savedId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('product-images').upload(path, img.file)
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)
        const { error: imgErr } = await supabase.from('product_images').insert({
          product_id: savedId,
          image_url: urlData.publicUrl,
          is_primary: img.is_primary,
          order: img.order,
        })
        if (imgErr) throw imgErr
      }

      router.push('/admin/products')
    } catch (e: unknown) {
      const msg =
        (e as { message?: string })?.message ??
        (e as { error_description?: string })?.error_description ??
        'An unexpected error occurred.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────

  async function handleDelete() {
    if (!productId || !confirm('Are you sure you want to delete this product?')) return
    setDeleting(true)
    try {
      await supabase.from('product_images').delete().eq('product_id', productId)
      const { error: err } = await supabase.from('products').delete().eq('id', productId)
      if (err) throw err
      router.push('/admin/products')
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to delete product.')
      setDeleting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto bg-gray-50 [&_input]:text-gray-900 [&_textarea]:text-gray-900 [&_select]:text-gray-900">
      <div className="px-4 md:px-12 py-6 md:py-10 max-w-2xl space-y-6">

        {/* Header */}
        <div>
          <button
            onClick={() => router.push('/admin/products')}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to Products
          </button>
          <h1 className="text-xl font-semibold text-gray-900">
            {productId ? `Edit ${productNumber}` : 'Add Product'}
          </h1>
        </div>

        {/* ── Basic Info ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-900">Basic Information</h2>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Product Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Enter product name"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                value={form.category_id}
                onChange={(e) => { set('category_id', e.target.value); set('subcategory_id', '') }}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white text-gray-700"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Sub-category
              </label>
              <select
                value={form.subcategory_id}
                onChange={(e) => set('subcategory_id', e.target.value)}
                disabled={!form.category_id || filteredSubs.length === 0}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white text-gray-700 disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">— None —</option>
                {filteredSubs.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Enter product description"
              rows={10}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all resize-y"
            />
          </div>

          {/* Dual currency price */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-500">
                Price <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => { set('price_currency', 'KRW'); set('base_price', '') }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    form.price_currency === 'KRW'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  KRW
                </button>
                <button
                  type="button"
                  onClick={() => { set('price_currency', 'USD'); set('base_price', '') }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    form.price_currency === 'USD'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  USD
                </button>
              </div>
            </div>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#0f4c35] focus-within:ring-2 focus-within:ring-[#0f4c35]/10 transition-all">
              <span className="px-3 py-2.5 text-sm text-gray-400 bg-gray-50 border-r border-gray-200">
                {form.price_currency === 'KRW' ? '₩' : '$'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={fmtNum(form.base_price)}
                onChange={(e) => handlePriceChange(e.target.value)}
                placeholder="0"
                className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-white"
              />
            </div>
            {priceHint() && (
              <p className="text-xs text-gray-400 mt-1">{priceHint()}</p>
            )}
            {form.base_price && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                  Customer Price by Agent Tier
                </p>
                <div className="space-y-1">
                  {[0.15, 0.20, 0.25].map((tier) => {
                    const n = Number(form.base_price)
                    const final = n * (1 + companyMargin) * (1 + tier)
                    const isUSD = form.price_currency === 'USD'
                    const display = isUSD
                      ? `$${final.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `₩${Math.round(final).toLocaleString('ko-KR')}`
                    return (
                      <div key={tier} className="flex justify-between text-xs">
                        <span className="text-gray-500">Agent {Math.round(tier * 100)}%</span>
                        <span className="font-semibold text-gray-800 tabular-nums">{display}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Duration <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                value={form.duration_value}
                onChange={(e) => set('duration_value', e.target.value)}
                placeholder="0"
                min={0}
                className="w-24 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all"
              />
              {DURATION_UNITS.map((u) => (
                <label key={u.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="duration_unit"
                    value={u.value}
                    checked={form.duration_unit === u.value}
                    onChange={() => set('duration_unit', u.value as FormState['duration_unit'])}
                    className="accent-[#0f4c35]"
                  />
                  <span className="text-sm text-gray-700">{u.label}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* ── Images ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Images</h2>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-[#0f4c35] font-medium hover:underline"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {images.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#0f4c35]/40 transition-colors"
            >
              <p className="text-sm text-gray-400">Add product images</p>
              <p className="text-xs text-gray-300 mt-1">Click to select files</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {images.map((img, idx) => (
                <div key={idx} className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPrimary(idx)}
                    title="Set as primary image"
                    className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      img.is_primary
                        ? 'bg-yellow-400 text-white'
                        : 'bg-black/30 text-white/80 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    ★
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400">Click ★ to set as primary image</p>
        </section>

        {/* ── Partner Info ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-900">Partner Info</h2>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Partner Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.partner_name}
              onChange={(e) => set('partner_name', e.target.value)}
              placeholder="Enter partner/institution name"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Address <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.location_address}
              onChange={(e) => set('location_address', e.target.value)}
              placeholder="Enter address"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-gray-500">
                Contact Channels <span className="text-red-400">*</span>
              </label>
              <button
                type="button"
                onClick={addChannel}
                className="flex items-center gap-1.5 text-xs text-[#0f4c35] font-medium hover:underline"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Channel
              </button>
            </div>
            {form.contact_channels.length === 0 ? (
              <p className="text-sm text-gray-400">No channels added</p>
            ) : (
              <div className="space-y-2.5">
                {form.contact_channels.map((ch, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={ch.type}
                      onChange={(e) => updateChannel(idx, 'type', e.target.value)}
                      className="w-32 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0f4c35] bg-white"
                    >
                      {CHANNEL_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={ch.value}
                      onChange={(e) => updateChannel(idx, 'value', e.target.value)}
                      placeholder="Contact info"
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => removeChannel(idx)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Muslim Friendly ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Muslim Friendly</h2>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_prayer_room}
              onChange={(e) => set('has_prayer_room', e.target.checked)}
              className="w-4 h-4 accent-[#0f4c35]"
            />
            <span className="text-sm text-gray-700">Prayer room available</span>
          </label>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Dietary Restriction</label>
            <select
              value={form.dietary_type}
              onChange={(e) => set('dietary_type', e.target.value as FormState['dietary_type'])}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white"
            >
              {DIETARY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_female_doctor}
              onChange={(e) => set('has_female_doctor', e.target.checked)}
              className="w-4 h-4 accent-[#0f4c35]"
            />
            <span className="text-sm text-gray-700">Female medical staff available</span>
          </label>
        </section>

        {/* ── Visibility ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Visibility</h2>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="is_active"
                checked={form.is_active}
                onChange={() => set('is_active', true)}
                className="accent-[#0f4c35]"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="is_active"
                checked={!form.is_active}
                onChange={() => set('is_active', false)}
                className="accent-[#0f4c35]"
              />
              <span className="text-sm text-gray-700">Inactive</span>
            </label>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pb-10">
          {productId ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-40"
            >
              {deleting ? 'Deleting...' : 'Delete Product'}
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/admin/products')}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
