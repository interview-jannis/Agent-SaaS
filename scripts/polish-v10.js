/* eslint-disable */
// Polish pass on highest products_master_v*.xlsx:
//   1. Normalize CRLF -> LF in all string fields
//   2. Strip NBSP (U+00A0) -> regular space
//   3. Backfill subcategory for existing rows
//   4. Backfill partner_short for new appendix rows

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const DATA_DIR = path.join(__dirname, '..', 'data')
const NBSP = String.fromCharCode(0xA0)

const PARTNER_SHORT_MAP = {
  'TRABIC': 'TRABIC',
  'VERITAS': 'VERITAS',
  'OK KOREA COMPANY': 'OK Korea',
  'AS CONCIERGE': 'AS Concierge',
  'COSMIJN': 'COSMIJN',
  'KOREA SPECIAL SECURITY': 'KSS',
  'TEAMGUARD COMPANY': 'TeamGuard',
  'TRIPLE SECURITY': 'Triple Security',
  'Korea Grand Sale': 'Korea Grand Sale',
  'KUMKANG OPTICAL': 'Kumkang Optical',
  'OLIVE YOUNG N': 'Olive Young',
  'ART BOX': 'Art Box',
  'Life World tour': 'Life World Tour',
  'Korea Trevel Easy': 'Korea Travel Easy',
  'eTour': 'eTour',
  'GET YOUR GUIDE': 'Get Your Guide',
  'Korea Tour Tip': 'Korea Tour Tip',
  'DANCEJOA': 'Dancejoa',
  'K Look': 'K Look',
  'REHANNAIMAGE': 'Rehanna Image',
  'Rarelee': 'Rarelee',
  'Merizzbeauty': 'Merizz Beauty',
  'COLOR PLACE': 'Color Place',
  'NEUF COULEUR': 'Neuf Couleur',
  'COSMOJIN': 'Cosmojin',
  'Gold Sky Tour': 'Gold Sky Tour',
  'KOREA TOUR NET': 'Korea Tour Net',
  'LOTTE TOUR': 'Lotte Tour',
  'Gyeongsangbuk-do Cultural Tourism': 'Gyeongbuk Tourism',
  'NATOUR': 'Natour',
  'HAERANG': 'Haerang',
  'TATATA RENTAL SHOP': 'Tatata',
  'SERENO SKISHOP': 'Sereno',
  'NUMBER.1 RENTALSHOP': 'Number.1',
  'V SKI': 'V Ski',
  'Caribbean Bay': 'Caribbean Bay',
  'Ocean World': 'Ocean World',
  'Cimer': 'Cimer',
  'Le Point Water Leisure': 'Le Point',
  'RIVER LAND': 'River Land',
  'Kiwoom Heroes (Gocheok)': 'Kiwoom Heroes',
  'SSG Landers': 'SSG Landers',
  'FC Seoul': 'FC Seoul',
  'LOTTE WORLD': 'Lotte World',
  'EVER LAND': 'Everland',
  'Seoul Land': 'Seoul Land',
}

function inferSubcategory(row) {
  if (row.subcategory) return row.subcategory
  const cat = row.category
  const name = String(row.name || '')
  const partner = String(row.partner_name || '')

  if (cat === 'Medical') return 'Health Check-up'
  if (cat === 'Beauty') return 'K-Beauty Program'
  if (cat === 'Wellness' && partner.includes('SIGNIEL SPA')) return 'Spa'
  if (cat === 'K-Education') return 'School Tour'
  if (cat === 'K-Starcation') return 'K-POP Camp'

  if (cat === 'Subpackage') {
    if (/Hotel|Hanok|\[★/i.test(name)) return 'Hotel'
    if (/Vehicle|Sprinter|Sedan|SUV|Limousine/i.test(name)) return 'Vehicle'
  }
  return ''
}

function findHighestVersion(prefix) {
  const re = new RegExp('^' + prefix + '_v(\\d+)\\.xlsx$')
  let best = { version: 0, file: null }
  for (const f of fs.readdirSync(DATA_DIR)) {
    const m = f.match(re); if (m && Number(m[1]) > best.version) best = { version: Number(m[1]), file: f }
  }
  return best
}

function main() {
  const { version, file } = findHighestVersion('products_master')
  if (!file) { console.error('No products_master_v*.xlsx'); process.exit(1) }
  const inPath = path.join(DATA_DIR, file)
  const outPath = path.join(DATA_DIR, `products_master_v${version + 1}.xlsx`)

  const wb = XLSX.readFile(inPath)
  const sheetName = wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })

  let nbspStripped = 0
  let crlfNormalized = 0
  let subcatFilled = 0
  let shortFilled = 0
  const unknownPartners = new Set()

  const out = rows.map(r => {
    const newRow = {}
    for (const [k, v] of Object.entries(r)) {
      if (typeof v !== 'string') { newRow[k] = v; continue }
      let s = v
      if (s.indexOf(NBSP) !== -1) {
        nbspStripped++
        s = s.split(NBSP).join(' ').replace(/ {2,}/g, ' ').trim()
      }
      if (s.indexOf('\r') !== -1) {
        crlfNormalized++
        s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      }
      newRow[k] = s
    }

    if (!newRow.subcategory) {
      const sub = inferSubcategory(newRow)
      if (sub) { newRow.subcategory = sub; subcatFilled++ }
    }

    if (!newRow.partner_short && newRow.partner_name) {
      const map = PARTNER_SHORT_MAP[newRow.partner_name]
      if (map) { newRow.partner_short = map; shortFilled++ }
      else unknownPartners.add(newRow.partner_name)
    }

    return newRow
  })

  const wbo = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(out)
  const cols = Object.keys(out[0])
  ws['!cols'] = cols.map(c => {
    if (['description', 'why_recommendation', 'head_doctor_profile', 'name', 'notes'].includes(c)) return { wch: 50 }
    if (['partner_name', 'location_address', 'contact_phone', 'contact_email', 'info_url'].includes(c)) return { wch: 28 }
    if (c === 'partner_short') return { wch: 20 }
    if (c === 'subcategory') return { wch: 14 }
    return { wch: 14 }
  })
  XLSX.utils.book_append_sheet(wbo, ws, sheetName)
  for (const name of wb.SheetNames) {
    if (name === sheetName) continue
    XLSX.utils.book_append_sheet(wbo, wb.Sheets[name], name)
  }
  XLSX.writeFile(wbo, outPath)

  console.log('Read :', inPath)
  console.log('Wrote:', outPath)
  console.log('NBSP stripped from:', nbspStripped, 'cells')
  console.log('CRLF -> LF normalized:', crlfNormalized, 'cells')
  console.log('subcategory backfilled:', subcatFilled, 'rows')
  console.log('partner_short backfilled:', shortFilled, 'rows')
  if (unknownPartners.size) console.log('Unknown partners:', [...unknownPartners])
}

main()
