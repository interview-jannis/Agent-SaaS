-- ════════════════════════════════════════════════════════════════════════════
-- product_variants — same product, different session counts / shot counts /
-- volumes / grades. Each variant has its own price; the product holds the
-- shared metadata (name, description, partner, duration, tags, etc).
-- Date: 2026-05-04
--
-- Compatibility: products.base_price stays for now as a "representative"
-- price; new code reads from product_variants. Old document_items get
-- backfilled to point at each product's default variant.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- NULL or empty string means this is the sole/default variant for the product.
  variant_label TEXT,
  base_price NUMERIC NOT NULL,
  price_currency TEXT NOT NULL DEFAULT 'KRW',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants(product_id);
ALTER TABLE product_variants DISABLE ROW LEVEL SECURITY;
GRANT ALL ON product_variants TO anon, authenticated;


-- Backfill: ensure every existing product has at least one variant.
-- Idempotent — only inserts when none exist for a product.
INSERT INTO product_variants (product_id, variant_label, base_price, price_currency, sort_order)
SELECT id, NULL, COALESCE(base_price, 0), COALESCE(price_currency, 'KRW'), 0
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id);


-- document_items: track which variant was selected, and snapshot the label
-- so finalized quotes/invoices keep showing the right thing even if the
-- variant gets renamed/deleted later.
ALTER TABLE document_items
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_label_snapshot TEXT;


-- Backfill existing document_items: link each to its product's default variant.
-- Only updates rows missing variant_id (idempotent).
UPDATE document_items di
SET variant_id = (
  SELECT v.id FROM product_variants v
  WHERE v.product_id = di.product_id
  ORDER BY v.sort_order, v.created_at
  LIMIT 1
)
WHERE di.product_id IS NOT NULL AND di.variant_id IS NULL;
