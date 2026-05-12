-- Intake sessions: agent selects clients → single shared link for all of them.
-- One session can cover 1–N clients (e.g. a family group).

CREATE TABLE IF NOT EXISTS intake_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  agent_id      UUID REFERENCES agents(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE intake_sessions DISABLE ROW LEVEL SECURITY;
GRANT ALL ON intake_sessions TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS intake_session_clients (
  session_id UUID NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, client_id)
);

ALTER TABLE intake_session_clients DISABLE ROW LEVEL SECURITY;
GRANT ALL ON intake_session_clients TO anon, authenticated, service_role;
