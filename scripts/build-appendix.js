/* eslint-disable */
// Parse the 7 missed sheets from the master Internal_Price sheet:
//   3-1. K-Wellness_Shopping       → Wellness (sub: Shopping)
//   3-2. K-Wellness_K-Content      → Wellness (sub: K-Content)
//   3-3. K-Wellness_TOUR           → Wellness (sub: Tour)
//   3-4. K-Wellness_Leisure        → Wellness (sub: Leisure)
//   7. Interpreter                 → Subpackage (sub: Interpreter)
//   8. Concierge                   → Subpackage (sub: Concierge)
//   11. Security                   → Subpackage (sub: Security)
//
// Filter policy (per 4/30 meeting):
//   - Wellness: ALL items, even "No Fixed Price" (margin=0)
//   - Subpackage Interpreter/Concierge/Security: ALL items
// (Hotel ≥1M filter applies to existing 5. Hotel sheet, not re-parsed here.)
//
// Output: data/products_appendix_generated_v*.xlsx (auto-versioned, never overwritten).
// Numbering continues from master_v*.xlsx max #P-NNN.
//
// Usage: node scripts/build-appendix.js

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const DATA_DIR = path.join(__dirname, '..', 'data')
const SRC = path.join(DATA_DIR, 'Internal_Price sheet for Proposal_draft_2_v7_26.02.24.xlsx')
const USD_RATE = 1480

function nextVersionedPath(prefix) {
  const re = new RegExp('^' + prefix + '_v(\\d+)\\.xlsx$')
  let max = 0
  for (const f of fs.readdirSync(DATA_DIR)) {
    const m = f.match(re); if (m) max = Math.max(max, Number(m[1]))
  }
  return { path: path.join(DATA_DIR, `${prefix}_v${max + 1}.xlsx`), version: max + 1 }
}

