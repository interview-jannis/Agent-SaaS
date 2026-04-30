-- ════════════════════════════════════════════════════════════════════════════
-- Drop schedules.quote_id FK constraint
-- Date: 2026-05-01
--
-- Why: schedules.quote_id used to FK quotes(id). After Documents Phase 1, new
-- cases write only to documents (not quotes), so the FK fails on insert.
-- The UUID stored in schedules.quote_id IS valid (matches the quotation
-- document id since UUIDs were preserved in migration), but the FK target is
-- the obsolete quotes table.
--
-- Quick fix: drop the FK constraint. Column stays as informational reference
-- to the quotation document. Rename to document_id in Phase 2 cleanup.
--
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_quote_id_fkey;
