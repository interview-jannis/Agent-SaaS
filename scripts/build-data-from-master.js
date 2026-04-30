/* eslint-disable */
// Build TWO output files from the master Internal_Price sheet:
//   data/products_generated.xlsx   ← admin-only products (real partner data)
//   data/selections_generated.xlsx ← customer/agent-facing menu (anonymized)
//
// Outputs go to *_generated.xlsx so the user's hand-edited products_master.xlsx is never touched.
// All Korean text is translated to English (best-effort patterns + manual phrasebook).
//
// Usage:  node scripts/build-data-from-master.js

const path = require('path')
const XLSX = require('xlsx')

const USD_RATE = 1480
const MIN_KRW = 1_000_000
const SRC = path.join(__dirname, '..', 'data', 'Internal_Price sheet for Proposal_draft_2_v7_26.02.24.xlsx')
const OUT_PRODUCTS = path.join(__dirname, '..', 'data', 'products_generated.xlsx')
const OUT_SELECTIONS = path.join(__dirname, '..', 'data', 'selections_generated.xlsx')

// ────────────────────────────────────────────────────────────────────────────────
// Translation phrasebook (Korean → English). Patterns first (longer first to avoid
// partial overlaps), then word-level. Not a perfect translator — covers the
// recurring strings we actually see in this dataset.
// ────────────────────────────────────────────────────────────────────────────────

