/* eslint-disable */
// Manual translations for rows where automatic phrasebook+strip lost real
// product information (tour stops, consulting program details, hashtag specs).
// Translations were authored from the v6 (Korean-preserved) originals.
//
// Reads highest products_master_v*.xlsx, applies description (and select
// partner_name) overrides, writes next version.
//
// Usage: node scripts/patch-translations.js

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const DATA_DIR = path.join(__dirname, '..', 'data')

// Descriptions use \n for paragraph breaks and bullet/itinerary readability.
// Hashtags collected on a final line.
const PATCHES = {
  '#P-083': {
    description: [
      "Runs 2025.12.17 – 2026.02.22.",
      "",
      "Includes:",
      "• Welcome coupon book",
      "• K-Theme Zone experience",
      "• Photo zones & lucky draws",
      "• AI sentiment-analysis shopping recommendations",
      "• K shopping-cart fill-up",
      "",
      "Covers airfare & transport, shopping, accommodation, food & beverage, beauty, health, experiences, and convenience services.",
    ].join('\n'),
  },
  '#P-084': {
    description: [
      "Korea's largest Lindberg dealer. Premium optical store carrying luxury international eyewear brands.",
      "",
      "• State-of-the-art optometry system with ultra-precision 3D inspection equipment",
      "• In-house training program ensures highly skilled optometrists and fitting specialists",
    ].join('\n'),
  },
  '#P-085': {
    description: "Korea's first health & beauty store chain.",
  },
  '#P-086': {
    description: [
      "Korea's first stationery & fancy-goods specialty brand.",
      "",
      "Transformed the domestic stationery industry from simple school-supply manufacturing into design-driven fancy retail.",
    ].join('\n'),
  },
  '#P-087': {
    description: [
      "Minimum 2 pax (max 6–7).",
      "",
      "Itinerary:",
      "Gyeongbokgung Palace → Bukchon / Seochon → Myeongdong → Lunch → N Seoul Tower → VAN Entertainment (DIY workshop) → Naksan Park → Souvenir shopping",
      "",
      "Tour package (1 van) includes English guide, professional photographer, and lunch.",
      "",
      "#SeoulDowntown #K-POPContent #ImmersiveExperience #MissionTour #XR/AR",
    ].join('\n'),
  },
  '#P-099': {
    description: [
      "Includes:",
      "• Color draping with detailed 25-type tone diagnosis",
      "• Makeup product recommendations",
      "• Fashion style check & styling recommendations",
      "• Accessory, perfume, eyewear, contact-lens, nail design & color recommendations",
      "• Body-frame analysis with strategic fashion coaching",
      "• Signature image consulting",
      "",
      "#PersonalColorDiagnosis #FourSeasonsToneAnalysis #MakeupColorRecommendation #HairColorGuide #ImageAnalysis #PersonalizedRecommendation",
    ].join('\n'),
  },
  '#P-100': {
    description: [
      "Includes:",
      "• Body-color analysis with personal color diagnosis",
      "• Hair, jewelry, and contact-lens color recommendations",
      "• Brief face-zone analysis with fashion coaching",
      "• Perfume recommendation",
      "• Necklace, earring, ring, watch design recommendations",
      "",
      "#AdvancedPersonalColorDiagnosis #ColorPaletteGuide #FaceZoneAnalysis #ImageAnalysis #MakeupApplication #PersonalizedRecommendation",
    ].join('\n'),
  },
  '#P-101': {
    description: [
      "Minimum 4 pax / 09:00 – 17:30",
      "",
      "Itinerary:",
      "Hotel → Drive-by (City Hall, Gwanghwamun Square, Cheonggyecheon) → Royal Guard Changing Ceremony → Gyeongbokgung Palace (Mondays: Deoksugung Palace) → National Folk Museum → Drive past Cheong Wa Dae → Amethyst or ginseng center → N Seoul Tower → Lunch → Changdeokgung Palace (Mondays: Bukchon Hanok Village) → Insadong → Han River cruise → Hotel",
      "",
      "#ForeignerTravel #SeoulVIPCityTour #HistoricalCultural #PrivateVehicle #PickupService #LunchIncluded",
    ].join('\n'),
  },
  '#P-102': {
    description: [
      "Itinerary:",
      "Gwanghwamun Square → Drive along Cheonggyecheon → Dongdaemun DDP → N Seoul Tower → Han River Park → Banpo Bridge Moonlight Rainbow Fountain → Itaewon",
      "",
      "#NightDrivingTour #SeoulNightView #ForeignerTour #EnglishGuide",
    ].join('\n'),
  },
  '#P-104': {
    description: [
      "Minimum 4 pax / 07:00 – 17:30",
      "",
      "Itinerary:",
      "Hotel → Imjingak → Unification Bridge → Passport / ID check → DMZ Theater & Exhibition Hall → Third Tunnel → Dora Observatory → Tongil-chon → Lunch → Yeonmijeong (Ganghwa) → Passport / ID check → Coastal barrier fence → Ganghwa Peace Observatory → Hotel",
      "",
      "#ForeignerVIP #DMZNLLTour #ExpertGuide #LunchIncluded",
    ].join('\n'),
  },
  '#P-105': {
    description: [
      "Itinerary:",
      "Hotel → Nami Island → Lunch → Prayer time → Garden of Morning Calm → Hotel or Myeongdong → Tour ends",
      "",
      "#MuslimPrivateTour #HalalMeals #PrayerTimeIncluded #NamiIslandTour #ArabicGuide #EnglishGuide #LunchIncluded",
    ].join('\n'),
  },
  '#P-111': {
    description: [
      "Korea's largest ski resort.",
      "",
      "• FIS-certified slopes (13)",
      "• 28 slopes total, 14 lifts",
      "• Ski / board / equipment / clothing rentals",
      "• Lift tickets and lessons available",
    ].join('\n'),
  },
  '#P-112': {
    description: [
      "• 15 FIS-certified slopes",
      "• 15 slopes total, 5 lifts, 3 gondolas",
      "• Ski / board / equipment / clothing rentals",
      "• Lift tickets and lessons available",
    ].join('\n'),
    // Also fix partner_name leftover phone number
    partner_name: "SERENO SKISHOP",
  },
  '#P-113': {
    description: [
      "• 13 slopes, 10 lifts",
      "• Ski / board / equipment / clothing rentals",
      "• Lift tickets and lessons available",
    ].join('\n'),
  },
  '#P-114': {
    description: [
      "• 9 slopes, 5 lifts",
      "• Ski / board / equipment / clothing rentals",
      "• Lift tickets and lessons available",
    ].join('\n'),
  },
  '#P-115': {
    description: [
      "Water park within Everland Resort. Caribbean theme.",
      "",
      "• Wave pool",
      "• Diving pool",
      "• Surfing rides",
      "• Slides",
    ].join('\n'),
  },
  '#P-116': {
    description: [
      "Mega water park at Vivaldi Park Resort. Ancient Egypt theme.",
      "",
      "• Wave pool",
      "• Slides",
    ].join('\n'),
  },
  '#P-117': {
    description: [
      "Spa water park at Paradise City.",
      "",
      "• European art spa",
      "• Pool party",
      "• Traditional Korean jjimjilbang",
      "• Slides",
      "• Infinity pool",
    ].join('\n'),
  },
  '#P-118': {
    description: [
      "Water park.",
      "",
      "• Jet boat",
      "• Water-ski / wakeboard",
      "• Rides",
      "• Unlimited barbecue",
    ].join('\n'),
  },
  '#P-119': {
    description: [
      "Water park.",
      "",
      "• Jet boat",
      "• Water-ski / wakeboard",
      "• Rides",
      "• Unlimited barbecue",
    ].join('\n'),
  },
  '#P-120': {
    description: [
      "Services / events:",
      "1) Dedicated entrance (Gocheok Sky Dome central C-gate)",
      "2) Dedicated parking",
      "3) Mascot photo service",
    ].join('\n'),
    partner_name: "Kiwoom Heroes (Gocheok)",  // was empty (Korean stripped to just "(GOCHUCK)")
  },
  '#P-124': {
    description: [
      "Includes:",
      "• Designated Dream Tour parking",
      "• Priority entry through Everland's main gate",
      "• Tour guide accompaniment throughout the park",
      "• Priority access to popular attractions",
      "• Everland commemorative photography",
      "• Restaurant meal",
      "• Safari Special Tour (closed for renovation from 2026.02.19)",
    ].join('\n'),
  },
  // Additional partner_name fixes for empty rows identified earlier
  '#P-108': {
    partner_name: "Gyeongsangbuk-do Cultural Tourism",  // was empty
  },
  '#P-125': {
    partner_name: "Seoul Land",  // was empty
    description: "Theme park 1-day pass. Seoul Land in Gwacheon, Gyeonggi-do.",
  },
  // Sports / theme-park venues — source had no description; fill with 1-line venue note
  '#P-121': {
    description: "K-League baseball Sky Box at Incheon SSG Landers Field.",
  },
  '#P-122': {
    description: "K-League soccer Sky Box at Seoul World Cup Stadium.",
  },
  '#P-123': {
    description: "Lotte World theme park 1-day pass with Magic Pass Premium (priority access to popular attractions).",
  },
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

  let patched = 0
  const seen = new Set()
  const out = rows.map(r => {
    const patch = PATCHES[r.product_number]
    if (!patch) return r
    seen.add(r.product_number)
    patched++
    return { ...r, ...patch }
  })
  const missing = Object.keys(PATCHES).filter(pn => !seen.has(pn))

  const wbo = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(out)
  const cols = Object.keys(out[0])
  ws['!cols'] = cols.map(c => {
    if (['description', 'why_recommendation', 'head_doctor_profile', 'name', 'notes'].includes(c)) return { wch: 50 }
    if (['partner_name', 'location_address', 'contact_phone', 'contact_email', 'info_url'].includes(c)) return { wch: 28 }
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
  console.log('Rows patched:', patched, '/', Object.keys(PATCHES).length)
  if (missing.length) console.log('Missing product_numbers (not found in master):', missing)
}

main()
