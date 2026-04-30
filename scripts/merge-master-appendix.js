/* eslint-disable */
// Merge highest products_appendix_generated_v*.xlsx into highest
// products_master_v*.xlsx, producing the next master version.
//
// Master columns + appendix columns are unioned. Existing master rows are
// untouched; appendix rows are appended with their original product_number
// (build-appendix already continues numbering from master max).
//
// Typical follow-up: run scripts/clean-master.js to strip residual Korean
// from the newly-added rows.
//
// Usage: node scripts/merge-master-appendix.js

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const DATA_DIR = path.join(__dirname, '..', 'data')

function findHighestVersion(prefix) {
  const re = new RegExp('^' + prefix + '_v(\\d+)\\.xlsx$')
  let best = { version: 0, file: null }
  for (const f of fs.readdirSync(DATA_DIR)) {
    const m = f.match(re); if (m && Number(m[1]) > best.version) best = { version: Number(m[1]), file: f }
  }
  return best
}

function main() {
  const master = findHighestVersion('products_master')
  const appendix = findHighestVersion('products_appendix_generated')
  if (!master.file) { console.error('No products_master_v*.xlsx'); process.exit(1) }
  if (!appendix.file) { console.error('No products_appendix_generated_v*.xlsx'); process.exit(1) }

  const masterPath = path.join(DATA_DIR, master.file)
  const appendixPath = path.join(DATA_DIR, appendix.file)
  const outPath = path.join(DATA_DIR, `products_master_v${master.version + 1}.xlsx`)

  const masterWb = XLSX.readFile(masterPath)
  const appendixWb = XLSX.readFile(appendixPath)
  const masterSheetName = masterWb.SheetNames[0]
  const masterRows = XLSX.utils.sheet_to_json(masterWb.Sheets[masterSheetName], { defval: '' })
  const appendixRows = XLSX.utils.sheet_to_json(appendixWb.Sheets[appendixWb.SheetNames[0]], { defval: '' })

  const masterCols = Object.keys(masterRows[0])
  const appendixCols = Object.keys(appendixRows[0])
  const onlyMaster = masterCols.filter(c => !appendixCols.includes(c))
  const onlyAppendix = appendixCols.filter(c => !masterCols.includes(c))

  // Union, preserving master ordering then appending new appendix-only columns
  const unionCols = [...masterCols]
  for (const c of onlyAppendix) {
    // Insert subcategory right after category for natural reading order
    if (c === 'subcategory') {
      const catIdx = unionCols.indexOf('category')
      unionCols.splice(catIdx + 1, 0, c)
    } else {
      unionCols.push(c)
    }
  }

  // Find next sort_order
  let maxSortOrder = 0
  for (const r of masterRows) {
    const n = Number(r.sort_order)
    if (!isNaN(n)) maxSortOrder = Math.max(maxSortOrder, n)
  }

  // Detect duplicate product_numbers (sanity)
  const masterPNs = new Set(masterRows.map(r => r.product_number))
  const dupes = appendixRows.filter(r => masterPNs.has(r.product_number)).map(r => r.product_number)
  if (dupes.length) {
    console.warn('⚠️  Duplicate product_numbers in appendix vs master:', dupes)
    console.warn('Aborting — fix appendix numbering first.')
    process.exit(1)
  }

  // Normalize each row to the union schema, defaulting missing fields to ''
  function normalize(row, sourceSheet, sortOrder) {
    const out = {}
    for (const c of unionCols) out[c] = row[c] ?? ''
    if (sourceSheet !== undefined && !out.source_sheet) out.source_sheet = sourceSheet
    if (sortOrder !== undefined && !out.sort_order) out.sort_order = sortOrder
    return out
  }

  const finalRows = [
    ...masterRows.map(r => normalize(r)),
    ...appendixRows.map((r, i) => normalize(r, '', maxSortOrder + 1 + i)),
  ]

  // Write
  const wbo = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(finalRows, { header: unionCols })
  ws['!cols'] = unionCols.map(c => {
    if (['description', 'why_recommendation', 'head_doctor_profile', 'name', 'notes'].includes(c)) return { wch: 50 }
    if (['partner_name', 'location_address', 'contact_phone', 'contact_email', 'info_url'].includes(c)) return { wch: 28 }
    if (c === 'partner_short') return { wch: 20 }
    if (c === 'subcategory') return { wch: 14 }
    return { wch: 14 }
  })
  XLSX.utils.book_append_sheet(wbo, ws, masterSheetName)

  // Preserve other sheets from master
  for (const name of masterWb.SheetNames) {
    if (name === masterSheetName) continue
    XLSX.utils.book_append_sheet(wbo, masterWb.Sheets[name], name)
  }

  XLSX.writeFile(wbo, outPath)

  console.log('Master   :', masterPath, `(${masterRows.length} rows, ${masterCols.length} cols)`)
  console.log('Appendix :', appendixPath, `(${appendixRows.length} rows, ${appendixCols.length} cols)`)
  console.log('Wrote    :', outPath)
  console.log('Total rows:', finalRows.length)
  console.log('Final cols:', unionCols.length, '→', unionCols.join(', '))
  if (onlyMaster.length) console.log('Master-only cols (filled empty for appendix rows):', onlyMaster)
  if (onlyAppendix.length) console.log('Appendix-only cols (filled empty for master rows):', onlyAppendix)
}

main()
