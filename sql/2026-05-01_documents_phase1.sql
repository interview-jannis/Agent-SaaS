-- ════════════════════════════════════════════════════════════════════════════
-- Documents Model — Phase 1: Schema + Data Migration
-- Date: 2026-05-01
--
-- Goal: replace single `quotes` row (which serves as both Quotation and Invoice)
-- with a unified `documents` table that supports 5 document types in 4/30 SOP:
--   - quotation
--   - deposit_invoice
--   - final_invoice
--   - additional_invoice  (multiple allowed per case)
--   - commission_invoice  (admin → agent direction)
--
-- Phase 1 (this file): create new tables, migrate data, verify counts.
--   Old `quotes/quote_*` tables are LEFT IN PLACE — code still reads from them
--   until Phase 2.
--
-- Phase 2 (future): once all code reads/writes from documents, DROP old tables.
--
-- This script is idempotent — re-running won't duplicate rows.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Create tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'quotation',
    'deposit_invoice',
    'final_invoice',
    'additional_invoice',
    'commission_invoice'
  )),

  -- Identifiers
  document_number TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,

  -- Pricing snapshot
  total_price NUMERIC,
  company_margin_rate NUMERIC,
  agent_margin_rate NUMERIC,

  -- Lifecycle (per document)
  finalized_at TIMESTAMPTZ,
  payment_due_date DATE,
  payment_received_at TIMESTAMPTZ,

  -- Frozen at finalize
  signer_snapshot JSONB,

  -- Customer engagement
  first_opened_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS documents_case_idx ON documents(case_id);
CREATE INDEX IF NOT EXISTS documents_type_idx ON documents(type);
CREATE INDEX IF NOT EXISTS documents_slug_idx ON documents(slug);
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
GRANT ALL ON documents TO anon, authenticated;


CREATE TABLE IF NOT EXISTS document_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  name TEXT,
  member_count INT DEFAULT 1,
  "order" INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_groups_doc_idx ON document_groups(document_id);
ALTER TABLE document_groups DISABLE ROW LEVEL SECURITY;
GRANT ALL ON document_groups TO anon, authenticated;


CREATE TABLE IF NOT EXISTS document_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_group_id UUID REFERENCES document_groups(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  -- Snapshot — preserves doc integrity if product is deleted/renamed
  product_name_snapshot TEXT,
  product_partner_snapshot TEXT,

  base_price NUMERIC,
  final_price NUMERIC,
  quantity INT DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_items_doc_idx ON document_items(document_id);
CREATE INDEX IF NOT EXISTS document_items_group_idx ON document_items(document_group_id);
ALTER TABLE document_items DISABLE ROW LEVEL SECURITY;
GRANT ALL ON document_items TO anon, authenticated;


CREATE TABLE IF NOT EXISTS document_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_group_id UUID NOT NULL REFERENCES document_groups(id) ON DELETE CASCADE,
  case_member_id UUID NOT NULL REFERENCES case_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_group_members_dg_idx ON document_group_members(document_group_id);
ALTER TABLE document_group_members DISABLE ROW LEVEL SECURITY;
GRANT ALL ON document_group_members TO anon, authenticated;


-- ─── 2. Migrate quotes → documents (quotation rows) ─────────────────────────
-- Preserve UUIDs so existing schedules.quote_id keeps pointing at the
-- corresponding quotation document.

INSERT INTO documents (
  id, case_id, type, document_number, slug,
  total_price, company_margin_rate, agent_margin_rate,
  finalized_at, payment_due_date, payment_received_at,
  signer_snapshot, first_opened_at, open_count,
  created_at
)
SELECT
  q.id,
  q.case_id,
  'quotation',
  q.quote_number,
  q.slug,
  q.total_price,
  q.company_margin_rate,
  q.agent_margin_rate,
  q.finalized_at,
  q.payment_due_date,
  c.payment_confirmed_at,
  q.signer_snapshot,
  q.first_opened_at,
  COALESCE(q.open_count, 0),
  COALESCE(c.created_at, now())
FROM quotes q
LEFT JOIN cases c ON c.id = q.case_id
ON CONFLICT (id) DO NOTHING;


-- ─── 3. Migrate finalized quotes → final_invoice documents ──────────────────
-- For each quote that has finalized_at + invoice_number, create a separate
-- final_invoice document mirroring the quotation snapshot at finalize-time.

INSERT INTO documents (
  case_id, type, document_number, slug,
  total_price, company_margin_rate, agent_margin_rate,
  finalized_at, payment_due_date, payment_received_at,
  signer_snapshot, first_opened_at, open_count,
  created_at
)
SELECT
  q.case_id,
  'final_invoice',
  q.invoice_number,
  encode(gen_random_bytes(8), 'hex'),  -- new slug for invoice URL
  q.total_price,
  q.company_margin_rate,
  q.agent_margin_rate,
  q.finalized_at,
  q.payment_due_date,
  c.payment_confirmed_at,
  q.signer_snapshot,
  q.invoice_first_opened_at,
  0,
  q.finalized_at
FROM quotes q
LEFT JOIN cases c ON c.id = q.case_id
WHERE q.finalized_at IS NOT NULL
  AND q.invoice_number IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM documents d
    WHERE d.case_id = q.case_id AND d.type = 'final_invoice'
  );


