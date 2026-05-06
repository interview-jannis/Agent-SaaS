-- 2026-05-06: pin K-category sort order.
--
-- Display order across agent home + admin picker:
--   K-Medical, K-Beauty, K-Wellness, K-Starcation, K-Education, Subpackage
--
-- product_categories.sort_order is the single source of truth — agent home
-- already orders by it (page.tsx fetch), and the admin Edit Selected Products
-- picker is being updated to use it too. Run once.

UPDATE product_categories SET sort_order = 1 WHERE name = 'K-Medical';
UPDATE product_categories SET sort_order = 2 WHERE name = 'K-Beauty';
UPDATE product_categories SET sort_order = 3 WHERE name = 'K-Wellness';
UPDATE product_categories SET sort_order = 4 WHERE name = 'K-Starcation';
UPDATE product_categories SET sort_order = 5 WHERE name = 'K-Education';
UPDATE product_categories SET sort_order = 6 WHERE name = 'Subpackage';
