// Shared completeness checks for Client travel/service info + Case-level requirements.
// Used by Agent/Admin case detail pages to gate schedule upload.

export type DietaryType = 'halal_certified' | 'halal_friendly' | 'muslim_friendly' | 'pork_free' | 'none'
export type PrayerFrequency = 'all_five_daily' | 'flexible' | 'not_applicable'
export type PrayerLocation = 'hotel' | 'vehicle' | 'external_prayer_room' | 'mosque' | 'not_applicable'
export type PregnancyStatus = 'not_applicable' | 'none' | 'pregnant' | 'unknown'
export type SmokingStatus = 'non_smoker' | 'occasional' | 'regular' | 'former' | 'not_applicable'
export type AlcoholStatus = 'none' | 'occasional' | 'regular' | 'not_applicable'
export type GenderPref = 'required' | 'preferred' | 'no_preference' | 'not_applicable'
export type MixedGenderPref = 'comfortable' | 'prefer_to_limit' | 'not_comfortable' | 'not_applicable'

export type ClientInfo = {
  id: string
  name: string
  gender: string | null
  needs_muslim_friendly: boolean

  passport_number: string | null

  emergency_contact_name: string | null
  emergency_contact_relation: string | null
  emergency_contact_phone: string | null

  blood_type: string | null
  allergies: string | null
  current_medications: string | null
  health_conditions: string | null
  medical_restrictions: string | null

  height_cm: number | null
  weight_kg: number | null

  pregnancy_status: PregnancyStatus | null
  smoking_status: SmokingStatus | null
  alcohol_status: AlcoholStatus | null

  preferred_language: string | null
  mobility_limitations: string | null

  // Muslim-only
  prayer_frequency: PrayerFrequency | null
  prayer_location: PrayerLocation | null
  dietary_restriction: DietaryType | null
  same_gender_doctor: GenderPref | null
  same_gender_therapist: GenderPref | null
  mixed_gender_activities: MixedGenderPref | null
  cultural_religious_notes: string | null
}

const isFilledText = (v: string | null | undefined) => typeof v === 'string' && v.trim().length > 0

export function getMissingClientFields(c: ClientInfo | null | undefined): string[] {
  if (!c) return ['Client data']
  const missing: string[] = []

  if (!isFilledText(c.passport_number)) missing.push('Passport')
  if (!isFilledText(c.emergency_contact_name)) missing.push('Emergency Contact Name')
  if (!isFilledText(c.emergency_contact_relation)) missing.push('Emergency Contact Relation')
  if (!isFilledText(c.emergency_contact_phone)) missing.push('Emergency Contact Phone')
  if (!isFilledText(c.blood_type)) missing.push('Blood Type')
  if (!isFilledText(c.allergies)) missing.push('Allergies')
  if (!isFilledText(c.current_medications)) missing.push('Current Medications')
  if (!isFilledText(c.health_conditions)) missing.push('Health Conditions')
  if (!isFilledText(c.medical_restrictions)) missing.push('Medical Restrictions')
  if (c.height_cm == null) missing.push('Height')
  if (c.weight_kg == null) missing.push('Weight')
  if (!c.smoking_status) missing.push('Smoking Status')
  if (!c.alcohol_status) missing.push('Alcohol Status')
  if (!isFilledText(c.preferred_language)) missing.push('Preferred Language')
  if (!isFilledText(c.mobility_limitations)) missing.push('Mobility')

  // Pregnancy status required only for female (male is auto N/A)
  if (c.gender === 'female' && !c.pregnancy_status) missing.push('Pregnancy Status')

  // Muslim-only fields
  if (c.needs_muslim_friendly) {
    if (!c.prayer_frequency) missing.push('Prayer Frequency')
    if (!c.prayer_location) missing.push('Prayer Location')
    if (!c.dietary_restriction) missing.push('Dietary Restriction')
    if (!c.same_gender_doctor) missing.push('Same-gender Doctor')
    if (!c.same_gender_therapist) missing.push('Same-gender Therapist')
    if (!c.mixed_gender_activities) missing.push('Mixed-gender Activities')
    if (!isFilledText(c.cultural_religious_notes)) missing.push('Cultural/Religious Notes')
  }

  return missing
}

export function hasCompleteClientInfo(c: ClientInfo | null | undefined): boolean {
  return getMissingClientFields(c).length === 0
}

// Columns to include in Supabase SELECT when loading clients for completeness checks.
export const CLIENT_INFO_COLUMNS =
  'id, name, gender, needs_muslim_friendly, passport_number, ' +
  'emergency_contact_name, emergency_contact_relation, emergency_contact_phone, ' +
  'blood_type, allergies, current_medications, health_conditions, medical_restrictions, ' +
  'height_cm, weight_kg, pregnancy_status, smoking_status, alcohol_status, ' +
  'preferred_language, mobility_limitations, ' +
  'prayer_frequency, prayer_location, dietary_restriction, ' +
  'same_gender_doctor, same_gender_therapist, mixed_gender_activities, cultural_religious_notes'

// ── Case-level requirements ──────────────────────────────────────────────────

export type FlightInfo = {
  departure_datetime?: string // ISO
  departure_airport?: string
  arrival_datetime?: string
  arrival_airport?: string
  flight_number?: string
} | null

export type CaseRequiredFields = {
  concept: string | null
  meeting_date: string | null
  outbound_flight: FlightInfo
  inbound_flight: FlightInfo
}

function isFlightComplete(f: FlightInfo): boolean {
  if (!f) return false
  return isFilledText(f.departure_datetime) && isFilledText(f.departure_airport)
    && isFilledText(f.arrival_datetime) && isFilledText(f.arrival_airport)
}

export function getMissingCaseFields(c: CaseRequiredFields): string[] {
  const missing: string[] = []
  if (!isFilledText(c.concept)) missing.push('Concept')
  if (!isFilledText(c.meeting_date)) missing.push('Meeting Date')
  if (!isFlightComplete(c.outbound_flight)) missing.push('Outbound Flight')
  if (!isFlightComplete(c.inbound_flight)) missing.push('Inbound Flight')
  return missing
}
