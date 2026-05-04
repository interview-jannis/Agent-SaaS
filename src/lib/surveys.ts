// Post-travel client review/survey. Per 4/30 SOP step 16:
// 10~15 multiple-choice questions + 1 open-ended.
// Submitted by agent on behalf of client (collected verbally / via offline form
// during wrap-up call). Submission triggers awaiting_review → completed.

import { supabase } from './supabase'
import { notifyAssignedAdmin } from './notifications'

export type RatingScale = 1 | 2 | 3 | 4 | 5

export type SurveyQuestion = {
  id: string
  prompt: string
  type: 'rating' | 'text'
}

// Load survey questions from system_settings (admin-managed via /admin/surveys).
// Returns an empty array if not yet configured — caller should show a hint.
export async function getSurveyQuestions(): Promise<SurveyQuestion[]> {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'survey_questions')
    .maybeSingle()
  return ((data?.value as { questions?: SurveyQuestion[] } | null)?.questions) ?? []
}

export type SurveyResponse = {
  question_id: string
  prompt: string
  type: 'rating' | 'text'
  rating?: RatingScale
  text?: string
}

export type SurveyRow = {
  id: string
  case_id: string
  responses: SurveyResponse[]
  submitted_by_actor_type: 'agent' | 'client' | null
  submitted_by_actor_id: string | null
  submitted_at: string
  created_at: string
}

export async function getCaseSurvey(caseId: string): Promise<SurveyRow | null> {
  const { data } = await supabase
    .from('surveys')
    .select('*')
    .eq('case_id', caseId)
    .maybeSingle()
  return data as SurveyRow | null
}

export async function submitSurvey(
  caseId: string,
  responses: SurveyResponse[],
  submittedBy: { actor_type: 'agent' | 'client'; actor_id: string | null },
): Promise<SurveyRow> {
  const { data, error } = await supabase
    .from('surveys')
    .insert({
      case_id: caseId,
      responses,
      submitted_by_actor_type: submittedBy.actor_type,
      submitted_by_actor_id: submittedBy.actor_id,
      submitted_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error || !data) throw error ?? new Error('Failed to submit survey.')
  return data as SurveyRow
}

// Try to advance status awaiting_review → completed when survey is submitted.
// Idempotent — safe to call after submitSurvey.
export async function tryAdvanceReviewSubmitted(caseId: string): Promise<{ advanced: boolean }> {
  const survey = await getCaseSurvey(caseId)
  if (!survey) return { advanced: false }

  const { data: caseRow } = await supabase
    .from('cases').select('id, case_number, status').eq('id', caseId).maybeSingle()
  const cr = caseRow as { id: string; case_number: string; status: string } | null
  if (!cr || cr.status !== 'awaiting_review') return { advanced: false }

  const { error } = await supabase
    .from('cases').update({ status: 'completed' }).eq('id', caseId).eq('status', 'awaiting_review')
  if (error) return { advanced: false }
  await notifyAssignedAdmin({ case_id: cr.id }, `${cr.case_number} client review submitted — case completed`, `/admin/cases/${cr.id}`)
  return { advanced: true }
}