const KO_PHRASES = [
  // Hotel layout phrases
  ['룸구성', 'Layout'],
  ['기준 인원', 'Standard occupancy'],
  ['최대 인원', 'Max occupancy'],
  ['전망욕실', 'view bathroom'],
  ['1인당 추가 금액', 'Additional per person'],
  ['조식 포함', 'Breakfast included'],
  ['전화 예약만 가능', 'Phone reservation only'],
  ['세금 별도', 'tax not included'],
  ['투숙 인원', 'Occupancy'],
  ['8시간 초과 시', 'After 8 hours'],
  ['8시간 기준', '8-hour base'],
  ['10시간 기준', '10-hour base'],
  ['시간 당', 'per hour'],
  ['시트수', 'Seats'],

  // Single-word Korean
  ['침실', 'bedroom'],
  ['욕실', 'bathroom'],
  ['화장실', 'toilet'],
  ['응접실', 'living room'],
  ['사우나', 'sauna'],
  ['다이닝룸', 'dining room'],
  ['집무실', 'office'],
  ['주방', 'kitchen'],
  ['옷방', 'walk-in closet'],
  ['다용도실', 'utility room'],
  ['가족룸', 'family room'],
  ['면적', 'Area'],
  ['전망', 'View'],
  ['시티', 'City'],
  ['리버', 'River'],
  ['리버뷰', 'River view'],
  ['온돌', 'Ondol (Korean floor heating)'],
  ['성인', 'adults'],
  ['소인', 'children'],
  ['동반', 'with'],
  ['또는', 'or'],
  ['추가', 'additional'],
  ['추가 금액', 'additional fee'],
  ['최대', 'Max'],
  ['최소', 'Min'],
  ['동반 시', 'with'],
  ['스프린터', 'Sprinter'],
  ['메리트', 'Merit'],
  ['그랜드', 'Grand'],
  ['세단', 'Sedan'],
  ['프리미엄 SUV', 'Premium SUV'],
  ['럭셔리 세단', 'Luxury Sedan'],
  ['다인승 리무진', 'Multi-passenger Limousine'],
  ['벤츠 스프린터', 'Mercedes-Benz Sprinter'],
  ['벤츠', 'Mercedes-Benz'],
  ['리무진 버스', 'Limousine Bus'],
  ['리무진', 'Limousine'],
  ['최신형', '(latest)'],
  ['신형', '(latest)'],
  ['롱휠', 'long wheelbase'],
  ['최고급형', 'top-tier'],
  ['크리스탈', 'Crystal'],
  ['비즈니스', 'Business'],
  ['1박', '1 night'],
  ['1인', '1 person'],
  ['2인', '2 persons'],
  ['3인', '3 persons'],
  ['4인', '4 persons'],
  ['5인', '5 persons'],
  ['6인', '6 persons'],
  ['8인', '8 persons'],
  ['9인', '9 persons'],
  ['14인', '14 persons'],
  ['11인', '11 persons'],
  ['12인', '12 persons'],
  ['20인', '20 persons'],
  ['28인', '28 persons'],
  ['45인', '45 persons'],
  ['9인승', '9-seat'],
  ['11인승', '11-seat'],
  ['12인승', '12-seat'],
  ['20인승', '20-seat'],
  ['28인승', '28-seat'],
  ['45인승', '45-seat'],
  ['기준', 'base'],
  ['이용 가능 고객', 'Eligible customers'],
  ['외국인', 'Foreigners'],
  ['바이어 등', 'buyers, etc.'],
  ['국가 및 지방자치단체', 'government / local authorities'],
  ['일반 및 주 법인사업자', 'general and corporate businesses'],
  ['법인사업자', 'corporate businesses'],
  ['기타', 'others'],
  ['차량', 'vehicle'],
  ['기사님', 'driver'],
  ['유류', 'fuel'],
  ['톨비', 'toll'],
  ['식사', 'meals'],
  ['숙박', 'accommodation'],
  // Vehicle partner names
  ['그랜드리무진코리아', 'Grand Limousine Korea'],
  ['메리트리무진', 'Merit Limousine'],
  ['세계최초 할랄인증 리무진으로 제공하는 무슬림 전용 라이딩 서비스', 'A Muslim-exclusive ride service using the world\'s first halal-certified limousine'],
  ['차량 내 무슬림을 위한 기도 공간', 'in-vehicle prayer space for Muslims'],
  ['별도 상담', 'Consultation required'],

  // K-Education / K-Starcation Korean blocks (manual translations of the strings we actually see)
  ['최소 인원', 'Min participants'],
  ['최대 인원', 'Max participants'],
  ['그룹 K-POP 베이직 트레이닝 (보컬 & 댄스 기초)', 'Group K-POP basic training (vocal & dance fundamentals)'],
  ['소수정예 K-POP 심화 트레이닝 (보컬, 댄스, 무대 퍼포먼스)', 'Small-group intensive K-POP training (vocal, dance, stage performance)'],
  ['1:1 마스터 트레이닝 (전담 보컬/댄스 디렉팅)', '1:1 master training (dedicated vocal & dance directing)'],
  ['K-POP 아이돌 헤어 & 메이크업 스타일링', 'K-POP idol hair & makeup styling'],
  ['프리미엄 아이돌 스타일링', 'Premium idol styling'],
  ['VVIP 전담 스타일링 및 맞춤형 무대', 'VVIP dedicated styling and tailored stage'],
  ['프리미엄 스튜디오 프로필 촬영', 'Premium studio profile shoot'],
  ['개인 콘셉트 화보 촬영', 'Personal concept photo shoot'],
  ['전문 스튜디오 음원 녹음', 'Professional studio recording'],
  ['단독 음원 제작 및 녹음', 'Solo track production and recording'],
  ['하이라이트 뮤직비디오(MV) 촬영', 'Highlight music video (MV) shoot'],
  ['스케일업 단독 풀버전 뮤직비디오(MV) 촬영', 'Full-length scale-up solo music video (MV) shoot'],
  ['공식 수료증 발급', 'Official completion certificate'],
  ['숏폼(Reels/Shorts) 챌린지 영상 제작', 'Short-form (Reels/Shorts) challenge video production'],
  ['쇼케이스', 'Showcase'],
  ['전담 의전 및 VIP 케어', 'Dedicated VIP care and protocol'],
  ['기도', 'prayer'],
  ['무대 의상 피팅 요청 시 추가 진행 가능', 'Stage outfit fitting available on request'],

  // Misc K-Beauty Korean
  ['울쎄라피프라임', 'Ultherapy Prime'],
  ['써마지FLX', 'Thermage FLX'],
  ['프리미엄 스킨수티컬즈 항산화 관리', 'Premium SkinCeuticals antioxidant care'],
  ['풀페이스 리쥬란힐러', 'Full-face Rejuran Healer'],
  ['아이리쥬란', 'Eye Rejuran'],
  ['아이써마지', 'Eye Thermage'],
  ['항산화 스킨수티컬즈 관리', 'SkinCeuticals antioxidant care'],
  ['풀페이스 리쥬란', 'Full-face Rejuran'],
  ['바디써마지 FLX', 'Body Thermage FLX'],
  ['바디써마지', 'Body Thermage'],
  ['바디 스컬트라', 'Body Sculptra'],
  ['프리미엄 메디컬 케어', 'Premium medical care'],
  ['바디슬리밍 브이올렛', 'Body slimming Violet'],
  ['손등주름 래디어스', 'Hand wrinkle Radius'],
  ['총 2부위까지 선택 가능', 'up to 2 areas'],
  ['총 5부위까지 선택 가능', 'up to 5 areas'],
  ['Antiaging+Collagen Volumizing', 'Antiaging + Collagen Volumizing'],
  ['Slimming, Antiaging', 'Slimming + Antiaging'],
  ['Slimming, Total Antiaging', 'Slimming + Total Antiaging'],
  ['샷', 'shots'],

  // K-Starcation tier labels
  ['(2박 3일 K-POP 캠프)', '(2N3D K-POP camp)'],
  ['(4박 5일 프로 클래스)', '(4N5D pro class)'],
  ['(4박 5일 VVIP Class)', '(4N5D VVIP class)'],
]

const KO_PARTNER = [
  ['락고재 서울 본관', 'Rakkojae Seoul Main'],
  ['별채(독채)', 'Detached annex'],
  ['북촌빈관 by 락고재', 'Bukchon Bingwan by Rakkojae'],
  ['사랑방', 'Sarangbang'],
  ['디아르', 'DIAR'],
]

function translateKo(raw) {
  if (!raw) return ''
  let s = String(raw)
  // Apply phrasebook longest-first so multi-word phrases beat single-word substrings
  // (e.g. "동반 시" must translate before "동반" alone).
  const sortedPhrases = [...KO_PHRASES, ...KO_PARTNER].sort((a, b) => b[0].length - a[0].length)
  for (const [k, v] of sortedPhrases) s = s.split(k).join(v)
  // Final cleanup: drop any remaining Korean fragments (mostly hashtag-style tags
  // in the source data we don't have explicit translations for). Keep ASCII intact.
  s = s.replace(/#[가-힣A-Za-z0-9·\s]*[가-힣][가-힣A-Za-z0-9·\s]*/g, ' ')   // strip Korean-bearing hashtags
  s = s.replace(/[가-힣]+/g, ' ')                                              // any leftover Korean chars
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/\s+([,.;:])/g, '$1')                                           // tighten orphan punctuation
  s = s.replace(/\(\s*\)/g, '')                                                 // empty parens
  return s
}

