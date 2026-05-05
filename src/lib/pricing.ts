// Single source of truth for cart/quote pricing.
//
// Margin rule (per 5/4 product taxonomy decision):
//   Margin applied to: K-Medical, K-Beauty, K-Wellness > Spa,
//                      K-Starcation, K-Education
//   Cost-only (no margin): K-Wellness > Tour/Leisure/Shopping/K-Content,
//                          Subpackage (Hotel/Vehicle/Interpreter/etc)
//
// Subpackage and non-Spa Wellness pass through at base_price so the agent
// sees the partner's actual cost during builder, helping them make
// honest selections.

export function appliesMargin(category: string | null | undefined, subcategory: string | null | undefined): boolean {
  if (!category) return false
  if (category === 'K-Medical') return true
  if (category === 'K-Beauty') return true
  if (category === 'K-Education') return true
  if (category === 'K-Starcation') return true
  if (category === 'K-Wellness') return subcategory === 'Spa'
  // Subpackage and anything else: cost-only
  return false
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
