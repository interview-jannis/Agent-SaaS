import { createServerClient } from '@/lib/supabase-server'

const STEPS = [
  {
    number: '01',
    title: 'Choose Your Program',
    description:
      'Explore our curated selection of K-Medical, K-Beauty, K-Wellness, and premium stay packages — tailored to your travel dates and personal preferences.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Receive Your Quotation',
    description:
      'Your dedicated agent prepares a fully itemised quotation with transparent pricing. Take your time to review every detail before moving forward.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Sign & Confirm',
    description:
      'A three-party agreement is signed by you, your agent, and TikkTakk — ensuring complete alignment from day one.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Secure Your Booking',
    description:
      'A 50% deposit confirms your reservation. The remaining balance is settled before departure — no surprises.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    number: '05',
    title: 'Get Your Personalised Schedule',
    description:
      'Our concierge team crafts a day-by-day itinerary around your appointments and preferences — delivered for your approval before travel.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    number: '06',
    title: 'Experience Premium Korea',
    description:
      'Arrive to a fully arranged VIP journey. Every detail is taken care of — so you can simply enjoy.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
  },
]

const WHY = [
  {
    title: 'VIP Concierge, End-to-End',
    description: 'A dedicated agent and TikkTakk operations team support you at every stage — from first consultation through to departure.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    title: 'Muslim-Friendly by Default',
    description: 'Halal dining options, prayer facilities, and same-gender medical staff preferences are accommodated as a standard — not an afterthought.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
  {
    title: 'All-in-One Programme',
    description: 'Medical, aesthetic, wellness, hotel, and cultural experiences — one plan, one team, zero coordination headache.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    title: 'Vetted Partners, Clear Pricing',
    description: 'Every clinic, hospital, and hotel in our network is carefully selected. Pricing is transparent — what you see in the quotation is what you pay.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
]

const CATEGORIES = [
  { name: 'K-Medical',    tagline: 'Health Screening · Stem Cell · Dental',  color: 'bg-[#0f4c35]/8 text-[#0f4c35]' },
  { name: 'K-Beauty',     tagline: 'Lifting · Skin Care · Aesthetics',        color: 'bg-rose-50 text-rose-600' },
  { name: 'K-Wellness',   tagline: 'SPA · Healing · Fitness · Oriental',      color: 'bg-amber-50 text-amber-700' },
  { name: 'K-Starcation', tagline: 'Fan Meetings · Studios · Experiences',    color: 'bg-gray-100 text-gray-600' },
  { name: 'K-Education',  tagline: 'Language · Cultural · Workshops',         color: 'bg-gray-100 text-gray-600' },
  { name: 'Subpackage',   tagline: 'Hotels · Transfers · Concierge',          color: 'bg-gray-100 text-gray-600' },
]

const FEATURED_SPECS: Array<{ nums: string[]; ord: number | null }> = [
  { nums: ['P-034', 'P-035'], ord: null },
  { nums: ['P-035'], ord: 6 },
  { nums: ['P-014', 'P-015', 'P-016'], ord: 2 },
  { nums: ['P-014', 'P-015', 'P-016'], ord: 5 },
  { nums: ['P-028', 'P-029', 'P-030'], ord: null },
  { nums: ['P-001', 'P-002', 'P-003'], ord: 3 },
  { nums: ['P-006', 'P-007'], ord: 4 },
  { nums: ['P-008', 'P-009', 'P-010'], ord: 5 },
  { nums: ['P-011', 'P-012', 'P-013'], ord: 2 },
  { nums: ['P-208'], ord: null },
  { nums: ['P-201'], ord: null },
  { nums: ['P-301', 'P-302', 'P-303'], ord: null },
  { nums: ['P-505', 'P-506', 'P-507', 'P-508'], ord: null },
  { nums: ['P-509', 'P-510'], ord: null },
  { nums: ['P-542'], ord: null },
  { nums: ['P-544'], ord: null },
]
const FLAT_SPECS = FEATURED_SPECS.map(s => ({ num: `#${s.nums[0]}`, ord: s.ord }))
const ALL_NUMBERS = [...new Set(FLAT_SPECS.map(s => s.num))]

type ProductImage = { url: string; name: string; category: string; subcategory: string }

function imgPriority(img: ProductImage): number {
  const cat = img.category
  const sub = img.subcategory.toLowerCase()
  const name = img.name.toLowerCase()
  if (cat === 'K-Medical') {
    if (sub.includes('health screening') || name.includes('health screening') || name.includes('vip premium')) return 0
    if (sub.includes('dermatology') || sub.includes('skin') || sub.includes('lifting') || name.includes('stem cell anti')) return 1
    if (sub.includes('dental') || name.includes('laminate') || name.includes('whitening')) return 2
    if (name.includes('feminin') || name.includes('women') || sub.includes('women')) return 3
    return 4
  }
  if (cat === 'K-Wellness' && sub.includes('spa')) return 5
  if (cat === 'K-Starcation') return 6
  if (cat === 'Subpackage') {
    if (name.includes('hotel') || name.includes('signiel') || name.includes('four seasons') || name.includes('room') || name.includes('suite')) return 7
    if (name.includes('vehicle') || name.includes('sedan') || name.includes('suv') || name.includes('sprinter') || name.includes('bus')) return 8
    return 9
  }
  if (cat === 'K-Wellness') return 10
  return 11
}

async function loadFeaturedImages(): Promise<ProductImage[]> {
  try {
    const supabase = createServerClient()
    const { data: prods } = await supabase
      .from('products')
      .select('id, product_number, name, product_categories(name), product_subcategories!products_subcategory_id_fkey(name)')
      .in('product_number', ALL_NUMBERS)
    if (!prods?.length) return []

    const prodByNumber = new Map(prods.map(p => [p.product_number, p]))
    const prodIds = prods.map(p => p.id)

    const { data: imgs } = await supabase
      .from('product_images')
      .select('product_id, image_url, is_primary, order')
      .in('product_id', prodIds)
    if (!imgs) return []

    const seenUrls = new Set<string>()
    const result: ProductImage[] = []

    for (const spec of FLAT_SPECS) {
      const prod = prodByNumber.get(spec.num)
      if (!prod) continue
      const img = imgs.find(i =>
        i.product_id === prod.id &&
        (spec.ord === null ? i.is_primary : i.order === spec.ord)
      )
      if (!img?.image_url || seenUrls.has(img.image_url)) continue
      seenUrls.add(img.image_url)
      const cat = (prod.product_categories as { name?: string } | null)?.name ?? ''
      const sub = (prod.product_subcategories as { name?: string } | null)?.name ?? ''
      result.push({ url: img.image_url, name: prod.name, category: cat, subcategory: sub })
    }

    result.sort((a, b) => imgPriority(a) - imgPriority(b))
    return result
  } catch {
    return []
  }
}

export default async function ProposalPage() {
  const productImages = await loadFeaturedImages()

  return (
    <div className="min-h-screen bg-white">

      {/* Header */}
      <header className="h-14 border-b border-gray-100 flex items-center px-6 md:px-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tiktak-logo-long.png" alt="TikkTakk" className="h-11 w-auto -mt-1" />
      </header>

      {/* Hero */}
      <div className="bg-[#0f4c35] px-12 lg:px-28 py-14 md:py-20 text-white">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-white/50 mb-4">Powered by TikkTakk</p>
        <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight mb-4">
          Premium K-Travel,<br />Curated for You
        </h1>
        <p className="text-base text-white/70 leading-relaxed max-w-lg">
          TikkTakk is a white-glove medical tourism concierge connecting discerning clients with Korea&apos;s finest clinics, wellness destinations, and cultural experiences — seamlessly managed by your dedicated agent.
        </p>
      </div>

      {/* Promo video */}
      <div className="px-12 lg:px-28 pt-12">
        <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#0f4c35] mb-2">About TikkTakk</p>
        <h2 className="text-xl font-bold text-gray-900 mb-5">See what we do</h2>
        <div className="relative w-full rounded-2xl overflow-hidden border border-gray-100 shadow-sm" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src="https://www.youtube.com/embed/lojeT0D5fdY"
            title="TikkTakk — Premium K-Travel"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </div>

      <div className="px-12 lg:px-28 py-12 space-y-16">

        {/* Why TikkTakk + How It Works */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">

          {/* Why TikkTakk */}
          <section>
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#0f4c35] mb-2">Why TikkTakk</p>
            <h2 className="text-xl font-bold text-gray-900 mb-7">The difference is in the details</h2>
            <div className="space-y-5">
              {WHY.map((item) => (
                <div key={item.title} className="flex gap-4">
                  <div className="shrink-0 w-9 h-9 rounded-xl bg-[#0f4c35]/8 flex items-center justify-center text-[#0f4c35]">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 mb-1">{item.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* How It Works */}
          <section>
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#0f4c35] mb-2">How It Works</p>
            <h2 className="text-xl font-bold text-gray-900 mb-7">Your journey, step by step</h2>
            <div className="space-y-0">
              {STEPS.map((step, idx) => (
                <div key={step.number} className="flex gap-5">
                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-[#0f4c35] text-white flex items-center justify-center shrink-0">
                      {step.icon}
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className="w-px flex-1 bg-gray-100 my-1" style={{ minHeight: '2rem' }} />
                    )}
                  </div>
                  <div className={`min-w-0 flex-1 ${idx < STEPS.length - 1 ? 'pb-6' : 'pb-1'}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-bold tracking-widest text-[#0f4c35]/50">{step.number}</span>
                      <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* What We Offer */}
        <section>
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#0f4c35] mb-2">What We Offer</p>
          <h2 className="text-xl font-bold text-gray-900 mb-7">Six categories, one seamless journey</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATEGORIES.map((cat) => (
              <div key={cat.name} className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50/60">
                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg ${cat.color}`}>{cat.name}</span>
                <p className="text-xs text-gray-400 leading-relaxed">{cat.tagline}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Featured Products */}
        {productImages.length > 0 && (
          <section>
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#0f4c35] mb-2">Featured Services</p>
            <h2 className="text-xl font-bold text-gray-900 mb-7">A glimpse of what awaits</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {productImages.map((img, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-gray-100 group">
                  <div className="aspect-[4/3] overflow-hidden bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-medium text-[#0f4c35]">{img.category}</p>
                    <p className="text-xs text-gray-700 font-medium leading-tight mt-0.5 line-clamp-2">{img.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-12 lg:px-28 py-6 text-center">
        <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} TikkTakk · Interview Co., Ltd. · All rights reserved.</p>
      </footer>

    </div>
  )
}
