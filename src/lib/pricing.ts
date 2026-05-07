// Single source of truth for cart/quote pricing.
//
// Margin rule (per 4/30 + 5/4 decisions):
//   Margin applied to: K-Medical, K-Beauty, K-Wellness > Spa, K-Wellness > Henna,
//                      K-Starcation, K-Education
//   Cost-only (no margin): K-Wellness > everything else (Tour/Leisure/Shopping/K-Content),
//                          Subpackage — see subpackageMult() below
//
// Subpackage margin is configurable by super admin (system_settings.subpackage_margin).
// When enabled, a flat rate is applied (separate from the compound company×agent margin).
// When disabled, Subpackage items pass through at cost.

export function appliesMargin(category: string | null | undefined, subcategory: string | null | undefined): boolean {
  if (!category) return false
  if (category === 'K-Medical') return true
  if (category === 'K-Beauty') return true
  if (category === 'K-Education') return true
  if (category === 'K-Starcation') return true
  if (category === 'K-Wellness') return subcategory === 'Spa' || subcategory === 'Henna'
  // Subpackage: handled separately via subpackageMult(). Cost-only by default.
  return false
}

// Subpackage margin config — stored in system_settings.subpackage_margin
export type SubpackageMarginConfig = { enabled: boolean; rate: number }

// Returns the price multiplier for Subpackage items.
// When disabled (or config null): 0 (free — 무상 제공).
// When enabled: 1 + rate (flat markup, e.g. 0.5 → ×1.5 = 50% above cost).
export function subpackageMult(config: SubpackageMarginConfig | null | undefined): number {
  if (!config?.enabled) return 0
  return 1 + (config.rate ?? 0)
}

// Hotel items price by room × nights, NOT per-person × memberCount.
// (A hotel room costs the same regardless of how many guests share it.)
export function isHotelItem(category: string | null | undefined, subcategory: string | null | undefined): boolean {
  return category === 'Subpackage' && subcategory === 'Hotel'
}

// Nights between two ISO dates (YYYY-MM-DD). Returns 1 as a safe minimum
// if either date is missing or end is not strictly after start.
export function nightsBetween(dateStart: string | null | undefined, dateEnd: string | null | undefined): number {
  if (!dateStart || !dateEnd) return 1
  const start = new Date(dateStart).getTime()
  const end = new Date(dateEnd).getTime()
  if (!isFinite(start) || !isFinite(end) || end <= start) return 1
  return Math.max(1, Math.round((end - start) / 86400000))
}

// Convert a base price (per single member) to USD applying the margin rule.
// `marginMult` is `(1 + companyMargin) * (1 + agentMargin)`.
export function variantPriceUsd({
  basePrice, priceCurrency, exchangeRate, marginMult, applyMargin,
}: {
  basePrice: number
  priceCurrency: string
  exchangeRate: number
  marginMult: number
  applyMargin: boolean
}): number {
  const baseUsd = priceCurrency === 'USD' ? basePrice : basePrice / exchangeRate
  return applyMargin ? baseUsd * marginMult : baseUsd
}

// Convert a base price to KRW (final, with or without margin per rule).
export function variantPriceKrw({
  basePrice, priceCurrency, exchangeRate, marginMult, applyMargin,
}: {
  basePrice: number
  priceCurrency: string
  exchangeRate: number
  marginMult: number
  applyMargin: boolean
}): number {
  const baseKrw = priceCurrency === 'USD' ? basePrice * exchangeRate : basePrice
  return applyMargin ? Math.round(baseKrw * marginMult) : Math.round(baseKrw)
}
