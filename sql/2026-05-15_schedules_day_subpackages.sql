-- Day-level concierge subpackage assignments per schedule version.
-- Map of { "<dayNumber>": ["<variantId>", ...] }.
-- Drives the per-day default concierge (interpreter / concierge / security / etc.)
-- and the "Trip services not fully scheduled" coverage count in ScheduleEditor.
-- Item-level tripServiceVariantIds remain as optional overrides.
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS day_subpackages JSONB NOT NULL DEFAULT '{}'::jsonb;
