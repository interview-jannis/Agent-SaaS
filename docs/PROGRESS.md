# Project Progress

## 현재 상태
- **Phase**: 전 플로우 (견적→결제→스케줄 승인→여행 완료→정산) 구축 완료. UX 폴리시 + 테스트 단계.
- **마지막 작업**: 스케줄 버전 관리, 고객 정보 대폭 확장, Members staging, Agent/Admin 관리 페이지 5개 신규, 정산 흐름 end-to-end
- **마지막 업데이트**: 2026-04-22 (D-7, MVP 4/29 마감)
- **SaaS 브랜드명**: **Tiktak** (UI 전역, 법인명 Interview Co., Ltd)

> 2026-04-22 상세: `docs/26.04.22.md` (최신)
> 2026-04-21 상세: `docs/26.04.21.md`
> 2026-04-17 회사 미팅 피드백: `docs/meetings/26.04.17-kickoff-feedback.md`

---

## 다음 할 일

### 안정화 (MVP 마감 전)
- [ ] End-to-end 전체 플로우 테스트 (Agent 가입 → 고객 등록 → 견적 → 결제 → 스케줄 → 여행 → 정산)
- [ ] Vercel 배포 환경 점검
- [ ] CLAUDE.md 현재 스키마에 맞춰 업데이트 (clients/cases/settlements 컬럼 대폭 추가됨)

### 기능 보완 (시간 되면)
- [ ] Register 폼에 bank_info 필수 입력 (지금은 Profile에서만 입력 가능)
- [ ] Admin Products Excel Export (`xlsx` 라이브러리)
- [ ] `agents.monthly_completed` 자동 업데이트 트리거 or 월말 리셋 (지금은 수동, 대시보드는 누적으로 fallback)

### Post-MVP (다음 스프린트)
- [ ] Resend 이메일 연동 (Invoice/Schedule 링크 고객에 자동 발송, 서명 PDF)
- [ ] Agent Pre-Onboarding + 전자서명 (NDA/파트너십 계약서, Canvas 서명 + SMS 인증)
  - `/onboarding` 진입 페이지
  - `agent_contracts` 테이블 (signer_email, contract_type, signature_image_url, pdf_url, signed_at, ip)
  - 서명 완료 후에만 `/register` 허용
- [ ] Agent Dashboard 고급화 (월별 커미션 차트, 성과 비교)
- [ ] Settlement 월별 집계 뷰

---

## 완료된 작업

### 인프라 / 세팅
- [x] Next.js (TypeScript, Tailwind, App Router) + Supabase + Vercel
- [x] GitHub: `interview-jannis/Agent-SaaS`
- [x] 전체 테이블 RLS 비활성화 (settlements, agents 포함)
- [x] Storage 버킷 `schedules`, `product-images` (Public) + 버킷별 RLS 정책
- [x] CLAUDE.md 프로젝트 바이블
- [x] 공용 lib: `src/lib/clientCompleteness.ts` (필수 필드 체크 공유)
- [x] 공용 컴포넌트: `DOBPicker`, `PrintPdfButton`, `AutoPrint`, `PrintButton`

### 인증
- [x] 로그인 페이지 (`/login`) — 역할 분기(admin/agent), Tiktak 브랜딩
- [x] 회원가입 페이지 (`/register`) — Agent 전용

### 브랜딩
- [x] 전역 metadata title / Sidebar / 로그인 / Invoice 모두 Tiktak
- [x] 법적 발행 주체(Invoice From)만 Interview Co., Ltd 유지

### Admin 화면
- [x] Overview (`/admin/overview`) — 액션 필요 / 월매출(KRW+USD) / Top Agents / Recent Cases
- [x] Products (`/admin/products`) — 카테고리 그룹핑 + Sticky 네비 + 3 tier 가격 + 캐러셀
- [x] Categories (`/admin/categories`) — CRUD + sort_order
- [x] Settings (`/admin/settings`) — 환율 + 회사 마진 + 은행 정보
- [x] Cases 리스트 (`/admin/cases`) — 표 + 상태 필터
- [x] **Case 상세 (`/admin/cases/[id]`)** — 라우트 분리 (새로고침·링크 공유 가능)
  - 50/50 분할, Trip Info 읽기 전용, Client Info Status, Group 경고
  - Schedule History: 2단계 업로드(프리뷰→Confirm), 버전별 관리, Delete 확인창
  - Lock 배너: schedule_confirmed/travel_completed면 업로드·삭제 불가
