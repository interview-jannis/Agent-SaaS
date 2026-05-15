// Single source of truth for cart/quote pricing.
//
// Markup rule:
//   판가 = 원가 × (1 + markupRate)   — markupRate is per-category, set by super admin
//   커미션 = 판가 × commissionRate    — commissionRate is per-agent tier (15/20/25%)
//   회사수익 = 판가 - 원가 - 커미션
//
// markupRate 0 = cost pass-through (원가 그대로 고객 청구)

export type MarkupRatesConfig = {
  'K-Medical': number
  'K-Beauty': number
  'K-Wellness-Spa': number
  'K-Wellness-Henna': number
  'K-Wellness-Other': number
  'K-Starcation': number
  'K-Education': number
  'Subpackage-Hotel': number
  'Subpackage-Other': number
}

export const DEFAULT_MARKUP_RATES: MarkupRatesConfig = {
  'K-Medical': 1.0,
  'K-Beauty': 0.8,
  'K-Wellness-Spa': 0.5,
  'K-Wellness-Henna': 0.5,
  'K-Wellness-Other': 0.0,
  'K-Starcation': 0.5,
  'K-Education': 0.3,
  'Subpackage-Hotel': 0.0,
  'Subpackage-Other': 0.3,
}

// Returns the markup rate for a given category/subcategory combination.
// Falls back to DEFAULT_MARKUP_RATES if config is null/undefined.
export function getMarkupRate(
  category: string | null | undefined,
  subcategory: string | null | undefined,
  config: MarkupRatesConfig | null | undefined,
): number {
  const c = config ?? DEFAULT_MARKUP_RATES
  if (!category) return 0
  if (category === 'K-Medical') return c['K-Medical'] ?? 0
  if (category === 'K-Beauty') return c['K-Beauty'] ?? 0
  if (category === 'K-Education') return c['K-Education'] ?? 0
  if (category === 'K-Starcation') return c['K-Starcation'] ?? 0
  if (category === 'K-Wellness') {
    if (subcategory === 'SPA & Aesthetic') return c['K-Wellness-Spa'] ?? 0
    if (subcategory === 'Henna') return c['K-Wellness-Henna'] ?? 0
    return c['K-Wellness-Other'] ?? 0
  }
  if (category === 'Subpackage') {
    if (subcategory === 'Hotel') return c['Subpackage-Hotel'] ?? 0
    return c['Subpackage-Other'] ?? 0
  }
  return 0
}

// Hotel items price by room × nights, NOT per-person × memberCount.
export function isHotelItem(category: string | null | undefined, subcategory: string | null | undefined): boolean {
  return category === 'Subpackage' && subcategory === 'Hotel'
}

// Nights between two ISO dates (YYYY-MM-DD). Returns 1 as a safe minimum.
export function nightsBetween(dateStart: string | null | undefined, dateEnd: string | null | undefined): number {
  if (!dateStart || !dateEnd) return 1
  const start = new Date(dateStart).getTime()
  const end = new Date(dateEnd).getTime()
  if (!isFinite(start) || !isFinite(end) || end <= start) return 1
  return Math.max(1, Math.round((end - start) / 86400000))
}

// Days between two ISO dates (inclusive). Used for per_day items (vehicles).
export function daysBetween(dateStart: string | null | undefined, dateEnd: string | null | undefined): number {
  if (!dateStart || !dateEnd) return 1
  return nightsBetween(dateStart, dateEnd) + 1
}

// Convert a base price to USD applying the markup rate.
// markupRate: 0 = no markup, 1.0 = 100% markup (판가 = 원가 × 2)
export function variantPriceUsd({
  basePrice, priceCurrency, exchangeRate, markupRate,
}: {
  basePrice: number
  priceCurrency: string
  exchangeRate: number
  markupRate: number
}): number {
  const baseUsd = priceCurrency === 'USD' ? basePrice : basePrice / exchangeRate
  return baseUsd * (1 + markupRate)
}

// Convert a base price to KRW applying the markup rate.
export function variantPriceKrw({
  basePrice, priceCurrency, exchangeRate, markupRate,
}: {
  basePrice: number
  priceCurrency: string
  exchangeRate: number
  markupRate: number
}): number {
  const baseKrw = priceCurrency === 'USD' ? basePrice * exchangeRate : basePrice
  return Math.round(baseKrw * (1 + markupRate))
}

// Calculate overtime cost for a trip service variant.
// assignedHoursByDay: array of hours assigned per day (one entry per day the service is scheduled).
// Returns total overtime hours and the KRW cost of those hours.
export function calcOvertimeCostKrw({
  assignedHoursByDay,
  durationValue,
  overtimeRateKrw,
}: {
  assignedHoursByDay: number[]
  durationValue: number | null
  overtimeRateKrw: number | null
}): { overtimeHours: number; overtimeCostKrw: number } {
  if (!overtimeRateKrw || !durationValue) return { overtimeHours: 0, overtimeCostKrw: 0 }
  const overtimeHours = assignedHoursByDay.reduce((sum, h) => sum + Math.max(0, h - durationValue), 0)
  return { overtimeHours, overtimeCostKrw: Math.round(overtimeHours * overtimeRateKrw) }
}
