# Project Progress

## 현재 상태
- **Phase**: 온보딩 E2E + Realtime 알림 완성. Dashboard 지표 교정, 계약서 시스템 법무 정리. 최종 테스트 진입.
- **마지막 작업**: 온보딩 E2E(Orientation/NDA/Partnership/Setup Wizard), Realtime 알림 9개 트리거, Admin Clients 탭, 계약서 뷰어(Admin/Agent), Members+Readiness 통합
- **마지막 업데이트**: 2026-04-23 (D-6, MVP 4/29 마감)
- **SaaS 브랜드명**: **Tiktak** (UI 전역, 법인명 Interview Co., Ltd)

> 2026-04-23 상세: `notes/26.04.23.md` (최신)
> 2026-04-22 상세: `notes/26.04.22.md`
> 2026-04-21 상세: `notes/26.04.21.md`
> 2026-04-17 회사 미팅 피드백: `notes/meetings/26.04.17-kickoff-feedback.md`

---

## 다음 할 일

### 안정화 (MVP 마감 전)
- [ ] End-to-end 전체 플로우 테스트 (temp 생성 → 온보딩 → 승인 → Setup → 견적 → 스케줄 → 정산)
- [ ] Vercel 배포 환경 점검 (`SUPABASE_SERVICE_ROLE_KEY` 환경변수 확인)
- [ ] CLAUDE.md 현재 스키마에 맞춰 업데이트 (travel_completed_at, setup_completed_at, link_url 등)
- [ ] 법무 검토: NDA / Partnership Agreement 초안 (사내 고문변호사 or SIAC 전문가)

### 4/23 검토 결과 — D-6 내 추가 작업
- [x] **Audit log** 테이블 + `/admin/audit` + 15개 액션 지점 로그 삽입
- [x] **Forgot Password** — Login 링크 + 모달 + `/reset-password` 페이지
- [x] **Agent Reject** — Admin Agent 상세에 Reject 버튼 (사유 + audit log)
- [x] **Agent 본인 Case 삭제** — payment_pending만, 사유 입력 + Admin 알림 + audit log
- [x] **Sidebar 접기** — Agent/Admin 양쪽 collapse 토글, localStorage 유지
- [ ] Products Excel Export (남음)
- [ ] 모바일 bottom-nav (Post-MVP로)

### 기능 보완 (시간 되면)
- [ ] Admin Products Excel Export (`xlsx` 라이브러리)
- [ ] `agents.monthly_completed` 자동 업데이트 트리거 or 월말 리셋 (현재는 travel_completed_at 기반 당월 환자수로 계산)
- [ ] Invoice opened by client 알림 트리거 (서버 컴포넌트라 별도 처리 필요)
- [ ] Case ready for schedule 알림 (모든 조건 충족 시 최초 1회)

### Post-MVP (다음 스프린트)
- [ ] Resend 이메일 연동 (Invoice/Schedule 링크 고객에 자동 발송, 서명 PDF 첨부)
- [ ] 모바일 반응형 (사이드바 drawer, 테이블 카드화, 서명 캔버스 터치 검증)
- [ ] Arabic 지원 (중동 VIP 대응)
- [ ] SMS 본인 인증 (현재는 서명 이미지 + user-agent 메타데이터만)
- [ ] Agent Dashboard 고급화 (월별 커미션 차트)
- [ ] Settlement 월별 집계 뷰
- [ ] Meeting date 컬럼 DB DROP (UI는 이미 제거됨)
- [ ] 계약서 템플릿 검증 로직 (토큰 미치환/오입력 방지)
- [ ] Storage 고아 PDF 정리 배치
- [ ] Client-Agent 매칭 모델 재검토 (스케일 이슈 생길 때)
- [ ] 오래된 read 알림 자동 정리 (30일+)

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

### 온보딩 (4/23 완성)
- [x] `/onboarding` Welcome → `/orientation` → `/nda` → `/partnership` → `/waiting` → `/setup`
- [x] Orientation PDF 뷰어 (Admin Contracts에서 Drag&Drop 업로드, system_settings.onboarding_ot에 URL 저장)
- [x] NDA 계약서: 본문 상단에 Name/Country 인풋 → 체크박스 + 서명 캔버스
- [x] Partnership 계약서: "Signing as {name}" 표시 + 서명
- [x] `SignaturePad` 컴포넌트 (HTMLCanvas, device-pixel-ratio 대응)
- [x] `ContractStep` 공용 (markdown 렌더 + 토큰 치환 + 볼드/리스트/제목)
- [x] Waiting: 본인 서명 계약서 열람 링크 + 15s 폴링 자동 리다이렉트
- [x] Setup Wizard: 로그인 이메일·비밀번호 변경(service role API) + Bank 필수 + Phone 선택
- [x] Agent 본인 계약 뷰어 (`/onboarding/contract/[id]`) — 본인 소유만 접근
- [x] 라우팅 가드 3곳(Login, AgentOnboardingGuard, Onboarding layout) 동기화

