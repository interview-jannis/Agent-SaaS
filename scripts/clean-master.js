/* eslint-disable */
// Read highest products_master_v*.xlsx and produce next version with:
//   1. Korean text stripped from all text fields (extended phrasebook + fallback)
//   2. Name segment deduplication (e.g. "Package · Glow Package" → "Glow Package")
//
// All other columns / rows preserved as-is.
//
// Usage:  node scripts/clean-master.js

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const DATA_DIR = path.join(__dirname, '..', 'data')

// ─── Extended phrasebook (Korean → English) ─────────────────────────────────
// Order matters: longer phrases first within each section to prevent partial
// overlap matches. Sections are concatenated, then sorted by length desc.

const PHRASES = [
  // Beauty (시술 / Procedures)
  ['울쎄라피프라임', 'Ulthera Prime'],
  ['울쎄라피', 'Ultherapy'],
  ['써마지FLX', 'Thermage FLX'],
  ['써마지 FLX', 'Thermage FLX'],
  ['써마지', 'Thermage'],
  ['바디써마지FLX', 'Body Thermage FLX'],
  ['바디써마지', 'Body Thermage'],
  ['아이써마지', 'Eye Thermage'],
  ['아이리쥬란', 'Eye Rejuran'],
  ['리쥬란힐러', 'Rejuran Healer'],
  ['리쥬란 HB', 'Rejuran HB'],
  ['리쥬란', 'Rejuran'],
  ['풀페이스', 'Full-face'],
  ['스킨수티컬즈', 'SkinCeuticals'],
  ['항산화', 'Antioxidant'],
  ['프리미엄 메디컬 케어', 'Premium Medical Care'],
  ['메디컬 케어', 'Medical Care'],
  ['바디 스컬트라', 'Body Sculptra'],
  ['스컬트라', 'Sculptra'],
  ['바디슬리밍 브이올렛', 'Body Slimming Violet'],
  ['브이올렛', 'Violet'],
  ['손등주름 래디어스', 'Hand Wrinkle Radiesse'],
  ['래디어스', 'Radiesse'],
  ['스킨', 'Skin'],
  ['관리', 'Care'],
  ['샷', 'shots'],
  ['총', 'total'],
  ['부위', 'area'],
  ['선택 가능', 'selectable'],

  // K-Education capacity / itinerary
  ['최소 인원', 'Min capacity'],
  ['최대 인원', 'Max capacity'],
  ['최소', 'Min'],
  ['최대', 'Max'],

  // K-Starcation
  ['그룹 K-POP 베이직 트레이닝', 'Group K-POP Basic Training'],
  ['소수정예 K-POP 심화 트레이닝', 'Small-group K-POP Advanced Training'],
  ['1:1 마스터 트레이닝', '1:1 Master Training'],
  ['베이직 트레이닝', 'Basic Training'],
  ['심화 트레이닝', 'Advanced Training'],
  ['마스터 트레이닝', 'Master Training'],
  ['트레이닝', 'Training'],
  ['보컬 & 댄스 기초', 'Vocal & Dance Basics'],
  ['보컬, 댄스, 무대 퍼포먼스', 'Vocal, Dance, Stage Performance'],
  ['전담 보컬/댄스 디렉팅', 'Dedicated Vocal/Dance Directing'],
  ['보컬', 'Vocal'],
  ['댄스', 'Dance'],
  ['기초', 'Basics'],
  ['K-POP 아이돌 헤어 & 메이크업 스타일링', 'K-POP Idol Hair & Makeup Styling'],
  ['프리미엄 아이돌 스타일링', 'Premium Idol Styling'],
  ['VVIP 전담 스타일링 및 맞춤형 무대', 'VVIP Dedicated Styling & Custom Stage'],
  ['아이돌', 'Idol'],
  ['헤어', 'Hair'],
  ['메이크업', 'Makeup'],
  ['스타일링', 'Styling'],
  ['프리미엄 스튜디오 프로필 촬영', 'Premium Studio Profile Shoot'],
  ['전문 스튜디오 음원 녹음', 'Professional Studio Music Recording'],
  ['단독 음원 제작 및 녹음', 'Exclusive Music Production & Recording'],
  ['음원 녹음', 'Music Recording'],
  ['음원 제작', 'Music Production'],
  ['프로필 촬영', 'Profile Shoot'],
  ['개인 콘셉트 화보 촬영', 'Personal Concept Editorial Shoot'],
  ['화보 촬영', 'Editorial Shoot'],
  ['스튜디오', 'Studio'],
  ['프리미엄', 'Premium'],
  ['숏폼(Reels/Shorts) 챌린지 영상 제작', 'Short-form (Reels/Shorts) Challenge Video Production'],
  ['하이라이트 뮤직비디오(MV) 촬영', 'Highlight Music Video (MV) Shoot'],
  ['스케일업 단독 풀버전 뮤직비디오(MV) 촬영', 'Scale-up Exclusive Full-version Music Video (MV) Shoot'],
  ['뮤직비디오(MV)', 'Music Video (MV)'],
  ['뮤직비디오', 'Music Video'],
  ['영상 제작', 'Video Production'],
  ['챌린지', 'Challenge'],
  ['공식 수료증 발급', 'Official Certificate Issued'],
  ['수료증 발급', 'Certificate Issued'],
  ['수료증', 'Certificate'],
  ['공연장 쇼케이스 진행', 'Venue Showcase'],
  ['쇼케이스 + 전담 의전 및 VIP 케어', 'Showcase + Dedicated Protocol & VIP Care'],
  ['쇼케이스', 'Showcase'],
  ['공연장', 'Venue'],
  ['전담 의전 및 VIP 케어', 'Dedicated Protocol & VIP Care'],
  ['VIP 케어', 'VIP Care'],
  ['의전', 'Protocol'],
  ['전담', 'Dedicated'],
  ['기도실/할랄 식단 등 맞춤 지원', 'Prayer room / halal meals & custom support'],
  ['기도실', 'Prayer room'],
  ['할랄 식단', 'Halal meals'],
  ['맞춤 지원', 'Custom support'],
  ['맞춤형', 'Custom'],
  ['기획사 내방오디션', 'Agency in-house audition'],
  ['기획사', 'Agency'],
  ['내방오디션', 'in-house audition'],
  ['오디션', 'audition'],
  ['무대 의상 피팅 요청 시 추가 진행 가능', 'Stage costume fitting available upon request'],
  ['무대 퍼포먼스', 'Stage Performance'],
  ['무대 의상', 'Stage costume'],
  ['무대', 'Stage'],
  ['의상', 'Costume'],
  ['피팅', 'Fitting'],
  ['요청 시', 'upon request'],
  ['추가 진행 가능', 'additional sessions available'],
  ['개인 콘셉트', 'Personal Concept'],
  ['콘셉트', 'Concept'],
  ['하이라이트', 'Highlight'],
  ['풀버전', 'Full-version'],
  ['단독', 'Exclusive'],
  ['스케일업', 'Scale-up'],
  ['소수정예', 'Small-group'],
  ['심화', 'Advanced'],
  ['그룹', 'Group'],

  // Hotel layouts (existing + extensions)
  ['룸구성', 'Layout'],
  ['기준인원', 'Standard occupancy'],
  ['기준 인원', 'Standard occupancy'],
  ['최대 인원', 'Max occupancy'],
  ['투숙 인원', 'Occupancy'],
  ['전망욕실', 'view bathroom'],
  ['시티뷰', 'City view'],
  ['리버뷰', 'River view'],
  ['호수 전망', 'Lake view'],
  ['산 전망', 'Mountain view'],
  ['도심 또는 산 전망', 'Downtown or mountain view'],
  ['경복궁 전망', 'Gyeongbokgung view'],
  ['도심', 'Downtown'],
  ['전망', 'View'],
  ['시티', 'City'],
  ['리버', 'River'],
  ['호수', 'Lake'],
  ['산', 'Mountain'],
  ['경복궁', 'Gyeongbokgung'],
  ['1인당 추가 금액', 'Additional per person'],
  ['추가 금액', 'additional fee'],
  ['조식 포함', 'Breakfast included'],
  ['전화 예약만 가능', 'Phone reservation only'],
  ['세금 별도', 'tax not included'],
  ['8시간 초과 시', 'After 8 hours'],
  ['8시간 기준', '8-hour base'],
  ['10시간 기준', '10-hour base'],
  ['시간 당', 'per hour'],
  ['시트수', 'Seats'],
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
  ['온돌', 'Ondol (Korean floor heating)'],
  ['성인', 'adults'],
  ['소인', 'children'],
  ['어린이', 'children'],
  ['유아', 'infants'],
  ['동반 시', 'with'],
  ['동반', 'with'],
  ['또는', 'or'],
  ['추가', 'additional'],

  // Hotel amenities (Suite extras)
  ['미나기 오마카세 세트', 'Minagi Omakase set'],
  ['오마카세', 'Omakase'],
  ['미나기', 'Minagi'],
  ['웰니스 클럽', 'Wellness Club'],
  ['실내 수영장 및 피트니스 센터 무료 이용', 'Complimentary indoor pool & fitness center access'],
  ['실내 수영장', 'Indoor pool'],
  ['피트니스 센터', 'Fitness center'],
  ['무료 이용', 'Complimentary access'],
  ['레이트 체크아웃', 'Late checkout'],
  ['스플래시 베이 오후 이용권', 'Splash Bay afternoon pass'],
  ['스플래시 베이 카바나', 'Splash Bay Cabana'],
  ['스플래시 베이', 'Splash Bay'],
  ['카바나', 'Cabana'],
  ['오후 이용권', 'afternoon pass'],
  ['세프스 키친 디너 뷔페', "Chef's Kitchen dinner buffet"],
  ['세프스 키친', "Chef's Kitchen"],
  ['디너 뷔페', 'dinner buffet'],
  ['클럽 라운지 이용 가능', 'Club Lounge access'],
  ['클럽 라운지', 'Club Lounge'],
  ['이용 가능', 'access'],
  ['무료 음식', 'Complimentary food'],
  ['오르되브르', "hors d'oeuvres"],
  ['조식', 'breakfast'],
  ['간식', 'snacks'],
  ['무료 비즈니스 서비스', 'Complimentary business services'],
  ['비즈니스 서비스', 'business services'],
  ['다도세트와 찻잎', 'Tea ceremony set with tea leaves'],
  ['다도세트', 'Tea ceremony set'],
  ['찻잎', 'tea leaves'],
  ['드립 커피 셋트와 원두', 'Drip coffee set with beans'],
  ['드립 커피 셋트', 'Drip coffee set'],
  ['원두', 'coffee beans'],

  // Concierge / Security / Interpreter (services)
  ['VIP 의전수행 및 경호', 'VIP Protocol & Security'],
  ['VIP 의전수행', 'VIP Protocol Service'],
  ['VIP의전수행', 'VIP Protocol Service'],
  ['신변보호', 'Personal Protection'],
  ['경호서비스', 'Security Service'],
  ['경호 서비스', 'Security Service'],
  ['개인 의전', 'Personal Protocol'],
  ['의전수행', 'Protocol Service'],
  ['의전 전문 매니저', 'Protocol Manager'],
  ['의전도우미', 'Protocol Assistant'],
  ['의전 도우미', 'Protocol Assistant'],
  ['수행기사', 'Driver'],
  ['동시통역사', 'Simultaneous Interpreter'],
  ['통역사', 'Interpreter'],
  ['개인 VIP 수행', 'Personal VIP Attendance'],
  ['VIP 수행', 'VIP Attendance'],
  ['경호', 'Security'],
  ['의전', 'Protocol'],
  ['인력 지원 비용', 'Personnel Support Fees'],
  ['인력 지원', 'Personnel support'],
  ['시간당', 'per hour'],
  ['만원', ' 10,000 KRW'],   // leading space — keeps digit attached number-only e.g. "5-10만원" → "5-10 10,000 KRW"
  ['가격 문의 필요', 'Quote on request'],
  ['별도 상담', 'Consultation required'],

  // Vehicle
  ['메리트리무진', 'Merit Limousine'],
  ['벤츠 스프린터', 'Mercedes-Benz Sprinter'],
  ['스프린터', 'Sprinter'],
  ['메리트', 'Merit'],
  ['벤츠', 'Mercedes-Benz'],
  ['리무진', 'Limousine'],
  ['크리스탈', 'Crystal'],
  ['그랜드', 'Grand'],
  ['세단', 'Sedan'],
  ['프리미엄 SUV', 'Premium SUV'],
  ['럭셔리 세단', 'Luxury Sedan'],
  ['다인승 리무진', 'Multi-passenger Limousine'],
  ['리무진 버스', 'Limousine Bus'],
]

