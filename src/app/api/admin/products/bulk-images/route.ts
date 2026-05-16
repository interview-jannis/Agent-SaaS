import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ════════════════════════════════════════════════════════════════════════════
// Bulk product image upload — filename-based matching.
//
// Naming convention (case-insensitive):
//   P-001.jpg           → product #P-001, primary image
//   P-001-2.jpg         → product #P-001, additional image (order 2)
//   P-001-3.png         → product #P-001, additional image (order 3)
//   P-101,102,103.jpg   → same primary image applied to P-101, P-102, P-103
//   P-101,102,103-2.jpg → same additional image (order 2) for all three
//
// Behaviour:
//   - Matched products: existing product_images rows + storage files are
//     DELETED then replaced with the new uploads.
//   - Unmatched filenames (no product found): recorded in result.unmatched.
//   - Supports any image mime type (image/*).
//
// Returns a summary: matched / unmatched / failed counts + per-file details.
// ════════════════════════════════════════════════════════════════════════════

const FILENAME_RE = /^p-([\d,\s]+?)(?:-(\d+))?\.([a-z0-9]+)$/i

function parseFilename(name: string): { nums: string[]; order: number; isPrimary: boolean; ext: string } | null {
  const m = FILENAME_RE.exec(name)
  if (!m) return null
  const nums = m[1].split(',').map(n => n.trim().padStart(3, '0')).filter(Boolean)
  const extra = m[2] ? parseInt(m[2], 10) : null
  const isPrimary = extra === null
  const order = extra ?? 1
  return { nums, order, isPrimary, ext: m[3].toLowerCase() }
}

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })
  }

  // Auth: admins only
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: userData } = await supabase.auth.getUser(token)
  const uid = userData?.user?.id
  if (!uid) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', uid).maybeSingle()
  if (!admin) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  // Parse multipart
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Could not parse form data.' }, { status: 400 })
  }

  const files = form.getAll('images') as File[]
  if (files.length === 0) {
    return NextResponse.json({ error: 'No images provided.' }, { status: 400 })
  }

  // Group files by product number
  type FileEntry = { file: File; order: number; isPrimary: boolean; ext: string }
  const byProduct = new Map<string, FileEntry[]>()
  const unmatched: string[] = []

  for (const file of files) {
    // Defensive: strip any directory prefix in case the client sent a path
    // (some browsers/clients put webkitRelativePath in the multipart filename).
    const basename = (file.name.split(/[\\/]/).pop() ?? file.name)
    const parsed = parseFilename(basename)
    if (!parsed) {
      unmatched.push(basename)
      continue
    }
    for (const key of parsed.nums) {
      if (!byProduct.has(key)) byProduct.set(key, [])
      byProduct.get(key)!.push({
        file,
        order: parsed.order,
        isPrimary: parsed.isPrimary,
        ext: parsed.ext,
      })
    }
  }

  // Fetch all matching products in one query
  const productNumbers = Array.from(byProduct.keys()).map(n => `#P-${n}`)
  const { data: products } = await supabase
    .from('products')
    .select('id, product_number')
    .in('product_number', productNumbers)

  const productMap = new Map<string, string>()  // product_number → id
  for (const p of products ?? []) {
    const m = /(\d+)/.exec((p as { product_number: string }).product_number)
    if (m) productMap.set(m[1].padStart(3, '0'), (p as { id: string }).id)
  }

  // Track results
  type FileResult = { filename: string; status: 'ok' | 'no_product' | 'failed'; error?: string }
  const results: FileResult[] = []
  let matchedProducts = 0
  let totalImages = 0
  let failed = 0

  // Process each product group
  for (const [num, entries] of byProduct) {
    const productId = productMap.get(num)
    if (!productId) {
      for (const e of entries) {
        results.push({ filename: e.file.name, status: 'no_product' })
        unmatched.push(e.file.name)
      }
      continue
    }

    matchedProducts++

    // 1. Get existing product_images rows so we can delete storage files
    const { data: existingImages } = await supabase
      .from('product_images')
      .select('id, image_url')
      .eq('product_id', productId)

    // 2. Delete old storage files
    if (existingImages && existingImages.length > 0) {
      const storageKeys: string[] = []
      for (const img of existingImages) {
        const url = (img as { image_url: string }).image_url
        // Extract storage path: everything after /product-images/
        const marker = '/product-images/'
        const idx = url.indexOf(marker)
        if (idx !== -1) {
          // URL may have query params or be a /storage/v1/object/public/... path
          // The key we need is the path after the bucket name
          const afterBucket = url.slice(idx + marker.length).split('?')[0]
          storageKeys.push(afterBucket)
        }
      }
      if (storageKeys.length > 0) {
        await supabase.storage.from('product-images').remove(storageKeys)
      }

      // 3. Delete DB rows
      const ids = existingImages.map(i => (i as { id: string }).id)
      await supabase.from('product_images').delete().in('id', ids)
    }

    // 4. Sort entries: primary first, then by order
    const sorted = [...entries].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
      return a.order - b.order
    })

    // 5. Upload new files
    let orderIdx = 1
    for (const entry of sorted) {
      try {
        const buf = await entry.file.arrayBuffer()
        const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${entry.ext}`
        const { error: uploadErr } = await supabase.storage
          .from('product-images')
          .upload(path, buf, { contentType: entry.file.type || `image/${entry.ext}` })

        if (uploadErr) throw uploadErr

        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)

        const { error: dbErr } = await supabase.from('product_images').insert({
          product_id: productId,
          image_url: urlData.publicUrl,
          is_primary: entry.isPrimary,
          order: entry.isPrimary ? 1 : orderIdx + 1,
        })
        if (dbErr) throw dbErr

        if (!entry.isPrimary) orderIdx++
        totalImages++
        results.push({ filename: entry.file.name, status: 'ok' })
      } catch (e: unknown) {
        failed++
        results.push({
          filename: entry.file.name,
          status: 'failed',
          error: (e as { message?: string })?.message ?? 'Upload failed',
        })
      }
    }
  }

  // Unmatched (bad filename format)
  for (const name of unmatched) {
    if (!results.find(r => r.filename === name)) {
      results.push({ filename: name, status: 'no_product' })
    }
  }

  return NextResponse.json({
    ok: true,
    matchedProducts,
    totalImages,
    failed,
    unmatched: results.filter(r => r.status === 'no_product').map(r => r.filename),
    failedFiles: results.filter(r => r.status === 'failed'),
    results,
  })
}