### 알림 시스템 (4/23 신규)
- [x] `NotificationBell` 우측 하단 fixed (Agent/Admin 공용)
- [x] Supabase Realtime 구독 (publication 등록)
- [x] 안 읽음 점 + Show previously read 토글
- [x] 트리거 9개: Schedule uploaded / Payment confirmed / Settlement paid / New case / Revision requested / Schedule confirmed / Travel completed / Signed contracts / (Invoice opened은 TBD)

### Admin 추가(4/23)
- [x] Agent 상세: Signed Contracts 섹션 + Approve 버튼 + Temp 계정은 관련 섹션만 노출
- [x] 계약 뷰어 (`/admin/agents/[id]/contract/[id]`) — Print/Save PDF
- [x] Clients 리스트(`/admin/clients`) + 상세(`/admin/clients/[id]`, read-only 7섹션)

### 공용
- [x] `ChangePasswordCard` (Agent Profile + Admin Settings)
- [x] `DateTime24Picker` (비행 datetime 24시간 고정)

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

### 이번 스프린트(4/23) 추가 결정
| 항목 | 결정 | 이유 |
|------|------|------|
| Dashboard 티어 단위 | 케이스 수 → **당월 환자 수** | 마진율 스펙 "Patients/Month" 기준에 맞춤 |
| travel_completed_at | 신규 컬럼 + Mark Complete 시점 기록 | travel_end_date는 예정일이라 부정확 |
| 계약 당사자 명칭 | Tiktak(브랜드) vs `(the "Company")`(법인 약칭) | Interview Co.가 법적 당사자, Tiktak은 제품명 |
| 계약서 토큰 치환 | `{{AGENT_NAME}}`, `{{AGENT_COUNTRY}}` 서명 시 치환 후 body_snapshot 저장 | audit 무결성 — 이후 agent name 변경돼도 계약 고정 |
| 계약 markdown | `## heading`, `- item`, `**bold**`, 빈 줄 문단 | 법무 검토도 그대로 텍스트로 가능 |
| 준거법 + 분쟁해결 | 한국법 + SIAC 중재(싱가포르, 영어) | 중동 VIP 파트너십 업계 표준 |
| Agent identity 수집 | NDA 페이지에서 본문 아래 Name/Country만 | 추가 단계 없이 계약과 연속된 UX |
| Setup Wizard 은행정보 | 필수 4필드 (Bank/Account/Beneficiary/Swift) | 에이전트 계약 목적 = 수익, 없으면 미완성 |
| 알림 전달 방식 | Supabase Realtime 구독 | 폴링 대비 즉시성, 설정 비용도 유사 |
| 알림 UI | 우측 하단 fixed 벨 + 미읽음만 표시 | 사이드바 공간 유지, 집중 유도 |
| Agent/Admin 계약서 접근 | Agent는 본인 것만 (보안 가드), Admin은 Print-to-PDF | 감사 출력 쉽고, 별도 PDF 라이브러리 불필요 |
| Schedule Delete | "최신 버전 + status=pending"만 허용 | 실수 복구 유지하면서 audit 보호 |
| Home cart 복원 | sessionStorage 플래그로 "Edit 복귀"만 유지 | 다른 탭 이동 후 귀신 cart 방지 |
| Revision Note UI | 각 버전 카드 내 뱃지 옆 인라인 | 과거 사유도 계속 참조 가능 |
| Members + Readiness 분리 | Member 관련만 Members 블록, Trip Info는 자체 섹션에서 경고 | 관심사 분리 |
| Admin Temp 계정 상세 | 관련 없는 Metrics/Profile/Bank/Cases/Settlement 섹션 숨김 | 의미 없는 빈 필드 제거 |

### 이전 스프린트 결정
(참고용 — 자세히는 이전 연구노트 참조)
- UI 언어 영어, 가격 USD 2자리, Quote=Invoice, RLS 전체 비활성화, Tiktak 브랜드, 상품 카테고리 정렬 고정, ENUM 대신 TEXT+CHECK, Cases에서 신규 생성 금지 (Home 플로우만)

---

## DB 스키마 변경사항 누적

### 금일(4/23) 추가분

```sql
-- travel_completed_at (Mark Travel Complete 시점 기록)
ALTER TABLE cases ADD COLUMN travel_completed_at TIMESTAMPTZ;
UPDATE cases SET travel_completed_at = COALESCE(travel_end_date::timestamptz, now())
WHERE status = 'travel_completed' AND travel_completed_at IS NULL;

-- Notifications 보강 + Realtime publication
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
GRANT ALL ON notifications TO anon, authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Agent setup 완료 플래그
ALTER TABLE agents ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

-- 계약 관련 RLS off (새 테이블)
ALTER TABLE contract_templates DISABLE ROW LEVEL SECURITY;
GRANT ALL ON contract_templates TO anon, authenticated;
ALTER TABLE agent_contracts DISABLE ROW LEVEL SECURITY;
GRANT ALL ON agent_contracts TO anon, authenticated;

-- FK 수정 — admin 삭제 시 audit 유지하고 approved_by만 NULL
ALTER TABLE agent_contracts DROP CONSTRAINT agent_contracts_approved_by_fkey;
ALTER TABLE agent_contracts ADD CONSTRAINT agent_contracts_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES admins(id) ON DELETE SET NULL;

-- Meeting date 컬럼은 UI에서 제거(DROP 미적용, post-MVP 클린업)

-- Audit log (오후 추가)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT CHECK (actor_type IN ('agent','admin','system')),
  actor_id UUID,
  actor_label TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  target_label TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
GRANT ALL ON audit_logs TO anon, authenticated;
```