const PHRASES_SORTED = [...PHRASES].sort((a, b) => b[0].length - a[0].length)

function applyPhrasebook(s) {
  let out = String(s)
  for (const [ko, en] of PHRASES_SORTED) {
    if (out.includes(ko)) out = out.split(ko).join(en)
  }
  return out
}

// Strip residual Korean numeric-suffix particles after digits — e.g. "성인 2명" → "adults 2".
// Run AFTER phrasebook so 인/명 in word context are already converted.
function stripKoreanNumberSuffixes(s) {
  return String(s).replace(/(\d+)\s*(명|인|박|일|개|회|호|팀|팩|개월|년)\b/g, '$1')
}

// Final fallback: drop any leftover Korean characters (Hangul Jamo + Syllables)
// + collapse whitespace and orphan punctuation that survived translation.
//
// After Korean nouns are removed from itinerary text and hashtag clouds, the
// connectives between them become orphan noise:
//   "호텔 → 임진각 → 통일대교"   → "→ → →"           (arrow chain)
//   "#슬로프수13면 #리프트10기"  → "# #"             (orphan hashtags)
//   ",,, ::, +, +,, "          (Korean noun list residue)
// We collapse / drop these so descriptions either read cleanly or end up empty
// (signalling "needs manual rewrite" for affected rows).
function stripResidualKorean(s) {
  let out = String(s).replace(/[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯]+/g, '')

  // Collapse chains of arrows / hashtags / orphan punctuation that resulted
  // from stripping Korean tokens between them
  out = out
    // Hashtags with no body (just "#") or "#" followed by digits/punctuation only
    .replace(/#\s*(?=[#\s,;:.\-+/]|$)/g, '')                // bare "#"
    .replace(/#[\d\s,;:.\-+/]+(?=[#\s]|$)/g, '')             // hashtags with only digits/punct
    // Arrow chains: collapse multiple → to nothing if surrounded by whitespace
    .replace(/(?:→\s*){2,}/g, ' → ')                         // "→ → → →" → " → "
    .replace(/(?:->\s*){2,}/g, ' -> ')
    .replace(/(?:-->\s*){2,}/g, ' --> ')
    .replace(/^\s*→\s*|→\s*$/g, '')                          // leading/trailing arrow
    .replace(/^\s*->\s*|->\s*$/g, '')
    // Orphan-pair separators "(/)" or "(: )" left behind
    .replace(/\([\s/:.,;\-]+\)/g, '')
    // Repeated word/word artifacts like "Mountain/ Mountain" (from "산/산"-like splits)
    .replace(/\b(\w+)\/\s*\1\b/g, '$1')
    // Whitespace + punctuation cleanup
    .replace(/\s+/g, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s*([,;:.])/g, '$1')                           // tighten before punctuation
    .replace(/([,;:])\s*([,;:.])/g, '$2')                    // collapse adjacent punctuation
    .replace(/[,;:+]{2,}/g, ',')                             // ",,," → ","  (NOT --, which is significant en/em-dash)
    .replace(/^\s*[,;:.\-+&/]+\s*/, '')                      // trim leading orphan punctuation
    .replace(/[,;:.\-+&/\s#]+$/, '')                         // trim trailing orphan punctuation
    .trim()

  // If what remains is just punctuation/symbols/very short, drop entirely
  if (out.length < 4 || !/[A-Za-z0-9]{3,}/.test(out)) return ''
  return out
}

function cleanText(s) {
  if (s == null || s === '') return ''
  let out = applyPhrasebook(s)
  out = stripKoreanNumberSuffixes(out)
  out = stripResidualKorean(out)
  // Insert a space between a digit and an immediately-following English unit
  // word (e.g. "300shots" → "300 shots", "1bedroom" → "1 bedroom"). Helps
  // readability after Korean→English translation fuses tokens.
  out = out.replace(/(\d)(shots?|bedrooms?|bathrooms?|toilets?|saunas?|kitchens?|offices?|living room|family room|dining room|utility room|adults?|children|infants?)\b/gi, '$1 $2')
  // Collapse multiple spaces left behind from earlier transforms
  out = out.replace(/[ \t]{2,}/g, ' ')
  return out
}

// Name dedup: drop a "·"-separated segment when it appears as a whole-word
// substring inside a *longer* segment.
//
// Case-sensitive on purpose so partner brand acronyms (e.g. "INSPIRE") aren't
// swallowed by similarly-spelled common words ("Inspire") in another segment.
// Also requires word-boundary match so "tour" inside "TOUR" inside another
// phrase doesn't trigger over-eager deletion.
function dedupName(name) {
  if (!name || !name.includes('·')) return name
  const segs = name.split('·').map(s => s.trim()).filter(Boolean)
  const keep = []
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i]
    let isContained = false
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue
      const b = segs[j]
      if (b.length <= a.length) continue
      // Word-boundary case-sensitive containment
      const re = new RegExp('(?:^|\\s)' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)')
      if (re.test(b)) {
        isContained = true
        break
      }
    }
    if (!isContained) keep.push(a)
  }
  return keep.join(' · ')
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

const TEXT_FIELDS = ['name', 'description', 'grade', 'partner_name', 'location_address', 'notes', 'why_recommendation', 'head_doctor_profile']

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
    console.error('No rows in', file)
    process.exit(1)
  }

  let cleanedKorean = 0
  let dedupedNames = 0
  let urlSwapped = 0

  const cleanedRows = rows.map(r => {
    const out = { ...r }

    // Detect misplaced info_url (descriptive text in info_url column instead
    // of an actual URL). Move that text into description and clear info_url.
    const url = String(out.info_url ?? '').trim()
    if (url && !/^https?:\/\//i.test(url)) {
      const existingDesc = String(out.description ?? '').trim()
      out.description = existingDesc ? existingDesc + '\n' + url : url
      out.info_url = ''
      urlSwapped++
    }

    for (const f of TEXT_FIELDS) {
      if (out[f] == null) continue
      const before = String(out[f])
      const after = cleanText(before)
      if (before !== after) {
        if (/[ㄱ-힣]/.test(before)) cleanedKorean++
        out[f] = after
      }
    }
    if (out.name) {
      const beforeName = String(out.name)
      const afterName = dedupName(beforeName)
      if (beforeName !== afterName) {
        out.name = afterName
        dedupedNames++
      }
    }
    return out
  })

  // Write out
  const wbo = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(cleanedRows)
  const cols = Object.keys(cleanedRows[0])
  ws['!cols'] = cols.map(c => {
    if (c === 'description' || c === 'why_recommendation' || c === 'head_doctor_profile' || c === 'name' || c === 'notes') return { wch: 50 }
    if (c === 'partner_name' || c === 'location_address' || c === 'contact_phone' || c === 'contact_email' || c === 'info_url') return { wch: 28 }
    return { wch: 14 }
  })
  XLSX.utils.book_append_sheet(wbo, ws, sheetName)
  for (const name of wb.SheetNames) {
    if (name === sheetName) continue
    XLSX.utils.book_append_sheet(wbo, wb.Sheets[name], name)
  }
  XLSX.writeFile(wbo, outPath)

  // Verify residual Korean
  const KO = /[ㄱ-힣]/
  const remaining = []
  for (const r of cleanedRows) {
    for (const f of TEXT_FIELDS) {
      if (KO.test(String(r[f] ?? ''))) remaining.push({ pn: r.product_number, f, v: String(r[f]).slice(0, 100) })
    }
  }

  console.log('Read :', inPath)
  console.log('Wrote:', outPath)
  console.log('Field cleanings (Korean → English):', cleanedKorean)
  console.log('Names deduped:', dedupedNames)
  console.log('info_url swapped to description:', urlSwapped)
  console.log('Residual Korean cells:', remaining.length)
  for (const r of remaining.slice(0, 20)) console.log('  ', r.pn, r.f + ':', r.v)
}

main()
