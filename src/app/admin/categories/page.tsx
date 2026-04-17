'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Category = { id: string; name: string }

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('product_categories').select('id, name').order('name')
    setCategories(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    setError('')
    const { error: err } = await supabase.from('product_categories').insert({ name: newName.trim() })
    if (err) { setError(err.message); setAdding(false); return }
    setNewName('')
    setAdding(false)
    load()
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('product_categories').update({ name: editName.trim() }).eq('id', id)
    if (err) { setError(err.message); setSaving(false); return }
    setEditId(null)
    setSaving(false)
    load()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete category "${name}"? Products using this category will be unassigned.`)) return
    const { error: err } = await supabase.from('product_categories').delete().eq('id', id)
    if (err) { setError(err.message); return }
    load()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-12 py-10 max-w-xl space-y-6">

        <h1 className="text-xl font-semibold text-gray-900">Manage Categories</h1>

        {/* Add new */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Add Category</h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Category name"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10 transition-all"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="px-4 py-2.5 bg-[#0f4c35] text-white text-sm font-medium rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors"
            >
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">Loading...</div>
          ) : categories.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">No categories yet</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {categories.map((cat) => (
                <li key={cat.id} className="flex items-center gap-3 px-6 py-3.5">
                  {editId === cat.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdate(cat.id)}
                        autoFocus
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#0f4c35] focus:ring-2 focus:ring-[#0f4c35]/10"
                      />
                      <button
                        onClick={() => handleUpdate(cat.id)}
                        disabled={saving}
                        className="text-xs font-medium text-[#0f4c35] hover:underline disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="text-xs font-medium text-gray-400 hover:underline"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
                      <button
                        onClick={() => { setEditId(cat.id); setEditName(cat.name) }}
                        className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id, cat.name)}
                        className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

      </div>
    </div>
  )
}