- [x] **Agents (`/admin/agents`, `/admin/agents/[id]`)** — 에이전트 관리
  - 리스트: Margin/Unsettled/Paid Out 재정산 3열 묶음
  - 상세: Profile·Bank·Cases·Settlement History + Activate/Deactivate 토글
- [x] **Settlement (`/admin/settlement`)** — 수수료 지급 관리
  - Unsettled Cases + Settle 모달 (agent 은행정보 자동 표시)
  - Settlement History (읽기 전용, 삭제 없음)

### Agent 화면
- [x] 공통 레이아웃 + 사이드바 (6탭 전부 활성)
- [x] Home (`/agent/home`) — 2×2 카테고리 섹션, 그룹 기반 카트, 마진 적용 USD
- [x] 견적 검토 (`/agent/home/review`) — 그룹 배정, 필수 검증, Redirect to case
- [x] **Dashboard (`/agent/dashboard`)** — 신규
  - Action Needed 배너 (amber)
  - Hero 2열: This Month 총수익 / Next Tier progress bar
  - Recent Cases + Upcoming Travel 2열 (days until 뱃지)
  - Pipeline 5칸 (0이면 회색, 활성은 상태색)
- [x] Cases 리스트 (`/agent/cases`)
- [x] **Cases 상세 (`/agent/cases/[id]`)** — 재작성
  - Trip Info 섹션 (concept/meeting_date/flights 편집)
  - Client Info Status (미완성 고객 한 줄 요약)
  - Members & Groups: staging 모드 (Save/Cancel), 2열 그룹 배치, Lead 교체, 그룹 dropdown
  - Selected Products 접기/펴기 토글
  - Schedule 섹션: 버전 표시, Confirm/Request Revision (pending일 때만)
  - Mark Travel Complete (schedule_confirmed일 때)
  - Financials: 총액 · 결제 마감 · 예상 수수료
- [x] Clients 리스트 (`/agent/clients`) — Info 컬럼(완성도 뱃지)
- [x] **Clients 상세 (`/agent/clients/[id]`)** — 대폭 확장
  - Basic / Contact / Emergency Contact / Medical / Lifestyle / Muslim Preferences / Additional Notes 7개 섹션
  - Missing Info 상단 요약 배너
  - Female일 때만 Pregnancy 노출, Muslim=Yes일 때만 Muslim Preferences
  - Edit는 상단, Save는 하단 (긴 폼 자연스럽게)
- [x] **Payouts (`/agent/payouts`)** — 신규
  - 카드 3개: Unsettled / Received This Month / Total Received
  - Unsettled Cases + Settlement History
- [x] **Profile (`/agent/profile`)** — 신규
  - Basic (읽기) / Contact (편집) / Bank Information (편집)
  - Bank 미입력 시 경고 배너

### 고객용 페이지
- [x] Invoice (`/quote/[slug]`) — Commercial Invoice, Muslim 기반 Subject, Tiktak 로고
- [x] Schedule (`/schedule/[slug]`) — PDF iframe, `?autoprint=1`로 에이전트 인쇄용 호출

---

## 주요 결정사항 (이번 스프린트 추가분)

