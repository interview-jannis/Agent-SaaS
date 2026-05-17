-- Add is_overtime_item flag to document_items.
-- Overtime line items are auto-created/deleted by calcAndStoreOvertimeHours
-- when admin adjusts per-day service hours in the Schedule Editor.
-- They are aggregated per variant (all days summed into one row).

ALTER TABLE document_items ADD COLUMN IF NOT EXISTS is_overtime_item boolean DEFAULT false;
