'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useNotifications } from '@/hooks/useNotifications'

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function NotificationBell() {
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUid(data.session?.user?.id ?? null))
  }, [])

  const { items, unreadCount, markAllRead } = useNotifications(uid)
  const [showRead, setShowRead] = useState(false)
  // Snapshot of unread ids at the moment the panel opens — these stay visible until panel closes,
  // even after markAllRead flips their is_read. Otherwise the panel would empty instantly.
  const [justOpenedUnread, setJustOpenedUnread] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      setJustOpenedUnread(new Set(items.filter(n => !n.is_read).map(n => n.id)))
      setShowRead(false)
      if (unreadCount > 0) markAllRead()
    }
  }

  function handleClick(n: typeof items[number]) {
    setOpen(false)
    if (n.link_url) router.push(n.link_url)
  }

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50">
      <button onClick={toggle}
        className="relative flex items-center justify-center w-12 h-12 rounded-full bg-white border border-gray-200 shadow-lg hover:shadow-xl hover:border-gray-300 transition-all"
        aria-label="Notifications">
        <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white" />
        )}
      </button>

      {open && (() => {
        const activeItems = items.filter(n => !n.is_read || justOpenedUnread.has(n.id))
        const readItems = items.filter(n => n.is_read && !justOpenedUnread.has(n.id))
        const renderRow = (n: typeof items[number]) => {
          const isFresh = !n.is_read || justOpenedUnread.has(n.id)
          return (
            <button key={n.id} onClick={() => handleClick(n)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${isFresh ? 'bg-blue-50/40' : ''}`}>
              <div className="flex items-start gap-2">
                {isFresh && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${isFresh ? 'text-gray-800' : 'text-gray-500'}`}>{n.message}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            </button>
          )
        }
        return (
          <div className="absolute bottom-full mb-2 right-0 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {activeItems.length > 0 && <span className="text-[10px] text-gray-400">{activeItems.length}</span>}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {activeItems.length === 0 && !showRead ? (
                <p className="text-sm text-gray-400 text-center py-10">No new notifications.</p>
              ) : (
                <>
                  {activeItems.map(renderRow)}
                  {showRead && readItems.map(renderRow)}
                </>
              )}
            </div>
            {readItems.length > 0 && (
              <button onClick={() => setShowRead(v => !v)}
                className="w-full text-[11px] text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 py-2 border-t border-gray-100 transition-colors">
                {showRead ? 'Hide history' : `Show previously read (${readItems.length})`}
              </button>
            )}
          </div>
        )
      })()}
    </div>
  )
}