### 4/22 추가분

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

-- Onboarding (오후 세션)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'approved'
  CHECK (onboarding_status IN ('pending_onboarding', 'awaiting_approval', 'approved'));
UPDATE agents SET onboarding_status = 'approved' WHERE onboarding_status IS NULL;

CREATE TABLE IF NOT EXISTS contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_type TEXT UNIQUE CHECK (contract_type IN ('nda','partnership')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  contract_type TEXT CHECK (contract_type IN ('nda','partnership')),
  title_snapshot TEXT NOT NULL,
  body_snapshot TEXT NOT NULL,
  ot_acknowledged_at TIMESTAMPTZ,
  signature_data_url TEXT,
  signed_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES admins(id)
);

INSERT INTO contract_templates (contract_type, title, body) VALUES
  ('nda', 'Non-Disclosure Agreement', E'## 1. Parties\n[Edit in Admin > Contracts.]\n\n## 2. Confidential Information\n...'),
  ('partnership', 'Partnership Agreement', E'## 1. Role\n[Edit in Admin > Contracts.]\n\n## 2. Commission Structure\n...')
ON CONFLICT (contract_type) DO NOTHING;
```

### 누적 스키마 요약

- **products**: 기본 + `price_currency`, `partner_name`, sort_order, dietary TEXT+CHECK
- **product_categories**: `sort_order` (Medical→Beauty→Wellness→Subpackage)
- **clients**: 기본 + passport/flight/accommodation + emergency contact + medical (height/weight/blood/allergies/medications/conditions/restrictions) + lifestyle (smoking/alcohol/pregnancy) + language/mobility + muslim prefs (prayer x2, dietary, same-gender x2, mixed-gender, cultural) + optional (aesthetic/checkup)
- **cases**: 기본 + `concept`, `meeting_date`(deprecated, UI 미사용), `outbound_flight`/`inbound_flight`(JSONB), `travel_completed_at` (Mark Complete 시점)
- **case_members**: (case_id, client_id) UNIQUE, is_lead
- **quotes**: 기본 + slug, payment_due_date
- **quote_groups**: 기본 + `member_count`
- **quote_group_members**: (quote_group_id, case_member_id)
- **quote_items**: 기본
- **schedules**: 기본 + `file_name`, `revision_note`, `confirmed_at`, status CHECK(pending/confirmed/revision_requested), (case_id, version) UNIQUE, slug index
- **settlements**: 기본 + `case_id` (UNIQUE, 1:1), amount는 KRW 저장
- **agents**: 기본 + `onboarding_status` (pending/awaiting/approved), `setup_completed_at`, `bank_info` (JSONB)
- **contract_templates**: (contract_type, title, body, updated_at) — RLS off
- **agent_contracts**: 기본 + snapshot(title/body), signature_data_url, signed_at, ip_address/user_agent, approved_at/approved_by (ON DELETE SET NULL)
- **notifications**: (target_type, target_id, auth_user_id, message, link_url, is_read, created_at) — Realtime publication 등록됨
- **audit_logs**: (actor_type/id/label, action, target_type/id/label, details JSONB, created_at) — 주요 상태 변경 기록
- **system_settings**: key=exchange_rate/company_margin_rate/bank_details/onboarding_ot

---

## 블로커 / 이슈

- **`agents.created_at` 컬럼 실제 DB에 없음**: 코드에서 order by created_at 쓰면 400. name 정렬로 회피 중.
- **`agents.monthly_completed` 자동 업데이트 안 됨**: 트리거 없음. Dashboard는 **travel_completed_at 기반 당월 환자 수**로 계산(정확). monthly_completed 컬럼은 현재 사용 안 함 — 향후 제거 고려.
- **Storage 고아 PDF**: 스케줄/OT 업로드 후 삭제 시 DB 레코드만 정리, Storage 파일은 남음. 정기 정리 배치 필요 (post-MVP).
- **Invoice first_opened_at 미기록**: 서버 컴포넌트에서 upsert + notifyAgent 흐름 아직 미구현.
- **RLS 재활성화 경계**: settlements, agents 테이블이 수 차례 RLS 자동 재활성화됨. 새 테이블 생성 시마다 즉시 disable 필요.

---

## 참고 링크
- GitHub: https://github.com/interview-jannis/Agent-SaaS
- Supabase: https://supabase.com/dashboard/project/tknucfjnqapriadgiwuv
- 로컬 개발: http://localhost:3000
- 연구노트 (최신순): `docs/26.04.22.md`, `docs/26.04.21.md`, `docs/26.04.20.md`, `docs/26.04.17.md`, `docs/26.04.16.md`
- 미팅 노트: `docs/meetings/26.04.17-kickoff-feedback.md`
