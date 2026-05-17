-- Update contract templates with official contract text (260515_vf)
-- Tokens substituted at signing time:
--   {{AGENT_NAME}}         → agent's registered name
--   {{CLIENT_NAME}}        → lead client's name  (Tripartite only)
--   {{CASE_NUMBER}}        → case number          (Tripartite only)
--   {{QUOTE_NUMBER}}       → quotation number     (Tripartite only)
--   {{TOTAL_AMOUNT}}       → total trip cost USD  (Tripartite only)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. NDA
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE contract_templates SET
  title      = 'Agent Non-Disclosure Agreement (NDA)',
  body       = $BODY$
## AGENT NON-DISCLOSURE AGREEMENT (NDA)
For VIP Medical & Wellness Tourism Service Platform

## 1. PURPOSE
The purpose of this Agreement is to protect confidential and proprietary information disclosed by the Company to the Agent in connection with VIP medical tourism services, Agent SaaS platform usage, customer acquisition activities, business operations, partnership discussions, operational workflows, pricing structures, and strategic business information.

## 2. CONFIDENTIAL INFORMATION
Confidential Information includes business information, customer information, technical information, and marketing information including pricing structures, customer identities, schedules, SaaS architecture, workflows, and operational SOPs.

## 3. OBLIGATIONS OF THE AGENT
The Agent agrees not to disclose confidential information to third parties, to use such information solely for authorized business activities, to protect the information from unauthorized access, and not to bypass the Company for competing purposes for 3 years following termination.

## 4. EXCLUSIONS
Confidential Information does not include information publicly available, lawfully known prior to disclosure, independently developed without use of confidential information, or required by law to be disclosed.

## 5. DATA PRIVACY & CUSTOMER PROTECTION
The Agent agrees to comply with applicable privacy laws and to use customer data only within authorized business activities and approved systems.

## 6. INTELLECTUAL PROPERTY
All materials, workflows, templates, branding, and systems remain the exclusive property of the Company.

## 7. TERM
This Agreement shall remain effective during the business relationship and for an additional 3 years after termination.

## 8. BREACH & REMEDIES
The Company may suspend access, seek damages, injunctive relief, or pursue legal remedies in the event of breach.

## 9. GOVERNING LAW
This Agreement shall be governed under the laws of the Republic of Korea and disputes shall be subject to the jurisdiction of Incheon courts.

## 10. ENTIRE AGREEMENT
This Agreement constitutes the entire understanding between the Parties regarding confidentiality obligations.

## 11. SIGNATURES

**COMPANY**
Company Name: Interview Co., Ltd.
Representative Name: Sung-min Park

**AGENT**
{{AGENT_SIGNATURE_BLOCK}}
$BODY$,
  updated_at = now()
WHERE contract_type = 'nda';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Partnership Master Agreement
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE contract_templates SET
  title      = 'Agent Partnership Master Agreement',
  body       = $BODY$
## AGENT PARTNERSHIP MASTER AGREEMENT
Including Commission Policy, Anti-Bribery Compliance, DPA, and Brand Usage Guideline

This Agreement is entered into between Interview Co., Ltd. (the "Company") and the Agent/Partner (the "Agent") for the purpose of establishing a VIP Medical & Wellness Tourism Service partnership.

## 1. PARTNERSHIP PURPOSE
The Agent shall promote, introduce, and support VIP customers for medical tourism, wellness, beauty, lifestyle, and concierge services provided by the Company.

## 2. AGENT RESPONSIBILITIES
The Agent shall conduct lawful marketing and customer acquisition activities, provide accurate customer information, support customer communication, and comply with Company SOPs and operational guidelines.

## 3. COMPANY RESPONSIBILITIES
The Company shall provide operational support, scheduling coordination, supplier management, invoicing, customer support, and commission settlement according to this Agreement.

## 4. COMMISSION POLICY AGREEMENT
Commission shall be calculated based on the net revenue actually received by the Company. The standard commission structure, payment schedule, deduction policy, and settlement timeline shall be separately communicated by the Company. Commission payments shall only be processed after successful completion of customer payments and invoice verification.

**▶ Standard commission structure (15~25%)**
1) 0 ~ 10 Clients/Month : Commission Rate 15%
2) 10 ~ 30 Clients/Month : Commission Rate 20%
3) 30 + Clients/Month : Commission Rate 25%

**▶ Performance Incentives**
1) High-Value Incentive : $50,000+ → Additional 5%
2) Retention Bonus : Re-Visiting customers → Additional 3%

## 5. PAYMENT & INVOICE POLICY
The Agent agrees to remit payments according to invoice terms issued by the Company. Delayed payments may result in suspension of services, schedules, or partnership status.

## 6. ANTI-BRIBERY & COMPLIANCE AGREEMENT
The Agent shall comply with all applicable anti-corruption, anti-bribery, anti-money laundering, and international compliance laws. The Agent shall not provide illegal payments, gifts, kickbacks, or benefits to any government official, partner organization, medical institution, or customer for improper business advantage.

## 7. DATA PROCESSING AGREEMENT (DPA)
The Agent agrees to process all personal data, medical information, customer identities, payment records, and operational data in compliance with applicable privacy and data protection laws. Customer information may only be used for authorized business purposes and shall not be transferred, sold, disclosed, or retained beyond necessary operational periods.

## 8. CONFIDENTIALITY
The Agent agrees to maintain confidentiality regarding all operational, financial, customer, technical, and strategic information obtained during the partnership period.

