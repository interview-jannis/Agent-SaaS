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
