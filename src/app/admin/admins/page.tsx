'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type AdminRow = {
  id: string
  auth_user_id: string | null
  name: string
  email: string | null
  title: string | null
  is_super_admin: boolean | null
  created_at: string | null
}

function genTempPassword(): string {
  // Friendly-but-strong: 12 chars, alphanumeric (no confusing chars)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  for (const b of bytes) out += chars[b % chars.length]
  return out
}

export default function AdminAdminsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [callerId, setCallerId] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  // Add modal
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', title: '', password: genTempPassword() })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdInfo, setCreatedInfo] = useState<{ name: string; email: string; password: string } | null>(null)
  const [copiedField, setCopiedField] = useState<string>('')

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchAdmins = useCallback(async () => {
    const { data } = await supabase.from('admins')
      .select('id, auth_user_id, name, email, title, is_super_admin, created_at')
      .order('is_super_admin', { ascending: false })
      .order('name')
    setAdmins((data as AdminRow[]) ?? [])
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) { router.replace('/login'); return }
      const { data: caller } = await supabase.from('admins')
        .select('id, is_super_admin').eq('auth_user_id', uid).maybeSingle()
      const c = caller as { id: string; is_super_admin: boolean | null } | null
      if (!c?.is_super_admin) {
        setAccessDenied(true); setLoading(false); return
      }
      setCallerId(c.id)
      await fetchAdmins()
      setLoading(false)
    }
    init()
  }, [fetchAdmins, router])

  function openAddModal() {
    setForm({ name: '', email: '', title: '', password: genTempPassword() })
    setCreateError('')
    setCreatedInfo(null)
    setShowAdd(true)
  }

  async function createAdmin() {
    setCreating(true); setCreateError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not signed in.')
      const res = await fetch('/api/admin/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Failed to create admin.')
      setCreatedInfo({ name: form.name, email: form.email, password: form.password })
      await fetchAdmins()
    } catch (e: unknown) {
      setCreateError((e as { message?: string })?.message ?? 'Failed to create admin.')
    } finally {
      setCreating(false)
    }
  }

  async function deleteAdmin(id: string) {
    setDeletingId(id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not signed in.')
      const res = await fetch('/api/admin/delete-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ admin_id: id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Failed.')
      await fetchAdmins()
    } catch (e: unknown) {
      alert((e as { message?: string })?.message ?? 'Failed to delete admin.')
    } finally {
      setDeletingId(null)
    }
  }

  function copy(value: string, field: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(''), 2000)
    })
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-white">
        <p className="text-sm text-gray-500">Super admin access required.</p>
        <button onClick={() => router.push('/admin/overview')} className="mt-3 text-xs text-[#0f4c35] hover:underline">Back to Overview</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-base font-semibold text-gray-900">Admins</h1>
        {!loading && <span className="text-xs text-gray-400">{admins.length}</span>}
        <button onClick={openAddModal}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#0f4c35] text-white text-xs font-medium rounded-lg hover:bg-[#0a3828] transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Admin
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-12">Loading...</p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
              {admins.map(a => {
                const isSelf = a.id === callerId
                const isProtected = !!a.is_super_admin
                return (
                  <div key={a.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="w-8 h-8 rounded-full bg-[#0f4c35]/10 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-[#0f4c35]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{a.name}</p>
                        {isProtected && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#0f4c35]/10 text-[#0f4c35]">Super Admin</span>
                        )}
                        {isSelf && (
                          <span className="text-[10px] text-gray-400">You</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{a.email}</p>
                      {a.title && <p className="text-xs text-gray-400 mt-0.5">{a.title}</p>}
                    </div>
                    {!isSelf && !isProtected && (
                      <button onClick={() => {
                        if (window.confirm(`Delete admin "${a.name}"? This removes their login and admin record. This cannot be undone.`)) {
                          deleteAdmin(a.id)
                        }
                      }} disabled={deletingId === a.id}
                        className="shrink-0 text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors">
                        {deletingId === a.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { if (!creating) setShowAdd(false) }}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            {!createdInfo ? (
              <>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Add Admin</h2>
                  <p className="text-xs text-gray-500 mt-1">Creates a new admin account. The new admin signs in with these credentials and changes their password in Settings.</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Name *</label>
                    <input autoFocus type="text" value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Jane Doe"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Email *</label>
                    <input type="email" value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="jane@interviewcorp.co.kr"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Title</label>
                    <input type="text" value={form.title}
                      onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                      placeholder="e.g. Account Manager"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Temporary Password *</label>
                    <div className="flex items-center gap-2">
                      <input type="text" value={form.password}
                        onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus:border-[#0f4c35]" />
                      <button type="button" onClick={() => setForm(p => ({ ...p, password: genTempPassword() }))}
                        className="text-xs text-gray-500 hover:text-[#0f4c35] px-2 py-1 rounded">↻ Regen</button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">The new admin will change this on first login.</p>
                  </div>
                </div>
                {createError && <p className="text-xs text-red-500">{createError}</p>}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => setShowAdd(false)} disabled={creating}
                    className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 disabled:opacity-40">Cancel</button>
                  <button onClick={createAdmin} disabled={creating || !form.name.trim() || !form.email.trim() || form.password.length < 8}
                    className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                    {creating ? 'Creating…' : 'Create Admin'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Admin created</h2>
                  <p className="text-xs text-gray-500 mt-1">Share these credentials with {createdInfo.name}. They&apos;ll change the password on first login.</p>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-500 shrink-0">Email</span>
                    <span className="font-mono text-gray-900 truncate flex-1 text-right">{createdInfo.email}</span>
                    <button onClick={() => copy(createdInfo.email, 'email')}
                      className="text-[10px] text-[#0f4c35] hover:underline shrink-0">{copiedField === 'email' ? 'Copied!' : 'Copy'}</button>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-200">
                    <span className="text-xs text-gray-500 shrink-0">Password</span>
                    <span className="font-mono text-gray-900 truncate flex-1 text-right">{createdInfo.password}</span>
                    <button onClick={() => copy(createdInfo.password, 'password')}
                      className="text-[10px] text-[#0f4c35] hover:underline shrink-0">{copiedField === 'password' ? 'Copied!' : 'Copy'}</button>
                  </div>
                </div>
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  This password is shown once. After this dialog closes you won&apos;t be able to retrieve it.
                </p>
                <div className="flex items-center justify-end pt-2 border-t border-gray-100">
                  <button onClick={() => setShowAdd(false)}
                    className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828]">Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
