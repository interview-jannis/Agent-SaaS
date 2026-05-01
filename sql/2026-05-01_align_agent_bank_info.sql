-- ════════════════════════════════════════════════════════════════════════════
-- Align agents.bank_info JSONB schema with admin's system_settings.bank_details
-- Date: 2026-05-01
--
-- Rename keys so agent-issued invoices (Deposit, Commission) render the same
-- bank block as admin-issued invoices via QuoteDocument's shared BankDetails
-- type:
--   bank_address     → address
--   account_holder   → beneficiary
--   (new optional)   → beneficiary_number
--
-- Idempotent — checks for old key presence before renaming.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE agents
SET bank_info = (bank_info - 'bank_address' - 'account_holder')
  || jsonb_strip_nulls(jsonb_build_object(
    'address', bank_info->>'bank_address',
    'beneficiary', bank_info->>'account_holder'
  ))
WHERE bank_info ? 'bank_address' OR bank_info ? 'account_holder';
