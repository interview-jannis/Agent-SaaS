import { supabase } from './supabase'

export type ActorType = 'agent' | 'admin' | 'system'

export type AuditAction =
  // Agent lifecycle
  | 'agent.contracts_signed' | 'agent.approved' | 'agent.rejected'
  | 'agent.setup_completed' | 'agent.activated' | 'agent.deactivated'
  // Case lifecycle
  | 'case.created' | 'case.cancelled' | 'case.payment_confirmed'
  | 'case.travel_completed'
  // Schedule lifecycle
  | 'schedule.uploaded' | 'schedule.confirmed' | 'schedule.revision_requested'
  | 'schedule.deleted'
  // Settlement
  | 'settlement.paid'

type AuditInput = {
  actor_type: ActorType
  actor_id?: string | null
  actor_label?: string | null
  action: AuditAction | string
  target_type?: string | null
  target_id?: string | null
  target_label?: string | null
  details?: Record<string, unknown> | null
}

export async function logAudit(input: AuditInput) {
  const { error } = await supabase.from('audit_logs').insert({
    actor_type: input.actor_type,
    actor_id: input.actor_id ?? null,
    actor_label: input.actor_label ?? null,
    action: input.action,
    target_type: input.target_type ?? null,
    target_id: input.target_id ?? null,
    target_label: input.target_label ?? null,
    details: input.details ?? null,
  })
  if (error) console.error('[audit] insert failed', error)
}

// Resolve currently signed-in user → actor identity for logging.
export async function getActor(): Promise<{ type: ActorType; id: string | null; label: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) return { type: 'system', id: null, label: 'system' }
  const uid = session.user.id
  const [{ data: admin }, { data: agent }] = await Promise.all([
    supabase.from('admins').select('id, name').eq('auth_user_id', uid).maybeSingle(),
    supabase.from('agents').select('id, name, agent_number').eq('auth_user_id', uid).maybeSingle(),
  ])
  if (admin) {
    const a = admin as { id: string; name: string }
    return { type: 'admin', id: a.id, label: a.name }
  }
  if (agent) {
    const a = agent as { id: string; name: string; agent_number: string | null }
    return { type: 'agent', id: a.id, label: `${a.name}${a.agent_number ? ` · ${a.agent_number}` : ''}` }
  }
  return { type: 'system', id: null, label: 'system' }
}

// Convenience wrapper: getActor() + logAudit() in one call.
export async function logAsCurrentUser(
  action: AuditAction | string,
  target: { type: string; id?: string | null; label?: string | null } | null = null,
  details?: Record<string, unknown> | null,
) {
  const actor = await getActor()
  await logAudit({
    actor_type: actor.type,
    actor_id: actor.id,
    actor_label: actor.label,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    target_label: target?.label ?? null,
    details: details ?? null,
  })
}
