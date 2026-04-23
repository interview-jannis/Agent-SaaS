import { supabase } from './supabase'

export type NotificationRow = {
  id: string
  target_type: 'agent' | 'admin'
  target_id: string | null
  auth_user_id: string
  message: string
  link_url: string | null
  is_read: boolean
  created_at: string
}

type InsertInput = {
  auth_user_id: string
  target_type: 'agent' | 'admin'
  target_id?: string | null
  message: string
  link_url?: string | null
}

export async function createNotification(input: InsertInput) {
  const { error } = await supabase.from('notifications').insert({
    auth_user_id: input.auth_user_id,
    target_type: input.target_type,
    target_id: input.target_id ?? null,
    message: input.message,
    link_url: input.link_url ?? null,
    is_read: false,
  })
  if (error) console.error('[notification] insert failed', error)
}

// Notify every admin (broadcast). One row per admin so is_read is per-user.
export async function notifyAllAdmins(message: string, link_url?: string | null) {
  const { data: admins } = await supabase.from('admins').select('id, auth_user_id')
  if (!admins || admins.length === 0) return
  // Deduplicate by auth_user_id — if a user has multiple admin rows, only notify them once.
  const seen = new Set<string>()
  const rows = admins
    .filter(a => a.auth_user_id && !seen.has(a.auth_user_id) && seen.add(a.auth_user_id))
    .map(a => ({
      auth_user_id: a.auth_user_id,
      target_type: 'admin' as const,
      target_id: a.id,
      message,
      link_url: link_url ?? null,
      is_read: false,
    }))
  if (rows.length === 0) return
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) console.error('[notification] admin broadcast failed', error)
}

// Notify a single agent by agent_id → resolve their auth_user_id
export async function notifyAgent(agent_id: string, message: string, link_url?: string | null) {
  const { data: agent } = await supabase.from('agents').select('auth_user_id').eq('id', agent_id).single()
  if (!agent?.auth_user_id) return
  await createNotification({
    auth_user_id: agent.auth_user_id,
    target_type: 'agent',
    target_id: agent_id,
    message,
    link_url,
  })
}
