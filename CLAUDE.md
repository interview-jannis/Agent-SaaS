@AGENTS.md

# CLAUDE.md — Agent SaaS 프로젝트 바이블

## 프로젝트 개요
(주)인터뷰가 개발 중인 글로벌·중동 VIP 의료관광 에이전트 전용 SaaS.
- 법인명: Interview Co., Ltd. (법적 계약 당사자)
- SaaS 브랜드명: **Tiktak** (UI 전역)
- 개발 방식: 바이블코딩, 2인 개발
- 일정: 킥오프 4/16 → 개발 완료 5/8 → 내부 시뮬레이션 5/11~15 → 런칭 5/18 (5주 MVP)

## 기술 스택
- Framework: Next.js (App Router, TypeScript)
- DB: Supabase (PostgreSQL)
- 인증: Supabase Auth (이메일/비밀번호)
- 파일 저장: Supabase Storage (스케줄 PDF)
- 이메일: Resend (결제 요청 자동 발송)
- 스타일: Tailwind CSS
- 배포: Vercel

## 번호 체계
- 클라이언트: #CL-
- 에이전트: #AG-
- 케이스: #C-
- 견적서: #Q-
- 인보이스: #INV- (가격 finalize 시 자동 발번, 듀얼 넘버링)
- 상품: #P-
- 정산: #S-

## 마진율 구조
- 고객 견적가 = 원가 × (1 + 회사 마진율) × (1 + 에이전트 마진율)
- 에이전트 마진율 자동 적용 (당월 travel_completed 환자 수 기준, case_members 합산)
  - 0~10명: 15%
  - 11~30명: 20%
  - 30명+: 25%
- 단위는 케이스가 아니라 **환자(patient)**. 그룹 4명 케이스 = 4명으로 카운트.

## 비즈니스 플로우

### Agent 온보딩
초대 링크 발급(Admin) → Orientation(PDF) → NDA(신원+서명) → Partnership(서명)
→ awaiting_approval → Admin 승인 → Setup Wizard(email/password/bank) → Agent Home

### 케이스 진행 (흐름 B — 4/24 미팅 결정)
견적(Quotation) → 스케줄 업로드 → 스케줄 컨펌 → 가격 Finalize(→ Invoice 발번) → 결제 → 여행 → 정산

상태 전이 (실제 DB는 8단계):
1. `awaiting_info` — 케이스 생성 직후, Trip Info / Client Info 미완성
2. `awaiting_schedule` — 정보 완료, admin 스케줄 작업 대기
3. `reviewing_schedule` — admin 업로드, agent 검토 대기
4. `awaiting_pricing` — agent 컨펌, admin 가격 finalize 대기
5. `awaiting_payment` — finalize 완료, Invoice 발번, 결제 대기
6. `awaiting_travel` — 결제 확정
7. `completed` — agent가 Mark Travel Complete
8. `canceled` — 결제 전(1~5) 단계에서만 cancel 가능. cancellation_reason / cancelled_at 기록

Admin 수동 개입:
1. Agent 초대 / 승인 / Reject (계약 검토 후)
2. 스케줄 업로드 (버전 관리, 2단계 프리뷰→Confirm)
3. 가격 Finalize (quote_items.final_price 인라인 편집, invoice_number 발번)
4. 결제 완료 확인 (payment_date 입력)
5. Partner Payouts 송금 처리 (병원/호텔 등)
6. Agent Settlement 지급 처리 (송금 후 paid_at 입력)

Agent 수동 개입:
1. Schedule Confirm / Request Revision
2. Mark Travel Complete (travel_completed_at 기록)
3. Cancel Case (payment 전 단계만)
4. Send Quotation/Invoice 링크 클립보드 복사 (finalize 전후로 라우트 자동 분기)

### 편집 잠금 정책
- **canceled 케이스**: Trip Info / Members / Travel Dates / Send 버튼 모두 비활성. View-only 배너 노출.
- **client 필수 필드**: 한 번 채워진 필드는 빈값으로 clear 불가. 값 변경은 가능. (Muslim 토글을 off로 바꾸면 Muslim-only 필드는 자동 정리되며 허용)
- **schedule 잠금**: schedule_confirmed 이후엔 업로드/삭제 불가 (canceled 포함).

## 화면 구조
- Agent (6탭): Home / Cases / Clients / Payouts / Dashboard / Profile
- Admin: Overview / Cases / Clients / Products / Categories / Agents / Settlement / Contracts / Settings / Audit Log
- 고객용 URL 페이지:
  - **/quote/[slug]** — Quotation (가격 finalize 전 단계)
  - **/invoice/[slug]** — Commercial Invoice (finalize 후, 은행 정보 포함)
  - 두 라우트 모두 `src/components/QuoteDocument.tsx` 공유, mode prop으로 분기
  - 같은 slug 사용 (quotes 1 row = 두 라우트). Send 버튼이 finalized_at 기준으로 라우트 선택
  - /schedule/[slug] (Schedule PDF)
