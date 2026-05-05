-- 2026-05-05: schedules.items JSONB column for native (non-PDF) schedules.
--
-- Schedule shifts from PDF upload to in-app editor (Day cards + Add Item form).
-- Output rendered by ScheduleDocument.tsx in the editorial Option A template.
--
-- Backward compat: existing rows keep pdf_url; new rows use items.
-- /schedule/[slug] page renders items if present, else falls back to pdf_url.
-- A schedule row may have one of (items, pdf_url) — never both. We don't add
-- a CHECK so legacy/edge cases stay flexible.

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS items JSONB;

-- Items shape (typed in TS as ScheduleItem[]):
--   [
--     {
--       "id": "uuid",                     -- client-generated for React key + reorder
--       "day": 1,                         -- 1-indexed day
--       "block": "morning"|"afternoon"|"evening",
--       "time": "10:30" | null,           -- optional explicit time, sorts within block
--       "title": "DIAR Clinic · Cheongdam",
--       "location": "Seoul" | null,
--       "notes": "Halal lunch arranged" | null,
--       "variantId": "uuid" | null,       -- optional ref to product_variants for context
--       "sortOrder": 0                    -- within (day, block) ties
--     },
--     ...
--   ]

-- pdf_url stays nullable; existing rows untouched.
ALTER TABLE schedules
  ALTER COLUMN pdf_url DROP NOT NULL;
