-- Prevent any modification to document_items belonging to quotation documents.
-- Quotations are immutable snapshots; all edits must target the draft final_invoice.

CREATE OR REPLACE FUNCTION prevent_quotation_item_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  doc_type TEXT;
BEGIN
  -- For DELETE the row data is in OLD; for INSERT/UPDATE it's in NEW.
  SELECT d.type INTO doc_type
  FROM documents d
  WHERE d.id = COALESCE(NEW.document_id, OLD.document_id);

  IF doc_type = 'quotation' THEN
    RAISE EXCEPTION 'document_items for quotation documents are immutable. Target the draft final_invoice instead.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_items_immutable ON document_items;
CREATE TRIGGER trg_quotation_items_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON document_items
  FOR EACH ROW EXECUTE FUNCTION prevent_quotation_item_mutation();