## 9. BRAND USAGE GUIDELINE
The Agent may use the Company's name, logo, proposal templates, and marketing materials solely for authorized partnership activities. Unauthorized modification, misrepresentation, or misuse of Company branding is strictly prohibited.

## 10. NON-CIRCUMVENTION
The Agent shall not bypass the Company to directly engage with Company partners, suppliers, or customers for competing or unauthorized transactions during the partnership term and for 3 years thereafter.

## 11. TERM & TERMINATION
This Agreement shall remain effective until terminated by either Party upon written notice. The Company reserves the right to terminate the Agreement immediately in case of legal violations, misconduct, reputational risk, or operational breach.

## 12. LIABILITY
The Agent shall be responsible for damages, legal claims, or losses resulting from unauthorized activities, false representations, data breaches, or compliance violations.

## 13. GOVERNING LAW
This Agreement shall be governed by the laws of the Republic of Korea, and disputes shall be subject to the jurisdiction of courts located in Incheon, Republic of Korea.

## 14. ENTIRE AGREEMENT
This document constitutes the complete agreement between the Parties and supersedes prior oral or written discussions regarding the partnership.

## SIGNATURES

**COMPANY**
Company Name: Interview Co., Ltd.
Representative Name: Sung-min Park

**AGENT**
{{AGENT_SIGNATURE_BLOCK}}
$BODY$,
  updated_at = now()
WHERE contract_type = 'partnership';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tripartite VIP Medical Tour Agreement
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE contract_templates SET
  title      = 'Tripartite VIP Medical Tour Agreement',
  body       = $BODY$
## TRIPARTITE VIP MEDICAL TOUR AGREEMENT
Between VIP Customer, Global Agent, and Interview Co., Ltd.

This Tripartite Agreement ("Agreement") is entered into among the Parties for the purpose of providing premium Korean medical tourism, wellness, and concierge services.

**Case:** {{CASE_NUMBER}} | **Quotation:** {{QUOTE_NUMBER}} | **Total:** {{TOTAL_AMOUNT}}

## 1. PARTIES
Party A – VIP Customer: VIP Customer receiving medical tourism services
Name: **{{CLIENT_NAME}}**

Party B – Agent: Global VIP Agent / Local Partner ("Agent")
Name: **{{AGENT_NAME}}**

Party C – Company: Interview Co., Ltd. ("Interview")

## 2. PURPOSE OF AGREEMENT
This Agreement defines the rights, obligations, operational procedures, payment structure, confidentiality obligations, and service conditions among the Parties.

## 3. SERVICE SCOPE
Services may include medical consultation, medical procedure coordination, wellness services, luxury tourism, halal arrangements, transportation, concierge, hotel booking, and translation services.

## 4. ROLE OF THE COMPANY
The Company shall coordinate Korean suppliers, hospitals, schedules, reservations, invoicing, customer support, and overall VIP operations.

## 5. ROLE OF THE AGENT
The Agent shall source and manage VIP customers, conduct consultations, deliver proposals, collect payments, and support customer communications.

## 6. ROLE OF THE VIP CUSTOMER
The VIP Customer shall provide accurate information, fulfill payment obligations, cooperate with schedules, and follow medical institution guidelines.

## 7. PAYMENT TERMS
The VIP Customer shall pay 50% deposit upon final approval and remaining 50% before departure to Korea unless otherwise agreed in writing.

## 8. ADDITIONAL SERVICES
Additional services requested during the stay in Korea shall require separate quotation approval and payment before reservation.

## 9. REFUND & CANCELLATION
Refund eligibility depends on reservation status, operational expenses, hospital policy, and timing of cancellation.

## 10. MEDICAL DISCLAIMER
The Company and Agent do not guarantee medical outcomes. Final medical responsibility remains with licensed Korean medical providers.

## 11. PRIVACY & DATA PROCESSING
All Parties shall comply with applicable privacy and data protection laws. Customer information shall only be used for authorized operational purposes.

## 12. CONFIDENTIALITY
All operational, medical, pricing, and customer information exchanged under this Agreement shall remain confidential.

## 13. SHARIA & CULTURAL CONSIDERATION
Reasonable efforts shall be made to support halal food, prayer schedules, privacy, and Muslim-friendly operational preferences.

## 14. ANTI-BRIBERY & COMPLIANCE
All Parties shall comply with anti-corruption, anti-money laundering, and international compliance laws.

## 15. FORCE MAJEURE
No Party shall be liable for delays or failures caused by events beyond reasonable control.

## 16. LIABILITY LIMITATION
The Company and Agent shall not be liable for indirect damages, medical complications, or third-party provider failures.

## 17. GOVERNING LAW
This Agreement shall be governed by the laws of the Republic of Korea and disputes shall be subject to Incheon courts.

## 18. ENTIRE AGREEMENT
This Agreement constitutes the complete understanding among the Parties.

**KEY CLAUSES RECOMMENDED**
- Emergency medical consent procedure
- Hospital liability separation
- Luxury concierge disclaimer
- Currency exchange policy
- VIP transportation policy
- Social media and publicity consent
- Non-circumvention clause
- Commission settlement standard
- Customer conduct obligations
- Halal and prayer support policy

## SIGNATURES

**VIP CUSTOMER**
Name: **{{CLIENT_NAME}}**

**AGENT**
Name: **{{AGENT_NAME}}**

**Interview Co., Ltd.**
Name: Sung-min Park
$BODY$,
  updated_at = now()
WHERE contract_type = 'three_party';
