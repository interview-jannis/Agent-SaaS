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
// Server-first: calls /api/notifications/broadcast-admins (service role) to avoid
// RLS/session edge cases on cross-user INSERTs. Falls back to client-side insert
// if the API isn't reachable (e.g. during static prerender or service key unset).
export async function notifyAllAdmins(message: string, link_url?: string | null) {
  // Server path — only meaningful in browser (relative fetch needs an origin)
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/notifications/broadcast-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, link_url: link_url ?? null }),
      })
      if (res.ok) return
      console.warn('[notification] server broadcast non-OK, falling back to client', await res.text().catch(() => ''))
    } catch (e) {
      console.warn('[notification] server broadcast threw, falling back to client', e)
    }
  }

  // Client fallback
  const { data: admins } = await supabase.from('admins').select('id, auth_user_id')
  if (!admins || admins.length === 0) return
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

// Notify the admin assigned to an agent (or to a case, via its agent). If no
// admin is assigned, falls back to broadcasting to all super_admins so the
// message isn't lost. Server-first via service-role API; client-side fallback.
export async function notifyAssignedAdmin(
  target: { agent_id?: string; case_id?: string },
  message: string,
  link_url?: string | null,
) {
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/notifications/notify-assigned-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, message, link_url: link_url ?? null }),
      })
      if (res.ok) return
      console.warn('[notification] notify-assigned-admin server non-OK, falling back', await res.text().catch(() => ''))
    } catch (e) {
      console.warn('[notification] notify-assigned-admin server threw, falling back', e)
    }
  }

  // Client fallback — resolve agent_id then assigned_admin_id
  let agentId = target.agent_id ?? null
  if (!agentId && target.case_id) {
    const { data: caseRow } = await supabase.from('cases').select('agent_id').eq('id', target.case_id).maybeSingle()
    agentId = (caseRow as { agent_id: string } | null)?.agent_id ?? null
  }
  if (!agentId) return
  const { data: agent } = await supabase.from('agents')
    .select('assigned_admin_id').eq('id', agentId).maybeSingle()
  const assignedAdminId = (agent as { assigned_admin_id: string | null } | null)?.assigned_admin_id ?? null

  let recipients: Array<{ id: string; auth_user_id: string | null }> = []
  if (assignedAdminId) {
    const { data: a } = await supabase.from('admins').select('id, auth_user_id').eq('id', assignedAdminId).maybeSingle()
    if (a) recipients = [a as { id: string; auth_user_id: string | null }]
  }
  if (recipients.length === 0) {
    const { data: supers } = await supabase.from('admins').select('id, auth_user_id').eq('is_super_admin', true)
    recipients = (supers as Array<{ id: string; auth_user_id: string | null }>) ?? []
  }
  const seen = new Set<string>()
  const rows = recipients
    .filter(r => r.auth_user_id && !seen.has(r.auth_user_id) && seen.add(r.auth_user_id))
    .map(r => ({
      auth_user_id: r.auth_user_id!,
      target_type: 'admin' as const,
      target_id: r.id,
      message,
      link_url: link_url ?? null,
      is_read: false,
    }))
  if (rows.length === 0) return
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) console.error('[notification] assigned-admin insert failed', error)
}

// Notify a single agent by agent_id. Server-first to dodge cross-user INSERT
// edge cases (admin/client → agent row); falls back to direct client insert
// if the API isn't reachable.
export async function notifyAgent(agent_id: string, message: string, link_url?: string | null) {
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/notifications/notify-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id, message, link_url: link_url ?? null }),
      })
      if (res.ok) return
      console.warn('[notification] notify-agent server non-OK, falling back to client', await res.text().catch(() => ''))
    } catch (e) {
      console.warn('[notification] notify-agent server threw, falling back to client', e)
    }
  }

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