// ── Generic helpers ───────────────────────────────────────────────────────────

function clean(s) { return String(s ?? '').trim() }
function flat(s) { return String(s ?? '').replace(/\s+/g, ' ').trim() }

function cleanDescription(raw) {
  if (!raw) return ''
  const text = translateKo(String(raw).replace(/\r\n/g, '\n').replace(/ /g, ' '))
  const parts = text.split(/\n+/).map(line => {
    return line
      .replace(/^[\s*•❖▪◆●◦∙·\-–—]+/, '')
      .replace(/[\s]+/g, ' ')
      .trim()
  }).filter(Boolean)
  const out = []
  for (const p of parts) if (out[out.length - 1] !== p) out.push(p)
  return out.join('; ')
}

// info_url is sometimes filled with descriptive text instead of an actual URL
// (e.g. Asan rows). Detect a real URL — anything else is description content.
function isUrl(s) {
  return /^https?:\/\//i.test(String(s ?? '').trim())
}

function parsePartner(raw) {
  const lines = String(raw ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const namesParts = []
  const phones = []
  let email = ''
  let address = ''
  const isEmail = (l) => /@/.test(l)
  const isPhone = (l) => /^[\+\d][\d\-\.\s\)\(]{5,}$/.test(l) || /^\d{2,4}[-\.\s]\d{3,4}[-\.\s]\d{3,4}/.test(l) || /^\d{4,}$/.test(l)
  const isAddress = (l) => /(Seoul|Busan|Incheon|Daegu|Gwangju|Daejeon|Ulsan|Sejong|Gyeonggi|Jeju|Gangwon|Chungcheong|Jeolla|Gyeongsang)[\s\-]/i.test(l)
    || /(\-gu|\-do|\-si|\-dong)\b/i.test(l)
    || /(서울|부산|인천|대구|광주|대전|울산|세종|경기|제주|강원)/.test(l)
  for (const line of lines) {
    if (isEmail(line)) { email = line; continue }
    if (isPhone(line)) { phones.push(line); continue }
    if (isAddress(line)) { address = translateKo(line); continue }
    namesParts.push(line)
  }
  return {
    name: translateKo(namesParts.join(' ').replace(/\s+/g, ' ').trim()),
    phone: phones.join(' / '),
    email,
    address,
  }
}

function extractNumbers(txt) {
  return (txt.match(/[\d,]+(?:\.\d+)?/g) ?? [])
    .map(s => Number(s.replace(/,/g, '')))
    .filter(n => !isNaN(n) && n > 0)
}

function priceFloor(currency, scale) {
  if (currency === 'USD') return 100
  return scale === 1000 ? 100 : 100000
}

function stripUnitNumbers(txt) {
  return String(txt)
    .replace(/\d+(?:[\.,]\d+)?\s*(?:박|일|인|시간|분|개|회|호|명|그룹|팀|셋트|셋|팩|P|T|h|m|min|hr|hour|day|night|group|grp|pax|person|people|ea|set|team)\b/gi, ' ')
}

function parsePrice(krwCell, usdCell, opts = {}) {
  const krwUnit = opts.krwUnit ?? 'thousands'
  const krwScale = krwUnit === 'raw' ? 1 : 1000
  const got = {}
  if (krwCell !== '' && krwCell != null) parseInto(krwCell, 'KRW', krwScale, got)
  if (Object.keys(got).length === 0 && usdCell !== '' && usdCell != null) parseInto(usdCell, 'USD', 1, got)
  return Object.keys(got).length > 0 ? got : null
}

function parseInto(cell, currency, scale, out) {
  if (typeof cell === 'number') {
    if (!isFinite(cell) || cell <= 0) return
    if (cell < priceFloor(currency, scale)) return
    out.ANY = { price: Math.round(cell * scale), currency, min: Math.round(cell * scale), max: Math.round(cell * scale) }
    return
  }
  const raw = String(cell).replace(/ /g, ' ').trim()
  if (!raw || /^[-—–]+$/.test(raw) || /별도\s*상담/.test(raw) || /^free$/i.test(raw)) return
  const mfMatch = raw.match(/M\s*:\s*([\d,\.\s\/~∼\-]+)[^\d]*F\s*:\s*([\d,\.\s\/~∼\-]+)/)
  if (mfMatch) {
    const m = extractNumbers(stripUnitNumbers(mfMatch[1])).filter(n => n >= priceFloor(currency, scale))
    const f = extractNumbers(stripUnitNumbers(mfMatch[2])).filter(n => n >= priceFloor(currency, scale))
    if (m.length) out.M = mkPrice(m, currency, scale)
    if (f.length) out.F = mkPrice(f, currency, scale)
    return
  }
  const firstLine = raw.split(/\r?\n/)[0]
  const nums = extractNumbers(stripUnitNumbers(firstLine)).filter(n => n >= priceFloor(currency, scale))
  if (nums.length) out.ANY = mkPrice(nums, currency, scale)
}

function mkPrice(nums, currency, scale) {
  const max = Math.max(...nums)
  const min = Math.min(...nums)
  return {
    price: Math.round(max * scale),
    currency,
    min: Math.round(min * scale),
    max: Math.round(max * scale),
  }
}

function toKrw(entry) {
  if (!entry) return 0
  return entry.currency === 'USD' ? entry.price * USD_RATE : entry.price
}

function parseDuration(raw) {
  const s = clean(raw).toLowerCase()
  if (!s) return { value: '', unit: '' }
  let m
  if ((m = s.match(/(\d+)\s*(?:day|일|d)\b/))) return { value: Number(m[1]), unit: 'days' }
  if ((m = s.match(/(\d+)\s*(?:hour|hr|h)\b/))) return { value: Number(m[1]), unit: 'hours' }
  if ((m = s.match(/(\d+)\s*(?:m(?:in)?)\b/))) return { value: Number(m[1]), unit: 'minutes' }
  if ((m = s.match(/^(\d+)$/))) return { value: Number(m[1]), unit: 'minutes' }
  return { value: '', unit: '' }
}

function rowsOf(wb, sheet) {
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' })
}

function isHeaderOrDecorRow(row) {
  const a = clean(row[0])
  if (!a && row.every(c => clean(c) === '')) return true
  if (/^Premium/i.test(a) || a === 'Package' || /^K-Wellness Package/i.test(a) || /Selection Sheet for Schedule/i.test(a)) return true
  if (a === '') return row.slice(1).every(c => clean(c) === '' || /^Information$/.test(clean(c)) || /^1,?000 KRW$/i.test(clean(c)) || /^USD$/i.test(clean(c)))
  return false
}

function parseCarryDown(rows, partnerCol) {
  let lastPartner = ''
  const out = []
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const partner = clean(row[partnerCol])
    if (partner) lastPartner = partner
    if (!lastPartner) continue
    out.push({ row, partner: lastPartner })
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────────
// SELECTIONS — customer-facing menu items, parsed from the Selection sheets
// ────────────────────────────────────────────────────────────────────────────────

const selections = []
let selNum = 0
function pushSelection(s) {
  selNum += 1
  selections.push({
    selection_number: '#S-' + String(selNum).padStart(3, '0'),
    category: s.category,
    subcategory: flat(s.subcategory ?? ''),
    tier: flat(s.tier ?? ''),
    name: flat(s.name),
    description: cleanDescription(s.description ?? ''),
    duration_value: s.duration_value ?? '',
    duration_unit: s.duration_unit ?? '',
    est_price_min: s.est_price_min ?? '',
    est_price_max: s.est_price_max ?? '',
    est_price_currency: s.est_price_currency ?? 'USD',
    notes: s.notes ?? '',
    // Keys used later for product↔selection auto-mapping. Not exported.
    _matchKey: s._matchKey,
  })
}

// (1) Selection_K-Medical → Medical Selections (Silver/Gold/Diamond)
function parseMedicalSelections(wb) {
  const rows = rowsOf(wb, '(1) Selection_K-Medical')
  let lastPackage = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const pkg = clean(row[0])
    if (pkg) lastPackage = pkg
    if (lastPackage !== 'K-Medical') continue
    const tier = clean(row[1]).split(/\r?\n/)[0].trim()  // "Diamond \n(Premium)" → "Diamond"
    if (!tier) continue
    const detail = clean(row[2])
    const duration = parseDuration(row[3])
    const priceCell = row[4]
    const priceTxt = String(priceCell)
    const nums = extractNumbers(stripUnitNumbers(priceTxt))
    const min = nums.length ? Math.min(...nums) : ''
    const max = nums.length ? Math.max(...nums) : ''
    pushSelection({
      category: 'Medical',
      subcategory: 'Premium Check-up',
      tier,
      name: `Premium Check-up · ${tier}`,
      description: detail,
      duration_value: duration.value,
      duration_unit: duration.unit,
      est_price_min: min,
      est_price_max: max,
      est_price_currency: 'USD',
      _matchKey: { sheet: '1. K-Medical', tier: tier.toLowerCase() },
    })
  }
}

// (2) Selection_K-Beauty_Medical → Beauty Selections.
// The source uses "A Clinic / B Clinic / C Clinic" labels which we drop entirely;
// each row becomes a descriptive program name (no partner reference).
function parseBeautyMedicalSelections(wb) {
  const rows = rowsOf(wb, '(2) Selection_K-Beauty_Medical')
  let lastPackage = ''
  let lastClinic = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const pkg = clean(row[0])
    if (pkg) lastPackage = pkg
    if (!/K-Beauty/i.test(lastPackage)) continue
    const clinic = clean(row[1])
    if (clinic) lastClinic = clinic
    const program = clean(row[2])
    if (!program) continue
    const detail = clean(row[3])
    const duration = parseDuration(row[4])
    const priceTxt = String(row[5])
    const nums = extractNumbers(stripUnitNumbers(priceTxt))
    if (nums.length === 0) continue   // skip info/header rows that have no price
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    pushSelection({
      category: 'Beauty',
      subcategory: 'Premium K-Beauty Program',
      tier: '',
      name: program,
      description: detail,
      duration_value: duration.value,
      duration_unit: duration.unit,
      est_price_min: min,
      est_price_max: max,
      est_price_currency: 'USD',
      _matchKey: { sheet: '2. K-Beauty', medical: true, program: program.toLowerCase() },
    })
  }
}