| 항목 | 결정 | 이유 |
|------|------|------|
| Schedule 버전 관리 | 케이스당 여러 schedule 행 (slug 공유) | 버전 히스토리 + 고객 URL 안정 |
| Schedule 상태 | pending / confirmed / revision_requested | 승인 플로우에 필요 |
| Schedule 업로드 | 드롭 → 프리뷰 → Confirm (2단계) | 실수 방지 |
| Mark Travel Complete | Admin → **Agent**가 표시 | 현장에 있는 주체가 확정 |
| 정산 기본 단위 | 1 case = 1 settlement | 실제 송금 단위와 일치, 수동 송금에 안전 |
| Settlement 금액 입력 | 읽기 전용 (자동 계산) | deterministic → 오타 방지 |
| Settlement 삭제 | 불가 (audit log) | 재무 기록 무결성 |
| Members 편집 | Staging 모드 (Save/Cancel) | 실수로 잘못 고른 것 되돌리기 |
| Trip Info 저장 | JSONB (outbound/inbound) | 쿼리 필요 없음, 스키마 변경 최소화 |
| Client 필수 필드 | "N/A 허용" 정책 | 무의미 필드 때문에 업로드 블록 방지 |
| Pregnancy 필드 | female일 때만 노출 | UX 간결 |
| Muslim Preferences | needs_muslim_friendly=true일 때만 노출 | 비무슬림에겐 무관 |
| Prayer enum | all_five_daily / flexible / not_applicable | 고객 템플릿 용어와 일치 |
| DOB 입력 | 커스텀 Year/Month/Day 드롭다운 | native date input은 연도 스크롤 지옥 |
| Date input 색 | CSS로 gray-900 강제 | 브라우저 기본 회색 가독성 나쁨 |

### 이전 스프린트 결정
(참고용, 변경 없음 — 자세히는 이전 연구노트 참조)
- UI 언어 영어, 가격 USD 2자리, Quote=Invoice, RLS 전체 비활성화, Tiktak 브랜드, 상품 카테고리 정렬 고정, ENUM 대신 TEXT+CHECK, Cases에서 신규 생성 금지 (Home 플로우만)

---

## DB 스키마 변경사항 누적

### 금일(4/22) 추가분

```sql
-- Schedules 버전 관리
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS revision_note TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_status_check;
UPDATE schedules SET status = 'pending' WHERE status = 'reviewed';
ALTER TABLE schedules ADD CONSTRAINT schedules_status_check
  CHECK (status IN ('pending','confirmed','revision_requested'));
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_slug_key;
ALTER TABLE schedules ADD CONSTRAINT schedules_case_version_unique UNIQUE (case_id, version);
CREATE INDEX IF NOT EXISTS schedules_slug_idx ON schedules(slug);

-- Storage RLS
CREATE POLICY "schedules_all_access" ON storage.objects
  FOR ALL TO anon, authenticated
  USING (bucket_id = 'schedules') WITH CHECK (bucket_id = 'schedules');

-- Clients 확장 (의료관광 필수 정보 20+ 필드)
ALTER TABLE clients ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE clients ADD COLUMN emergency_contact_relation TEXT;
ALTER TABLE clients ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE clients ADD COLUMN blood_type TEXT;
ALTER TABLE clients ADD COLUMN allergies TEXT;
ALTER TABLE clients ADD COLUMN current_medications TEXT;
ALTER TABLE clients ADD COLUMN health_conditions TEXT;
ALTER TABLE clients ADD COLUMN medical_restrictions TEXT;
ALTER TABLE clients ADD COLUMN height_cm NUMERIC;
ALTER TABLE clients ADD COLUMN weight_kg NUMERIC;
ALTER TABLE clients ADD COLUMN preferred_language TEXT;
ALTER TABLE clients ADD COLUMN mobility_limitations TEXT;
ALTER TABLE clients ADD COLUMN cultural_religious_notes TEXT;
ALTER TABLE clients ADD COLUMN prior_aesthetic_procedures TEXT;
ALTER TABLE clients ADD COLUMN recent_health_checkup_notes TEXT;

ALTER TABLE clients ADD COLUMN pregnancy_status TEXT
  CHECK (pregnancy_status IN ('not_applicable','none','pregnant','unknown'));
ALTER TABLE clients ADD COLUMN smoking_status TEXT
  CHECK (smoking_status IN ('non_smoker','occasional','regular','former','not_applicable'));
ALTER TABLE clients ADD COLUMN alcohol_status TEXT
  CHECK (alcohol_status IN ('none','occasional','regular','not_applicable'));
ALTER TABLE clients ADD COLUMN same_gender_doctor TEXT
  CHECK (same_gender_doctor IN ('required','preferred','no_preference','not_applicable'));
ALTER TABLE clients ADD COLUMN same_gender_therapist TEXT
  CHECK (same_gender_therapist IN ('required','preferred','no_preference','not_applicable'));
ALTER TABLE clients ADD COLUMN mixed_gender_activities TEXT
  CHECK (mixed_gender_activities IN ('comfortable','prefer_to_limit','not_comfortable','not_applicable'));

-- Prayer enum 값 재정의
UPDATE clients SET prayer_frequency = NULL
  WHERE prayer_frequency NOT IN ('all_five_daily','flexible','not_applicable');
ALTER TABLE clients DROP CONSTRAINT clients_prayer_frequency_check;
ALTER TABLE clients ADD CONSTRAINT clients_prayer_frequency_check
  CHECK (prayer_frequency IN ('all_five_daily','flexible','not_applicable'));

UPDATE clients SET prayer_location = NULL
  WHERE prayer_location NOT IN ('hotel','vehicle','external_prayer_room','mosque','not_applicable');
ALTER TABLE clients DROP CONSTRAINT clients_prayer_location_check;
ALTER TABLE clients ADD CONSTRAINT clients_prayer_location_check
  CHECK (prayer_location IN ('hotel','vehicle','external_prayer_room','mosque','not_applicable'));

-- Cases 확장 (Trip Info)
ALTER TABLE cases ADD COLUMN concept TEXT DEFAULT 'K-Beauty + Medical + Wellness + Luxury';
ALTER TABLE cases ADD COLUMN meeting_date DATE;
ALTER TABLE cases ADD COLUMN outbound_flight JSONB;
ALTER TABLE cases ADD COLUMN inbound_flight JSONB;

-- Settlements 확장
ALTER TABLE settlements ADD COLUMN case_id UUID REFERENCES cases(id);
CREATE UNIQUE INDEX settlements_case_id_idx ON settlements(case_id);
ALTER TABLE settlements DISABLE ROW LEVEL SECURITY;

-- Agents 권한 (re-enable된 것 다시 차단)
ALTER TABLE agents DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON agents TO anon, authenticated;
```

