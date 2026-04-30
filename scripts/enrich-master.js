/* eslint-disable */
// Read the highest-versioned products_master_v*.xlsx and write the next version
// with the two new columns required by the 4/30 meeting:
//   - why_recommendation   (why this partner / product, e.g. "Korea's top university hospital")
//   - head_doctor_profile  (head doctor name + credentials, English-only public info)
//
// Existing rows + columns are preserved as-is. Only the two columns are added
// (empty values, ready for manual fill).
//
// Usage:  node scripts/enrich-master.js

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const DATA_DIR = path.join(__dirname, '..', 'data')

function findHighestVersion(prefix) {
  const re = new RegExp('^' + prefix + '_v(\\d+)\\.xlsx$')
  let best = { version: 0, file: null }
  for (const f of fs.readdirSync(DATA_DIR)) {
    const m = f.match(re)
    if (m && Number(m[1]) > best.version) best = { version: Number(m[1]), file: f }
  }
  return best
}

const NEW_COLS = ['why_recommendation', 'head_doctor_profile']
// Insert new columns right after `description` to keep related fields adjacent
const INSERT_AFTER = 'description'

function reorderColumns(row, originalCols) {
  const out = {}
  for (const col of originalCols) {
    out[col] = row[col] ?? ''
    if (col === INSERT_AFTER) {
      for (const nc of NEW_COLS) {
        if (!originalCols.includes(nc)) out[nc] = row[nc] ?? ''
      }
    }
  }
  // Append any trailing new cols if INSERT_AFTER wasn't found
  for (const nc of NEW_COLS) {
    if (!(nc in out)) out[nc] = row[nc] ?? ''
  }
  return out
}

function main() {
  const { version, file } = findHighestVersion('products_master')
  if (!file) {
    console.error('No products_master_v*.xlsx found in data/')
    process.exit(1)
  }
  const inPath = path.join(DATA_DIR, file)
  const outPath = path.join(DATA_DIR, `products_master_v${version + 1}.xlsx`)

  const wb = XLSX.readFile(inPath)
  const sheetName = wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
  if (rows.length === 0) {
    console.error('No rows found in', file)
    process.exit(1)
  }
  const originalCols = Object.keys(rows[0])

  // Decide if we actually need to add anything
  const missing = NEW_COLS.filter(c => !originalCols.includes(c))
  if (missing.length === 0) {
    console.log('No new columns to add. Skipping write.')
    return
  }

  const newRows = rows.map(r => reorderColumns(r, originalCols))

  // Build new workbook, preserving other sheets verbatim
  const wbo = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(newRows)
  // Approximate column widths (preserve hand-tuned ones loosely)
  const finalCols = Object.keys(newRows[0])
  ws['!cols'] = finalCols.map(c => {
    if (c === 'description' || c === 'why_recommendation' || c === 'head_doctor_profile' || c === 'name' || c === 'notes') return { wch: 50 }
    if (c === 'partner_name' || c === 'location_address' || c === 'contact_phone' || c === 'contact_email' || c === 'info_url') return { wch: 28 }
    return { wch: 14 }
  })
  XLSX.utils.book_append_sheet(wbo, ws, sheetName)

  // Copy any other sheets (Summary etc.) untouched
  for (const name of wb.SheetNames) {
    if (name === sheetName) continue
    XLSX.utils.book_append_sheet(wbo, wb.Sheets[name], name)
  }

  XLSX.writeFile(wbo, outPath)
  console.log('Read :', inPath)
  console.log('Wrote:', outPath)
  console.log('Added columns:', missing.join(', '))
  console.log('Rows:', newRows.length)
  console.log('Final column order:', finalCols.join(', '))
}

main()