// (3) Selection_K-Beauty_NonMedi → Wellness Selections (spa, henna, scalp, etc.)
function parseWellnessSelections(wb) {
  const rows = rowsOf(wb, '(3) Selection_K-Beauty_NonMedi')
  let lastPackage = ''
  let lastSubcategory = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const pkg = clean(row[0])
    if (pkg) lastPackage = pkg
    if (!/K-Beauty/i.test(lastPackage)) continue
    const sub = clean(row[1])
    if (sub) lastSubcategory = sub
    const tierOrItem = clean(row[2])
    const detail = clean(row[3])
    const duration = parseDuration(row[4])
    const priceTxt = String(row[5])
    if (!tierOrItem && !detail) continue
    const nums = extractNumbers(stripUnitNumbers(priceTxt))
    if (nums.length === 0) continue
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    // Detect tiered (Silver/Gold/Diamond) vs single-item (Henna at Seoul, etc.)
    const isTier = /^(Silver|Gold|Diamond)$/i.test(tierOrItem)
    pushSelection({
      category: 'Wellness',
      subcategory: lastSubcategory,
      tier: isTier ? tierOrItem : '',
      name: isTier ? `${lastSubcategory} · ${tierOrItem}` : (tierOrItem || lastSubcategory),
      description: detail,
      duration_value: duration.value,
      duration_unit: duration.unit,
      est_price_min: min,
      est_price_max: max,
      est_price_currency: 'USD',
      _matchKey: { sheet: '2. K-Beauty', medical: false, sub: lastSubcategory.toLowerCase(), tier: tierOrItem.toLowerCase() },
    })
  }
}

