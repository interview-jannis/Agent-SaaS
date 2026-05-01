-- ════════════════════════════════════════════════════════════════════════════
-- Documents: add from_party + to_party for proper invoice direction tracking
-- Date: 2026-05-01
--
-- Rationale: per 4/30 SOP, two invoice types are issued by AGENT (not admin):
--   - Deposit invoice (agent → client): client pays agent the deposit
--   - Commission invoice (agent → admin): agent claims margin after travel
--
-- And one is admin → agent:
--   - Deposit settlement invoice: agent forwards collected deposit to admin
--
-- Without explicit from/to, we can't distinguish these and the customer-facing
-- /invoice/[slug] page can't know whose bank info / signer to render.
--
-- Backfill assumes existing rows were created under the old admin-only model.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE documents ADD COLUMN IF NOT EXISTS from_party TEXT
  CHECK (from_party IN ('admin', 'agent'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS to_party TEXT
  CHECK (to_party IN ('client', 'agent', 'admin'));

-- Backfill: all existing documents were admin-issued
UPDATE documents SET from_party = 'admin' WHERE from_party IS NULL;

-- Most existing documents (quotation, final_invoice, additional_invoice,
-- deposit_invoice under old model) targeted the client.
UPDATE documents SET to_party = 'client'
  WHERE to_party IS NULL
    AND type IN ('quotation', 'final_invoice', 'additional_invoice', 'deposit_invoice');

-- Existing commission_invoice rows were technically admin-issued under the old
-- model but the new model has them agent→admin. The migration below flips
-- direction for them so future renders (bank info, signer) work correctly.
UPDATE documents
  SET from_party = 'agent', to_party = 'admin'
  WHERE type = 'commission_invoice';

-- After backfill, enforce NOT NULL going forward
ALTER TABLE documents ALTER COLUMN from_party SET NOT NULL;
ALTER TABLE documents ALTER COLUMN to_party SET NOT NULL;
