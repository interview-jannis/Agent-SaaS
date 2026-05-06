-- 2026-05-06: track item provenance and soft-delete on document_items.
--
-- Edit Selected Products (admin) needs to show three persistent states even
-- after save:
--   • Original     — what the agent quoted (origin='original')
--   • Added        — what admin added during schedule build (origin='admin_added')
--   • Removed      — what admin removed (removed_at set; row preserved)
--
-- All consumers that sum / render line items must filter `removed_at IS NULL`
-- so a removed line doesn't appear in customer-facing invoices, totals,
-- partner payouts, or settlement calculations. Edit Selected Products is the
-- one surface that intentionally shows all rows.

ALTER TABLE document_items
  ADD COLUMN IF NOT EXISTS origin     TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE document_items
    ADD CONSTRAINT document_items_origin_check
      CHECK (origin IN ('original', 'admin_added'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index for "give me active items in this document" query — common path.
CREATE INDEX IF NOT EXISTS document_items_active_idx
  ON document_items (document_id) WHERE removed_at IS NULL;
