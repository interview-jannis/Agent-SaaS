import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public intake API — no auth required, session_token-gated.
// GET  → return all clients in the session (ordered by sort_order)
// PATCH → update one client in the session { client_id, ...fields }

const CLIENT_SELECT = `
  id, name, client_number,
  nationality, gender, date_of_birth, phone, email, passport_image_url,
  needs_muslim_friendly, dietary_restriction, prayer_frequency, prayer_location,
  special_requests, emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
  blood_type, allergies, current_medications, health_conditions, medical_restrictions,
  height_cm, weight_kg, pregnancy_status, smoking_status, alcohol_status,
  preferred_language, mobility_limitations, same_gender_doctor, same_gender_therapist,
  mixed_gender_activities, cultural_religious_notes,
  prior_aesthetic_procedures, recent_health_checkup_notes
`

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function resolveSession(supabase: ReturnType<typeof serviceClient>, token: string) {
  const { data } = await supabase
    .from('intake_sessions')
    .select('id')
    .eq('session_token', token)
    .maybeSingle()
  return data as { id: string } | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = serviceClient()
  const session = await resolveSession(supabase, token)
  if (!session) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { data: members, error } = await supabase
    .from('intake_session_clients')
    .select(`sort_order, clients(${CLIENT_SELECT})`)
    .eq('session_id', session.id)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clients = (members ?? []).map((r: { clients: unknown }) => r.clients).filter(Boolean)
  return NextResponse.json({ clients })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = serviceClient()
  const session = await resolveSession(supabase, token)
  if (!session) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const body = await req.json() as Record<string, unknown> & { client_id: string }
  const { client_id } = body
  if (!client_id) return NextResponse.json({ error: 'Missing client_id.' }, { status: 400 })

  // Verify this client belongs to the session
  const { data: membership } = await supabase
    .from('intake_session_clients')
    .select('client_id')
    .eq('session_id', session.id)
    .eq('client_id', client_id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Client not in this session.' }, { status: 403 })

  // Fetch current values to enforce "can't clear filled fields" rule
  const { data: current } = await supabase
    .from('clients')
    .select('id, gender, needs_muslim_friendly, passport_image_url, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, blood_type, allergies, current_medications, health_conditions, medical_restrictions, height_cm, weight_kg, smoking_status, alcohol_status, pregnancy_status, preferred_language, mobility_limitations, prayer_frequency, prayer_location, dietary_restriction, same_gender_doctor, same_gender_therapist, mixed_gender_activities, cultural_religious_notes')
    .eq('id', client_id)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })

  const isMuslim: boolean = body.needs_muslim_friendly as boolean ?? current.needs_muslim_friendly
  const heightRaw = body.height_cm
  const weightRaw = body.weight_kg
  const height = heightRaw === '' || heightRaw == null ? null : Number(heightRaw)
  const weight = weightRaw === '' || weightRaw == null ? null : Number(weightRaw)
  if (height != null && (Number.isNaN(height) || height <= 0)) return NextResponse.json({ error: 'Height must be a positive number.' }, { status: 422 })
  if (weight != null && (Number.isNaN(weight) || weight <= 0)) return NextResponse.json({ error: 'Weight must be a positive number.' }, { status: 422 })

  const gender = (body.gender as string) ?? current.gender
  const pregnancy = gender === 'female' ? (body.pregnancy_status ?? null) : 'not_applicable'

  const cleared: string[] = []
  const wasText = (v: unknown) => typeof v === 'string' && v.trim().length > 0
  const nowText = (v: unknown) => typeof v === 'string' && v.trim().length > 0
  const check = (label: string, oldV: unknown, newV: unknown) => { if (wasText(oldV) && !nowText(newV)) cleared.push(label) }

  if (current.passport_image_url && !body.passport_image_url) cleared.push('Passport Copy')
  check('Emergency Contact Name', current.emergency_contact_name, body.emergency_contact_name)
  check('Emergency Contact Relation', current.emergency_contact_relation, body.emergency_contact_relation)
  check('Emergency Contact Phone', current.emergency_contact_phone, body.emergency_contact_phone)
  check('Blood Type', current.blood_type, body.blood_type)
  check('Allergies', current.allergies, body.allergies)
  check('Current Medications', current.current_medications, body.current_medications)
  check('Health Conditions', current.health_conditions, body.health_conditions)
  check('Medical Restrictions', current.medical_restrictions, body.medical_restrictions)
  check('Preferred Language', current.preferred_language, body.preferred_language)
  check('Mobility', current.mobility_limitations, body.mobility_limitations)
  if (current.height_cm != null && height == null) cleared.push('Height')
  if (current.weight_kg != null && weight == null) cleared.push('Weight')
  if (current.smoking_status && !body.smoking_status) cleared.push('Smoking Status')
  if (current.alcohol_status && !body.alcohol_status) cleared.push('Alcohol Status')
  if (gender === 'female' && current.pregnancy_status && !body.pregnancy_status) cleared.push('Pregnancy Status')
  if (isMuslim && current.needs_muslim_friendly) {
    if (current.prayer_frequency && !body.prayer_frequency) cleared.push('Prayer Frequency')
    if (current.prayer_location && !body.prayer_location) cleared.push('Prayer Location')
    if (current.dietary_restriction && current.dietary_restriction !== 'none' && (!body.dietary_restriction || body.dietary_restriction === 'none')) cleared.push('Dietary Restriction')
    if (current.same_gender_doctor && !body.same_gender_doctor) cleared.push('Same-gender Doctor')
    if (current.same_gender_therapist && !body.same_gender_therapist) cleared.push('Same-gender Therapist')
    if (current.mixed_gender_activities && !body.mixed_gender_activities) cleared.push('Mixed-gender Activities')
    check('Cultural/Religious Notes', current.cultural_religious_notes, body.cultural_religious_notes)
  }
  if (cleared.length > 0) {
    return NextResponse.json({ error: `Cannot clear required fields once set: ${cleared.join(', ')}.` }, { status: 422 })
  }

  const { error } = await supabase.from('clients').update({
    nationality: (body.nationality as string) || null,
    gender: gender || null,
    date_of_birth: (body.date_of_birth as string) || null,
    phone: (body.phone as string) || null,
    email: (body.email as string) || null,
    passport_image_url: (body.passport_image_url as string) || null,
    needs_muslim_friendly: isMuslim,
    dietary_restriction: isMuslim ? ((body.dietary_restriction as string) ?? 'none') : 'none',
    prayer_frequency: isMuslim ? ((body.prayer_frequency as string) ?? null) : null,
    prayer_location: isMuslim ? ((body.prayer_location as string) ?? null) : null,
    special_requests: (body.special_requests as string) || null,
    emergency_contact_name: (body.emergency_contact_name as string) || null,
    emergency_contact_relation: (body.emergency_contact_relation as string) || null,
    emergency_contact_phone: (body.emergency_contact_phone as string) || null,
    blood_type: (body.blood_type as string) || null,
    allergies: (body.allergies as string) || null,
    current_medications: (body.current_medications as string) || null,
    health_conditions: (body.health_conditions as string) || null,
    medical_restrictions: (body.medical_restrictions as string) || null,
    height_cm: height,
    weight_kg: weight,
    pregnancy_status: pregnancy,
    smoking_status: (body.smoking_status as string) || null,
    alcohol_status: (body.alcohol_status as string) || null,
    preferred_language: (body.preferred_language as string) || null,
    mobility_limitations: (body.mobility_limitations as string) || null,
    same_gender_doctor: isMuslim ? ((body.same_gender_doctor as string) ?? null) : null,
    same_gender_therapist: isMuslim ? ((body.same_gender_therapist as string) ?? null) : null,
    mixed_gender_activities: isMuslim ? ((body.mixed_gender_activities as string) ?? null) : null,
    cultural_religious_notes: isMuslim ? ((body.cultural_religious_notes as string) || null) : null,
    prior_aesthetic_procedures: (body.prior_aesthetic_procedures as string) || null,
    recent_health_checkup_notes: (body.recent_health_checkup_notes as string) || null,
  }).eq('id', client_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