// (4-2) Selection_K-Wellness_SCH → K-Education Selections (≥1M KRW only).
// SCH = school trip. Mostly Education content; we keep what passes the price filter.
function parseEducationSelections(wb) {
  const rows = rowsOf(wb, '(4-2) Selection_K-Wellness_SCH')
  let lastPackage = ''
  let lastTopCat = ''
  let lastSubCat = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const pkg = clean(row[0])
    if (pkg) lastPackage = pkg
    if (!/K-Wellness/i.test(lastPackage)) continue
    const topCat = clean(row[1])
    if (topCat) { lastTopCat = topCat; lastSubCat = '' }
    const subCat = clean(row[2])
    if (subCat) lastSubCat = subCat
    const item = clean(row[3])
    const detail = clean(row[4])
    const duration = parseDuration(row[5])
    const priceTxt = String(row[6])
    if (!item && !detail) continue
    const nums = extractNumbers(stripUnitNumbers(priceTxt))
    if (nums.length === 0) continue
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    if (max * USD_RATE < MIN_KRW) continue   // VIP threshold
    const labelParts = [lastTopCat, lastSubCat, item].filter(Boolean)
    pushSelection({
      category: 'K-Education',
      subcategory: lastTopCat,
      tier: lastSubCat || '',
      name: labelParts.join(' · '),
      description: detail,
      duration_value: duration.value,
      duration_unit: duration.unit,
      est_price_min: min,
      est_price_max: max,
      est_price_currency: 'USD',
      _matchKey: { sheet: '3-5. K-Wellness_Education', label: item.toLowerCase() },
    })
  }
}

// (5) Selection_SubPackaging → Subpackage Selections (Hotel + Vehicle).
function parseSubpackageSelections(wb) {
  const rows = rowsOf(wb, '(5) Selection_SubPackaging')
  let lastPackage = ''     // "Luxury Hotel" / "Private Vehicle"
  let lastSubCat = ''      // "★5 Hotel" / "Hanok" / "Luxury Sedan" / etc.
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const pkg = clean(row[0])
    if (pkg) { lastPackage = pkg; lastSubCat = '' }
    const sub = clean(row[1])
    if (sub) lastSubCat = sub
    const tier = clean(row[2])
    const detail = clean(row[3])
    const priceTxt = String(row[4])
    if (!tier && !detail) continue
    const nums = extractNumbers(stripUnitNumbers(priceTxt))
    if (nums.length === 0) continue
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    const isHotel = /Hotel|Hanok/i.test(lastPackage) || /Hotel|Hanok/i.test(lastSubCat)
    pushSelection({
      category: 'Subpackage',
      subcategory: `${lastPackage}${lastSubCat ? ' · ' + lastSubCat : ''}`,
      tier,
      name: `${lastSubCat || lastPackage}${tier ? ' · ' + tier : ''}`,
      description: detail,
      duration_value: isHotel ? 1 : 8,
      duration_unit: isHotel ? 'days' : 'hours',
      est_price_min: min,
      est_price_max: max,
      est_price_currency: 'USD',
      _matchKey: isHotel
        ? { sheet: '5. Hotel', tier: tier.toLowerCase(), category: lastSubCat.toLowerCase() }
        : { sheet: '6. Vehicle', vCategory: (lastSubCat || tier).toLowerCase() },
    })
  }
}

