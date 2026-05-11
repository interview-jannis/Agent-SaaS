-- 결제 확인 시점의 환율을 스냅샷으로 저장
-- payment_received_at 기록 시 함께 저장되어 overview USD 환산에 사용
ALTER TABLE documents ADD COLUMN IF NOT EXISTS exchange_rate_snapshot numeric;
