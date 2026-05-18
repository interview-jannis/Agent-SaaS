-- Persist day_subpackages on every Save Draft, even before a full schedule save exists.
-- Falls back when latestSchedule is null so the Build Schedule chips survive page refresh.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS day_subpackages_draft JSONB;
