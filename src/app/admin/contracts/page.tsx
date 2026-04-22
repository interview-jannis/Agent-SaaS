'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type ContractType = 'nda' | 'partnership'

type Template = {
  id: string
  contract_type: ContractType
  title: string
  body: string
  updated_at: string
}

const TYPE_LABELS: Record<ContractType, string> = {
  nda: 'Non-Disclosure Agreement',
  partnership: 'Partnership Agreement',
}

export default function AdminContractsPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editingType, setEditingType] = useState<ContractType | null>(null)
  const [form, setForm] = useState<{ title: string; body: string }>({ title: '', body: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase.from('contract_templates').select('*')
    setTemplates((data as Template[]) ?? [])
  }, [])

  useEffect(() => {
    async function init() { await fetchTemplates(); setLoading(false) }
    init()
  }, [fetchTemplates])

  function openEdit(t: Template) {
    setEditingType(t.contract_type)
    setForm({ title: t.title, body: t.body })
    setError('')
  }

  async function save() {
    if (!editingType) return
    if (!form.title.trim() || !form.body.trim()) { setError('Title and body are required.'); return }
    setSaving(true); setError('')
    try {
      const { error } = await supabase.from('contract_templates')
        .update({ title: form.title.trim(), body: form.body, updated_at: new Date().toISOString() })
        .eq('contract_type', editingType)
      if (error) throw error
      await fetchTemplates()
      setEditingType(null)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-900">Contracts</h1>
        <p className="text-xs text-gray-500">Templates shown to agents during onboarding.</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-16">Loading...</p>
          ) : (
            (['nda', 'partnership'] as ContractType[]).map(type => {
              const t = templates.find(x => x.contract_type === type)
              const isEditing = editingType === type
              return (
                <section key={type} className="bg-gray-50 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{TYPE_LABELS[type]}</p>
                      {t?.updated_at && (
                        <p className="text-[10px] text-gray-400 mt-0.5">Last updated {t.updated_at.slice(0, 10)}</p>
                      )}
                    </div>
                    {!isEditing ? (
                      <button onClick={() => t && openEdit(t)}
                        className="text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button onClick={() => setEditingType(null)}
                          className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        <button onClick={save} disabled={saving}
                          className="px-3 py-1 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                      <h2 className="text-lg font-bold text-gray-900">{t?.title ?? '—'}</h2>
                      <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed max-h-64 overflow-y-auto">
                        {t?.body ?? <span className="text-gray-400">No content yet.</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Title</label>
                        <input value={form.title}
                          onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Body</label>
                        <p className="text-[10px] text-gray-400 mb-1.5">
                          Use <code className="bg-gray-200 px-1 rounded">## Heading</code> for section titles. Blank lines separate paragraphs.
                        </p>
                        <textarea value={form.body}
                          onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                          rows={20}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0f4c35] bg-white resize-y" />
                      </div>
                      {error && <p className="text-xs text-red-500">{error}</p>}
                    </div>
                  )}
                </section>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
