@AGENTS.md

# CLAUDE.md — Agent SaaS 프로젝트 바이블

## 프로젝트 개요
(주)인터뷰가 개발 중인 글로벌·중동 VIP 의료관광 에이전트 전용 SaaS.
- 회사명: Interview
- 개발 방식: 바이블코딩, 2인 개발, 2주 MVP (4/16 ~ 4/29)

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
- 상품: #P-
- 정산: #S-

## 마진율 구조
- 고객 견적가 = 원가 × (1 + 회사 마진율) × (1 + 에이전트 마진율)
- 에이전트 마진율 자동 적용 (당월 여행완료 고객 수 기준)
  - 0~10명: 15%
  - 11~30명: 20%
  - 31명+: 25%

## 비즈니스 플로우
견적 생성 → 결제 대기 → 결제 완료 → 스케줄 업로드 → 스케줄 확정 → 여행 완료

Admin 수동 개입 4회:
1. 결제 완료 확인
2. 스케줄 업로드
3. 여행 완료 처리
4. 결제 입금일 수동 입력

## 화면 구조
- Agent (5탭): Home / Clients / Payouts / Dashboard / Profile
- Admin (5탭): Overview / Cases / Products / Agents / Settlement
- 고객용 URL 페이지: /quote/[slug] (견적서) / /schedule/[slug] (스케줄)

## 역할 분기
- 로그인 후 admins 테이블에 있으면 → /admin/overview
- 로그인 후 agents 테이블에 있으면 → /agent/home

## DB 스키마 (ERD v5 — 16개 테이블)

### ENUM 타입
- case_status: payment_pending / payment_completed / schedule_reviewed / schedule_confirmed / travel_completed
- dietary_type: halal_certified / halal_friendly / muslim_friendly / pork_free / none

### 테이블 목록
- product_categories: id, name
- products: id, product_number, category_id, name, description, base_price, duration_value, duration_unit, has_female_doctor, has_prayer_room, dietary_type, location_address, contact_channels(jsonb), is_active
- product_images: id, product_id, image_url, is_primary, order
- admins: id, auth_user_id, name, email, created_at
- agents: id, agent_number, auth_user_id, name, email, phone, country, bank_info(jsonb), margin_rate, monthly_completed, margin_reset_at, is_active
- clients: id, client_number, agent_id, name, nationality, gender, date_of_birth, phone, email, passport_number, needs_muslim_friendly, dietary_restriction, arrival_date, departure_date, flight_info, accommodation_name, accommodation_addr, special_requests, created_at
- cases: id, case_number, agent_id, status(case_status), travel_start_date, travel_end_date, payment_date, payment_confirmed_at, created_at
- case_members: id, case_id, client_id, is_lead
- quotes: id, quote_number, case_id, slug, company_margin_rate, agent_margin_rate, total_price, payment_due_date, first_opened_at, open_count
- quote_groups: id, quote_id, name, order
- quote_group_members: id, quote_group_id, case_member_id
- quote_items: id, quote_id, quote_group_id, product_id, base_price, final_price
- schedules: id, case_id, quote_id, slug, pdf_url, status, version, created_at
- settlements: id, settlement_number, agent_id, amount, paid_at, created_at
- system_settings: id, key, value(jsonb)
- notifications: id, target_type, target_id, auth_user_id, message, is_read

## 코딩 규칙
- 컴포넌트는 src/components/ 에 위치
- 페이지는 src/app/ 에 위치 (App Router)
- Supabase 클라이언트는 src/lib/supabase.ts 사용
- Agent 페이지: src/app/agent/
- Admin 페이지: src/app/admin/
- 고객 URL 페이지: src/app/quote/[slug]/ , src/app/schedule/[slug]/
- 타입 정의는 src/types/ 에 위치

## 언어 규칙
- **모든 UI 텍스트는 영어만 사용** (버튼, 라벨, 에러 메시지, placeholder 포함)
- 한국어는 주석, 이 CLAUDE.md, docs/ 문서에만 허용

## 디자인 가이드
- 프리미엄하고 깔끔한 느낌
- Tailwind CSS 사용
- 모바일 대응 필요 (에이전트가 모바일로도 사용)