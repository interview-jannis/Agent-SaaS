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

type OtSetting = { pdf_url?: string; file_name?: string; updated_at?: string }

export default function AdminContractsPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editingType, setEditingType] = useState<ContractType | null>(null)
  const [form, setForm] = useState<{ title: string; body: string }>({ title: '', body: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Orientation PDF
  const [ot, setOt] = useState<OtSetting | null>(null)
  const [uploadingOt, setUploadingOt] = useState(false)
  const [otError, setOtError] = useState('')
  const [otDragging, setOtDragging] = useState(false)
  const [stagedOt, setStagedOt] = useState<File | null>(null)
  const [deletingOt, setDeletingOt] = useState(false)

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase.from('contract_templates').select('*')
    setTemplates((data as Template[]) ?? [])
  }, [])

  const fetchOt = useCallback(async () => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'onboarding_ot').maybeSingle()
    setOt((data?.value as OtSetting | null) ?? null)
  }, [])

  useEffect(() => {
    async function init() { await Promise.all([fetchTemplates(), fetchOt()]); setLoading(false) }
    init()
  }, [fetchTemplates, fetchOt])

  function stageOt(file: File) {
    if (file.type !== 'application/pdf') { setOtError('Only PDF files are allowed.'); return }
    setOtError('')
    setStagedOt(file)
  }

  async function confirmOtUpload() {
    if (!stagedOt) return
    setUploadingOt(true); setOtError('')
    try {
      const safeName = stagedOt.name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'ot'
      const path = `onboarding/ot_${Date.now()}_${safeName}.pdf`
      const { error: upErr } = await supabase.storage.from('schedules').upload(path, stagedOt, { upsert: false })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('schedules').getPublicUrl(path)
      const value: OtSetting = { pdf_url: urlData.publicUrl, file_name: stagedOt.name, updated_at: new Date().toISOString() }
      const { error: upsertErr } = await supabase.from('system_settings').upsert({ key: 'onboarding_ot', value }, { onConflict: 'key' })
      if (upsertErr) throw upsertErr
      await fetchOt()
      setStagedOt(null)
    } catch (e: unknown) {
      setOtError((e as { message?: string })?.message ?? 'Upload failed.')
    } finally {
      setUploadingOt(false)
    }
  }

  async function deleteOt() {
    if (!ot?.pdf_url) return
    const confirmed = window.confirm(`Delete orientation material?\n\n"${ot.file_name ?? 'orientation.pdf'}"\n\nAgents will see a placeholder until a new PDF is uploaded.`)
    if (!confirmed) return
    setDeletingOt(true); setOtError('')
    try {
      // Extract storage path from public URL
      const match = ot.pdf_url.match(/\/schedules\/(.+)$/)
      if (match) await supabase.storage.from('schedules').remove([match[1]])
      const { error } = await supabase.from('system_settings').delete().eq('key', 'onboarding_ot')
      if (error) throw error
      await fetchOt()
    } catch (e: unknown) {
      setOtError((e as { message?: string })?.message ?? 'Delete failed.')
    } finally {
      setDeletingOt(false)
    }
  }

  function openEdit(type: ContractType) {
    const t = templates.find(x => x.contract_type === type)
    setEditingType(type)
    setForm({ title: t?.title ?? (type === 'nda' ? 'Non-Disclosure Agreement' : 'Partnership Agreement'), body: t?.body ?? '' })
    setError('')
  }

  async function save() {
    if (!editingType) return
    if (!form.title.trim() || !form.body.trim()) { setError('Title and body are required.'); return }
    setSaving(true); setError('')
    try {
      const { error } = await supabase.from('contract_templates')
        .upsert({
          contract_type: editingType,
          title: form.title.trim(),
          body: form.body,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'contract_type' })
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
        <h1 className="text-base font-semibold text-gray-900">Contracts</h1>
        <p className="text-xs text-gray-500">Templates shown to agents during onboarding.</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {loading ? (
            <p className="text-sm text-gray-900 text-center py-16">Loading...</p>
          ) : (
            <>
              {/* Orientation PDF */}
              <section className="bg-gray-50 rounded-2xl p-5 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold text-gray-900 uppercase tracking-wide">Orientation Material</p>
                  {ot?.updated_at && <p className="text-[10px] text-gray-900 mt-0.5">Last uploaded {ot.updated_at.slice(0, 10)}</p>}
                </div>

                {/* Uploaded file view */}
                {ot?.pdf_url && !stagedOt && (
                  <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                    <svg className="w-5 h-5 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="text-sm text-gray-700 truncate flex-1 min-w-0">{ot.file_name ?? 'orientation.pdf'}</span>
                    <a href={ot.pdf_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#0f4c35] font-medium hover:underline shrink-0">View ↗</a>
                    <button onClick={deleteOt} disabled={deletingOt}
                      className="text-xs text-gray-900 hover:text-red-500 transition-colors disabled:opacity-40">
                      {deletingOt ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                )}

                {/* Staged file preview (awaiting confirm) */}
                {stagedOt && (
                  <div className="bg-white border border-[#0f4c35]/40 rounded-xl p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-[#0f4c35] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{stagedOt.name}</p>
                        <p className="text-[11px] text-gray-900">{(stagedOt.size / 1024).toFixed(0)} KB · ready to upload</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setStagedOt(null)} disabled={uploadingOt}
                        className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40">
                        Cancel
                      </button>
                      <button onClick={confirmOtUpload} disabled={uploadingOt}
                        className="px-3 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                        {uploadingOt ? 'Uploading...' : 'Confirm Upload'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Dropzone — only when no file uploaded and nothing staged */}
                {!ot?.pdf_url && !stagedOt && (
                  <label
                    onDragEnter={e => { e.preventDefault(); setOtDragging(true) }}
                    onDragOver={e => { e.preventDefault(); setOtDragging(true) }}
                    onDragLeave={e => { e.preventDefault(); setOtDragging(false) }}
                    onDrop={e => {
                      e.preventDefault(); setOtDragging(false)
                      const f = e.dataTransfer.files?.[0]
                      if (f) stageOt(f)
                    }}
                    className={`block border-2 border-dashed rounded-xl px-4 py-8 text-center cursor-pointer transition-colors ${
                      otDragging ? 'border-[#0f4c35] bg-[#0f4c35]/5' :
                      'border-gray-300 bg-white hover:border-[#0f4c35]/60 hover:bg-gray-50'
                    }`}>
                    <input type="file" accept="application/pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) stageOt(f); e.target.value = '' }} />
                    <svg className={`w-7 h-7 mx-auto mb-2 ${otDragging ? 'text-[#0f4c35]' : 'text-gray-900'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                    </svg>
                    <p className="text-sm font-medium text-gray-700">
                      {otDragging ? 'Drop PDF to stage' : 'Drag PDF here or click to browse'}
                    </p>
                    <p className="text-[11px] text-gray-900 mt-1">PDF only</p>
                  </label>
                )}

                {otError && <p className="text-xs text-red-500">{otError}</p>}
              </section>

              {(['nda', 'partnership'] as ContractType[]).map(type => {
              const t = templates.find(x => x.contract_type === type)
              const isEditing = editingType === type
              return (
                <section key={type} className="bg-gray-50 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-900 uppercase tracking-wide">{TYPE_LABELS[type]}</p>
                      {t?.updated_at && (
                        <p className="text-[10px] text-gray-900 mt-0.5">Last updated {t.updated_at.slice(0, 10)}</p>
                      )}
                    </div>
                    {!isEditing ? (
                      <button onClick={() => openEdit(type)}
                        className="text-xs font-medium text-[#0f4c35] hover:underline">Edit</button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button onClick={() => setEditingType(null)}
                          className="text-xs text-gray-900 hover:text-gray-900">Cancel</button>
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
                        {t?.body ?? <span className="text-gray-900">No content yet.</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Title</label>
                        <input value={form.title}
                          onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Body</label>
                        <p className="text-[10px] text-gray-900 mb-1.5">
                          Use <code className="bg-gray-200 px-1 rounded">## Heading</code> for section titles. Blank lines separate paragraphs.
                        </p>
                        <textarea value={form.body}
                          onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                          rows={20}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:border-[#0f4c35] bg-white resize-y" />
                      </div>
                      {error && <p className="text-xs text-red-500">{error}</p>}
                    </div>
                  )}
                </section>
              )
            })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
