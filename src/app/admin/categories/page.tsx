'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Category = { id: string; name: string }
type Subcategory = { id: string; category_id: string; name: string; sort_order: number }

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [loading, setLoading] = useState(true)

  // Category state
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [editCatId, setEditCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [savingCat, setSavingCat] = useState(false)

  // Sub-category state — keyed by parent category_id
  const [newSubName, setNewSubName] = useState<Record<string, string>>({})
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null)
  const [editSubId, setEditSubId] = useState<string | null>(null)
  const [editSubName, setEditSubName] = useState('')
  const [savingSub, setSavingSub] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [error, setError] = useState('')

  async function load() {
    const [{ data: cats }, { data: subs }] = await Promise.all([
      supabase.from('product_categories').select('id, name').order('sort_order').order('name'),
      supabase.from('product_subcategories').select('id, category_id, name, sort_order').order('sort_order').order('name'),
    ])
    setCategories(cats ?? [])
    setSubcategories((subs as Subcategory[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Category CRUD ────────────────────────────────────────────────────────

  async function addCategory() {
    if (!newCatName.trim()) return
    setAddingCat(true); setError('')
    const { error: err } = await supabase.from('product_categories').insert({ name: newCatName.trim() })
    if (err) { setError(err.message); setAddingCat(false); return }
    setNewCatName('')
    setAddingCat(false)
    load()
  }

  async function updateCategory(id: string) {
    if (!editCatName.trim()) return
    setSavingCat(true); setError('')
    const { error: err } = await supabase.from('product_categories').update({ name: editCatName.trim() }).eq('id', id)
    if (err) { setError(err.message); setSavingCat(false); return }
    setEditCatId(null)
    setSavingCat(false)
    load()
  }

  async function deleteCategory(id: string, name: string) {
    if (!confirm(`Delete category "${name}"? Products using this category will be unassigned. Sub-categories will also be deleted.`)) return
    const { error: err } = await supabase.from('product_categories').delete().eq('id', id)
    if (err) { setError(err.message); return }
    load()
  }

  // ── Sub-category CRUD ─────────────────────────────────────────────────────

  async function addSubcategory(categoryId: string) {
    const name = (newSubName[categoryId] ?? '').trim()
    if (!name) return
    setAddingSubFor(categoryId); setError('')
    // sort_order = max + 1 within this category
    const existing = subcategories.filter(s => s.category_id === categoryId)
    const nextOrder = existing.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0) + 1
    const { error: err } = await supabase.from('product_subcategories').insert({ category_id: categoryId, name, sort_order: nextOrder })
    if (err) { setError(err.message); setAddingSubFor(null); return }
    setNewSubName(p => ({ ...p, [categoryId]: '' }))
    setAddingSubFor(null)
    load()
  }

  async function updateSubcategory(id: string) {
    if (!editSubName.trim()) return
    setSavingSub(true); setError('')
    const { error: err } = await supabase.from('product_subcategories').update({ name: editSubName.trim() }).eq('id', id)
    if (err) { setError(err.message); setSavingSub(false); return }
    setEditSubId(null)
    setSavingSub(false)
    load()
  }

  async function deleteSubcategory(id: string, name: string) {
    if (!confirm(`Delete sub-category "${name}"? Products using it will be unassigned (still keep the parent category).`)) return
    const { error: err } = await supabase.from('product_subcategories').delete().eq('id', id)
    if (err) { setError(err.message); return }
    load()
  }

  function toggleExpanded(catId: string) {
    setExpanded(s => {
      const next = new Set(s)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-base font-semibold text-gray-900">Manage Categories</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-6 py-8 space-y-6">

          {/* Add new category */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Add Category</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                placeholder="Category name"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all"
              />
              <button
                onClick={addCategory}
                disabled={addingCat || !newCatName.trim()}
                className="px-4 py-2.5 bg-[#0f4c35] text-white text-sm font-medium rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors"
              >
                {addingCat ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>

          {/* List with expandable sub-categories */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">Loading...</div>
            ) : categories.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">No categories yet</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {categories.map((cat) => {
                  const subs = subcategories.filter(s => s.category_id === cat.id)
                  const isExpanded = expanded.has(cat.id)
                  return (
                    <li key={cat.id}>
                      {/* Category row */}
                      <div className="flex items-center gap-3 px-6 py-3.5">
                        <button onClick={() => toggleExpanded(cat.id)} className="text-gray-400 hover:text-gray-700 transition-colors">
                          <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        {editCatId === cat.id ? (
                          <>
                            <input
                              type="text"
                              value={editCatName}
                              onChange={(e) => setEditCatName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && updateCategory(cat.id)}
                              autoFocus
                              className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10"
                            />
                            <button onClick={() => updateCategory(cat.id)} disabled={savingCat}
                              className="text-xs font-medium text-[#0f4c35] hover:underline disabled:opacity-40">Save</button>
                            <button onClick={() => setEditCatId(null)} className="text-xs font-medium text-gray-400 hover:underline">Cancel</button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-medium text-gray-900">{cat.name}</span>
                            <span className="text-[10px] text-gray-400 mr-2">{subs.length} sub</span>
                            <button onClick={() => { setEditCatId(cat.id); setEditCatName(cat.name) }}
                              className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors">Edit</button>
                            <button onClick={() => deleteCategory(cat.id, cat.name)}
                              className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors">Delete</button>
                          </>
                        )}
                      </div>

                      {/* Sub-categories */}
                      {isExpanded && (
                        <div className="bg-gray-50/60 border-t border-gray-100">
                          <ul className="divide-y divide-gray-100">
                            {subs.length === 0 ? (
                              <li className="px-12 py-3 text-[11px] text-gray-400 italic">No sub-categories yet</li>
                            ) : subs.map((sub) => (
                              <li key={sub.id} className="flex items-center gap-2 pl-12 pr-6 py-2">
                                {editSubId === sub.id ? (
                                  <>
                                    <input type="text" value={editSubName}
                                      onChange={(e) => setEditSubName(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && updateSubcategory(sub.id)}
                                      autoFocus
                                      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-[#0f4c35]" />
                                    <button onClick={() => updateSubcategory(sub.id)} disabled={savingSub}
                                      className="text-[11px] font-medium text-[#0f4c35] hover:underline disabled:opacity-40">Save</button>
                                    <button onClick={() => setEditSubId(null)}
                                      className="text-[11px] font-medium text-gray-400 hover:underline">Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    <span className="flex-1 text-xs text-gray-700">{sub.name}</span>
                                    <button onClick={() => { setEditSubId(sub.id); setEditSubName(sub.name) }}
                                      className="text-[11px] font-medium text-gray-400 hover:text-gray-700 transition-colors">Edit</button>
                                    <button onClick={() => deleteSubcategory(sub.id, sub.name)}
                                      className="text-[11px] font-medium text-red-400 hover:text-red-600 transition-colors">Delete</button>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                          {/* Add sub */}
                          <div className="flex items-center gap-2 pl-12 pr-6 py-2 border-t border-gray-100">
                            <input type="text" placeholder="Add sub-category…"
                              value={newSubName[cat.id] ?? ''}
                              onChange={(e) => setNewSubName(p => ({ ...p, [cat.id]: e.target.value }))}
                              onKeyDown={(e) => e.key === 'Enter' && addSubcategory(cat.id)}
                              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-[#0f4c35] bg-white" />
                            <button onClick={() => addSubcategory(cat.id)}
                              disabled={addingSubFor === cat.id || !(newSubName[cat.id] ?? '').trim()}
                              className="text-[11px] font-medium text-[#0f4c35] hover:underline disabled:opacity-40">
                              {addingSubFor === cat.id ? 'Adding…' : '+ Add'}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

        </div>
      </div>
    </div>
  )
}
