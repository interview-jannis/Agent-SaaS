-- Replace hardcoded AGENT signature section with {{AGENT_SIGNATURE_BLOCK}} token.
-- The token is substituted server-side at signing time:
--   - Individual agent  → "Name: **Ahmed Al-Rashid**"
--   - Corporate agent   → "Agent / Company Name: **Al-Rashid Travel LLC**\nRepresentative Name: **Ahmed Al-Rashid**"
-- This patch normalises templates that may have any of the old hardcoded variants.

-- Pattern A: two-line "Agent / Company Name + Representative Name" (old format)
UPDATE contract_templates SET
  body = replace(
    body,
    E'Agent / Company Name: **{{AGENT_NAME}}**\nRepresentative Name: **{{AGENT_NAME}}**',
    '{{AGENT_SIGNATURE_BLOCK}}'
  ),
  updated_at = now()
WHERE contract_type IN ('nda', 'partnership')
  AND body LIKE '%Agent / Company Name:%';

-- Pattern B: single "Name: **{{AGENT_NAME}}**" line (260517 format before this patch)
UPDATE contract_templates SET
  body = replace(
    body,
    E'Name: **{{AGENT_NAME}}**',
    '{{AGENT_SIGNATURE_BLOCK}}'
  ),
  updated_at = now()
WHERE contract_type IN ('nda', 'partnership')
  AND body LIKE '%Name: **{{AGENT_NAME}}**%';