// K-Starcation has no Selection sheet — synthesize one set per tier from the Internal sheet.
function parseStarcationSelections(wb) {
  const rows = rowsOf(wb, '4. K-Starcation')
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const program = clean(row[2])
    const tierLabel = clean(row[3]).split(/\r?\n/)[0]   // "Basic\n(2박 3일 K-POP 캠프)" → "Basic"
    if (!tierLabel) continue
    const krwCell = row[4]
    const usdCell = row[5]
    const dur = parseDuration(row[6])
    const desc = clean(row[7])
    const price = parsePrice(krwCell, usdCell, { krwUnit: 'thousands' })
    if (!price || !price.ANY) continue
    const krwPrice = toKrw(price.ANY)
    if (krwPrice < MIN_KRW) continue
    pushSelection({
      category: 'K-Starcation',
      subcategory: program || 'K-POP CAMP',
      tier: tierLabel,
      name: `${program || 'K-POP CAMP'} · ${tierLabel}`,
      description: desc,
      duration_value: dur.value,
      duration_unit: dur.unit,
      est_price_min: Math.round(krwPrice / USD_RATE),
      est_price_max: Math.round(krwPrice / USD_RATE),
      est_price_currency: 'USD',
      _matchKey: { sheet: '4. K-Starcation', tier: tierLabel.toLowerCase() },
    })
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// PRODUCTS — admin-only, real partner data
// ────────────────────────────────────────────────────────────────────────────────

const products = []
let pNum = 0
function pushProduct(p) {
  pNum += 1
  // Move misplaced info_url text to description if it's not a real URL
  let infoUrl = clean(p.info_url ?? '')
  let description = p.description ?? ''
  if (infoUrl && !isUrl(infoUrl)) {
    description = (description ? description + '\n' : '') + infoUrl
    infoUrl = ''
  }
  products.push({
    product_number: '#P-' + String(pNum).padStart(3, '0'),
    category: p.category,
    selection_number: p._selection_number ?? '',
    partner_name: flat(p.partner_name),
    name: flat(p.name),
    grade: flat(p.grade),
    gender: p.gender ?? 'Both',
    base_price: p.base_price,
    price_currency: p.price_currency,
    price_min: p.price_min ?? '',
    price_max: p.price_max ?? '',
    duration_value: p.duration_value ?? '',
    duration_unit: p.duration_unit ?? '',
    description: cleanDescription(description),
    location_address: p.location_address ?? '',
    contact_phone: p.contact_phone ?? '',
    contact_email: p.contact_email ?? '',
    info_url: infoUrl,
    has_female_doctor: '',
    has_prayer_room: '',
    dietary_type: 'none',
    is_active: 'TRUE',
    notes: p.notes ?? '',
  })
}

function pushIfBig(p, priceEntry) {
  if (!priceEntry || toKrw(priceEntry) < MIN_KRW) return
  pushProduct(p)
}

// Auto-mapping: assign p._selection_number based on the same _matchKey shape used
// when creating selections. Returns a function used by parsers.
function buildMatcher() {
  // Index selections by sheet
  const bySheet = {}
  for (const s of selections) {
    const k = s._matchKey
    if (!k) continue
    bySheet[k.sheet] ||= []
    bySheet[k.sheet].push(s)
  }
  return function findSelection(sheet, key) {
    const candidates = bySheet[sheet] ?? []
    for (const s of candidates) {
      const sk = s._matchKey
      if (!sk) continue
      // Compare relevant attributes
      let ok = true
      for (const f of Object.keys(key)) {
        if ((sk[f] ?? '').toString().toLowerCase().trim() !== (key[f] ?? '').toString().toLowerCase().trim()) { ok = false; break }
      }
      if (ok) return s.selection_number
    }
    return ''
  }
}

let findSelection = () => ''

// 1. K-Medical → Medical
function parseMedicalProducts(wb) {
  const rows = rowsOf(wb, '1. K-Medical')
  const items = parseCarryDown(rows, 1)
  for (const { row, partner } of items) {
    const grade = clean(row[2])
    const tier = clean(row[3]).split(/\r?\n/)[0]
    if (!grade && !tier) continue
    const dur = parseDuration(row[6])
    const desc = clean(row[7])
    const url = clean(row[8])
    const partnerInfo = parsePartner(partner)
    const price = parsePrice(row[4], row[5], { krwUnit: 'thousands' })
    if (!price) continue
    const baseName = `Premium Check-up · ${grade}${tier ? ` (${tier} tier)` : ''}`
    const sel = findSelection('1. K-Medical', { tier: tier.toLowerCase() })
    const common = () => ({
      category: 'Medical',
      partner_name: partnerInfo.name,
      grade,
      duration_value: dur.value,
      duration_unit: dur.unit,
      description: desc,
      location_address: partnerInfo.address,
      contact_phone: partnerInfo.phone,
      contact_email: partnerInfo.email,
      info_url: url,
      _selection_number: sel,
    })
    if (price.M && price.F) {
      pushIfBig(makeRow(common(), `${baseName} · Male`, 'Male', price.M), price.M)
      pushIfBig(makeRow(common(), `${baseName} · Female`, 'Female', price.F), price.F)
    } else if (price.M) {
      pushIfBig(makeRow(common(), `${baseName} · Male`, 'Male', price.M), price.M)
    } else if (price.F) {
      pushIfBig(makeRow(common(), `${baseName} · Female`, 'Female', price.F), price.F)
    } else if (price.ANY) {
      pushIfBig(makeRow(common(), baseName, 'Both', price.ANY), price.ANY)
    }
  }
}

function makeRow(base, name, gender, entry) {
  return {
    ...base,
    name,
    gender,
    base_price: entry.price,
    price_currency: entry.currency,
    price_min: entry.min !== entry.max ? entry.min : '',
    price_max: entry.min !== entry.max ? entry.max : '',
  }
}

// 2. K-Beauty → Beauty (Medical) / Wellness (Non-Medical)
function parseBeautyProducts(wb) {
  const rows = rowsOf(wb, '2. K-Beauty')
  let currentCategory = null
  let lastPartner = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const a = clean(row[0])
    if (a) {
      if (/non-?medical/i.test(a)) currentCategory = 'Wellness'
      else if (/medical/i.test(a)) currentCategory = 'Beauty'
    }
    const partner = clean(row[1])
    if (partner) lastPartner = partner
    if (!lastPartner || !currentCategory) continue
    const program = clean(row[2])
    const subName = clean(row[3])
    const tier = clean(row[4])
    const dur = parseDuration(row[7])
    const desc = clean(row[8])
    if (!program && !subName && !tier && row[5] === '' && row[6] === '') continue
    const partnerInfo = parsePartner(lastPartner)
    const price = parsePrice(row[5], row[6], { krwUnit: 'thousands' })
    if (!price) continue
    const entry = price.ANY ?? price.M ?? price.F
    // Build descriptive name (no partner reference)
    const nameParts = []
    if (program) nameParts.push(program)
    if (subName) nameParts.push(subName)
    if (tier && !nameParts.some(p => new RegExp(tier, 'i').test(p))) nameParts.push(tier)
    let name = nameParts.join(' · ')
    if (!name) name = `${currentCategory} program`
    if (dur.value && dur.unit) name += ` · ${dur.value}${dur.unit === 'minutes' ? 'min' : (dur.unit === 'hours' ? 'h' : 'd')}`

    let sel = ''
    if (currentCategory === 'Beauty') {
      sel = findSelection('2. K-Beauty', { medical: true, program: subName.toLowerCase() })
        || findSelection('2. K-Beauty', { medical: true, program: program.toLowerCase() })
    } else {
      // Wellness: try to match by sub+tier or sub alone. Strip parens like "Diamond (Premium)" → "Diamond".
      const sub = (program || subName).toLowerCase()
      const tierNorm = tier.replace(/\s*\([^)]*\)/g, '').toLowerCase().trim()
      sel = findSelection('2. K-Beauty', { medical: false, sub, tier: tierNorm })
        || findSelection('2. K-Beauty', { medical: false, sub, tier: '' })
    }

    pushIfBig(makeRow({
      category: currentCategory,
      partner_name: partnerInfo.name,
      grade: tier || program,
      duration_value: dur.value,
      duration_unit: dur.unit,
      description: desc,
      location_address: partnerInfo.address,
      contact_phone: partnerInfo.phone,
      contact_email: partnerInfo.email,
      info_url: '',
      _selection_number: sel,
    }, name, 'Both', entry), entry)
  }
}

