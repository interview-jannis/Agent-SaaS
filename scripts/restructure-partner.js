/* eslint-disable */
// Strategy A: separate partner from name.
//   - partner_name → canonicalized (typos fixed, anon codes/URLs/notes stripped)
//   - partner_short → new column with UI alias
//   - name → strip leading partner segment so name carries only the variant
//
// Reads highest products_master_v*.xlsx, writes next version.
// Idempotent-ish: if partner_short already populated, leaves it alone.
//
// Usage:  node scripts/restructure-partner.js

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const DATA_DIR = path.join(__dirname, '..', 'data')

// Map ANY variant of a partner_name (as it currently appears in the sheet) to
// its { canonical, short } form. Canonical is the formal name we want to keep
// in partner_name; short is the new partner_short alias used in dense UI.
const PARTNER_MAP = {
  // Medical
  'Asan Medical Center': { canonical: 'Asan Medical Center', short: 'Asan Medical' },
  'The Catholic University of Korea': { canonical: 'The Catholic University of Korea', short: 'Catholic Hospital' },
  'Gil Hospital International Healthcare Center': { canonical: 'Gil Hospital International Healthcare Center', short: 'Gil Hospital' },
  "SNUH healthcare System Gangnam Center's International Clnic": { canonical: 'SNUH Gangnam Center International Clinic', short: 'SNUH Gangnam' },
  // Beauty
  'Nest Clinic GangNam (=A Clinic)': { canonical: 'Nest Clinic GangNam', short: 'Nest Clinic' },
  'SELENA Clinic Hongdae (=B Clinic)': { canonical: 'SELENA Clinic Hongdae', short: 'Selena Clinic' },
  "Salon de Dr.Tune's Clinic": { canonical: "Salon de Dr.Tune's Clinic", short: "Dr.Tune's" },
  // Wellness
  'Retreat SIGNIEL SPA': { canonical: 'Retreat SIGNIEL SPA', short: 'Signiel Spa' },
  // K-Education
  'Korea tour tip': { canonical: 'Korea Tour Tip', short: 'Korea Tour Tip' },
  // K-Starcation
  'World K-POP Center': { canonical: 'World K-POP Center', short: 'World K-POP' },
  // Hotels
  'THE SHILLA SEOUL': { canonical: 'THE SHILLA SEOUL', short: 'Shilla' },
  'SIGNIEL SEOUL': { canonical: 'SIGNIEL SEOUL', short: 'Signiel' },
  'INSPIRE': { canonical: 'INSPIRE', short: 'INSPIRE' },
  'InterContinental': { canonical: 'InterContinental', short: 'InterContinental' },
  'PARADISE HOTEL': { canonical: 'PARADISE HOTEL', short: 'Paradise' },
  'FOUR SEASONS': { canonical: 'FOUR SEASONS', short: 'Four Seasons' },
  'PARK HYATT SEOUL': { canonical: 'PARK HYATT SEOUL', short: 'Park Hyatt Seoul' },
  'PARK HYATT INCHEON': { canonical: 'PARK HYATT INCHEON', short: 'Park Hyatt Incheon' },
  'Oak Wood Premier Incehon': { canonical: 'Oakwood Premier Incheon', short: 'Oakwood Incheon' },
  'Sheraton': { canonical: 'Sheraton', short: 'Sheraton' },
  'Hanok Essay Hahoe https://gahoe.hanokessay.com/reservation': { canonical: 'Hanok Essay Hahoe', short: 'Hanok Essay', extracted_url: 'https://gahoe.hanokessay.com/reservation' },
  'GYEONGWONJAE': { canonical: 'Gyeongwonjae', short: 'Gyeongwonjae' },
  // Vehicle
  'Merit Limousine (only vehicle / vehicle + driver)': { canonical: 'Merit Limousine', short: 'Merit Limo', desc_note: 'Vehicle-only or vehicle + driver options.' },
}

