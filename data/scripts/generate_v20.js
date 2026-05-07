// products_master_v18.xlsx → products_master_v20.xlsx
// Changes from v18 → v20:
//   - Rename column why_recommendation → highlights
//   - Remove old TRABIC/VERITAS/Merit Limousine rows (replaced below)
//   - Fix OK KOREA COMPANY concierge prices → 0; clear spurious variant labels on all Concierge rows
//   - Fix Sofitel ROYAL packages → 0; Presidential Suite → 0 (special rate on request)
//   - Add K-Medical: Podo Women's Clinic, Live Dental Hospital (EYEREUM excluded — no price list)
//   - Add Interpreter: TRABIC (1h/6h), VERITAS (General·8h / Professional·8h)
//   - Add Vehicle: Noble Klasse, Grand Limousine Korea, CK Company, VIP Limousine Korea, Merit Limousine (all models)
//   - Rebuild K-Wellness (Shopping/K-Content/Tour/Leisure) from Internal_Price source — v18 rows were corrupted
//   - Rebuild K-Starcation from source xlsx — v18 had phantom row + K-Beauty note contamination

const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');

const V18_PATH = path.join(__dirname, '../products_master_v18.xlsx');
const V19_PATH = path.join(__dirname, '../products_master_v20.xlsx');

// ── helpers ────────────────────────────────────────────────────────────────────
const P_NUM_RE = /^#P-(\d+)$/;
function pNum(n) { return `#P-${String(n).padStart(3, '0')}`; }

function nl(...lines) { return lines.join('\n'); }

// ── read v18 ───────────────────────────────────────────────────────────────────
const wb = XLSX.readFile(V18_PATH);
const ws = wb.Sheets[wb.SheetNames[0]];
const [headers, ...rawRows] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Rename why_recommendation → highlights
const whyIdx = headers.indexOf('why_recommendation');
if (whyIdx !== -1) headers[whyIdx] = 'highlights';

// Column index map (based on v18 header)
// 0:product_number 1:category 2:subcategory 3:partner_name 4:partner_short
// 5:name 6:grade 7:variant_label 8:gender 9:base_price 10:price_currency
// 11:price_min 12:price_max 13:duration_value 14:duration_unit 15:description
// 16:highlights 17:head_doctor_profile 18:location_address 19:contact_phone
// 20:contact_email 21:info_url 22:has_female_doctor 23:has_prayer_room
// 24:dietary_type 25:is_active 26:sort_order 27:source_sheet 28:notes 29:price_unit

// ── filter out rows to replace ─────────────────────────────────────────────────
const REMOVE_PARTNERS = new Set(['TRABIC', 'VERITAS', 'Merit Limousine']);
let rows = rawRows.filter(r => {
  if (REMOVE_PARTNERS.has(r[3])) return false;
  // All non-Spa K-Wellness rows in v18 are corrupted (botox brand names as variants,
  // wrong prices/names due to column misalignment). Spa rows are correct — keep them.
  if (r[1] === 'K-Wellness' && r[2] !== 'Spa') return false;
  // K-Starcation rows in v18 have wrong notes (K-Beauty contamination), wrong variant labels,
  // and a phantom 4th row not in source. Rebuild from source below.
  if (r[1] === 'K-Starcation') return false;
  return true;
});

// ── fix existing rows ──────────────────────────────────────────────────────────
rows.forEach(r => {
  // Concierge: OK KOREA COMPANY → price 0 (hourly rates, not fixed)
  if (r[3] === 'OK KOREA COMPANY') {
    r[9] = 0;
  }
  // Concierge: all rows had spurious "1 session"/"5 sessions" variant labels from v18 column misalignment
  if (r[2] === 'Concierge') {
    r[7] = '';
  }
  // Sofitel ROYAL packages → price 0 (package pricing TBD)
  if (r[3] === 'SOFITEL Ambassador Seoul' && String(r[7]).startsWith('ROYAL')) {
    r[9] = 0;
  }
  // Sofitel Presidential Suite: ₩22,000,000 is the published rack rate, not the negotiated special rate.
  // Special rate is "Contact Sales Manager" — use 0 to avoid quoting wrong price.
  if (r[3] === 'SOFITEL Ambassador Seoul' && String(r[7]).includes('Presidential')) {
    r[9] = 0;
    r[28] = 'Special rate on request — contact Sofitel sales manager for group/VIP pricing. Published rack rate: ₩22,000,000/night.';
  }
});

// ── max product number ─────────────────────────────────────────────────────────
const allNums = rawRows.map(r => { const m = String(r[0]).match(P_NUM_RE); return m ? parseInt(m[1]) : 0; });
let nextNum = Math.max(...allNums) + 1;
const next = () => pNum(nextNum++);

// ── row builder ────────────────────────────────────────────────────────────────
// Fields: [product_number, category, subcategory, partner_name, partner_short,
//          name, grade, variant_label, gender, base_price, price_currency,
//          price_min, price_max, duration_value, duration_unit, description,
//          highlights, head_doctor_profile, location_address, contact_phone,
//          contact_email, info_url, has_female_doctor, has_prayer_room,
//          dietary_type, is_active, sort_order, source_sheet, notes, price_unit]
function row(o) {
  return [
    next(),                            // 0  product_number
    o.category    || '',               // 1  category
    o.subcategory || '',               // 2  subcategory
    o.partner     || '',               // 3  partner_name
    o.partnerShort|| '',               // 4  partner_short
    o.name        || '',               // 5  name
    o.grade       || o.name || '',     // 6  grade
    o.variant     || '',               // 7  variant_label
    o.gender      || '',               // 8  gender
    o.price       ?? 0,                // 9  base_price
    o.currency    || 'KRW',            // 10 price_currency
    '',                                // 11 price_min
    '',                                // 12 price_max
    o.durVal      || '',               // 13 duration_value
    o.durUnit     || '',               // 14 duration_unit
    o.desc        || '',               // 15 description
    o.highlights  || '',               // 16 highlights
    o.headDoctor  || '',               // 17 head_doctor_profile
    o.address     || '',               // 18 location_address
    o.phone       || '',               // 19 contact_phone
    o.email       || '',               // 20 contact_email
    o.url         || '',               // 21 info_url
    o.femaleDoctor!== undefined ? (o.femaleDoctor ? 'TRUE' : 'FALSE') : '', // 22 has_female_doctor
    o.prayerRoom  !== undefined ? (o.prayerRoom  ? 'TRUE' : 'FALSE') : '', // 23 has_prayer_room
    o.dietary     || 'none',           // 24 dietary_type
    'TRUE',                            // 25 is_active
    0,                                 // 26 sort_order (renumbered at end)
    o.source      || '',               // 27 source_sheet
    o.notes       || '',               // 28 notes
    o.priceUnit   || '',               // 29 price_unit
  ];
}

// ── new rows ───────────────────────────────────────────────────────────────────
// Note: EYEREUM Eye Clinic excluded — price list not yet finalized