// 3-5. K-Wellness_Education → K-Education
function parseEducationProducts(wb) {
  const rows = rowsOf(wb, '3-5. K-Wellness_Education')
  let lastSub = ''
  let lastPartner = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const sub = clean(row[1])
    if (sub) lastSub = sub
    const partner = clean(row[2])
    if (partner) lastPartner = partner
    if (!lastPartner) continue
    const program = clean(row[3])
    const longDesc = clean(row[4])
    const dur = parseDuration(row[7])
    const detail = clean(row[8])
    const price = parsePrice(row[5], row[6], { krwUnit: 'thousands' })
    if (!price) continue
    const partnerInfo = parsePartner(lastPartner)
    const nameParts = []
    if (lastSub) nameParts.push(lastSub.replace(/\s+/g, ' '))
    if (program) nameParts.push(program)
    const description = [longDesc, detail].filter(Boolean).join('\n')
    const entry = price.ANY ?? price.M ?? price.F
    const sel = findSelection('3-5. K-Wellness_Education', { label: program.toLowerCase() })
    pushIfBig(makeRow({
      category: 'K-Education',
      partner_name: partnerInfo.name,
      grade: program,
      duration_value: dur.value,
      duration_unit: dur.unit,
      description,
      location_address: partnerInfo.address,
      contact_phone: partnerInfo.phone,
      contact_email: partnerInfo.email,
      info_url: '',
      _selection_number: sel,
    }, nameParts.join(' · '), 'Both', entry), entry)
  }
}

// 4. K-Starcation → K-Starcation
function parseStarcationProducts(wb) {
  const rows = rowsOf(wb, '4. K-Starcation')
  const items = parseCarryDown(rows, 1)
  for (const { row, partner } of items) {
    const program = clean(row[2])
    const subName = clean(row[3])
    const dur = parseDuration(row[6])
    const desc = clean(row[7])
    const price = parsePrice(row[4], row[5], { krwUnit: 'thousands' })
    if (!price) continue
    const partnerInfo = parsePartner(partner)
    const tier = subName.split(/\r?\n/)[0]
    const nameParts = []
    if (program) nameParts.push(program)
    if (tier) nameParts.push(tier)
    const entry = price.ANY ?? price.M ?? price.F
    const sel = findSelection('4. K-Starcation', { tier: tier.toLowerCase() })
    pushIfBig(makeRow({
      category: 'K-Starcation',
      partner_name: partnerInfo.name,
      grade: tier,
      duration_value: dur.value,
      duration_unit: dur.unit,
      description: desc,
      location_address: partnerInfo.address,
      contact_phone: partnerInfo.phone,
      contact_email: partnerInfo.email,
      info_url: '',
      _selection_number: sel,
    }, nameParts.join(' · '), 'Both', entry), entry)
  }
}

