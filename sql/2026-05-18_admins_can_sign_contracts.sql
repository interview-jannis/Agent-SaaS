-- Add can_sign_contracts capability flag to admins.
-- Separates contract counter-signing (legal representative) from general
-- super-admin operational powers (settings, agent approval, admin invites).
--
-- Default false to avoid surprise: existing super admins are backfilled to
-- true so the current signing flow keeps working until the super admin
-- explicitly reassigns the capability (e.g. transfers it to the CEO once
-- that account is created).

ALTER TABLE admins ADD COLUMN IF NOT EXISTS can_sign_contracts BOOLEAN DEFAULT false;

UPDATE admins
SET can_sign_contracts = true
WHERE is_super_admin = true
  AND can_sign_contracts IS DISTINCT FROM true;