const newRows = [
  // ── K-Medical: Podo Women's Clinic ──────────────────────────────────────────
  ...[
    {
      variant: 'Premium Rejuvenation', grade: 'Premium Rejuvenation',
      price: 10000000, durVal: 120, durUnit: 'minutes',
      desc: nl(
        '* Vaginal rejuvenation laser (600 shots) + tightening treatment + sensory enhancement injection',
        '* Labia whitening & moisturizing treatment',
        '* Premium IV nutrition: high-dose amino acids, B-complex, vitamin C, garlic injection',
        '* Volume filler 10cc',
        '* Comprehensive women\'s health screening: hormone panel, pelvic ultrasound (uterus/ovaries/bladder), cancer markers, STD panel',
      ),
    },
    {
      variant: 'VIP Anti-Aging', grade: 'VIP Anti-Aging',
      price: 20000000, durVal: 160, durUnit: 'minutes',
      desc: nl(
        '* All inclusions of Premium Rejuvenation Package',
        '* Volume filler 15cc',
        '* Stem cell ovarian anti-aging injection for hormonal rejuvenation',
      ),
    },
    {
      variant: 'Royal Total Luxury', grade: 'Royal Total Luxury',
      price: 30000000, durVal: 180, durUnit: 'minutes',
      desc: nl(
        '* All inclusions of VIP Anti-Aging Package',
        '* Volume filler 25cc',
        '* External volumizing program (Juvelook Volume)',
      ),
    },
  ].map(o => row({
    category: 'K-Medical', subcategory: "Women's Health",
    partner: "Podo Women's Clinic", partnerShort: 'Podo',
    name: 'Feminine Care Package',
    currency: 'KRW',
    femaleDoctor: true, prayerRoom: false, dietary: 'none',
    address: 'Seoul Gangnam-gu',
    source: '1. K-Medical',
    highlights: nl(
      '* Dedicated women\'s health clinic specializing in VIP feminine rejuvenation',
      '* Comprehensive programs combining aesthetic, hormonal, and preventive care',
      '* Female doctors available upon request',
    ),
    ...o,
  })),

  // ── K-Medical: Live Dental Hospital ─────────────────────────────────────────
  ...[
    {
      name: 'Dental Implant Package', variant: 'Dentium', grade: 'Dentium',
      price: 1200000, durVal: '3–6', durUnit: 'months', priceUnit: 'per implant',
      desc: nl(
        '* Dentium SuperLine implant fixture (South Korean, premium quality)',
        '* Custom abutment + zirconia crown',
        '* Bone graft included',
        '* Fixture: titanium screw anchored into jawbone',
        '* Zirconia crown: natural-looking, highly durable final restoration',
        '* Treatment duration: 3–6 months per implant',
      ),
    },
    {
      name: 'Dental Implant Package', variant: 'Straumann', grade: 'Straumann',
      price: 1200000, durVal: '3–6', durUnit: 'months', priceUnit: 'per implant',
      desc: nl(
        '* Straumann implant fixture (Swiss, globally recognized premium brand)',
        '* Custom abutment + zirconia crown',
        '* Bone graft included',
        '* Fixture: titanium screw anchored into jawbone',
        '* Zirconia crown: natural-looking, highly durable final restoration',
        '* Treatment duration: 3–6 months per implant',
      ),
    },
    {
      name: 'Full Arch Implant Package', variant: '', grade: '',
      price: 9000000, durVal: '8–12', durUnit: 'months', priceUnit: 'per arch',
      desc: nl(
        '* 7 Dentium SuperLine implant fixtures + 7 custom abutments + 7 zirconia crowns',
        '* Bone graft included for all 7 implants',
        '* 5 bridge connector teeth (pontics)',
        '* Full arch (upper or lower jaw) implant restoration',
        '* Treatment duration: 8–12 months per arch',
      ),
    },
    {
      name: 'Sinus Lift', variant: '', grade: '',
      price: 700000, durVal: '', durUnit: '', priceUnit: 'per site',
      desc: nl(
        '* Elevation of the maxillary sinus membrane to create space for implant placement in the upper molar region',
        '* Required when jawbone height is insufficient for direct implant placement',
        '* Bone graft performed simultaneously during the procedure',
        '* Optional add-on to dental implant treatment',
      ),
    },
  ].map(o => row({
    category: 'K-Medical', subcategory: 'Dental',
    partner: 'Live Dental Hospital', partnerShort: 'Live Dental',
    currency: 'KRW',
    femaleDoctor: false, prayerRoom: false, dietary: 'none',
    address: 'Seoul Gangnam-gu',
    source: '1. K-Medical',
    highlights: nl(
      '* Premium implant packages combining Korean and Swiss-brand systems',
      '* Bone graft included in all implant packages — no hidden add-on costs',
      '* Highly competitive pricing compared to Western dental clinics',
    ),
    ...o,
  })),

  // ── Interpreter: TRABIC ───────────────────────────────────────────────────────
  ...[
    { variant: '1h', price: 800000, durVal: 1, durUnit: 'hours' },
    { variant: '6h', price: 1000000, durVal: 6, durUnit: 'hours',
      notes: 'Overtime: +₩200,000/h' },
  ].map(o => row({
    category: 'Subpackage', subcategory: 'Interpreter',
    partner: 'TRABIC', partnerShort: 'TRABIC',
    name: 'Arabic-Korean Interpretation',
    currency: 'KRW', dietary: 'none',
    phone: '02-2652-2645 / 010-5805-5505', email: 'service@trabic.kr',
    url: 'https://trabic.kr/',
    source: '7. Interpreter',
    highlights: '* Professional Arabic-Korean interpretation for medical and VIP tourism contexts',
    desc: '* Professional Arabic-Korean simultaneous and consecutive interpretation\n* Specialized in medical, business, and VIP tourism settings\n* Based in Seoul; available nationwide',
    ...o,
  })),

  // ── Interpreter: VERITAS ─────────────────────────────────────────────────────
  ...[
    { variant: 'General · 8h',       price: 1012000, durVal: 8, durUnit: 'hours' },
    { variant: 'Professional · 8h',  price: 2420000, durVal: 8, durUnit: 'hours' },
  ].map(o => row({
    category: 'Subpackage', subcategory: 'Interpreter',
    partner: 'VERITAS', partnerShort: 'VERITAS',
    name: 'Arabic-Korean Interpretation',
    currency: 'KRW', dietary: 'none',
    email: 'service@veritasco.co.kr',
    url: 'https://m.blog.naver.com/veritas614/224103518574',
    source: '7. Interpreter',
    highlights: '* Certified professional Arabic-Korean interpreters with VIP and medical expertise',
    desc: nl(
      '* Professional Arabic-Korean interpretation (General or Senior/Professional level)',
      '* 8-hour daily rate; overtime billed separately',
      '* Experienced with VIP clients, medical consultations, and high-profile engagements',
    ),
    ...o,
  })),

  // ── K-Starcation: World K-POP Center ─────────────────────────────────────────
  // Source: K-Starcation/K-STARCATION 프로그램 내용,가격 - 복사본.xlsx (3 packages only)
  // v18 had 4 rows — 4th "Special Custom" row is phantom; notes were K-Beauty contamination.
  ...[
    {
      name: 'K-POP CAMP · Basic', price: 3000000,
      durVal: 3, durUnit: 'days',
      desc: nl(
        '* Group K-POP basic training (vocal & dance fundamentals)',
        '* K-POP idol hair & makeup styling',
        '* Premium studio profile photo shoot',
        '* Short-form (Reels/Shorts) challenge video production',
        '* Official completion certificate issued',
      ),
    },
    {
      name: 'K-POP CAMP · Gold', price: 4000000,
      durVal: 5, durUnit: 'days',
      desc: nl(
        '* Small-group intensive K-POP training (vocal, dance, stage performance)',
        '* Premium idol styling (stage costume fitting available on request)',
        '* Individual concept photo shoot (album-style)',
        '* Professional studio music recording session',
        '* Highlight music video (MV) production',
        '* Performance showcase at venue',
        '* Completion certificate issued',
      ),
    },
    {
      name: 'K-POP CAMP · Platinum', price: 5500000,
      durVal: 5, durUnit: 'days',
      desc: nl(
        '* 1:1 master training with dedicated vocal/dance director',
        '* VVIP dedicated styling and custom stage design',
        '* Solo original track production & recording',
        '* Full-length solo music video (MV) production',
        '* Private showcase performance',
        '* Dedicated protocol & VIP care (prayer room / halal catering etc.)',
        '* Entertainment agency audition visit',
      ),
    },
  ].map(o => row({
    category: 'K-Starcation', subcategory: 'K-POP Camp',
    partner: 'World K-POP Center', partnerShort: 'World K-POP Center',
    currency: 'KRW', dietary: 'halal_friendly', prayerRoom: true,
    address: 'Seoul',
    source: 'K-Starcation',
    highlights: nl(
      '* Premium residence accommodation and small-group K-POP experience',
      '* Professional video production team, trending short-form content creation',
      '* Halal/vegan catering, ISO-certified dance & vocal courses',
      '* Dedicated instructor, staff, and simultaneous interpretation guide',
    ),
    notes: 'Includes premium residence accommodation; halal/vegan catering available; ISO-certified course',
    ...o,
  })),

  // ── Vehicle: Noble Klasse ─────────────────────────────────────────────────────
  row({
    category: 'Subpackage', subcategory: 'Vehicle',
    partner: 'Noble Klasse', partnerShort: 'Noble Klasse',
    name: 'Halal-Certified VIP Limousine',
    variant: 'Noble Klasse Solati S11',
    price: 0, currency: 'KRW', dietary: 'halal_friendly',
    prayerRoom: true,
    phone: '(inquire via partner)',
    source: '6. Vehicle',
    highlights: nl(
      '* World\'s first halal-certified limousine service in Korea',
      '* In-vehicle prayer space specifically designed for Muslim passengers',
      '* Enables prayers at any time without stopping — ideal for busy itineraries',
    ),
    desc: nl(
      '* Noble Klasse Solati S11 — world\'s first halal-certified limousine in Korea',
      '* Dedicated in-vehicle prayer space with qibla direction, prayer mat provided',
      '* Muslim VIP-optimized mobility service for travel, sightseeing, and medical visits',
      '* Price on inquiry',
    ),
    notes: 'Price on inquiry',
  }),

  // ── Vehicle: Grand Limousine Korea ───────────────────────────────────────────
  ...[
    { variant: 'Luxury Sedan (Genesis G90) · 8h',          price: 450000,  notes: 'Overtime: +₩50,000/h; seats 4' },
    { variant: 'Premium SUV (Mercedes-Benz S580) · 8h',     price: 800000,  notes: 'Overtime: +₩70,000/h; seats 6' },
    { variant: 'Sprinter Limousine (9-seat) · 8h',          price: 800000,  notes: 'Overtime: +₩70,000/h; seats 9' },
    { variant: 'Limousine Bus (28/45-seat) · 8h',            price: 0,       notes: 'Price on inquiry' },
  ].map(o => row({
    category: 'Subpackage', subcategory: 'Vehicle',
    partner: 'Grand Limousine Korea', partnerShort: 'Grand Limousine',
    name: 'Charter Service',
    currency: 'KRW', dietary: 'none',
    phone: '1644-1065', email: 'baboo-1052@naver.com',
    url: 'https://www.grandlimousine.co.kr/home',
    source: '6. Vehicle',
    highlights: '* Premium vehicle charter service with experienced VIP drivers; English-speaking drivers available on request',
    desc: nl(
      '* 8-hour charter includes driver; base fare covers up to 8h',
      '* Fuel, tolls, parking, and driver meals/accommodation not included',
      '* English-speaking driver available on request (additional charge)',
    ),
    durVal: 8, durUnit: 'hours',
    ...o,
  })),

  // ── Vehicle: CK Company ───────────────────────────────────────────────────────
  ...[
    { variant: 'Luxury Sedan (Genesis G90 RS4) · 10h', price: 850000 },
    { variant: 'Luxury Sedan (Mercedes-Benz S-Class) · 10h', price: 850000 },
    { variant: 'Sprinter VIP · 10h',                    price: 850000 },
  ].map(o => row({
    category: 'Subpackage', subcategory: 'Vehicle',
    partner: 'CK Company', partnerShort: 'CK Company',
    name: 'Charter Service',
    currency: 'KRW', dietary: 'none',
    phone: '1688-2271', email: 'ckkoreacom@naver.com',
    url: 'http://ckkorea.net/',
    source: '6. Vehicle',
    highlights: '* Flat-rate VIP charter service with latest luxury vehicle fleet; uniform pricing across all models',
    desc: nl(
      '* 10-hour charter includes driver; all three vehicle types priced equally',
      '* Latest model fleet: Genesis G90 RS4 / Mercedes S-Class / Mercedes Sprinter VIP',
      '* Fuel, tolls, parking, and driver meals/accommodation not included',
    ),
    durVal: 10, durUnit: 'hours',
    ...o,
  })),

  // ── Vehicle: VIP Limousine Korea ─────────────────────────────────────────────
  ...[
    { variant: 'Genesis G90 Long Wheel Limousine · 9h',      price: 800000, notes: 'OT charged after 9h (09:00–18:00 standard)' },
    { variant: 'Mercedes Sprinter Limousine 519 · 9h',        price: 800000, notes: 'OT charged after 9h; seats 9/11/12' },
    { variant: 'Limousine Bus (20/28-seat) · 9h',             price: 0,      notes: 'Price on inquiry' },
  ].map(o => row({
    category: 'Subpackage', subcategory: 'Vehicle',
    partner: 'VIP Limousine Korea', partnerShort: 'VIP Limo Korea',
    name: 'Charter Service',
    currency: 'KRW', dietary: 'none',
    phone: '1877-6411 / 010-7599-6411', email: 'limousines-korea@naver.com',
    url: 'https://limousines-korea.com/',
    source: '6. Vehicle',
    highlights: '* Premium VIP limousine service catering to foreign VIP visitors, corporate delegations, and government officials',
    desc: nl(
      '* 9-hour charter (09:00–18:00); overtime billed per hour after 18:00',
      '* Eligible clients: foreign VIPs/buyers, government bodies, corporate accounts',
      '* Fuel, tolls, parking, and driver meals/accommodation billed separately',
    ),
    durVal: 9, durUnit: 'hours',
    ...o,
  })),

  // ── Vehicle: Merit Limousine (replaces old single row) ───────────────────────
  ...[
    { variant: 'Mercedes-Benz S580L 4MATIC · 8h',       price: 880000,  notes: 'Overtime: +₩132,000/h; seats 4 max. Fuel/tolls/meals billed separately.' },
    { variant: 'Sprinter R-VIP Crystal · 8h',            price: 1320000, notes: 'Overtime: +₩132,000/h; seats 8 max. Fuel/tolls/meals billed separately.' },
    { variant: 'Sprinter Business 15 · 8h',              price: 660000,  notes: 'Seats 14 max. Fuel/tolls/meals billed separately.' },
  ].map(o => row({
    category: 'Subpackage', subcategory: 'Vehicle',
    partner: 'Merit Limousine', partnerShort: 'Merit',
    name: 'Charter Service',
    currency: 'KRW', dietary: 'none',
    phone: '010-5215-2467', email: 'ktw1358@hanmail.net',
    url: 'https://meritlimo.kr/Reservation',
    source: '6. Vehicle',
    highlights: '* Premium Mercedes fleet; vehicle-only or vehicle + driver options available; English-speaking drivers on request',
    desc: nl(
      '* 8-hour charter with driver; vehicle-only (24h) also available',
      '* English-speaking driver: additional surcharge applies',
      '* 24h vehicle-only option: ₩55,000 own insurance per day',
      '* Fuel, tolls, driver meals/accommodation billed after the event',
    ),
    durVal: 8, durUnit: 'hours',
    ...o,
  })),
];

