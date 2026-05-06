-- 2026-05-06: free-form notes from agent to admin (per case).
--
-- Drives the "agent → admin" memo path: agent leaves context like "Day 3 free
-- requested by client" or "client prefers afternoon procedures" when the
-- quote is created, admin reads it while building the schedule.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS agent_notes TEXT;
