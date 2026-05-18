-- Fix overtime items that were incorrectly copied from quotation to final_invoice
-- without the is_overtime_item flag (issueInvoice bug now fixed in code).
--
-- These copied OT items have:
--   - origin = 'original' (wrong — real OT items are 'admin_added')
--   - is_overtime_item IS NULL (should be true for OT items, or simply shouldn't exist)
--
-- Strategy: remove OT items from final_invoice documents that have is_overtime_item = NULL
-- but whose product_name_snapshot ends with '– Overtime' (copied from quotation OT items).
-- Real OT items (is_overtime_item = true) are kept intact.
--
-- After running this SQL, use the "Save Draft" button in ScheduleEditor
-- (or re-open the case which will auto-recalculate) to regenerate correct OT items.

-- Step 1: Soft-delete copied OT items in final_invoices (identified by name suffix)
UPDATE document_items
SET removed_at = NOW()
FROM documents d
WHERE document_items.document_id = d.id
  AND d.type = 'final_invoice'
  AND document_items.is_overtime_item IS NULL
  AND document_items.removed_at IS NULL
  AND document_items.product_name_snapshot LIKE '%– Overtime';

-- Step 2: Also reset base item final_price to base_price × quantity
-- for Trip Services items where final_price was inflated by the old updateItemOvertimeHours
-- (which incorrectly embedded OT cost into final_price).
-- Only targets Trip Services group items in final_invoices.
UPDATE document_items di
SET final_price = di.base_price * di.quantity
FROM document_groups dg
JOIN documents d ON d.id = dg.document_id
WHERE di.document_group_id = dg.id
  AND d.type = 'final_invoice'
  AND dg.name = 'Trip Services'
  AND di.is_overtime_item IS NOT TRUE
  AND di.removed_at IS NULL
  AND di.overtime_hours > 0
  -- Only reset if final_price > base_price × quantity (indicates OT was embedded)
  AND di.final_price > di.base_price * di.quantity;
