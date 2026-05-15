-- Rename K-Wellness SPA subcategory to "SPA & Aesthetic".
-- Handles two legacy spellings that may exist: "Spa" and "SPA".
-- Merges them into a single canonical "SPA & Aesthetic" row.

DO $$
DECLARE
  cat_id UUID;
  canonical_id UUID;
  old_id UUID;
BEGIN
  SELECT id INTO cat_id FROM product_categories WHERE name = 'K-Wellness';
  IF cat_id IS NULL THEN RETURN; END IF;

  -- Ensure canonical row exists (rename "Spa" → "SPA & Aesthetic" if present)
  UPDATE product_subcategories SET name = 'SPA & Aesthetic'
  WHERE category_id = cat_id AND name = 'Spa';

  -- If "SPA" (all-caps) also exists as a separate row, merge it into canonical
  SELECT id INTO canonical_id FROM product_subcategories
    WHERE category_id = cat_id AND name = 'SPA & Aesthetic';
  SELECT id INTO old_id FROM product_subcategories
    WHERE category_id = cat_id AND name = 'SPA';

  IF old_id IS NOT NULL AND canonical_id IS NOT NULL THEN
    -- Move product primary subcategory_id references
    UPDATE products SET subcategory_id = canonical_id
    WHERE subcategory_id = old_id;
    -- Move junction table tags
    -- (delete duplicates first, then update remaining)
    DELETE FROM product_subcategory_tags
    WHERE subcategory_id = old_id
      AND product_id IN (
        SELECT product_id FROM product_subcategory_tags WHERE subcategory_id = canonical_id
      );
    UPDATE product_subcategory_tags SET subcategory_id = canonical_id
    WHERE subcategory_id = old_id;
    -- Remove the now-empty old row
    DELETE FROM product_subcategories WHERE id = old_id;
  END IF;
END $$;