// ── K-Wellness rows (rebuilt from Internal_Price 3-1 through 3-4) ──────────────
// All non-Spa K-Wellness rows were corrupted in v18. Rebuilt here from source data.
// Prices from Internal_Price are in 1,000 KRW units (e.g. 860 → ₩860,000).

const kwellnessRows = [
  // ── Shopping ──────────────────────────────────────────────────────────────────
  row({
    category: 'K-Wellness', subcategory: 'Shopping',
    partner: 'Korea Grand Sale', partnerShort: 'Korea Grand Sale',
    name: 'Korea Grand Sale Shopping Festival',
    price: 0, currency: 'KRW',
    phone: '070-8789-5600', email: 'kgs2026.info@gmail.com',
    url: 'https://www.koreagrandsale.co.kr/main',
    address: 'Seoul Jongno-gu',
    source: '3-1. K-Wellness_Shopping',
    desc: nl(
      "* Korea's premier annual shopping, culture, and tourism festival",
      '* Welcome coupon book, K-theme zone experiences, photo zones & lucky draw',
      '* AI-powered shopping recommendations and K-Shopping Cart event',
      '* Covers: air/transport, shopping, accommodation, dining, beauty, health, and concierge services',
    ),
    highlights: nl(
      "* Nation's largest multi-sector shopping & tourism festival with K-cultural experiences",
      '* Exclusive foreign-visitor welcome coupons and themed activities included',
    ),
    notes: 'No fixed price — complimentary experiences; purchase costs at guest discretion',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Shopping',
    partner: 'KUMKANG OPTICAL', partnerShort: 'Kumkang Optical',
    name: 'Premium Optical & Eyewear',
    price: 0, currency: 'KRW',
    phone: '02-6243-1001',
    url: 'https://kumkangoptical.com/',
    address: 'Seoul (multiple branches)',
    source: '3-1. K-Wellness_Shopping',
    desc: nl(
      "* Korea's largest Lindberg dealer — premium international designer eyewear",
      '* State-of-the-art digital lens fitting and advanced 3D diagnostic equipment',
      '* Highly trained optometrists with precision fitting systems',
      '* Branches: Dogok, Samsung Medical Center, Apgujeong, KINTEX, Pangyo, Cheonho, Express Bus Terminal, Apgujeong Rodeo, Gwanggyo, Yeouido, Myeongdong, Jamsil',
    ),
    highlights: "* Korea's premier optical brand trusted by VIPs and presidents; 12+ branches across Seoul",
    notes: 'No fixed price — product costs at guest discretion',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Shopping',
    partner: 'OLIVE YOUNG', partnerShort: 'Olive Young',
    name: 'K-Beauty Shopping',
    price: 0, currency: 'KRW',
    phone: '02-736-5290',
    url: 'https://corp.oliveyoung.com/ko',
    address: 'Seoul (Myeongdong Town, Gangnam Town, Seongsu N flagship)',
    source: '3-1. K-Wellness_Shopping',
    desc: nl(
      "* Korea's first and largest health & beauty retail chain",
      '* Curated selection of K-cosmetics, health supplements, beauty tools, and lifestyle products',
      '* Mix of Korean indie brands and global favorites under one roof',
    ),
    highlights: '* Leading K-beauty destination; first stop for trendy Korean skincare and cosmetic brands',
    notes: 'No fixed price — product costs at guest discretion',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Shopping',
    partner: 'ART BOX', partnerShort: 'ART BOX',
    name: 'K-Stationery & Lifestyle Shopping',
    price: 0, currency: 'KRW',
    phone: '0507-1445-0819',
    url: 'https://recruit.artbox.kr/m/',
    address: 'Seoul (Myeongdong, multiple branches)',
    source: '3-1. K-Wellness_Shopping',
    desc: nl(
      "* Korea's first design-focused stationery and lifestyle brand",
      '* Pioneered the transformation of stationery into a design-driven lifestyle category',
      '* Stylish stationery, planners, home goods, and K-culture merchandise',
    ),
    highlights: '* Iconic K-stationery brand; a must-visit for design lovers and K-culture souvenir shopping',
    notes: 'No fixed price — product costs at guest discretion',
  }),

  // ── K-Content ─────────────────────────────────────────────────────────────────
  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'Life World tour', partnerShort: 'Life World Tour',
    name: 'K-POP Demon Hunters Tour',
    price: 860000, currency: 'KRW', priceUnit: 'per group',
    durVal: 1, durUnit: 'days',
    phone: '010-7711-0774 / 02-1688-5632', email: 'bulgom@lifeworldtour.com',
    url: 'https://lifeworldtour.co.kr/18/?idx=34',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* Immersive mission-based XR/AR K-POP adventure through iconic Seoul landmarks',
      '* Gyeongbokgung → Bukchon/Seochon → Myeongdong → VAN Entertainment DIY Workshop → Naksan Park → souvenir shopping',
      '* Includes: 1 van, English guide, professional photographer, and lunch',
      '* Min. 2 / max. 6–7 persons per group',
    ),
    highlights: nl(
      '* K-POP Demon Hunters world brought to life with cutting-edge XR/AR technology',
      '* Professional photographer and English guide included; mission-style immersive format',
    ),
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'Korea Trevel Easy', partnerShort: 'Korea Trevel Easy',
    name: 'SBS Inkigayo K-POP Concert Package',
    price: 240000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    phone: '010-7574-6474', email: 'info@koreatraveleasy.com',
    url: 'https://www.koreatraveleasy.com/product/sbs-inkigayo-k-pop-concert-music-show-ticket-package/',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* Live taping ticket for SBS Inkigayo at SBS Public Hall (every Sunday)',
      '* Walking tour with monthly-changing itinerary + transportation to SBS Public Hall',
      '* Passport required; exclusive to foreign visitors',
    ),
    highlights: nl(
      '* Attend a real K-POP music show taping (SBS Inkigayo) every Sunday',
      '* Exclusive foreign-visitor package: walking tour + live show entry',
    ),
    notes: 'Held every Sunday; passport required; limited availability — not guaranteed',
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'eTour', partnerShort: 'eTour',
    name: 'K-Drama Filming Location Tour (Seoul)',
    price: 103000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    phone: '02-323-6850',
    url: 'https://fi.koreaetour.com/tuote/Korean-draaman-yksityinen-kiertue/',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* Descendants of the Sun, Guardian: The Lonely and Great God, My Love From the Star filming locations',
      '* Route: Songdo Dalkomm Coffee → Songdo Central Park → Deoksugung → Hakrim Coffee → N Seoul Tower',
      '* Lunch at BBQ restaurant (Guardian filming site) included; private guide throughout',
    ),
    highlights: '* Visit real filming sites of three legendary K-dramas across Seoul and Incheon with private guide',
    notes: 'Price range ₩103,000–₩233,000 per person depending on group size/option',
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'eTour', partnerShort: 'eTour',
    name: 'K-Drama Filming Location Tour (Jeju)',
    price: 402000, currency: 'KRW', priceUnit: 'per group',
    durVal: 1, durUnit: 'days',
    phone: '02-323-6850',
    url: 'https://www.kkday.com/en-au/product/164626',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* Welcome to Samdal-ri, Extraordinary Attorney Woo, When Life Gives You Tangerines — Jeju filming locations',
      '* Route A: Gwaneumsa Temple, Secret Forest Andol-oreum, Gwangchigi Beach, Seongsan Ilchulbong, Seongiwpean Bakery',
      '* Route B: Dodubong Peak, Rainbow Coastal Road, Iho Taewooja Horse Lighthouses, Myeongwol Elementary School, Changsindo',
      '* Private guide-accompanied tour; vehicle included; meals at guest discretion',
    ),
    highlights: '* Explore Jeju K-drama filming sites from three beloved recent dramas with private guide',
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'GET YOUR GUIDE', partnerShort: 'Get Your Guide',
    name: 'Squid Game Tour (Incheon)',
    price: 231000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    url: 'https://www.getyourguide.com/ko-kr/incheon-l90654/squid-game-in-incheon-t1093485/',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* Visit Gyodong Elementary — a real Squid Game filming location',
      '* On-screen challenges: dalgona carving and punch machine',
      '* Retro "lunchbox" meal as seen on screen + sea-view monorail loop',
      '* Archery Café at Wolmi Island + Songdo Central Park mission game',
      '* Hotel pickup/drop-off included',
    ),
    highlights: '* Authentic Squid Game experience at real Incheon filming locations with themed missions and dining',
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'Korea Tour Tip', partnerShort: 'Korea Tour Tip',
    name: 'K-POP Idol VIP Experience',
    price: 539000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    email: 'master@koreatourtip.co.kr',
    url: 'https://www.koreatourtip.com/master/54126',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* VIP-only private K-POP idol experience — limited to 4 participants per day',
      '* K-POP idol dance training + vocal training → idol concept makeup → idol concept photo shoot',
      '* Lunch (Korean cuisine) included',
    ),
    highlights: nl(
      '* Ultra-exclusive private K-POP program: max. 4 guests per day',
      '* Full idol training experience — dance, vocals, makeup, and professional photo shoot',
    ),
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'DANCEJOA', partnerShort: 'DANCEJOA',
    name: 'K-POP One Day Dance Lesson',
    price: 200000, currency: 'KRW', priceUnit: 'per 2 persons',
    durVal: 120, durUnit: 'minutes',
    phone: '010-6478-7022',
    url: 'https://dancejoa.com/34',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* Private K-POP one-day dance class tailored to group skill level and purpose',
      '* Lesson counseling → instructor assignment → lesson start',
      '* Small-group format with professional choreography instructor; studio in Seoul',
    ),
    highlights: '* Customized private K-POP dance lesson; goal-oriented choreography by professional instructor',
    notes: '₩200,000 per 2 persons / 1 hour',
  }),

  ...[
    { variant: '1 Person', price: 213000 },
    { variant: '2 Persons', price: 400000 },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'K Look', partnerShort: 'K Look',
    name: 'K-Fashion Personal Shopping Tour',
    currency: 'KRW',
    durVal: 120, durUnit: 'minutes',
    phone: '02-3478-4131',
    url: 'https://www.klook.com/ko/activity/91909-seoul-shopping-tour/',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* 1-on-1 styling session with a professional Korean fashion stylist',
      '* 6–7 curated outfit recommendations per hour from popular Korean fashion brands',
      '* Final purchase decisions entirely at the guest discretion; Seoul Gangnam area',
    ),
    highlights: '* Personal shopping tour with a Korean stylist — hands-on K-fashion experience in Gangnam',
    ...o,
  })),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'Korea Trevel Easy', partnerShort: 'Korea Trevel Easy',
    name: 'K-Beauty Makeup & Hair Styling',
    price: 450000, currency: 'KRW',
    durVal: 240, durUnit: 'minutes',
    phone: '010-7574-6474', email: 'info@koreatraveleasy.com',
    url: 'https://www.koreatraveleasy.com/product/k-beauty-makeup-hairstyling-in-gangnam-seoul/',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      "* Professional K-Beauty styling at studios where Korean celebrities prepare for performances",
      '* Makeup + Hair Styling + Photoshoot package',
      '* Studio in Gangnam Cheongdam-dong, Dosan Park area; near Supreme, Louis Vuitton, Stussy',
    ),
    highlights: nl(
      '* Get styled at the same salon Korean entertainment stars use before shows',
      '* Complete K-Beauty transformation: hair, makeup, and professional photoshoot',
    ),
    notes: 'Pre-interview/booking consultation required via Google Form',
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'REHANNAIMAGE', partnerShort: 'REHANNAIMAGE',
    name: 'Master Style Consulting',
    price: 600000, currency: 'KRW',
    durVal: 300, durUnit: 'minutes',
    phone: '031-983-3704', email: 'rehannaimagecompany@naver.com',
    url: 'https://www.rehannaimagecompany.co.kr/stylecounsulting',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* I Style Consulting: professional image consulting — hair, makeup, personal color, and body type analysis',
      '* Fit Style Consulting: advanced body-type fit styling based on data from 15,000+ measurements',
      '* In-person analysis plus practical shopping guidance; combined I Style + Fit Style package (300 min)',
    ),
    highlights: '* Data-driven style consulting using 15,000+ measurement insights; comprehensive image overhaul',
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'Rarelee', partnerShort: 'Rarelee',
    name: 'VIP Private Consulting',
    price: 0, currency: 'KRW',
    phone: '070-8019-3318', email: 'contact@rarelee.co.kr',
    url: 'https://rarelee.co.kr/category/9/premium-consulting',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* Ultra-premium VIP offline service by prior inquiry only',
      '* Comprehensive consulting: hair, makeup, fashion, and signature style design',
      '* 1:1 customized analysis and style proposal; inquiries via email only',
    ),
    highlights: '* Exclusive VIP-only premium consulting; by appointment — not available as a walk-in service',
    notes: 'Price on inquiry; approx. ₩8,800,000 per person',
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'Merizzbeauty', partnerShort: 'Merizzbeauty',
    name: 'VIP Offline Consulting',
    price: 2200000, currency: 'KRW',
    email: 'merizzbeauty@gmail.com',
    url: 'https://merizzbeauty.com/shop_view/?idx=194',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* VIP private consulting by a team of specialist consultants',
      '* Includes: Beauty, Fashion, Hair, and Makeup consulting',
      '* KakaoTalk channel inquiries accepted',
    ),
    highlights: '* All-in-one VIP beauty & style consulting by a dedicated team of professional consultants',
    notes: 'Inquiries via KakaoTalk Channel',
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'COLOR PLACE', partnerShort: 'COLOR PLACE',
    name: 'Master Premium Personal Color Diagnosis',
    price: 400000, currency: 'KRW',
    durVal: 150, durUnit: 'minutes',
    phone: '02-3443-5461', email: 'colorplace@colorplace.co.kr',
    url: 'https://colorplace.co.kr/consulting8.html',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* 25-type detailed seasonal tone color draping analysis',
      '* Color cosmetics, fashion style, accessories, perfume, glasses/lens, and nail recommendations',
      '* Body structure analysis + strategic fashion coaching + signature image consulting',
    ),
    highlights: '* Comprehensive personal color diagnosis covering 25 sub-tones with full image and fashion coaching',
  }),

  row({
    category: 'K-Wellness', subcategory: 'K-Content',
    partner: 'NEUF COULEUR', partnerShort: 'NEUF COULEUR',
    name: 'Palette Premium Personal Color Diagnosis',
    price: 250000, currency: 'KRW',
    durVal: 150, durUnit: 'minutes',
    phone: '0507-1351-0014', email: 'contact@neufcouleur.com',
    url: 'https://neufcouleur.com/Home',
    source: '3-2. K-Wellness_K-Content',
    desc: nl(
      '* In-depth personal color diagnosis after body color analysis',
      '* Hair, jewelry, and lens color recommendations',
      '* Face zone mini analysis + fashion coaching + perfume, necklace, earring, ring, and watch recommendations',
    ),
    highlights: '* Refined personal color and image consulting with detailed color palette and accessory guidance',
  }),

  // ── Tour ──────────────────────────────────────────────────────────────────────
  row({
    category: 'K-Wellness', subcategory: 'Tour',
    partner: 'COSMOJIN', partnerShort: 'COSMOJIN',
    name: 'Seoul City Tour',
    price: 220000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    phone: '1644-8230', email: 'master@koreatourtip.co.kr',
    url: 'https://home.cosmojin.com/korea-package/detail.php?idx=41',
    address: 'Seoul',
    source: '3-3. K-Wellness_TOUR',
    desc: nl(
      '* VIP Special Full-Day Seoul City Tour — min. 4 persons / 09:00–17:30',
      '* Hotel → City Hall/Gwanghwamun/Cheonggyecheon → Royal Guard Ceremony → Gyeongbokgung → National Folk Museum',
      '* → Amethyst/Ginseng Center → N Seoul Tower → Lunch → Changdeokgung → Insadong → Han River Cruise → Hotel',
      '* Private vehicle, professional English guide, and lunch included',
    ),
    highlights: nl(
      '* Full-day premium private Seoul tour covering history, culture, and scenic landmarks',
      '* Private vehicle + English guide + lunch all included',
    ),
    notes: 'Mondays: Changdeokgung → Bukchon Hanok Village; min. 4 persons',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Tour',
    partner: 'Gold Sky Tour', partnerShort: 'Gold Sky Tour',
    name: 'Seoul City Night Tour',
    price: 90000, currency: 'KRW',
    durVal: 4, durUnit: 'hours',
    phone: '02-2039-5882', email: 'hi@goldskytour.com',
    url: 'https://www.goldskytour.com/night-tour',
    address: 'Seoul',
    source: '3-3. K-Wellness_TOUR',
    desc: nl(
      '* Bamdokkaebi (Night Goblin) night driving tour of Seoul illuminated landmarks',
      '* Route: Gwanghwamun Square → Cheonggyecheon → DDP → N Seoul Tower → Han River Park → Banpo Moonbow Fountain → Itaewon',
      '* English-speaking guide; exclusive to foreign visitors; passport required',
    ),
    highlights: '* Seoul after dark — iconic landmarks lit up at night with English guide and scenic driving route',
    notes: 'Passport required',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Tour',
    partner: 'KOREA TOUR NET', partnerShort: 'Korea Tour Net',
    name: 'Islamic Seoul City Tour',
    price: 85000, currency: 'KRW',
    durVal: 4, durUnit: 'hours',
    phone: '070-7792-3001', email: 'phc@koreatournet.kr',
    url: 'http://www.koreatournet.kr/islamic2type.php',
    address: 'Seoul',
    prayerRoom: true, dietary: 'halal_friendly',
    source: '3-3. K-Wellness_TOUR',
    desc: nl(
      '* Muslim-only private Seoul city tour with halal meals and dedicated prayer time',
      '* Route: Hotel → Hanbok → Royal Guard Ceremony → Gyeongbokgung → N Seoul Tower → Itaewon Mosque → Halal Lunch → Prayer Time → Bukchon Village → Dongdaemun Market → Gwangjang Market → Myeongdong',
      '* Includes: private vehicle, halal lunch, entrance fees, Arabic/English guide',
    ),
    highlights: nl(
      '* Fully Muslim-friendly Seoul tour with halal dining and prayer time arranged',
      '* Arabic and English-speaking guide; private vehicle included',
    ),
  }),

  row({
    category: 'K-Wellness', subcategory: 'Tour',
    partner: 'COSMOJIN', partnerShort: 'COSMOJIN',
    name: 'DMZ + NLL Tour',
    price: 160000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    phone: '1644-8232', email: 'master@koreatourtip.co.kr',
    url: 'https://home.cosmojin.com/korea-package/detail.php?idx=65',
    address: 'Imjingak / Ganghwa Island, Gyeonggi-do',
    source: '3-3. K-Wellness_TOUR',
    desc: nl(
      '* VIP Private DMZ + NLL Tour — min. 4 persons / 07:00–17:30',
      '* Route: Hotel → Imjingak → Unification Bridge → Passport check → DMZ Theater & Exhibition → 3rd Tunnel → Dora Observatory → Unification Village → Lunch → Ganghwa Island coastal fence → Ganghwa Peace Observatory → Hotel',
      '* Private vehicle and professional guide; lunch included',
    ),
    highlights: nl(
      "* Exclusive VIP tour to the Korean DMZ and NLL — Korea's most politically significant restricted zones",
      '* Includes 3rd Tunnel, Dora Observatory, and Ganghwa Island NLL area',
    ),
    notes: 'Mondays & public holidays: closed; passport required; no photography in restricted areas',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Tour',
    partner: 'KOREA TOUR NET', partnerShort: 'Korea Tour Net',
    name: 'Islamic Nami Island Tour',
    price: 120000, currency: 'KRW',
    durVal: 4, durUnit: 'hours',
    phone: '070-7792-3001', email: 'phc@koreatournet.kr',
    url: 'http://www.koreatournet.kr/',
    address: 'Nami Island, Gangwon-do',
    prayerRoom: true, dietary: 'halal_friendly',
    source: '3-3. K-Wellness_TOUR',
    desc: nl(
      '* Muslim-only private tour to Nami Island and Garden of Morning Calm',
      '* Route: Hotel → Nami Island → Halal lunch → Prayer time → Garden of Morning Calm → Hotel or Myeongdong',
      '* Includes: private vehicle, halal lunch, Arabic/English guide',
    ),
    highlights: '* Muslim-friendly private nature tour combining Nami Island and the Garden of Morning Calm',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Tour',
    partner: 'LOTTE TOUR', partnerShort: 'LOTTE TOUR',
    name: 'Jeju Island Private Tour',
    price: 686000, currency: 'KRW',
    durVal: 3, durUnit: 'days',
    phone: '1577-3000',
    url: 'https://www.lottetour.com/evtList/851/938/943/944?godId=65289',
    address: 'Jeju Island',
    source: '3-3. K-Wellness_TOUR',
    desc: nl(
      '* Private 3-day Jeju Island tour with Grand Hyatt Jeju accommodation',
      '* Inclusions: round-trip airfare, Grand Hyatt Jeju, private vehicle + driver (Solati 4–10P / Combi Bus 11P+)',
      '* Meals per itinerary (breakfast, lunch, one dinner daily)',
      '* Admission: Pacific Marina Yacht, Hwansang Forest Gotjawal Park + foot bath, full-body massage',
      '* Travel insurance included; itinerary customizable',
    ),
    highlights: nl(
      '* Fully inclusive luxury 3-day Jeju tour: Grand Hyatt, private driver, yacht, and spa massage',
      '* Travel insurance and all admission fees included',
    ),
    notes: 'Price range ₩686,000–₩1,165,000 per person depending on season/group configuration',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Tour',
    partner: 'LOTTE TOUR', partnerShort: 'LOTTE TOUR',
    name: 'Jeju Island Golf Tour',
    price: 887000, currency: 'KRW',
    durVal: 3, durUnit: 'days',
    phone: '1577-3000',
    url: 'https://www.lottetour.com/evtList/851/2750/2751/2752?godId=57906',
    address: 'Jeju Island',
    source: '3-3. K-Wellness_TOUR',
    desc: nl(
      '* Premium 3-day Jeju golf tour with Blackstone Villa Suite accommodation',
      '* 3 rounds of 18-hole golf: 2 rounds at Blackstone CC + 1 round at Elysian CC',
      '* Both courses ranked in Asia Top 100; 2 nights private villa; private vehicle',
      '* Meals not included',
    ),
    highlights: nl(
      "* Play three rounds at Jeju's top-ranked courses: Blackstone CC and Elysian CC (Asia Top 100)",
      '* Blackstone Villa Suite accommodation with private vehicle',
    ),
    notes: 'Price range ₩887,000–₩1,245,000 per person depending on season/group size',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Tour',
    partner: 'Gyeongsangbuk-do Cultural Tourism', partnerShort: 'Gyeongbuk Tourism',
    name: 'Gyeongbuk Tourpass',
    price: 17000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    phone: '1522-2089',
    url: 'https://www.gbtourpass.kr/Tourpass/view?seq=iBb2419',
    address: 'Gyeongsangbuk-do',
    source: '3-3. K-Wellness_TOUR',
    desc: nl(
      '* Free-pass ticket for major paid attractions across Gyeongsangbuk-do',
      '* Single barcode grants 24/48/72-hour unlimited access to multiple attractions',
      '* Covers: Gyeongju, Pohang, Ulleungdo, and partner cafés; various route options',
    ),
    highlights: '* Cost-effective multi-attraction pass for Gyeongsangbuk-do — one barcode, 24/48/72 hours',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Tour',
    partner: 'NATOUR', partnerShort: 'NATOUR',
    name: 'Busan One-Night Cruise',
    price: 600000, currency: 'KRW',
    durVal: 2, durUnit: 'days',
    phone: '051-714-3133', email: 'info@natour.co.kr',
    url: 'https://www.natour.co.kr/shop_view/?idx=186',
    address: 'Busan',
    source: '3-3. K-Wellness_TOUR',
    desc: nl(
      '* Busan Fanstar one-night luxury cruise departing from Busan Port',
      '* Inclusions: Panstar Bridge Tour, onboard dinner buffet, live performances and events, fireworks',
      '* Breakfast included on return; operates every Saturday (rotating routes)',
    ),
    highlights: nl(
      '* Overnight luxury cruise from Busan with fireworks, live shows, and scenic Korea Strait seascape',
      '* All-inclusive: dinner buffet, breakfast, entertainment, and duty-free shopping',
    ),
    notes: 'Price range ₩600,000–₩650,000 per person; passport required; Saturdays only',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Tour',
    partner: 'HAERANG', partnerShort: 'HAERANG',
    name: 'Grand Tour of Korea by Rail Cruise',
    price: 3540000, currency: 'KRW', priceUnit: 'per 2 persons',
    durVal: 3, durUnit: 'days',
    phone: '1544-7755', email: 'haerang@korailtravel.com',
    url: 'https://www.railcruise.co.kr/website/rc_course_info.asp?1',
    address: 'Seoul → Suncheon → Busan → Gyeongju → Jeongdongjin → Donghae',
    source: '3-3. K-Wellness_TOUR',
    desc: nl(
      "* 3-day nationwide AURA rail cruise across Korea's most scenic regions",
      '* Route: Suncheon → Yeosu → Busan → Gyeongju → Jeongdongjin → Donghae → Seoul',
      '* All-inclusive: train fare, connecting buses, onboard accommodation, all meals & snacks, beverages, entrance & activity fees, onboard events',
    ),
    highlights: nl(
      "* All-inclusive 3-day luxury rail journey through Korea's most beautiful scenic regions",
      '* Accommodation, meals, entrance fees, and entertainment all included on Rail Cruise Haerang',
    ),
    notes: 'Price range ₩3,540,000–₩3,710,000 per 2 persons',
  }),

  // ── Leisure — Ski ─────────────────────────────────────────────────────────────
  ...[
    { variant: 'Ski/Board Rental + Lift', price: 111000 },
    { variant: 'Ski/Board Lesson', price: 200000, notes: 'Lesson price range ₩200,000–₩400,000 per group' },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'TATATA RENTAL SHOP', partnerShort: 'TATATA',
    name: 'MONA Yongpyong Ski Package',
    currency: 'KRW', durVal: '1–2', durUnit: 'days',
    phone: '010-4994-5060', email: 'kyc1120@naver.com',
    url: 'https://www.tatataski.com/',
    address: 'MONA Yongpyong Resort, Gangwon-do Pyeongchang',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      "* MONA Yongpyong Resort — Korea's largest ski resort; 28 slopes, 14 lifts, 13 FIS-certified runs",
      '* Rental: ski/snowboard equipment and clothing; lift ticket included',
      '* Lesson: professional instructor (group or private); separate pricing',
    ),
    highlights: "* Korea's largest and most prestigious ski resort; FIS-certified slopes; full rental & lesson service",
    ...o,
  })),

  ...[
    { variant: 'Ski/Board Rental + Lift', price: 120000 },
    { variant: 'Ski/Board Lesson', price: 150000, notes: 'Lesson price range ₩150,000–₩360,000 per group' },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'SERENO SKISHOP', partnerShort: 'SERENO',
    name: 'High 1 Resort Ski Package',
    currency: 'KRW', durVal: '1–2', durUnit: 'days',
    phone: '010-5716-1369',
    url: 'https://serenoskishop.com/',
    address: 'High 1 Resort, Gangwon-do Jeongseon',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* High 1 Resort — 15 FIS-certified slopes, 5 lifts, 3 gondolas; sleigh riding also available',
      '* Rental: ski/snowboard equipment and clothing; lift ticket included',
      '* Lesson: professional instructor available',
    ),
    highlights: '* FIS-certified 15-slope resort with gondola access; complete rental and lesson service',
    ...o,
  })),

  ...[
    { variant: 'Ski/Board Rental + Lift', price: 150000 },
    { variant: 'Ski/Board Lesson', price: 140000, notes: 'Lesson price range ₩140,000–₩240,000 per group' },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'NUMBER.1 RENTALSHOP', partnerShort: 'NUMBER.1',
    name: 'Vivaldi Park Ski Package',
    currency: 'KRW', durVal: '1–2', durUnit: 'days',
    phone: '010-2312-9202', email: 'gudwns2695@naver.com',
    url: 'https://smartstore.naver.com/number1rentalshop',
    address: 'Vivaldi Park Resort, Gangwon-do Hongcheon',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* Vivaldi Park Resort — 13 slopes, 10 lifts',
      '* Rental: ski/snowboard equipment and clothing; lift ticket included',
      '* Lesson: professional instructor available',
    ),
    highlights: '* Popular ski destination near Seoul with 13 slopes; full rental and lesson service',
    ...o,
  })),

  ...[
    { variant: 'Ski/Board Rental + Lift', price: 159000 },
    { variant: 'Ski/Board Lesson', price: 150000, notes: 'Lesson price range ₩150,000–₩360,000 per group' },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'V SKI', partnerShort: 'V SKI',
    name: 'Konjiam Resort Ski Package',
    currency: 'KRW', durVal: '1–2', durUnit: 'days',
    phone: '031-769-9997', email: 'yachacom@naver.com',
    url: 'https://smartstore.naver.com/vski',
    address: 'Konjiam Resort, Gyeonggi-do Gwangju',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* Konjiam Resort — 9 slopes, 5 lifts; closest major ski resort to Seoul',
      '* Rental: ski/snowboard equipment and clothing; lift ticket included',
      '* Lesson: professional instructor available',
    ),
    highlights: '* Closest major ski resort to Seoul; ideal for day trips; full rental and lesson service',
    ...o,
  })),

  // ── Leisure — Water Parks ─────────────────────────────────────────────────────
  ...[
    { variant: 'Middle Season Pass', price: 55000 },
    { variant: 'High Season Pass', price: 65000 },
    { variant: 'Gold Season Pass', price: 79000 },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'Caribbean Bay', partnerShort: 'Caribbean Bay',
    name: 'Caribbean Bay Water Park',
    currency: 'KRW', durVal: 1, durUnit: 'days',
    phone: '031-320-5000',
    url: 'https://www.everland.com/caribbeanbay/home/main',
    address: 'Everland Resort, Gyeonggi-do Yongin',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      "* Caribbean Bay — Korea's premier water park at Everland Resort",
      '* Caribbean-themed: wave pool, diving pool, surfing ride, and slides',
      '* Seasonal pricing (Middle / High / Gold season)',
    ),
    highlights: "* Korea's largest and most popular water park with Caribbean ocean theme",
    ...o,
  })),

  ...[
    { variant: 'Mid-Summer Pass', price: 74000 },
    { variant: 'Hot Summer Pass (Early)', price: 79000 },
    { variant: 'Hot Summer Pass (Peak)', price: 89000 },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'Ocean World', partnerShort: 'Ocean World',
    name: 'Ocean World Water Park',
    currency: 'KRW', durVal: 1, durUnit: 'days',
    phone: '1588-4888', email: 'webmaster@daemyungsono.com',
    url: 'https://www.sonohotelsresorts.com/oceanWorld',
    address: 'Vivaldi Park Resort, Gangwon-do Hongcheon',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* Ocean World — large-scale water park at Vivaldi Park Resort',
      '* Ancient Egyptian theme: wave pool, mega slides, and adventure zones',
      '* Seasonal pricing (Mid-Summer / Hot Summer)',
    ),
    highlights: "* Vivaldi Park's flagship water park with Egyptian theme and wide range of slide attractions",
    ...o,
  })),

  ...[
    { variant: 'Normal Season (6h)', price: 50000 },
    { variant: 'Peak Season (6h)', price: 60000 },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'Cimer', partnerShort: 'Cimer',
    name: 'Cimer Spa & Water Park',
    currency: 'KRW', durVal: 6, durUnit: 'hours',
    phone: '1833-8855', email: 'p-city@paradian.com',
    url: 'https://www.p-city.com/front/cimer/overview',
    address: 'Paradise City Resort, Incheon Jung-gu',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      "* Cimer — Paradise City's upscale spa & water park",
      '* European art-spa aesthetics + pool party + Korean-style sauna (jjimjilbang)',
      '* Slides, infinity pool; 6-hour pass; seasonal pricing',
    ),
    highlights: '* Luxury spa water park combining European art-spa and Korean sauna aesthetics at Paradise City',
    ...o,
  })),

  // ── Leisure — Water Leisure ───────────────────────────────────────────────────
  row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'Le Point Water Leisure', partnerShort: 'Le Point',
    name: 'Water Leisure Day Package',
    price: 75000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    phone: '010-8233-1426',
    url: 'https://lepoint.qrsvc.kr/',
    address: 'Gyeonggi-do Gapyeong',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* 1-day pass: unlimited water park access + 1-time jet boat ride',
      '* Water skiing, wakeboarding, towable rides, slides, and unlimited BBQ included',
    ),
    highlights: '* Full-day river water leisure with jet boat, water ski, and unlimited BBQ in scenic Gapyeong',
  }),

  row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'RIVER LAND', partnerShort: 'RIVER LAND',
    name: 'Water Leisure Afternoon Package',
    price: 59000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    phone: '010-5337-5534',
    url: 'http://www.riverland.co.kr/',
    address: 'Gyeonggi-do Gapyeong',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* Afternoon pass: water park access + 1-time jet boat ride',
      '* Water skiing, wakeboarding, towable rides, slides, and unlimited BBQ included',
    ),
    highlights: '* Affordable afternoon water leisure with jet boat and unlimited BBQ in Gapyeong',
  }),

  // ── Leisure — Sports ──────────────────────────────────────────────────────────
  ...[
    { variant: '20-Person Skybox', price: 2400000, priceUnit: 'per team' },
    { variant: '9-Person Skybox', price: 1080000, priceUnit: 'per team' },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'Kiwoom Heroes (Gocheok)', partnerShort: 'Kiwoom Heroes',
    name: 'Baseball Skybox (Kiwoom Heroes)',
    currency: 'KRW', durVal: 4, durUnit: 'hours',
    url: 'https://heroesbaseball.co.kr/index.do',
    address: 'Gocheok Sky Dome, Seoul Guro-gu',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* VIP Skybox at Gocheok Sky Dome for Kiwoom Heroes games',
      '* Dedicated entrance via Central C Gate, private parking, mascot photo service',
    ),
    highlights: "* VIP skybox at Korea's top covered baseball dome; exclusive private entrance and parking",
    ...o,
  })),

  ...[
    { variant: 'Weekday Skybox', price: 71000 },
    { variant: 'Weekend Skybox', price: 77000 },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'SSG Landers', partnerShort: 'SSG Landers',
    name: 'Baseball Skybox (SSG Landers)',
    currency: 'KRW', durVal: 4, durUnit: 'hours',
    url: 'https://www.ssglanders.com/main',
    address: 'Incheon SSG Landers Field, Incheon Michuhol-gu',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* VIP Skybox at Incheon SSG Landers Field for SSG Landers games',
      '* Premium private skybox seating; food and beverages available in-seat',
    ),
    highlights: "* Premium baseball skybox at Incheon's modern stadium; weekday/weekend seasonal pricing",
    ...o,
  })),

  row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'FC Seoul', partnerShort: 'FC Seoul',
    name: 'Soccer Skybox (FC Seoul)',
    price: 2970000, currency: 'KRW', priceUnit: 'per team',
    durVal: 3, durUnit: 'hours',
    address: 'Seoul World Cup Stadium, Seoul Mapo-gu',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* VIP Skybox at Seoul World Cup Stadium for FC Seoul matches',
      '* Private skybox with premium stadium views and in-seat dining service',
    ),
    highlights: "* VIP soccer skybox at Seoul's iconic World Cup Stadium; private group viewing experience",
    notes: '₩2,970,000 per team/group',
  }),

  // ── Leisure — Theme Parks ─────────────────────────────────────────────────────
  ...[
    { variant: '5-Ride Magic Pass', price: 54000 },
    { variant: '7-Ride Magic Pass', price: 75000 },
  ].map(o => row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'LOTTE WORLD', partnerShort: 'Lotte World',
    name: 'Lotte World 1-Day Pass + Magic Pass',
    currency: 'KRW', durVal: 1, durUnit: 'days',
    phone: '1661-2000',
    address: 'Seoul Songpa-gu',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* 1-Day Pass to Lotte World (indoor + outdoor) with Magic Pass for priority attraction access',
      '* 5-ride or 7-ride Magic Pass options; no queuing at priority attractions',
    ),
    highlights: "* Lotte World with priority access pass — skip queues at Korea's most popular indoor theme park",
    ...o,
  })),

  row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'EVER LAND', partnerShort: 'Everland',
    name: 'Everland Dream Tour',
    price: 350000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    phone: '031-325-0000',
    address: 'Gyeonggi-do Yongin',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* Everland Dream Tour — VIP guided park experience with full priority access',
      '* Dedicated parking, front gate priority entry, private guide throughout the park',
      '* Priority boarding at all major attractions; commemorative photo; restaurant meal included',
      '* Safari Special Tour (subject to availability)',
    ),
    highlights: nl(
      '* VIP Everland experience with personal guide, priority access, and restaurant dining',
      '* No waiting in queues — dedicated guide escorts through all major attractions',
    ),
  }),

  row({
    category: 'K-Wellness', subcategory: 'Leisure',
    partner: 'Seoul Land', partnerShort: 'Seoul Land',
    name: 'Seoul Land 1-Day Pass',
    price: 52000, currency: 'KRW',
    durVal: 1, durUnit: 'days',
    phone: '02-509-6000',
    address: 'Gyeonggi-do Gwacheon',
    source: '3-4. K-Wellness_Leisure',
    desc: nl(
      '* Full-day access to Seoul Land amusement park in Gwacheon',
      '* Classic Korean theme park with rides, attractions, and family entertainment',
    ),
    highlights: '* Family-friendly classic Korean theme park; affordable full-day access pass',
  }),
];