- 초대: /invite/[token] (Agent 초대 링크 진입점)
- 온보딩: /onboarding (Welcome/Orientation/NDA/Partnership/Waiting/Setup)
- 계약 뷰어: /onboarding/contract/[id] (Agent 본인), /admin/agents/[id]/contract/[cid] (Admin)
- 비밀번호: /reset-password (Supabase recovery flow)

## 역할 분기 (Login 3-way)
- admins 테이블에 있음 → /admin/overview
- agents.onboarding_status = 'pending_onboarding' 또는 'awaiting_approval' → /onboarding
- agents.onboarding_status = 'approved' && setup_completed_at IS NULL → /onboarding/setup
- agents.onboarding_status = 'approved' && setup_completed_at → /agent/home

라우팅 가드 3곳(Login / AgentOnboardingGuard / Onboarding layout) 동일 로직 유지 필수.

## DB 스키마

### 정책
- **RLS 전체 비활성화** (MVP 단계). 새 테이블 생성 시마다 즉시 disable + GRANT ALL 필요.
- ENUM 대신 TEXT + CHECK constraint 사용 (변경 용이).
- Storage 버킷: `schedules`, `product-images` (Public, 버킷별 RLS 정책 있음).

### CHECK 제약 값
- cases.status: awaiting_info / awaiting_schedule / reviewing_schedule / awaiting_pricing / awaiting_payment / awaiting_travel / completed / canceled
  - 단일 진실 소스: `src/lib/caseStatus.ts` (라벨/스타일/오너/CANCELLABLE_STATUSES 모두 여기서 export)
- schedules.status: pending / confirmed / revision_requested
- agents.onboarding_status: pending_onboarding / awaiting_approval / approved
- contract_templates.contract_type / agent_contracts.contract_type: nda / partnership
- clients.dietary_restriction: halal_certified / halal_friendly / muslim_friendly / pork_free / none
- clients.prayer_frequency: all_five_daily / flexible / not_applicable
- clients.prayer_location: hotel / vehicle / external_prayer_room / mosque / not_applicable
- clients.pregnancy_status: not_applicable / none / pregnant / unknown
- clients.smoking_status: non_smoker / occasional / regular / former / not_applicable
- clients.alcohol_status: none / occasional / regular / not_applicable
- clients.same_gender_doctor / same_gender_therapist: required / preferred / no_preference / not_applicable
- clients.mixed_gender_activities: comfortable / prefer_to_limit / not_comfortable / not_applicable
- audit_logs.actor_type: agent / admin / system

### 테이블 목록 (현재 스키마)
- **product_categories**: id, name, sort_order
- **products**: id, product_number, category_id, name, description, base_price, price_currency, partner_name, duration_value, duration_unit, has_female_doctor, has_prayer_room, dietary_type, location_address, contact_channels(jsonb), sort_order, is_active
- **product_images**: id, product_id, image_url, is_primary, order
- **admins**: id, auth_user_id, name, email, created_at
- **agents**: id, agent_number, auth_user_id, name, email, phone, country, bank_info(jsonb), margin_rate, monthly_completed, margin_reset_at, onboarding_status, setup_completed_at, is_active
  - 초대 플로우: invite_token(UNIQUE), invite_secret, invited_at, invite_expires_at
  - Reject 플로우: rejection_reason, rejected_at
  - ⚠️ `created_at` 컬럼 없음 (name으로 정렬)
  - ⚠️ `monthly_completed` 자동 업데이트 트리거 없음. Dashboard는 travel_completed_at 기반 계산
- **clients**: id, client_number, agent_id, name, nationality, gender, date_of_birth, phone, email, passport_number, arrival_date, departure_date, flight_info, accommodation_name, accommodation_addr, special_requests, created_at
  - 확장: emergency_contact_name/relation/phone, blood_type, allergies, current_medications, health_conditions, medical_restrictions, height_cm, weight_kg, preferred_language, mobility_limitations, cultural_religious_notes, prior_aesthetic_procedures, recent_health_checkup_notes
  - Lifestyle: pregnancy_status, smoking_status, alcohol_status
  - Muslim prefs: needs_muslim_friendly, dietary_restriction, prayer_frequency, prayer_location, same_gender_doctor, same_gender_therapist, mixed_gender_activities
