'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { NotificationRow } from '@/lib/notifications'

export function useNotifications(authUserId: string | null) {
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    if (!authUserId) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('auth_user_id', authUserId)
      .order('created_at', { ascending: false })
      .limit(30)
    setItems((data as NotificationRow[]) ?? [])
    setLoading(false)
  }, [authUserId])

  useEffect(() => {
    if (!authUserId) { setLoading(false); return }
    fetchItems()

    const channel = supabase
      .channel(`notifications:${authUserId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `auth_user_id=eq.${authUserId}` },
        (payload) => {
          setItems(prev => [payload.new as NotificationRow, ...prev].slice(0, 30))
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [authUserId, fetchItems])

  const unreadCount = items.filter(n => !n.is_read).length

  const markAllRead = useCallback(async () => {
    if (!authUserId) return
    const unreadIds = items.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
  }, [authUserId, items])

  return { items, unreadCount, loading, markAllRead, refresh: fetchItems }
}
