-- Restore document_items.quantity for Trip Services items that were
-- incorrectly overwritten with scheduled_days (should be contracted days = trip length).
UPDATE document_items di
SET quantity = (
  SELECT GREATEST(
    (c.travel_end_date::date - c.travel_start_date::date) + 1,
    1
  )
  FROM document_groups dg
  JOIN documents doc ON doc.id = dg.document_id
  JOIN cases c ON c.id = doc.case_id
  WHERE dg.id = di.document_group_id
    AND dg.name = 'Trip Services'
    AND c.travel_start_date IS NOT NULL
    AND c.travel_end_date IS NOT NULL
)
WHERE di.is_overtime_item IS NOT TRUE
  AND di.removed_at IS NULL
  AND di.document_group_id IN (
    SELECT id FROM document_groups WHERE name = 'Trip Services'
  )
  AND di.quantity < (
    SELECT GREATEST(
      (c.travel_end_date::date - c.travel_start_date::date) + 1,
      1
    )
    FROM document_groups dg
    JOIN documents doc ON doc.id = dg.document_id
    JOIN cases c ON c.id = doc.case_id
    WHERE dg.id = di.document_group_id
      AND c.travel_start_date IS NOT NULL
      AND c.travel_end_date IS NOT NULL
  );