// Strip the leading partner segment from a "·"-joined name. Match against
// every known variant of the partner (original + canonical + short) so we
// catch all forms.
function stripLeadingPartnerFromName(name, partnerVariants) {
  if (!name || !name.includes('·')) {
    // Single-segment name. If it equals the partner, name becomes empty —
    // signals "needs manual variant suffix".
    const trimmed = name.trim()
    if (partnerVariants.some(v => v.toLowerCase() === trimmed.toLowerCase())) return ''
    return name
  }
  const segs = name.split('·').map(s => s.trim())
  const first = segs[0]
  if (partnerVariants.some(v => v.toLowerCase() === first.toLowerCase())) {
    return segs.slice(1).join(' · ')
  }
  return name
}

// ─── File io ────────────────────────────────────────────────────────────────

function findHighestVersion(prefix) {
  const re = new RegExp('^' + prefix + '_v(\\d+)\\.xlsx$')
  let best = { version: 0, file: null }
  for (const f of fs.readdirSync(DATA_DIR)) {
    const m = f.match(re)
    if (m && Number(m[1]) > best.version) best = { version: Number(m[1]), file: f }
  }
  return best
}

function reorderColumns(row, originalCols) {
  // Insert partner_short right after partner_name
  const out = {}
  for (const col of originalCols) {
    out[col] = row[col] ?? ''
    if (col === 'partner_name' && !originalCols.includes('partner_short')) {
      out.partner_short = row.partner_short ?? ''
    }
  }
  return out
}

function main() {
  const { version, file } = findHighestVersion('products_master')
  if (!file) { console.error('No products_master_v*.xlsx'); process.exit(1) }
  const inPath = path.join(DATA_DIR, file)
  const outPath = path.join(DATA_DIR, `products_master_v${version + 1}.xlsx`)

  const wb = XLSX.readFile(inPath)
  const sheetName = wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })

  let partnersChanged = 0
  let namesStripped = 0
  let nameEmpty = 0
  const unknownPartners = new Set()
  const emptyNameRows = []

  const out = rows.map(r => {
    const orig = r.partner_name
    const map = PARTNER_MAP[orig]
    const newRow = { ...r }

    if (!map) {
      unknownPartners.add(orig)
      newRow.partner_short = newRow.partner_short || orig
      return newRow
    }

    // Update partner_name and partner_short
    if (newRow.partner_name !== map.canonical) {
      newRow.partner_name = map.canonical
      partnersChanged++
    }
    newRow.partner_short = map.short

    // Move embedded URL out of partner_name into info_url (if not already set)
    if (map.extracted_url && !String(newRow.info_url || '').trim()) {
      newRow.info_url = map.extracted_url
    }

    // Move embedded note out of partner_name into description (if not already there)
    if (map.desc_note) {
      const desc = String(newRow.description || '').trim()
      if (!desc.includes(map.desc_note)) {
        newRow.description = desc ? desc + '; ' + map.desc_note : map.desc_note
      }
    }

    // Strip leading partner segment from name
    const variants = [orig, map.canonical, map.short].filter(Boolean)
    // Also handle the embedded-URL/note variants by stripping the bare brand head
    if (map.extracted_url) variants.push(orig.replace(map.extracted_url, '').trim())
    const beforeName = newRow.name
    newRow.name = stripLeadingPartnerFromName(newRow.name, variants)
    if (beforeName !== newRow.name) namesStripped++
    if (!newRow.name) {
      nameEmpty++
      emptyNameRows.push(newRow.product_number)
    }

    return newRow
  })

  // Reorder columns: insert partner_short after partner_name
  const originalCols = Object.keys(rows[0])
  const finalRows = out.map(r => reorderColumns(r, originalCols))

  // Write
  const wbo = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(finalRows)
  const cols = Object.keys(finalRows[0])
  ws['!cols'] = cols.map(c => {
    if (c === 'description' || c === 'why_recommendation' || c === 'head_doctor_profile' || c === 'name' || c === 'notes') return { wch: 50 }
    if (c === 'partner_name') return { wch: 36 }
    if (c === 'partner_short') return { wch: 20 }
    if (c === 'location_address' || c === 'contact_phone' || c === 'contact_email' || c === 'info_url') return { wch: 28 }
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
  console.log('partner_name canonicalized:', partnersChanged)
  console.log('name leading-partner stripped:', namesStripped)
  console.log('rows with empty name (manual variant needed):', nameEmpty, emptyNameRows.length ? emptyNameRows : '')
  if (unknownPartners.size) console.log('UNKNOWN partners (no map entry):', [...unknownPartners])
}

main()
