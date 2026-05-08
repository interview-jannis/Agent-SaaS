-- 2026-05-08: K-Medical 서브카테고리 명칭 통일 + sort_order 재정렬 + 신규 추가
--
-- 현재 DB 상태: Health Check-up / Women's Health / Dental (모두 sort_order=0)
--
-- 확정 순서:
--   1. Health Screening  (← Health Check-up rename)
--   2. Dental Care       (← Dental rename)
--   3. Eye Care          (신규 INSERT)
--   4. Women's Health    (그대로, sort_order만 설정)
--   5. Korean Medicine   (신규 INSERT)

UPDATE product_subcategories
SET name = 'Health Screening', sort_order = 1
WHERE name = 'Health Check-up'
  AND category_id = (SELECT id FROM product_categories WHERE name = 'K-Medical');

UPDATE product_subcategories
SET name = 'Dental Care', sort_order = 2
WHERE name = 'Dental'
  AND category_id = (SELECT id FROM product_categories WHERE name = 'K-Medical');

INSERT INTO product_subcategories (category_id, name, sort_order)
SELECT id, 'Eye Care', 3
FROM product_categories WHERE name = 'K-Medical'
ON CONFLICT DO NOTHING;

UPDATE product_subcategories
SET sort_order = 4
WHERE name = 'Women''s Health'
  AND category_id = (SELECT id FROM product_categories WHERE name = 'K-Medical');

INSERT INTO product_subcategories (category_id, name, sort_order)
SELECT id, 'Korean Medicine', 5
FROM product_categories WHERE name = 'K-Medical'
ON CONFLICT DO NOTHING;
