-- Fix final_invoice document_items missing variant_id + variant_label_snapshot.
-- Root cause: issueInvoice() copied quotation items without carrying these fields.
-- Matches by: case_id → group name (same group copied) → product_id + sort_order.
-- Only updates origin='original' items (copied from quotation, not admin_added).

UPDATE document_items fi
SET
  variant_id            = q.variant_id,
  variant_label_snapshot = q.variant_label_snapshot
FROM document_items q
JOIN document_groups q_grp  ON q_grp.id  = q.document_group_id
JOIN documents       q_doc  ON q_doc.id  = q_grp.document_id AND q_doc.type = 'quotation'
JOIN document_groups fi_grp ON fi_grp.name = q_grp.name
JOIN documents       fi_doc ON fi_doc.id  = fi_grp.document_id
                            AND fi_doc.type    = 'final_invoice'
                            AND fi_doc.case_id = q_doc.case_id
WHERE fi.document_group_id  = fi_grp.id
  AND fi.product_id          = q.product_id
  AND fi.sort_order          = q.sort_order
  AND fi.variant_id          IS NULL
  AND fi.origin              = 'original'
  AND fi.removed_at          IS NULL
  AND q.variant_id           IS NOT NULL;
