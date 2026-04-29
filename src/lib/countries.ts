// Curated country list for agent country fields.
// Middle East / GCC weighted (target market) + common global entries.
// Used as <datalist> options on country inputs to reduce typos like
// "United Arb Emirates" while still allowing free entry for edge cases.

export const COUNTRIES = [
  // GCC + Middle East (primary market)
  'United Arab Emirates',
  'Saudi Arabia',
  'Qatar',
  'Kuwait',
  'Bahrain',
  'Oman',
  'Jordan',
  'Egypt',
  'Lebanon',
  'Iraq',
  'Iran',
  'Turkey',
  'Israel',
  'Yemen',
  'Syria',
  'Morocco',
  'Tunisia',
  'Algeria',
  'Libya',
  'Sudan',
  // East / Southeast Asia
  'Korea, Republic of',
  'Japan',
  'China',
  'Hong Kong',
  'Taiwan',
  'Singapore',
  'Malaysia',
  'Indonesia',
  'Thailand',
  'Vietnam',
  'Philippines',
  'India',
  'Pakistan',
  // Europe / Americas (occasional)
  'United Kingdom',
  'United States',
  'Canada',
  'Australia',
  'France',
  'Germany',
  'Spain',
  'Italy',
  'Russia',
] as const

export const COUNTRY_DATALIST_ID = 'countries-list'