// 5. Hotel → Subpackage
function parseHotelProducts(wb) {
  const rows = rowsOf(wb, '5. Hotel')
  let lastCategory = ''
  let lastPartner = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const cat = clean(row[1])
    if (cat) lastCategory = cat
    const partner = clean(row[2])
    if (partner) lastPartner = partner
    if (!lastPartner) continue
    const tier = clean(row[3])
    const room = clean(row[4])
    const detail = clean(row[6])
    const url = clean(row[7])
    const price = parsePrice(row[5], '', { krwUnit: 'raw' })
    if (!price || !price.ANY) continue
    const partnerInfo = parsePartner(lastPartner)
    const sel = findSelection('5. Hotel', { tier: tier.toLowerCase(), category: lastCategory.toLowerCase() })
    pushIfBig(makeRow({
      category: 'Subpackage',
      partner_name: partnerInfo.name,
      grade: tier || lastCategory,
      duration_value: 1,
      duration_unit: 'days',
      description: detail,
      location_address: partnerInfo.address,
      contact_phone: partnerInfo.phone,
      contact_email: partnerInfo.email,
      info_url: url,
      _selection_number: sel,
      notes: 'Hotel rate range — base_price = peak (upper bound).',
    }, `${flat(room)}${tier ? ` (${tier})` : ''} [${lastCategory || 'Hotel'}]`, 'Both', price.ANY), price.ANY)
  }
}

// 6. Vehicle → Subpackage
function parseVehicleProducts(wb) {
  const rows = rowsOf(wb, '6. Vehicle')
  let lastPartner = ''
  for (const row of rows) {
    if (isHeaderOrDecorRow(row)) continue
    const partner = clean(row[1])
    if (partner) lastPartner = partner
    if (!lastPartner) continue
    const vCat = clean(row[2])
    const model = clean(row[3])
    const detail = clean(row[5])
    const detail2 = clean(row[6])
    const url = clean(row[7])
    const price = parsePrice(row[4], '', { krwUnit: 'raw' })
    if (!price || !price.ANY) continue
    const partnerInfo = parsePartner(lastPartner)
    const desc = [detail, detail2].filter(Boolean).join('\n')
    // Vehicle selection match — try mapping our category labels to selection labels loosely
    const vCatTrans = translateKo(vCat)
    const sel = findSelection('6. Vehicle', { vCategory: vCatTrans.toLowerCase() })
      || findSelection('6. Vehicle', { vCategory: vCat.toLowerCase() })
    pushIfBig(makeRow({
      category: 'Subpackage',
      partner_name: partnerInfo.name,
      grade: vCatTrans,
      duration_value: 8,
      duration_unit: 'hours',
      description: desc,
      location_address: partnerInfo.address,
      contact_phone: partnerInfo.phone,
      contact_email: partnerInfo.email,
      info_url: url,
      _selection_number: sel,
      notes: 'Per-charter rate (~8 hours).',
    }, `${flat(translateKo(model || vCat))} [Vehicle · 8h charter]`, 'Both', price.ANY), price.ANY)
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────────

function main() {
  const wb = XLSX.readFile(SRC)

  // Parse selections first so products can map to them
  parseMedicalSelections(wb)
  parseBeautyMedicalSelections(wb)
  parseWellnessSelections(wb)
  parseEducationSelections(wb)
  parseSubpackageSelections(wb)
  parseStarcationSelections(wb)

  findSelection = buildMatcher()

  parseMedicalProducts(wb)
  parseBeautyProducts(wb)
  parseEducationProducts(wb)
  parseStarcationProducts(wb)
  parseHotelProducts(wb)
  parseVehicleProducts(wb)

  // Strip private fields from selections before writing
  const selOut = selections.map(s => {
    const { _matchKey, ...rest } = s
    return rest
  })

  // Write selections
  {
    const wbo = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(selOut)
    ws['!cols'] = [
      { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 50 },
      { wch: 70 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
      { wch: 8 }, { wch: 40 },
    ]
    XLSX.utils.book_append_sheet(wbo, ws, 'Selections')
    const summary = {}
    for (const s of selOut) summary[s.category] = (summary[s.category] ?? 0) + 1
    const sumRows = Object.entries(summary).map(([category, count]) => ({ category, count }))
    sumRows.push({ category: 'TOTAL', count: selOut.length })
    XLSX.utils.book_append_sheet(wbo, XLSX.utils.json_to_sheet(sumRows), 'Summary')
    XLSX.writeFile(wbo, OUT_SELECTIONS)
    console.log(`Wrote ${OUT_SELECTIONS}`)
    console.log('  Selections by category:', summary, 'Total:', selOut.length)
  }

  // Write products
  {
    const wbo = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(products)
    ws['!cols'] = [
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 50 },
      { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 14 },
      { wch: 14 }, { wch: 6 }, { wch: 8 }, { wch: 70 }, { wch: 22 },
      { wch: 22 }, { wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 8 }, { wch: 50 },
    ]
    XLSX.utils.book_append_sheet(wbo, ws, 'Products')
    const summary = {}
    let mapped = 0, unmapped = 0
    for (const p of products) {
      summary[p.category] = (summary[p.category] ?? 0) + 1
      if (p.selection_number) mapped++; else unmapped++
    }
    const sumRows = Object.entries(summary).map(([category, count]) => ({ category, count }))
    sumRows.push({ category: 'TOTAL', count: products.length })
    sumRows.push({ category: 'mapped to selection', count: mapped })
    sumRows.push({ category: 'unmapped', count: unmapped })
    XLSX.utils.book_append_sheet(wbo, XLSX.utils.json_to_sheet(sumRows), 'Summary')
    XLSX.writeFile(wbo, OUT_PRODUCTS)
    console.log(`Wrote ${OUT_PRODUCTS}`)
    console.log('  Products by category:', summary, 'Total:', products.length, 'Mapped:', mapped, 'Unmapped:', unmapped)
  }
}

main()
