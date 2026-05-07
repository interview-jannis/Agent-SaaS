-- Add concierge contact fields to schedules table.
-- Admin can override the default (agent name/phone) per schedule version.
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS concierge_name  TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS concierge_phone TEXT;
