-- 2026-05-06: 3-party case contracts — evidentiary parity with NDA/Partnership.
--
-- Adds per-side signature_hash, signed_typed_name, ip_address, user_agent
-- columns. NDA/Partnership got these on 2026-05-04; 3-party case contracts
-- were still doing client-side direct DB writes with no hash / IP / typed
-- name verification. 3-party commits actual money flow (deposit trigger),
-- so it deserves the same evidence trail.
--
-- Existing single ip_address / user_agent columns (unused in code) are left
-- alone for backward compat. New per-side columns are the canonical source.

ALTER TABLE case_contracts
  ADD COLUMN IF NOT EXISTS agent_signature_hash    TEXT,
  ADD COLUMN IF NOT EXISTS agent_signed_typed_name TEXT,
  ADD COLUMN IF NOT EXISTS agent_ip_address        TEXT,
  ADD COLUMN IF NOT EXISTS agent_user_agent        TEXT,
  ADD COLUMN IF NOT EXISTS client_signature_hash    TEXT,
  ADD COLUMN IF NOT EXISTS client_signed_typed_name TEXT,
  ADD COLUMN IF NOT EXISTS client_ip_address        TEXT,
  ADD COLUMN IF NOT EXISTS client_user_agent        TEXT,
  ADD COLUMN IF NOT EXISTS admin_signature_hash    TEXT,
  ADD COLUMN IF NOT EXISTS admin_signed_typed_name TEXT,
  ADD COLUMN IF NOT EXISTS admin_ip_address        TEXT,
  ADD COLUMN IF NOT EXISTS admin_user_agent        TEXT;
