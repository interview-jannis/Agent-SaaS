-- Strengthen agent_contracts evidentiary value.
--
-- 1) signature_hash       — SHA-256 of signature_data_url at sign time. Lets us
--                           prove the stored signature has not been swapped
--                           after the fact (admin row update would change the
--                           image, but not this hash).
-- 2) signed_typed_name    — name the agent typed verbatim before signing. Pairs
--                           with the canvas signature so we have both biometric
--                           (drawn) and explicit (typed) intent of the named
--                           individual under Korean Electronic Signatures Act
--                           (§3 일반전자서명).
-- 3) admin_signature_hash — same protection for the counter-signature.
-- 4) admin_signed_typed_name — same explicit-intent capture for the admin.
-- 5) IP columns are already present; no schema change there.

ALTER TABLE agent_contracts
  ADD COLUMN IF NOT EXISTS signature_hash TEXT,
  ADD COLUMN IF NOT EXISTS signed_typed_name TEXT,
  ADD COLUMN IF NOT EXISTS admin_signature_hash TEXT,
  ADD COLUMN IF NOT EXISTS admin_signed_typed_name TEXT;