-- ─── 4. Migrate quote_groups → document_groups (quotation side) ─────────────
-- Preserve quote_group UUIDs so quote_group_members FK migration is trivial.

INSERT INTO document_groups (
  id, document_id, name, member_count, "order", created_at
)
SELECT
  qg.id,
  qg.quote_id,
  qg.name,
  qg.member_count,
  qg."order",
  now()
FROM quote_groups qg
ON CONFLICT (id) DO NOTHING;


-- ─── 5. Mirror document_groups into final_invoice documents ─────────────────
-- For cases that have a final_invoice document, copy the quote_groups to
-- attach groups to that invoice as well.

INSERT INTO document_groups (document_id, name, member_count, "order", created_at)
SELECT
  fi.id,
  qg.name,
  qg.member_count,
  qg."order",
  now()
FROM quote_groups qg
JOIN quotes q ON q.id = qg.quote_id
JOIN documents fi ON fi.case_id = q.case_id AND fi.type = 'final_invoice'
WHERE NOT EXISTS (
  SELECT 1 FROM document_groups dg
  WHERE dg.document_id = fi.id AND dg.name = qg.name AND dg."order" = qg."order"
);


-- ─── 6. Migrate quote_items → document_items (quotation side) ───────────────

INSERT INTO document_items (
  document_id, document_group_id, product_id,
  product_name_snapshot, product_partner_snapshot,
  base_price, final_price, sort_order
)
SELECT
  qi.quote_id,
  qi.quote_group_id,
  qi.product_id,
  p.name,
  p.partner_name,
  qi.base_price,
  qi.final_price,
  0
FROM quote_items qi
LEFT JOIN products p ON p.id = qi.product_id
WHERE NOT EXISTS (
  SELECT 1 FROM document_items di
  WHERE di.document_id = qi.quote_id
    AND di.product_id IS NOT DISTINCT FROM qi.product_id
    AND di.base_price IS NOT DISTINCT FROM qi.base_price
);


-- ─── 7. Mirror items into final_invoice documents ──────────────────────────

INSERT INTO document_items (
  document_id, document_group_id, product_id,
  product_name_snapshot, product_partner_snapshot,
  base_price, final_price, sort_order
)
SELECT
  fi.id,
  -- Map quote_group → matching final_invoice document_group (by name + order)
  (SELECT dg.id FROM document_groups dg
    JOIN quote_groups qg2 ON qg2.id = qi.quote_group_id
    WHERE dg.document_id = fi.id
      AND dg.name = qg2.name
      AND dg."order" = qg2."order"
    LIMIT 1),
  qi.product_id,
  p.name,
  p.partner_name,
  qi.base_price,
  qi.final_price,
  0
FROM quote_items qi
JOIN quotes q ON q.id = qi.quote_id
JOIN documents fi ON fi.case_id = q.case_id AND fi.type = 'final_invoice'
LEFT JOIN products p ON p.id = qi.product_id
WHERE NOT EXISTS (
  SELECT 1 FROM document_items di
  WHERE di.document_id = fi.id
    AND di.product_id IS NOT DISTINCT FROM qi.product_id
    AND di.base_price IS NOT DISTINCT FROM qi.base_price
);


-- ─── 8. Migrate quote_group_members → document_group_members ────────────────

INSERT INTO document_group_members (document_group_id, case_member_id, created_at)
SELECT qgm.quote_group_id, qgm.case_member_id, now()
FROM quote_group_members qgm
WHERE NOT EXISTS (
  SELECT 1 FROM document_group_members dgm
  WHERE dgm.document_group_id = qgm.quote_group_id
    AND dgm.case_member_id = qgm.case_member_id
);


-- ─── 9. Verification ────────────────────────────────────────────────────────
-- Run these manually to spot-check.

-- Row count parity:
--   SELECT (SELECT COUNT(*) FROM quotes) AS quotes,
--          (SELECT COUNT(*) FROM documents WHERE type='quotation') AS quotations,
--          (SELECT COUNT(*) FROM quotes WHERE finalized_at IS NOT NULL) AS finalized_quotes,
--          (SELECT COUNT(*) FROM documents WHERE type='final_invoice') AS final_invoices;

-- Item parity:
--   SELECT (SELECT COUNT(*) FROM quote_items) AS quote_items,
--          (SELECT COUNT(*) FROM document_items
--             WHERE document_id IN (SELECT id FROM documents WHERE type='quotation')) AS quotation_items,
--          (SELECT COUNT(*) FROM document_items
--             WHERE document_id IN (SELECT id FROM documents WHERE type='final_invoice')) AS final_invoice_items;

-- Group parity:
--   SELECT (SELECT COUNT(*) FROM quote_groups) AS quote_groups,
--          (SELECT COUNT(*) FROM document_groups
--             WHERE document_id IN (SELECT id FROM documents WHERE type='quotation')) AS quotation_groups,
--          (SELECT COUNT(*) FROM document_groups
--             WHERE document_id IN (SELECT id FROM documents WHERE type='final_invoice')) AS final_invoice_groups;

-- Total price parity:
--   SELECT q.id, q.total_price AS quote_tp, d.total_price AS doc_tp, q.total_price = d.total_price AS match
--   FROM quotes q JOIN documents d ON d.id = q.id
--   WHERE q.total_price IS DISTINCT FROM d.total_price;
