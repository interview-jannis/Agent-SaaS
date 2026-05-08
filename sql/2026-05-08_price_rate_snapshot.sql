-- 2026-05-08: 상품 가격 환율 고정 + 문서 금액 잠금
--
-- 1. documents.price_rate_snapshot — 문서 생성 시 product_price_rate 저장.
--    QuoteDocument는 이 값만 사용해서 달러 변환 → 환율 설정 변경이 기존 문서에 영향 없음.
--
-- 2. system_settings에 product_price_rate 초기값 삽입 (1500원 고정 환율).
--    - 상품 달러 표시 및 신규 문서 생성에만 사용
--    - exchange_rate는 이후 Admin Overview 원화 매출 계산용으로만 사용

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS price_rate_snapshot NUMERIC;

-- 기존 문서들은 null → 코드에서 1500 fallback 처리됨.

-- product_price_rate 초기값 (없는 경우에만 삽입)
INSERT INTO system_settings (key, value)
VALUES ('product_price_rate', '{"usd_krw": 1500}')
ON CONFLICT (key) DO NOTHING;