function findHighestProductNumber(prefix) {
  const re = new RegExp('^' + prefix + '_v(\\d+)\\.xlsx$')
  let best = { version: 0, file: null }
  for (const f of fs.readdirSync(DATA_DIR)) {
    const m = f.match(re); if (m && Number(m[1]) > best.version) best = { version: Number(m[1]), file: f }
  }
  if (!best.file) return 0
  const wb = XLSX.readFile(path.join(DATA_DIR, best.file))
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
  let max = 0
  for (const r of rows) {
    const m = String(r.product_number ?? '').match(/#P-(\d+)/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

// ─── Helpers (shared shape with build-data-from-master.js) ───────────────────

function clean(s) { return String(s ?? '').trim() }
function flat(s) { return String(s ?? '').replace(/\s+/g, ' ').trim() }

function rowsOf(wb, sheet) {
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' })
}

function isHeaderOrDecorRow(row) {
  const a = clean(row[0])
  if (!a && row.every(c => clean(c) === '')) return true
  if (/^Premium Package/i.test(a)) return true
  if (/^K-Wellness Package/i.test(a)) return true
  if (/for Muslim VIP/i.test(a)) return true
  // "Package" header row — detect by presence of header keywords in any other column
  if (a === 'Package') {
    const restJoined = row.slice(1).map(clean).join(' ').toLowerCase()
    if (/sub.{0,2}package|partners|course program|service|quotation|contact point/i.test(restJoined)) return true
  }
  // Unit row — col 0 empty, other cells match unit/header keywords
  if (a === '' && row.slice(1).every(c => /^(Sub Package|Sub\s*\|\s*Package|Sub|Partners|Service|Course Program( & Grade)?|Quotation|Time(\s*\|\s*Taken)?|Package Detail|Information|Check-up|Check up|Contact Point|Check[- ]?up[- ]?Detail|1,?000 KRW|USD)$/i.test(clean(c)) || clean(c) === '')) return true
  return false
}

// Multi-line cell parser used for partner cells holding name+phone+email+url.
// Many cells in this dataset use formats like:
//   "KUMKANG OPTICAL | 도곡 점 : 02-6243-1001 | 삼성병원 점 : 02-2226-7007"
// where each line is "branch (Korean): phone". We extract the phone parts and
// drop the Korean branch text so the partner name stays clean post-translation.
function parsePartner(raw) {
  const lines = String(raw ?? '').split(/\r?\n|\|/).map(s => s.trim()).filter(Boolean)
  const namesParts = []
  const phones = []
  const emails = []
  let url = ''
  let address = ''
  const KO = /[ㄱ-힣]/
  const isEmail = (l) => /^\S+@\S+\.\S+$/.test(l)
  const isPhone = (l) => /^[\+\d][\d\-\.\s\)\(]{5,}$/.test(l) || /^\d{2,4}[-\.\s]\d{3,4}[-\.\s]\d{3,4}/.test(l) || /^\d{4,}$/.test(l)
  const isUrl = (l) => /^https?:\/\//i.test(l)
  const isAddr = (l) => /(Seoul|Busan|Incheon|Daegu|Gwangju|Daejeon|Ulsan|Sejong|Gyeonggi|Jeju|Gangwon|Chungcheong|Jeolla|Gyeongsang)[\s\-]/i.test(l)
    || /(\-gu|\-do|\-si|\-dong)\b/i.test(l)

  for (let line of lines) {
    if (isEmail(line)) { emails.push(line); continue }
    if (isUrl(line)) { url = line; continue }

    // "<Korean branch> : <phone>" pattern — extract phone, drop Korean
    if (KO.test(line)) {
      const phoneMatch = line.match(/(\+?\d[\d\-\.\s\)\(]{6,}\d|\d{4,4}[-\.\s]?\d{4,4}|\d{2,4}[-\.\s]\d{3,4}[-\.\s]\d{3,4})/)
      if (phoneMatch) {
        phones.push(phoneMatch[1].trim())
        // Strip the matched phone + Korean parts; if anything ASCII-like remains, keep as name
        const residual = line.replace(phoneMatch[1], '').replace(/[ㄱ-힣\s:]+/g, ' ').trim()
        if (residual && /[A-Za-z]/.test(residual)) namesParts.push(residual)
        continue
      }
      // Pure Korean line — drop (will be Korean-stripped later anyway)
      continue
    }

    if (isPhone(line)) { phones.push(line); continue }
    if (isAddr(line)) { address = line; continue }
    namesParts.push(line)
  }
  return {
    name: namesParts.join(' ').replace(/\s+/g, ' ').trim(),
    phone: phones.join(' / '),
    email: emails.join(' / '),
    url,
    address,
  }
}

function extractNumbers(txt) {
  return (txt.match(/[\d,]+(?:\.\d+)?/g) ?? [])
    .map(s => Number(s.replace(/,/g, '')))
    .filter(n => !isNaN(n) && n > 0)
}

function stripUnitNumbers(txt) {
  return String(txt).replace(/\d+(?:[\.,]\d+)?\s*(?:박|일|인|시간|분|개|회|호|명|그룹|팀|셋트|셋|팩|P|T|h|m|min|hr|hour|day|night|group|grp|pax|person|people|ea|set|team|hours)\b/gi, ' ')
}

function parseDuration(raw) {
  const s = clean(raw).toLowerCase()
  if (!s) return { value: '', unit: '' }
  let m
  if ((m = s.match(/(\d+)\s*(?:day|일|d)\b/))) return { value: Number(m[1]), unit: 'days' }
  if ((m = s.match(/(\d+)\s*(?:hour|hr|h)\b/))) return { value: Number(m[1]), unit: 'hours' }
  if ((m = s.match(/(\d+)\s*(?:m(?:in)?)\b/))) return { value: Number(m[1]), unit: 'minutes' }
  return { value: '', unit: '' }
}

// Parse a quotation cell. Returns { krw_min, krw_max, usd_min, usd_max } or empty.
// krwUnit: 'thousands' (cell shows 1,000-KRW units) or 'raw'.
function parsePrice(krwCell, usdCell, opts = {}) {
  const krwScale = (opts.krwUnit ?? 'thousands') === 'raw' ? 1 : 1000
  const out = {}
  if (krwCell !== '' && krwCell != null) {
    const txt = String(krwCell)
    if (!/^[-—–\s]+$|No\s*(?:Fixed|fixed)?\s*Price|가격 문의|별도 상담/i.test(txt)) {
      const nums = extractNumbers(stripUnitNumbers(txt))
      if (nums.length) {
        out.krw_min = Math.round(Math.min(...nums) * krwScale)
        out.krw_max = Math.round(Math.max(...nums) * krwScale)
      }
    }
  }
  if (usdCell !== '' && usdCell != null) {
    const txt = String(usdCell)
    if (!/^[-—–\s]+$|No\s*(?:Fixed|fixed)?\s*Price|가격 문의|별도 상담/i.test(txt)) {
      const nums = extractNumbers(stripUnitNumbers(txt))
      if (nums.length) {
        out.usd_min = Math.round(Math.min(...nums))
        out.usd_max = Math.round(Math.max(...nums))
      }
    }
  }
  return out
}

// ─── Product accumulator ────────────────────────────────────────────────────

const products = []
let pNum = 0

function pushProduct(p) {
  pNum += 1
  products.push({
    product_number: '#P-' + String(pNum).padStart(3, '0'),
    category: p.category,
    subcategory: p.subcategory ?? '',
    partner_name: flat(p.partner_name),
    name: flat(p.name),
    grade: flat(p.grade ?? ''),
    gender: 'Both',
    base_price: p.base_price ?? '',
    price_currency: p.price_currency ?? '',
    price_min: p.price_min ?? '',
    price_max: p.price_max ?? '',
    price_unit: p.price_unit ?? '',           // "1P" (per person) / "1T" (per team) / "8h" / etc — for Wellness/Sub
    duration_value: p.duration_value ?? '',
    duration_unit: p.duration_unit ?? '',
    description: p.description ?? '',
    why_recommendation: '',
    head_doctor_profile: '',
    location_address: p.location_address ?? '',
    contact_phone: p.contact_phone ?? '',
    contact_email: p.contact_email ?? '',
    info_url: p.info_url ?? '',
    has_female_doctor: '',
    has_prayer_room: '',
    dietary_type: 'none',
    is_active: 'TRUE',
    notes: p.notes ?? '',
  })
}

// Pick best price entry (prefer KRW, fall back to USD); record unit if extractable.
function pickPrice(rawKrw, rawUsd, parsed) {
  // Look for unit indicator "/ 1P" or "/ 1T" or "/ 1hour" or "/ 8h" in either cell
  const combined = String(rawKrw || '') + ' ' + String(rawUsd || '')
  const unitMatch = combined.match(/\/\s*(\d*[A-Za-z]+|\d+\s*(?:hour|h|day|d|min|m))\b/)
  const unit = unitMatch ? unitMatch[1].trim() : ''
  if (parsed.krw_min != null) {
    return {
      base_price: parsed.krw_max,
      price_currency: 'KRW',
      price_min: parsed.krw_min !== parsed.krw_max ? parsed.krw_min : '',
      price_max: parsed.krw_min !== parsed.krw_max ? parsed.krw_max : '',
      price_unit: unit,
    }
  }
  if (parsed.usd_min != null) {
    return {
      base_price: parsed.usd_max,
      price_currency: 'USD',
      price_min: parsed.usd_min !== parsed.usd_max ? parsed.usd_min : '',
      price_max: parsed.usd_min !== parsed.usd_max ? parsed.usd_max : '',
      price_unit: unit,
    }
  }
  return {
    base_price: 0,
    price_currency: 'KRW',
    price_min: '',
    price_max: '',
    price_unit: '',
  }
}

// ─── Parsers ────────────────────────────────────────────────────────────────

// 7. Interpreter — Subpackage > Interpreter
function parseInterpreterProducts(wb) {
  const rows = rowsOf(wb, '7. Interpreter')
  let lastPartnerCell = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const partnerCell = clean(row[1])
    if (partnerCell) lastPartnerCell = partnerCell
    if (!lastPartnerCell) continue
    const service = clean(row[2])
    const priceText = clean(row[3])
    if (!service && !priceText) continue
    const url = clean(row[6]) || (parsePartner(lastPartnerCell).url)
    const partnerInfo = parsePartner(lastPartnerCell)
    const parsed = parsePrice(priceText, '', { krwUnit: 'thousands' })
    const price = pickPrice(priceText, '', parsed)
    pushProduct({
      category: 'Subpackage',
      subcategory: 'Interpreter',
      partner_name: partnerInfo.name,
      name: service || 'Interpreter Service',
      description: priceText.replace(/\s+/g, ' ').trim() || '',
      contact_phone: partnerInfo.phone,
      contact_email: partnerInfo.email,
      info_url: url,
      ...price,
      notes: 'Interpreter — original quotation: ' + priceText.replace(/\s+/g, ' ').trim(),
    })
  }
}

// 8. Concierge — Subpackage > Concierge
function parseConciergeProducts(wb) {
  const rows = rowsOf(wb, '8. Concierge')
  let lastPartnerCell = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const partnerCell = clean(row[1])
    if (partnerCell) lastPartnerCell = partnerCell
    if (!lastPartnerCell) continue
    const service = clean(row[2])
    const priceText = clean(row[3])
    if (!service && !priceText) continue
    const url = clean(row[5]) || (parsePartner(lastPartnerCell).url)
    const partnerInfo = parsePartner(lastPartnerCell)
    const parsed = parsePrice(priceText, '', { krwUnit: 'raw' })
    const price = pickPrice(priceText, '', parsed)
    pushProduct({
      category: 'Subpackage',
      subcategory: 'Concierge',
      partner_name: partnerInfo.name,
      name: service || 'Concierge Service',
      description: priceText.replace(/\s+/g, ' ').trim() || '',
      contact_phone: partnerInfo.phone,
      contact_email: partnerInfo.email,
      info_url: url,
      ...price,
      notes: 'Concierge — original quotation: ' + priceText.replace(/\s+/g, ' ').trim(),
    })
  }
}

// 11. Security — Subpackage > Security
function parseSecurityProducts(wb) {
  const rows = rowsOf(wb, '11. Security')
  let lastPartner = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const partner = clean(row[1])
    if (partner) lastPartner = partner
    if (!lastPartner) continue
    const contact = clean(row[2])
    const service = clean(row[3])
    const priceText = clean(row[4])
    if (!service && !priceText) continue
    const url = clean(row[6])
    const contactInfo = parsePartner(contact)
    const parsed = parsePrice(priceText, '', { krwUnit: 'thousands' })
    const price = pickPrice(priceText, '', parsed)
    pushProduct({
      category: 'Subpackage',
      subcategory: 'Security',
      partner_name: lastPartner,
      name: service || 'Security Service',
      description: priceText.replace(/\s+/g, ' ').trim() || '',
      contact_phone: contactInfo.phone,
      contact_email: contactInfo.email,
      info_url: url,
      ...price,
      notes: 'Security — original quotation: ' + priceText.replace(/\s+/g, ' ').trim(),
    })
  }
}