### 누적 스키마 요약

- **products**: 기본 + `price_currency`, `partner_name`, sort_order, dietary TEXT+CHECK
- **product_categories**: `sort_order` (Medical→Beauty→Wellness→Subpackage)
- **clients**: 기본 + passport/flight/accommodation + emergency contact + medical (height/weight/blood/allergies/medications/conditions/restrictions) + lifestyle (smoking/alcohol/pregnancy) + language/mobility + muslim prefs (prayer x2, dietary, same-gender x2, mixed-gender, cultural) + optional (aesthetic/checkup)
- **cases**: 기본 + `concept`, `meeting_date`, `outbound_flight` (JSONB), `inbound_flight` (JSONB)
- **case_members**: (case_id, client_id) UNIQUE, is_lead
- **quotes**: 기본 + slug, payment_due_date
- **quote_groups**: 기본 + `member_count`
- **quote_group_members**: (quote_group_id, case_member_id)
- **quote_items**: 기본
- **schedules**: 기본 + `file_name`, `revision_note`, `confirmed_at`, status CHECK(pending/confirmed/revision_requested), (case_id, version) UNIQUE, slug index
- **settlements**: 기본 + `case_id` (UNIQUE, 1:1), amount는 KRW 저장
- **system_settings**: key=exchange_rate/company_margin_rate/bank_details

---

## 블로커 / 이슈

- **`agents.created_at` 컬럼 실제 DB에 없음**: 코드에서 order by created_at 쓰면 400. 최소 name 정렬로 회피 중.
- **`agents.monthly_completed` 자동 업데이트 안 됨**: 트리거 없음. Dashboard는 total 카운트로 fallback. 월 리셋 로직도 미구현.
- **RLS 재활성화 경계**: settlements, agents 테이블이 수 차례 RLS 자동 재활성화됨. 새 테이블 생성 시마다 즉시 disable 필요.

---

## 참고 링크
- GitHub: https://github.com/interview-jannis/Agent-SaaS
- Supabase: https://supabase.com/dashboard/project/tknucfjnqapriadgiwuv
- 로컬 개발: http://localhost:3000
- 연구노트 (최신순): `docs/26.04.22.md`, `docs/26.04.21.md`, `docs/26.04.20.md`, `docs/26.04.17.md`, `docs/26.04.16.md`
- 미팅 노트: `docs/meetings/26.04.17-kickoff-feedback.md`
