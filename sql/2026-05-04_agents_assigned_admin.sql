-- Add agents.assigned_admin_id — a single admin "owns" each agent for routing
-- notifications and (eventually) gating case-level write actions. Set on
-- approval (the admin who approved becomes the owner). Reassignable by super
-- admin only via UI. ON DELETE SET NULL so deleting an admin doesn't break the
-- agent row — those agents fall back to the super-admin inbox.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS assigned_admin_id uuid
    REFERENCES admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_assigned_admin_id
  ON agents(assigned_admin_id);