// 3-1. K-Wellness_Shopping — Wellness > Shopping
function parseWellnessShoppingProducts(wb) {
  const rows = rowsOf(wb, '3-1. K-Wellness_Shopping')
  parseWellnessSheet(rows, 'Shopping', { detailCol: 7, urlCol: 8 })
}

// 3-2. K-Wellness_K-Content — Wellness > K-Content
function parseWellnessKContentProducts(wb) {
  const rows = rowsOf(wb, '3-2. K-Wellness_K-Content')
  parseWellnessSheet(rows, 'K-Content', { detailCol: 8, urlCol: -1 })
}

// 3-3. K-Wellness_TOUR — Wellness > Tour
function parseWellnessTourProducts(wb) {
  const rows = rowsOf(wb, '3-3. K-Wellness_TOUR')
  parseWellnessSheet(rows, 'Tour', { detailCol: 8, urlCol: -1 })
}

// 3-4. K-Wellness_Leisure — Wellness > Leisure
function parseWellnessLeisureProducts(wb) {
  const rows = rowsOf(wb, '3-4. K-Wellness_Leisure')
  parseWellnessSheet(rows, 'Leisure', { detailCol: 8, urlCol: -1 })
}

// Common Wellness sheet shape:
// col 0: Package (carry-down: "K-Wellness (X)")
// col 1: Sub Package (carry-down: "festival" / "CITY TOUR" / "SNOW TOUR" etc.)
// col 2: Partners (multi-line: name + phone + email)
// col 3: Course Program & Grade (text)
// col 4: empty (filler)
// col 5: KRW (1,000 KRW units)
// col 6: USD
// col 7: Time Taken
// col 8: Package Detail (or info URL trailing). 3-1 has separate detailCol=7 + urlCol=8.
function parseWellnessSheet(rows, subLabel, opts) {
  let lastSubPackage = ''
  let lastPartner = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const sub = clean(row[1])
    if (sub) lastSubPackage = sub
    const partner = clean(row[2])
    if (partner) lastPartner = partner
    if (!lastPartner) continue
    const courseProgram = clean(row[3])
    const grade = clean(row[4])
    const krwCell = row[5]
    const usdCell = row[6]
    const time = clean(row[7])
    const detail = opts.detailCol >= 0 ? clean(row[opts.detailCol]) : ''
    const url = opts.urlCol >= 0 ? clean(row[opts.urlCol]) : ''
    // Skip pure decorator rows that have no actionable content
    if (!courseProgram && !grade && !detail && !krwCell && !usdCell) continue

    const partnerInfo = parsePartner(lastPartner)
    const parsed = parsePrice(krwCell, usdCell, { krwUnit: 'thousands' })
    const price = pickPrice(krwCell, usdCell, parsed)
    const dur = parseDuration(time)

    // Build descriptive name
    const nameParts = []
    if (lastSubPackage) nameParts.push(lastSubPackage)
    if (courseProgram) nameParts.push(courseProgram)
    if (grade && grade !== courseProgram) nameParts.push(grade)
    let name = nameParts.join(' · ')
    if (!name) name = `${subLabel} item`

    pushProduct({
      category: 'Wellness',
      subcategory: subLabel,
      partner_name: partnerInfo.name,
      name,
      grade,
      duration_value: dur.value,
      duration_unit: dur.unit,
      description: detail,
      contact_phone: partnerInfo.phone,
      contact_email: partnerInfo.email,
      info_url: /^https?:\/\//i.test(url) ? url : (partnerInfo.url || ''),
      ...price,
    })
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  // Resume product numbering from existing master if present
  const masterMax = findHighestProductNumber('products_master')
  pNum = masterMax
  console.log('Starting #P numbering after master max:', masterMax, '→ first new = #P-' + String(masterMax + 1).padStart(3, '0'))

  const wb = XLSX.readFile(SRC)
  parseInterpreterProducts(wb)
  parseConciergeProducts(wb)
  parseSecurityProducts(wb)
  parseWellnessShoppingProducts(wb)
  parseWellnessKContentProducts(wb)
  parseWellnessTourProducts(wb)
  parseWellnessLeisureProducts(wb)

  const { path: outPath } = nextVersionedPath('products_appendix_generated')
  const wbo = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(products)
  ws['!cols'] = [
    { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 50 },
    { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 8 }, { wch: 50 },
    { wch: 50 }, { wch: 50 }, { wch: 22 }, { wch: 22 }, { wch: 30 },
    { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 8 },
    { wch: 50 },
  ]
  XLSX.utils.book_append_sheet(wbo, ws, 'Products')

  const summary = {}
  for (const p of products) {
    const k = `${p.category} / ${p.subcategory}`
    summary[k] = (summary[k] ?? 0) + 1
  }
  const sumRows = Object.entries(summary).map(([k, count]) => ({ category: k, count }))
  sumRows.push({ category: 'TOTAL', count: products.length })
  XLSX.utils.book_append_sheet(wbo, XLSX.utils.json_to_sheet(sumRows), 'Summary')
  XLSX.writeFile(wbo, outPath)

  console.log('Wrote:', outPath)
  console.log('By sub-category:', summary)
  console.log('Total appended products:', products.length)
}

main()
