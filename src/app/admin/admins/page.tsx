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
  invite_token: string | null
  invite_expires_at: string | null
  created_at: string | null
}

export default function AdminAdminsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [callerId, setCallerId] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  // Invite modal
  const [showInvite, setShowInvite] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [createdInvite, setCreatedInvite] = useState<{ url: string; expires_at: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchAdmins = useCallback(async () => {
    const { data } = await supabase.from('admins')
      .select('id, auth_user_id, name, email, title, is_super_admin, invite_token, invite_expires_at, created_at')
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

  function openInviteModal() {
    setInviteError('')
    setCreatedInvite(null)
    setShowInvite(true)
  }

  async function createInvite() {
    setInviting(true); setInviteError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not signed in.')
      const res = await fetch('/api/admin/invite-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Failed to create invite.')
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
      setCreatedInvite({ url: `${baseUrl}${body.invite_path}`, expires_at: body.expires_at })
      await fetchAdmins()
    } catch (e: unknown) {
      setInviteError((e as { message?: string })?.message ?? 'Failed to create invite.')
    } finally {
      setInviting(false)
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

  function copyInvite() {
    if (!createdInvite) return
    navigator.clipboard.writeText(createdInvite.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
        <button onClick={openInviteModal}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#0f4c35] text-white text-xs font-medium rounded-lg hover:bg-[#0a3828] transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Invite Admin
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
                const isPendingInvite = !!a.invite_token
                return (
                  <div key={a.id} className="flex items-start gap-4 px-5 py-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isPendingInvite ? 'bg-amber-50' : 'bg-[#0f4c35]/10'}`}>
                      <svg className={`w-4 h-4 ${isPendingInvite ? 'text-amber-600' : 'text-[#0f4c35]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">
                          {isPendingInvite ? <span className="text-gray-500">Invited admin</span> : a.name}
                        </p>
                        {isProtected && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#0f4c35]/10 text-[#0f4c35]">Super Admin</span>
                        )}
                        {isPendingInvite && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Invite pending</span>
                        )}
                        {isSelf && (
                          <span className="text-[10px] text-gray-400">You</span>
                        )}
                      </div>
                      {isPendingInvite ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Awaiting setup{a.invite_expires_at && ` · expires ${new Date(a.invite_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </p>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 mt-0.5">{a.email}</p>
                          {a.title && <p className="text-xs text-gray-400 mt-0.5">{a.title}</p>}
                        </>
                      )}
                    </div>
                    {!isSelf && !isProtected && (
                      <button onClick={() => {
                        const label = isPendingInvite ? 'this pending invite' : `admin "${a.name}"`
                        if (window.confirm(`Delete ${label}? This removes their login and admin record. This cannot be undone.`)) {
                          deleteAdmin(a.id)
                        }
                      }} disabled={deletingId === a.id}
                        className="shrink-0 text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors">
                        {deletingId === a.id ? 'Deleting…' : isPendingInvite ? 'Cancel' : 'Delete'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { if (!inviting) setShowInvite(false) }}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            {!createdInvite ? (
              <>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Invite Admin</h2>
                  <p className="text-xs text-gray-500 mt-1">Generates a one-time invite link. Share it with the new admin — they&apos;ll set their own email and password from the link.</p>
                </div>
                {inviteError && <p className="text-xs text-red-500">{inviteError}</p>}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => setShowInvite(false)} disabled={inviting}
                    className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 disabled:opacity-40">Cancel</button>
                  <button onClick={createInvite} disabled={inviting}
                    className="px-4 py-1.5 text-xs font-medium bg-[#0f4c35] text-white rounded-lg hover:bg-[#0a3828] disabled:opacity-40">
                    {inviting ? 'Generating…' : 'Generate Invite Link'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Invite link ready</h2>
                  <p className="text-xs text-gray-500 mt-1">Share this link via Slack or email. The invitee opens it and sets their own email + password.</p>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-2">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Invite URL</p>
                  <p className="font-mono text-xs text-gray-800 break-all">{createdInvite.url}</p>
                  <button onClick={copyInvite}
                    className="w-full mt-2 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:border-[#0f4c35] hover:text-[#0f4c35]">
                    {copied ? '✓ Copied to clipboard' : 'Copy link'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Expires {new Date(createdInvite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · single use
                </p>
                <div className="flex items-center justify-end pt-2 border-t border-gray-100">
                  <button onClick={() => setShowInvite(false)}
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
