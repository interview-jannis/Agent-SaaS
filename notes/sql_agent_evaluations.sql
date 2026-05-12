-- Agent Evaluations table
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS agent_evaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  admin_id        UUID REFERENCES admins(id) ON DELETE SET NULL,
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags            TEXT[] NOT NULL DEFAULT '{}',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_evaluations DISABLE ROW LEVEL SECURITY;
GRANT ALL ON agent_evaluations TO anon, authenticated, service_role;

CREATE INDEX idx_agent_evaluations_agent_id ON agent_evaluations(agent_id);
CREATE INDEX idx_agent_evaluations_case_id  ON agent_evaluations(case_id);
