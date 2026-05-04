'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { logAsCurrentUser } from '@/lib/audit'

type SurveyQuestion = { id: string; prompt: string; type: 'rating' | 'text' }

type SurveyResponse = {
  question_id: string
  prompt: string
  type: 'rating' | 'text'
  rating?: 1 | 2 | 3 | 4 | 5
  text?: string
}

type SurveyRow = {
  id: string
  case_id: string
  responses: SurveyResponse[]
  submitted_at: string
  submitted_by_actor_type: 'agent' | 'client' | null
  cases: {
    case_number: string
    agent_id: string
    agents: { name: string | null } | null
  } | null
}

export default function AdminSurveysPage() {
  const [tab, setTab] = useState<'questions' | 'responses'>('questions')

  // Questions state
  const [surveyQs, setSurveyQs] = useState<SurveyQuestion[]>([])
  const [surveyQsOriginal, setSurveyQsOriginal] = useState<SurveyQuestion[]>([])
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // Responses state
  const [responses, setResponses] = useState<SurveyRow[]>([])
  const [loadingResponses, setLoadingResponses] = useState(true)

  // Permissions: only super admin can edit; everyone can view.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const fetchQuestions = useCallback(async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'survey_questions').maybeSingle()
    const qs = ((data?.value as { questions?: SurveyQuestion[] } | null)?.questions) ?? []
    setSurveyQs(qs); setSurveyQsOriginal(qs)
  }, [])

  const fetchResponses = useCallback(async () => {
    setLoadingResponses(true)
    const { data } = await supabase
      .from('surveys')
      .select('id, case_id, responses, submitted_at, submitted_by_actor_type, cases(case_number, agent_id, agents(name))')
      .order('submitted_at', { ascending: false })
    setResponses((data as unknown as SurveyRow[]) ?? [])
    setLoadingResponses(false)
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const { data } = await supabase.from('admins').select('is_super_admin').eq('auth_user_id', session.user.id).maybeSingle()
        setIsSuperAdmin(!!(data as { is_super_admin?: boolean } | null)?.is_super_admin)
      }
      await Promise.all([fetchQuestions(), fetchResponses()])
    })()
  }, [fetchQuestions, fetchResponses])

  // ── Question editor ─────────────────────────────────────────────────────
  function genQuestionId() { return 'q_' + Math.random().toString(36).slice(2, 8) }
  function addQ() { setSurveyQs(p => [...p, { id: genQuestionId(), prompt: '', type: 'rating' }]) }
  function removeQ(idx: number) { setSurveyQs(p => p.filter((_, i) => i !== idx)) }
  function moveQ(idx: number, dir: -1 | 1) {
    setSurveyQs(p => {
      const next = [...p]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return p
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }
  function setQ(idx: number, patch: Partial<SurveyQuestion>) {
    setSurveyQs(p => p.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }
  async function save() {
    const trimmed = surveyQs.map(q => ({ ...q, prompt: q.prompt.trim(), id: q.id.trim() }))
    if (trimmed.length === 0) { setError('At least one question is required.'); return }
    if (trimmed.some(q => !q.prompt)) { setError('Every question must have a prompt.'); return }
    const ids = new Set<string>()
    for (const q of trimmed) {
      if (!q.id) q.id = genQuestionId()
      if (ids.has(q.id)) { setError(`Duplicate question id: ${q.id}`); return }
      ids.add(q.id)
    }
    setSaving(true); setError(''); setSaved(false)
    const { error: err } = await supabase
      .from('system_settings')
      .upsert({ key: 'survey_questions', value: { questions: trimmed } }, { onConflict: 'key' })
    if (err) { setError(err.message) }
    else {
      await logAsCurrentUser('settings.updated', { type: 'system_setting', label: 'survey_questions' }, { count: trimmed.length })
      setSurveyQs(trimmed); setSurveyQsOriginal(trimmed)
      setEditing(false)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }
  function cancelEdit() { setSurveyQs(surveyQsOriginal); setEditing(false); setError('') }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="shrink-0 border-b border-gray-100 px-4 md:px-6 py-3 md:py-0 md:h-14 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <h1 className="text-base font-semibold text-gray-900 shrink-0">Surveys</h1>
        <div className="flex items-center gap-1 ml-auto">
          {(['questions', 'responses'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab === t ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
            >
              {t === 'questions' ? 'Questions' : `Responses${responses.length ? ` · ${responses.length}` : ''}`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-12 py-6 md:py-10 max-w-3xl space-y-6">

          {tab === 'questions' && (
            <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-[10px] font-semibold text-gray-900 uppercase tracking-wide">Post-Travel Review Questions</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Shown to the agent after Mark Travel Complete. Agent fills on the client&apos;s behalf.</p>
                </div>
                {!editing ? (
                  <div className="flex items-center gap-3">
                    {saved && <span className="text-[10px] text-[#0f4c35]">Saved.</span>}
                    {isSuperAdmin && (
                      <button onClick={() => setEditing(true)}
                        className="text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={cancelEdit} disabled={saving}
                      className="text-xs text-gray-900 hover:text-gray-900 disabled:opacity-40">Cancel</button>
                    <button onClick={save} disabled={saving}
                      className="px-3 py-1 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              {!editing ? (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                  {surveyQsOriginal.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No questions configured yet.</p>
                  ) : (
                    <ol className="text-sm text-gray-700 space-y-1.5 list-decimal pl-5">
                      {surveyQsOriginal.map((q) => (
                        <li key={q.id}>
                          <span>{q.prompt}</span>
                          <span className="ml-2 text-[10px] text-gray-400 uppercase">{q.type}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {surveyQs.map((q, idx) => (
                    <div key={`${q.id}-${idx}`} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-gray-400 w-6 shrink-0">#{idx + 1}</span>
                        <input value={q.prompt}
                          onChange={(e) => setQ(idx, { prompt: e.target.value })}
                          placeholder="Question prompt"
                          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white" />
                        <select value={q.type}
                          onChange={(e) => setQ(idx, { type: e.target.value as 'rating' | 'text' })}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 bg-white">
                          <option value="rating">Rating (1-5)</option>
                          <option value="text">Open text</option>
                        </select>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => moveQ(idx, -1)} disabled={idx === 0}
                            className="px-1.5 py-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30">↑</button>
                          <button onClick={() => moveQ(idx, 1)} disabled={idx === surveyQs.length - 1}
                            className="px-1.5 py-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30">↓</button>
                          <button onClick={() => removeQ(idx)}
                            className="px-1.5 py-1 text-xs text-red-500 hover:text-red-700">×</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={addQ}
                    className="px-3 py-1.5 text-xs font-medium border border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-[#0f4c35] hover:text-[#0f4c35] w-full">
                    + Add Question
                  </button>
                  {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
              )}
            </section>
          )}

          {tab === 'responses' && (
            <section className="space-y-3">
              {loadingResponses ? (
                <p className="text-sm text-gray-400 text-center py-12">Loading...</p>
              ) : responses.length === 0 ? (
                <div className="bg-gray-50 rounded-2xl p-12 text-center">
                  <p className="text-sm text-gray-400">No survey responses yet.</p>
                </div>
              ) : (
                responses.map((r) => {
                  const ratings = r.responses.filter(x => x.type === 'rating' && typeof x.rating === 'number')
                  const avg = ratings.length > 0
                    ? ratings.reduce((s, x) => s + (x.rating ?? 0), 0) / ratings.length
                    : null
                  return (
                    <div key={r.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          {r.cases?.case_number && (
                            <Link href={`/admin/cases/${r.case_id}`}
                              className="text-sm font-mono font-medium text-gray-900 hover:text-[#0f4c35]">
                              {r.cases.case_number}
                            </Link>
                          )}
                          <span className="text-xs text-gray-500">{r.cases?.agents?.name ?? '—'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {avg !== null && (
                            <span className="text-xs text-gray-700">
                              Avg <span className="font-semibold text-gray-900">{avg.toFixed(1)}</span> / 5
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400">
                            {new Date(r.submitted_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5 pl-1">
                        {r.responses.map((resp, idx) => (
                          <div key={`${resp.question_id}-${idx}`} className="text-xs">
                            <p className="text-gray-500">{idx + 1}. {resp.prompt}</p>
                            <p className="text-gray-900 pl-3">
                              {resp.type === 'rating'
                                ? (resp.rating ? `${resp.rating} / 5` : '—')
                                : (resp.text?.trim() || <span className="text-gray-400 italic">no answer</span>)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  )
}
