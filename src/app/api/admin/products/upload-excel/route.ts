import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

// ════════════════════════════════════════════════════════════════════════════
// Excel-driven bulk product upsert.
//
// Logic:
//   1. Parse the uploaded .xlsx (first sheet, columns matching the master
//      template — see EXPECTED_COLS below).
//   2. Group rows by (category, partner_name, name) → product family. Each
//      row in the family is a variant (variant_label per row).
//   3. For each family:
//      - Find product by (category_name, partner_name, name).
//        - Found: compare description / location / duration / tags / etc.
//          → if any diff, update; else leave alone.
//        - Not found: insert new product.
//      - For each variant row:
//        - Find variant by (product_id, variant_label or sort_index when
//          label is null).
//          → existing & same price/currency → skip
//          → existing & differs → update
//          → not found → insert
//   4. Existing variants NOT present in the upload are LEFT ALONE (we do not
//      auto-delete; user must remove via UI to avoid surprises).
//
// Returns counts so the UI can show a summary.
// ════════════════════════════════════════════════════════════════════════════

type Row = {
  category?: string
  subcategory?: string
  partner_name?: string
  name?: string
  variant_label?: string
  base_price?: number | string
  price_currency?: string
  description?: string
  duration_value?: number | string
  duration_unit?: string
  has_female_doctor?: boolean | string
  has_prayer_room?: boolean | string
  dietary_type?: string
  location_address?: string
  is_active?: boolean | string
}

type ProductRecord = {
  id: string
  category_id: string
  subcategory_id: string | null
  name: string
  description: string | null
  partner_name: string | null
  duration_value: number | null
  duration_unit: string | null
  has_female_doctor: boolean | null
  has_prayer_room: boolean | null
  dietary_type: string | null
  location_address: string | null
  is_active: boolean
}

type VariantRecord = {
  id: string
  product_id: string
  variant_label: string | null
  base_price: number
  price_currency: string
  sort_order: number
  is_active: boolean
}

function normBool(v: unknown): boolean | undefined {
  if (v === true) return true
  if (v === false) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
    if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
  }
  return undefined
}

function normStr(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  return String(v).trim()
}

function normNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function normDietary(v: unknown): string {
  const s = normStr(v)
  const valid = new Set(['halal_certified', 'halal_friendly', 'muslim_friendly', 'pork_free', 'none'])
  return s && valid.has(s) ? s : 'none'
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === 'true'
  // When true, products in DB whose (category, partner, name) is NOT present
  // in the upload will be DELETED (cascading their variants). Off by default
  // — caller must opt in. UI surfaces the count both in the dry-run preview
  // and as a separate "will delete" warning before commit.
  const deleteMissing = url.searchParams.get('deleteMissing') === 'true'

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 })
  }

  // Auth: only admins
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
  const { data: admin } = await supabase.from('admins').select('id, name').eq('auth_user_id', uid).maybeSingle()
  if (!admin) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  const adminRow = admin as { id: string; name: string | null }

  // Read file
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file.' }, { status: 400 })
  }
  const buf = Buffer.from(await file.arrayBuffer())
  let rows: Row[]
  try {
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: '' })
  } catch (e) {
    return NextResponse.json({ error: `Could not parse xlsx: ${(e as Error).message}` }, { status: 400 })
  }

  // Categories — required to exist
  const { data: cats } = await supabase.from('product_categories').select('id, name')
  const catMap = new Map<string, string>((cats ?? []).map(c => [c.name as string, c.id as string]))

  // Subcategories — auto-create as needed, scoped per category
  const { data: subs } = await supabase.from('product_subcategories').select('id, category_id, name')
  const subKey = (catId: string, name: string) => `${catId}::${name}`
  const subMap = new Map<string, string>((subs ?? []).map(s => [subKey(s.category_id as string, s.name as string), s.id as string]))

  // Group input rows by (category, partner, name). Order preserved.
  type GroupKey = string
  const groups = new Map<GroupKey, { cat: string; sub: string; partner: string; name: string; rows: Row[] }>()
  const groupOrder: GroupKey[] = []
  const errors: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const cat = normStr(r.category)
    const partner = normStr(r.partner_name)
    const name = normStr(r.name)
    const sub = normStr(r.subcategory) ?? ''
    if (!cat || !partner || !name) {
      errors.push(`Row ${i + 2}: missing category / partner_name / name (skipped)`)
      continue
    }
    if (!catMap.has(cat)) {
      errors.push(`Row ${i + 2}: unknown category "${cat}" (skipped)`)
      continue
    }
    const key: GroupKey = `${cat}::${partner}::${name}`
    if (!groups.has(key)) {
      groups.set(key, { cat, sub, partner, name, rows: [] })
      groupOrder.push(key)
    }
    groups.get(key)!.rows.push(r)
  }

  let productsInserted = 0, productsUpdated = 0, productsUnchanged = 0
  let variantsInserted = 0, variantsUpdated = 0, variantsUnchanged = 0
  // For preview: capture per-row diffs of UPDATED items only.
  type Change = { field: string; before: unknown; after: unknown }
  type Updated = { kind: 'product' | 'variant'; label: string; changes: Change[] }
  const updates: Updated[] = []
  // Track which products in DB are mentioned in this upload (by their natural key).
  // Anything else is "in DB but not in upload" — informational only, never deleted.
  const seenKeys = new Set<string>()

  for (const key of groupOrder) {
    const grp = groups.get(key)!
    const catId = catMap.get(grp.cat)!
    seenKeys.add(`${catId}::${grp.partner}::${grp.name}`)

    // Ensure subcategory row exists
    let subId: string | null = null
    if (grp.sub) {
      const sk = subKey(catId, grp.sub)
      if (subMap.has(sk)) {
        subId = subMap.get(sk)!
      } else if (dryRun) {
        // pretend a fresh subcategory id; product will report subcategory diff if existing had different one
        subId = `dryrun-sub-${sk}`
        subMap.set(sk, subId)
      } else {
        const { data: created, error: subErr } = await supabase
          .from('product_subcategories')
          .insert({ category_id: catId, name: grp.sub })
          .select('id').single()
        if (subErr) {
          errors.push(`Subcategory create failed for "${grp.cat} > ${grp.sub}": ${subErr.message}`)
        } else {
          subId = created.id as string
          subMap.set(sk, subId)
        }
      }
    }

    // Build product row from first variant's metadata (shared across variants)
    const first = grp.rows[0]
    const desired = {
      category_id: catId,
      subcategory_id: subId,
      name: grp.name,
      partner_name: grp.partner,
      description: normStr(first.description) ?? '',
      duration_value: normNum(first.duration_value) ?? null,
      duration_unit: normStr(first.duration_unit) ?? null,
      has_female_doctor: normBool(first.has_female_doctor) ?? null,
      has_prayer_room: normBool(first.has_prayer_room) ?? null,
      dietary_type: normDietary(first.dietary_type),
      location_address: normStr(first.location_address) ?? null,
      is_active: normBool(first.is_active) ?? true,
    }

    // Find existing product by (category_id, partner_name, name)
    const { data: existingProds } = await supabase
      .from('products')
      .select('*')
      .eq('category_id', catId)
      .eq('partner_name', grp.partner)
      .eq('name', grp.name)
    const existing = (existingProds as ProductRecord[] | null)?.[0]

    let productId: string
    if (existing) {
      // Per-field diff. Skip subcategory_id when both are dryrun- placeholders
      // (their string ids would falsely diverge), and use description as the
      // most user-visible field name.
      const checks: Array<[string, unknown, unknown]> = [
        ['subcategory_id', existing.subcategory_id, desired.subcategory_id],
        ['description', existing.description ?? '', desired.description],
        ['duration_value', existing.duration_value, desired.duration_value],
        ['duration_unit', existing.duration_unit ?? null, desired.duration_unit],
        ['has_female_doctor', existing.has_female_doctor, desired.has_female_doctor],
        ['has_prayer_room', existing.has_prayer_room, desired.has_prayer_room],
        ['dietary_type', existing.dietary_type ?? 'none', desired.dietary_type],
        ['location_address', existing.location_address ?? null, desired.location_address],
        ['is_active', existing.is_active, desired.is_active],
      ]
      const productChanges: Change[] = []
      for (const [field, before, after] of checks) {
        // Treat dryrun- placeholder subcategory ids as "no change" — they only
        // differ because we synthesized a fake id when the real one is missing.
        if (field === 'subcategory_id'
            && typeof after === 'string' && (after as string).startsWith('dryrun-sub-')) continue
        if (before !== after) productChanges.push({ field, before, after })
      }
      const diff = productChanges.length > 0
      if (diff) {
        updates.push({
          kind: 'product',
          label: `${grp.partner} / ${grp.name}`,
          changes: productChanges,
        })
        if (!dryRun) {
          const { error: updErr } = await supabase.from('products').update(desired).eq('id', existing.id)
          if (updErr) {
            errors.push(`Product update failed for "${grp.partner} / ${grp.name}": ${updErr.message}`)
            continue
          }
        }
        productsUpdated++
      } else {
        productsUnchanged++
      }
      productId = existing.id
    } else {
      if (dryRun) {
        productId = `dryrun-prod-${grp.partner}::${grp.name}`
      } else {
        // Need a product_number. Use MAX(numeric part) + 1 — count-based
        // numbering collides when existing #P-XXX values are sparse (e.g.
        // #P-306..#P-311 occupied while count = 109 → tries #P-110 then
        // crashes into an existing high number).
        const { data: maxRow } = await supabase
          .from('products')
          .select('product_number')
          .order('product_number', { ascending: false })
          .limit(200)
        let maxNum = 0
        for (const r of (maxRow as { product_number: string | null }[] | null) ?? []) {
          const m = /(\d+)/.exec(r.product_number ?? '')
          if (m) {
            const n = parseInt(m[1], 10)
            if (n > maxNum) maxNum = n
          }
        }
        const productNumber = `#P-${String(maxNum + 1).padStart(3, '0')}`
        const { data: created, error: insErr } = await supabase
          .from('products')
          .insert({
            ...desired,
            product_number: productNumber,
            base_price: normNum(first.base_price) ?? 0,
            price_currency: normStr(first.price_currency) ?? 'KRW',
          })
          .select('id').single()
        if (insErr || !created) {
          errors.push(`Product insert failed for "${grp.partner} / ${grp.name}": ${insErr?.message ?? 'no row'}`)
          continue
        }
        productId = created.id as string
      }
      productsInserted++
    }

    // Variants — for dry-run-created products, no existing variants to compare
    const existingByLabel = new Map<string, VariantRecord>()
    if (!productId.startsWith('dryrun-')) {
      const { data: existingVars } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('sort_order')
      for (const v of (existingVars as VariantRecord[] | null) ?? []) {
        existingByLabel.set(v.variant_label ?? '', v)
      }
    }

    for (let i = 0; i < grp.rows.length; i++) {
      const vrow = grp.rows[i]
      const label = normStr(vrow.variant_label) ?? null
      const desiredVar = {
        variant_label: label,
        base_price: normNum(vrow.base_price) ?? 0,
        price_currency: normStr(vrow.price_currency) ?? 'KRW',
        sort_order: i,
        is_active: normBool(vrow.is_active) ?? true,
      }
      const existVar = existingByLabel.get(label ?? '')
      if (existVar) {
        const variantChecks: Array<[string, unknown, unknown]> = [
          ['base_price', existVar.base_price, desiredVar.base_price],
          ['price_currency', existVar.price_currency, desiredVar.price_currency],
          ['sort_order', existVar.sort_order, desiredVar.sort_order],
          ['is_active', existVar.is_active, desiredVar.is_active],
        ]
        const variantChanges: Change[] = []
        for (const [field, before, after] of variantChecks) {
          if (before !== after) variantChanges.push({ field, before, after })
        }
        const diff = variantChanges.length > 0
        if (diff) {
          updates.push({
            kind: 'variant',
            label: `${grp.name}${label ? ` / ${label}` : ''}`,
            changes: variantChanges,
          })
          if (!dryRun) {
            const { error: vErr } = await supabase
              .from('product_variants').update(desiredVar).eq('id', existVar.id)
            if (vErr) {
              errors.push(`Variant update failed for "${grp.name} / ${label ?? '(default)'}": ${vErr.message}`)
              continue
            }
          }
          variantsUpdated++
        } else {
          variantsUnchanged++
        }
      } else {
        if (!dryRun) {
          const { error: vErr } = await supabase.from('product_variants').insert({
            product_id: productId,
            ...desiredVar,
          })
          if (vErr) {
            errors.push(`Variant insert failed for "${grp.name} / ${label ?? '(default)'}": ${vErr.message}`)
            continue
          }
        }
        variantsInserted++
      }
    }
  }

  // Compile "in DB but not in this upload". Default: informational. With
  // deleteMissing=true we actually remove these (cascading their variants).
  const { data: allDb } = await supabase
    .from('products')
    .select('id, name, partner_name, category_id, product_categories(name)')
  type DbProd = { id: string; name: string; partner_name: string | null; category_id: string;
    product_categories: { name: string } | null }
  const missingProds = ((allDb as unknown as DbProd[]) ?? [])
    .filter(p => p.partner_name && !seenKeys.has(`${p.category_id}::${p.partner_name}::${p.name}`))
  const missingInUpload = missingProds.map(p => ({
    label: `${p.partner_name} / ${p.name}`,
    category: p.product_categories?.name ?? '',
  }))

  let productsDeleted = 0
  if (deleteMissing && missingProds.length > 0) {
    if (dryRun) {
      productsDeleted = missingProds.length  // preview only
    } else {
      const ids = missingProds.map(p => p.id)
      const { error: delErr, count } = await supabase
        .from('products')
        .delete({ count: 'exact' })
        .in('id', ids)
      if (delErr) {
        errors.push(`Delete-missing failed: ${delErr.message}`)
      } else {
        productsDeleted = count ?? ids.length
      }
    }
  }

  // Audit log — only on real commit, not dry-run preview.
  if (!dryRun && (productsInserted + productsUpdated + productsDeleted + variantsInserted + variantsUpdated > 0)) {
    await supabase.from('audit_logs').insert({
      actor_type: 'admin',
      actor_id: adminRow.id,
      actor_label: adminRow.name ?? 'admin',
      action: 'product.bulk_uploaded',
      target_type: 'products',
      target_id: null,
      target_label: file.name,
      details: {
        file_name: file.name,
        delete_missing: deleteMissing,
        products: {
          inserted: productsInserted, updated: productsUpdated,
          unchanged: productsUnchanged, deleted: productsDeleted,
        },
        variants: { inserted: variantsInserted, updated: variantsUpdated, unchanged: variantsUnchanged },
        errors_count: errors.length,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    deleteMissing,
    products: {
      inserted: productsInserted, updated: productsUpdated, unchanged: productsUnchanged,
      deleted: productsDeleted,
    },
    variants: { inserted: variantsInserted, updated: variantsUpdated, unchanged: variantsUnchanged },
    updates,  // detail of each updated row — for preview UI
    missingInUpload,  // products in DB not present in this xlsx
    errors,
  })
}
