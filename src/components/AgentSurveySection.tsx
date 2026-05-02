'use client'

// Agent-side post-travel survey form. Visible in awaiting_review status; on
// submit advances case to completed (replaces the temp Mark Review Submitted
// button). Read-only display when already submitted.

import { useEffect, useState } from 'react'
import {
  type RatingScale,
  type SurveyQuestion,
  type SurveyResponse,
  type SurveyRow,
  getCaseSurvey,
  getSurveyQuestions,
  submitSurvey,
  tryAdvanceReviewSubmitted,
} from '@/lib/surveys'
import { logAsCurrentUser } from '@/lib/audit'

type Props = {
  caseId: string
  caseNumber: string
  agentId: string
  onChanged?: () => Promise<void> | void
}

export default function AgentSurveySection({ caseId, caseNumber, agentId, onChanged }: Props) {
  const [survey, setSurvey] = useState<SurveyRow | null>(null)
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [ratings, setRatings] = useState<Record<string, RatingScale | undefined>>({})
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [s, qs] = await Promise.all([getCaseSurvey(caseId), getSurveyQuestions()])
    setSurvey(s)
    setQuestions(qs)
    setLoading(false)
  }

  useEffect(() => { load() }, [caseId])

  async function submit() {
    setError('')
    if (questions.length === 0) {
      setError('No survey questions configured. Ask admin to set them up in Admin > Contracts.')
      return
    }
    // Validate: every rating question must have an answer
    const ratingQs = questions.filter(q => q.type === 'rating')
    const missing = ratingQs.filter(q => !ratings[q.id])
    if (missing.length > 0) {
      setError(`Please rate all ${ratingQs.length} questions before submitting.`)
      return
    }

    const responses: SurveyResponse[] = questions.map(q => ({
      question_id: q.id,
      prompt: q.prompt,
      type: q.type,
      ...(q.type === 'rating'
        ? { rating: ratings[q.id]! }
        : { text: textAnswers[q.id] ?? '' }),
    }))

    setSaving(true)
    try {
      await submitSurvey(caseId, responses, { actor_type: 'agent', actor_id: agentId || null })
      await logAsCurrentUser('case.survey_submitted', { type: 'case', id: caseId, label: caseNumber })
      const { advanced } = await tryAdvanceReviewSubmitted(caseId)
      await load()
      if (advanced) await onChanged?.()
      else await onChanged?.()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to submit survey.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  // Already submitted — show summary
  if (survey) {
    return (
      <section id="survey" className="scroll-mt-20 bg-gray-50 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Client Review</h3>
            <p className="text-xs text-gray-500 mt-0.5">Submitted {new Date(survey.submitted_at).toLocaleString()}</p>
          </div>
          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Submitted</span>
        </div>
        <div className="space-y-2">
          {survey.responses.map((r) => (
            <div key={r.question_id} className="bg-white rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">{r.prompt}</p>
              {r.type === 'rating' ? (
                <p className="text-sm text-gray-900">{'⭐'.repeat(r.rating ?? 0)}<span className="text-gray-400 ml-2 text-xs">{r.rating}/5</span></p>
              ) : (
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.text || <span className="text-gray-300">(no comment)</span>}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    )
  }

  // Not yet submitted — show form
  return (
    <section id="survey" className="scroll-mt-20 bg-teal-50 border border-teal-200 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-teal-700 uppercase tracking-wide">Client Review</h3>
        <p className="text-xs text-gray-600 mt-0.5">Collect feedback from your client and submit. This finalizes the case.</p>
      </div>

      {questions.length === 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800">No survey questions configured. Ask an admin to set them up in Admin → Contracts.</p>
        </div>
      )}

      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.id} className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-sm text-gray-800 mb-3">{q.prompt}</p>
            {q.type === 'rating' ? (
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const selected = ratings[q.id] === n
                  return (
                    <button key={n} onClick={() => setRatings((p) => ({ ...p, [q.id]: n as RatingScale }))}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${selected ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {n}
                    </button>
                  )
                })}
                <span className="text-[10px] text-gray-400 ml-2">1 = Poor · 5 = Excellent</span>
              </div>
            ) : (
              <textarea value={textAnswers[q.id] ?? ''} onChange={(e) => setTextAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                rows={3} placeholder="Anything client wants to share..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-teal-600 resize-none" />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex justify-end">
        <button onClick={submit} disabled={saving}
          className="px-5 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40">
          {saving ? 'Submitting...' : 'Submit Review'}
        </button>
      </div>
    </section>
  )
}