- **cases**: id, case_number, agent_id, status, travel_start_date, travel_end_date, payment_date, payment_confirmed_at, created_at, concept, meeting_date(deprecated, UI 미사용), outbound_flight(jsonb), inbound_flight(jsonb), travel_completed_at(Mark Complete 시점), **cancellation_reason, cancelled_at, cancelled_by_actor_type, cancelled_by_actor_id**
- **case_members**: id, case_id, client_id, is_lead, UNIQUE(case_id, client_id)
- **quotes**: id, quote_number, case_id, slug, company_margin_rate, agent_margin_rate, total_price, payment_due_date, first_opened_at, open_count, **invoice_number(UNIQUE), finalized_at, invoice_first_opened_at**
- **quote_groups**: id, quote_id, name, order, member_count
- **quote_group_members**: id, quote_group_id, case_member_id
- **quote_items**: id, quote_id, quote_group_id, product_id, base_price, final_price
- **schedules**: id, case_id, quote_id, slug, pdf_url, status, version, created_at, file_name, revision_note, confirmed_at, **first_opened_at, open_count**, UNIQUE(case_id, version)
- **settlements**: id, settlement_number, agent_id, **case_id**(UNIQUE, 1:1), amount(KRW), paid_at, created_at
- **partner_payments**: id, case_id, partner_name, amount, paid_at(DATE), paid_by(FK admins SET NULL), note, created_at, UNIQUE(case_id, partner_name) — Partner Payouts cash basis 추적
- **system_settings**: id, key, value(jsonb). Keys: exchange_rate / company_margin_rate / bank_details / onboarding_ot
- **notifications**: id, target_type, target_id, auth_user_id, message, **link_url**, is_read, **created_at**. Realtime publication 등록됨.
- **contract_templates**: id, contract_type(UNIQUE), title, body, updated_at
- **agent_contracts**: id, agent_id, contract_type, title_snapshot, body_snapshot, ot_acknowledged_at, signature_data_url, signed_at, ip_address, user_agent, approved_at, approved_by(FK admins ON DELETE SET NULL)
- **audit_logs**: id, actor_type, actor_id, actor_label, action, target_type, target_id, target_label, details(jsonb), created_at

## 코딩 규칙
- Next.js App Router. **AGENTS.md 참조**: 이 Next.js는 훈련 데이터와 다른 버전, 코드 작성 전 `node_modules/next/dist/docs/` 확인 필수
- 컴포넌트는 src/components/ 에 위치
- 페이지는 src/app/ 에 위치
- Supabase 클라이언트는 src/lib/supabase.ts
- Agent 페이지: src/app/agent/
- Admin 페이지: src/app/admin/
- 온보딩: src/app/onboarding/
- 고객 URL 페이지: src/app/quote/[slug]/ , src/app/invoice/[slug]/ , src/app/schedule/[slug]/
- API 라우트: src/app/api/ (service role 필요한 작업용 — agent setup, create-agent 등)
- 타입 정의는 src/types/

### 공용 유틸/컴포넌트
- `src/lib/clientCompleteness.ts` — Client 필수 필드 체크
- `src/lib/caseStatus.ts` — case status 단일 소스 (라벨/스타일/오너/CANCELLABLE/ACTIVE)
- `src/lib/notifications.ts` — `createNotification`, `notifyAgent`, `notifyAllAdmins`
- `src/lib/audit.ts` — `logAudit`, `getActor`, `logAsCurrentUser`
- `src/hooks/useNotifications.ts` — Realtime 구독
- `src/components/`: NotificationBell, DOBPicker, DateTime24Picker, SignaturePad, ContractStep, AgentOnboardingGuard, ChangePasswordCard, PrintPdfButton, AutoPrint, PrintButton, **QuoteDocument**(고객용 Quotation/Invoice 공용 렌더), SparklineCard

## 언어 규칙
- **모든 UI 텍스트는 영어만 사용** (버튼, 라벨, 에러 메시지, placeholder 포함)
- 한국어는 주석, 이 CLAUDE.md, docs/ 문서에만 허용

## 디자인 가이드
- 프리미엄하고 깔끔한 느낌
- Tailwind CSS 사용
- Main bg: white (sidebar만 gray). Admin/Agent 동일.
- input/textarea/date-input은 명시적 `text-gray-900` (브라우저 기본 회색 override)
- Date input 색상은 CSS로 gray-900 강제
- 모바일 대응은 Post-MVP (VIP B2B 우선순위 낮음, 서명 캔버스 등 미검증)

## 진행 현황 참조
- 최신 진행 상황: `notes/PROGRESS.md`
- 일일 연구노트: `notes/26.04.YY.md` (최신순)
- 미팅 노트: `notes/meetings/`