// ── combine all rows + renumber sort_order ─────────────────────────────────────
const allRows = [...rows, ...newRows, ...kwellnessRows];
allRows.forEach((r, i) => { r[26] = i + 1; }); // sort_order

// ── write v20 with ExcelJS ─────────────────────────────────────────────────────
const SHEET_ORDER = [
  'K-Medical',
  'K-Beauty',
  'K-Wellness',
  'K-Starcation',
  'K-Education',
  'Subpackage',
];

const COL_WIDTHS = {
  product_number: 14, category: 16, subcategory: 22, partner_name: 38, partner_short: 18,
  name: 32, grade: 24, variant_label: 32, gender: 10,
  base_price: 16, price_currency: 12, price_min: 12, price_max: 12,
  duration_value: 14, duration_unit: 14,
  description: 65, highlights: 55, head_doctor_profile: 45,
  location_address: 26, contact_phone: 26, contact_email: 30, info_url: 40,
  has_female_doctor: 16, has_prayer_room: 14, dietary_type: 16,
  is_active: 10, sort_order: 10, source_sheet: 20, notes: 35, price_unit: 14,
};

const WRAP_COLS = new Set(['description', 'highlights', 'head_doctor_profile', 'notes']);
const wrapIdxSet = new Set(
  headers.map((h, i) => WRAP_COLS.has(h) ? i : -1).filter(i => i !== -1)
);

function addSheet(workbook, sheetName, rowsForSheet) {
  const sheet = workbook.addWorksheet(sheetName);

  // Header
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  headerRow.alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Column widths
  headers.forEach((h, i) => {
    sheet.getColumn(i + 1).width = COL_WIDTHS[h] || 16;
  });

  // Data rows
  for (const rowData of rowsForSheet) {
    const exRow = sheet.addRow(rowData);
    exRow.alignment = { vertical: 'top' };
    wrapIdxSet.forEach(colIdx => {
      const cell = exRow.getCell(colIdx + 1);
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  }
}

async function write() {
  const workbook = new ExcelJS.Workbook();

  // Group rows by category, in defined order
  const byCategory = {};
  SHEET_ORDER.forEach(cat => { byCategory[cat] = []; });
  allRows.forEach(r => {
    const cat = r[1];
    if (byCategory[cat]) byCategory[cat].push(r);
    else byCategory[cat] = [r]; // unexpected category
  });

  SHEET_ORDER.forEach(cat => {
    if (byCategory[cat]?.length) addSheet(workbook, cat, byCategory[cat]);
  });

  await workbook.xlsx.writeFile(V19_PATH);
  console.log(`Written: ${V19_PATH}`);
  console.log(`Total rows: ${allRows.length} (v18 base: 317)`);

  console.log('\nSheet breakdown:');
  SHEET_ORDER.forEach(cat => {
    console.log(`  [${cat}]: ${byCategory[cat]?.length ?? 0} rows`);
  });

  const newPartners = new Set(newRows.map(r => r[3]));
  console.log('\nNew partners added:');
  [...newPartners].forEach(p => console.log(`  + ${p}`));
}

write().catch(console.error);
