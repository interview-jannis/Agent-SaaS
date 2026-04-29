# Project Progress

## 현재 상태
- **Phase**: UI/UX 통일 폴리시 + 권한 분리(super admin) + Invoice signer 시스템 완료
- **마지막 작업**: Cases Hero Action Bar / 톤 일관화(monochrome + 의미 SVG 아이콘) / Settings inline-edit 패턴 / PIC(signer) on invoice / Super admin 시스템 (조회 vs 수정 권한 분리)
- **마지막 업데이트**: 2026-04-29 (개발 마감 5/8, 시뮬레이션 5/11~15, 런칭 5/18)
- **SaaS 브랜드명**: **Tiktak** (UI 전역, 법인명 Interview Co., Ltd)

> 2026-04-29 상세: `notes/26.04.29.md` (최신, 큰 폴리시 라운드)
> 2026-04-28 상세: `notes/26.04.28.md`
> 2026-04-27 상세: `notes/26.04.27.md`
> 2026-04-24 상세: `notes/26.04.24.md`
> 2026-04-23 상세: `notes/26.04.23.md`
> 2026-04-22 상세: `notes/26.04.22.md`
> 2026-04-21 상세: `notes/26.04.21.md`
> 2026-04-24 데모 미팅: `notes/meetings/26.04.24-demo-meeting.md`
> 2026-04-17 회사 미팅 피드백: `notes/meetings/26.04.17-meeting-feedback.md`

---

## 다음 할 일

### 안정화 (MVP 마감 전)
- [ ] End-to-end 전체 플로우 테스트 (초대 → 온보딩 → 승인 → Setup → 견적 → 스케줄 → 정산)
- [ ] 배포 환경 최종 점검 (`SUPABASE_SERVICE_ROLE_KEY`, Resend 키 등)
- [ ] 법무 검토: NDA / Partnership Agreement 초안 (사내 고문변호사 or SIAC 전문가)
- [ ] **정보 등록 단계** 분리 검토 (quote_sent 전 Concept/Trip Info/멤버 등록 흐름) — 4/27 멘션 이월
- [ ] 고객용 Schedule 페이지 점검 (Quotation/Invoice는 4/29에 검토 완료)
- [x] CLAUDE.md 스키마 최신화 (흐름 B 8단계 status, /invoice, partner_payments, cancellation_*, invoice_number, finalized_at 등)
- [x] schedules.admin_note 마이그레이션

### 4/29 완료 (대형 폴리시 라운드)
- [x] **Cases Hero Action Bar** — `<CaseHeroAction>` 컴포넌트 (Agent/Admin), status별 next-action CTA + 섹션 스크롤
- [x] **Cases 리스트 톤 통일** — 빈 status pill 유지(흐름 시각화) + body 제거(공간 절약), 헤더 monochrome, JUMP TO 헤더로 통합, Settlement 컬럼 마커-only
- [x] **섹션 헤더 의미 아이콘** — Cases / Action Required 양쪽에 monochrome SVG (user/upload/eye/tag/banknote/check 등)
- [x] **차트 톤 전사 통일** — money: brand green `#0f4c35`, count: gray `#374151` (Overview/Dashboard/Payouts)
- [x] **Settings inline-edit 패턴** — GitHub Settings 스타일, 한 카드에 row들, 평소엔 값만 표시 + Edit
- [x] **Country 자동완성** — `<datalist>` 39개국 (중동 가중), NDA + Profile 양쪽
- [x] **Quotation/Invoice Group 인원수** — `Group 1: name · 2 pax`
- [x] **Print 버튼 `print:hidden`** — 인쇄 시 PDF에 안 박힘
- [x] **Audit Log 강화** — Date filter (All/Today/Yesterday/Last 7/Last 30/Custom) + Load older 페이지네이션
- [x] **Admin Settlement** 좌측 색띠 제거 → 중앙 vertical divider
- [x] **Admin layout** `overflow` 통일 (Agent와 동일)
- [x] **Agent Home** 이모티콘 → ✓ 마커 + 텍스트 (VIP 톤)
- [x] **Lead Client #CL 번호 표시** (Agent 컬럼이랑 일관)
- [x] **PIC (Invoice Signer) 시스템** — admins.title + quotes.signer_snapshot, Pricing finalize 시 동결, From + 하단 서명에 표시
- [x] **Super Admin 시스템** — admins.is_super_admin, /admin/admins 페이지, invite/delete API, Sidebar 분기, 조회/수정 권한 분리
- [x] **Admin 초대 링크** (agent invite 패턴 mirror) — super admin 버튼 1번 → URL 생성 → Slack 전달, 신규 admin이 본인 정보 입력. 7일 만료 + 단일 사용

### 4/28 완료
- [x] **canceled 케이스 view-only** — Travel Dates / Trip Info / Members / Send 버튼 hide + read-only 배너 (cancellation_reason 표시)
- [x] **Client 필수 필드 clear 차단** — 한 번 채워진 필드는 빈값 저장 차단 (값 변경은 OK)
- [x] **schedule_confirmed 이후 Trip/Members 잠금** — `tripMembersLocked` 플래그
- [x] **`isComplete()` 그룹 슬롯 검증 추가** — 자동 승격 버그 수정
- [x] **/quote vs /invoice 라우트 분리** — `QuoteDocument` 공용 component, `?as=` 제거
- [x] **알림 메시지 자동 diff** — Trip Info / Members / Pricing reprice old → new bullet 형식
- [x] **schedules.admin_note** — 재업로드 시 "What changed?" 메모 입력, 알림 + Schedule History 표시
- [x] **Pricing reprice diff 알림** — Total / item count / Due date 변경 명세
- [x] **Hybrid 결제 마감일** — Finalize Pricing에 due date input (default 7일)
- [x] **Admin broadcast 신뢰성 회복** — `/api/notifications/broadcast-admins` (service role) + client fallback
- [x] **알림 클릭 자동 새로고침** — 같은 페이지면 reload, 다른 페이지면 push
- [x] **Schedule History UX** — 각 박스 상단 우측 Preview(eye 아이콘), `?v=` 파라미터로 버전 명시, Delete 게이트 강화 (`!first_opened_at`)
- [x] **Quotation/Invoice 그룹 라벨** — "Group 1: Smith Family" 인덱스 prefix
- [x] **Financials awaiting_pricing 안내 배너** — "Final invoice in preparation"
- [x] **알림 줄바꿈 + bullet 통일** — `whitespace-pre-line`, 단일 변경도 bullet

### 4/24 완료
- [x] **Products Export ZIP 백업** — 엑셀 + images/ + README
- [x] **Invoice opened by client 알림** (Realtime 9개 완성)
- [x] **Schedule opened by client 알림** (동일 패턴)
- [x] **초대 링크 온보딩** — `/invite/[token]` + Temp 계정 방식 제거
- [x] **Agent Reject (soft)** + **Delete Agent (hard)** — Danger Zone 포함
- [x] **Admin Case 상세 Revenue Breakdown** — 원가/회사/에이전트 분해
- [x] **Audit Log 타임라인 개편** — 날짜 그룹 + 아이콘
- [x] **레이아웃 듀얼 모드** 정립 (작업 좌측 / 설정 중앙)
- [x] **Agent Payouts 재설계** — Hero + Monthly Chart 콤보 + Bank 이동
- [x] **Agent Dashboard 재설계** — Hero + Kanban Pipeline 3섹션
- [x] **Admin Overview 재설계** — 4지표 Hero + 통합 Action Queue
- [x] **Admin Settlement 재설계** — Hero + Agent별 그룹핑
- [x] Review 페이지 신규 고객 등록 폼에 Muslim 라디오 추가

### 기능 보완 (시간 되면)
- [ ] `agents.monthly_completed` 자동 업데이트 트리거 or 월말 리셋 (현재는 travel_completed_at 기반 계산)
- [ ] Case ready for schedule 알림 (모든 조건 충족 시 최초 1회)
- [ ] 계약서 템플릿 검증 로직 (토큰 미치환/오입력 방지)

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

### 4/24 — UX 재설계 + 온보딩 구조 변경

#### 온보딩: Temp 계정 → 초대 링크
- [x] `/api/admin/invite-agent` — 토큰 + placeholder auth user 생성
- [x] `/api/onboarding/claim` — 토큰 검증 후 credentials 반환
- [x] `/invite/[token]` 루트 경로 페이지 — claim → signIn → /onboarding
- [x] Admin Agent 상세에 "Invite Link" 섹션 (복사 놓쳐도 재확인 가능)
- [x] Setup 완료 시 invite_token/secret 자동 null
- [x] `/api/admin/create-agent` 제거

#### Agent Reject + Delete
- [x] `rejection_reason/rejected_at` 저장 → Waiting 페이지가 감지해 Rejected UI + Start Over 버튼
- [x] `/api/admin/delete-agent` — auth.users까지 제거, 케이스 있으면 409 차단
- [x] Admin Agent 상세 "Danger Zone" 섹션
- [x] Admin Agent 리스트 "Rejected" rose 뱃지
- [x] 재서명/승인 시 rejection 자동 클리어

#### 알림 확장
- [x] Invoice opened (`quotes.first_opened_at/open_count`) → Agent Realtime
- [x] Schedule opened (`schedules.first_opened_at/open_count`) → Agent Realtime
- [x] `?preview=1`로 Agent/Admin 내부 프리뷰 기록 스킵
- [x] `/api/onboarding/notify-signed` — service role로 admin broadcast (client-side fallback)

#### Agent Payouts 재설계
- [x] Hero: Total Received (큰 숫자) + This Month
- [x] Monthly Performance 콤보 차트 — 금액 바 + 환자 수 선 (dual Y-axis, nice-number scaling, hover 툴팁)
- [x] Settlement History 주인공 배치 (Paid On 정렬)
- [x] Bank Information을 Profile에서 Payouts로 이동
- [x] Waiting to be Paid 보조 섹션 (amber 제거, 중립 톤)

#### Agent Dashboard 재설계
- [x] 헤더 Quick Actions (+ Add Client / + Create Quote)
- [x] Hero: This Month + Expected Pipeline + 전체 폭 Tier bar
- [x] Kanban Pipeline — 6 컬럼, 헤더만 tint 본문은 white
- [x] 각 케이스 chip에 status-specific 맥락 + urgency 색 (overdue red, 임박 amber)
- [x] Action Needed / Upcoming Travel / Recent Activity 전부 통합 삭제 → Pipeline 하나로

#### Admin Overview 재설계
- [x] Hero 4지표: Revenue / Earnings / Partner Costs / Agent Payouts
- [x] 기존 "Net" 제거 (gross인데 이익으로 오해 소지)
- [x] Action Required 통합 큐: Pending approvals / Payments overdue / Payment to confirm / Schedule upload / Stuck cases 5+ days
- [x] Recent Cases 제거 (Cases 탭 중복)

#### Admin Settlement 재설계
- [x] Hero: Paid This Month / Pending Payouts (amber) / Total All-Time
- [x] Pending Settlements를 **Agent별로 그룹핑** — 오래 기다린 순
- [x] 14일+ 대기 red 뱃지
- [x] Settlement History Paid On 컬럼 맨 왼쪽으로 정렬

#### Audit Log 타임라인 개편
- [x] 날짜 그룹 헤더 (Today / Yesterday / Mon, Oct 22)
- [x] 카테고리별 아이콘 (24×24 tinted)
- [x] 시간 왼쪽 고정, 문장형 레이아웃
- [x] `agent.deleted` 액션 추가, 숫자/reason 포맷팅

#### 기타
- [x] **Products Export Backup (ZIP)** — 엑셀 + images/ + README
- [x] **Admin Case 상세 Revenue Breakdown** — base / company / agent 분해
- [x] Review 페이지 신규 고객 폼에 Muslim 라디오 (Yes일 때만 Dietary 노출)
- [x] 레이아웃 듀얼 모드 정립 (작업 좌측 / 설정 중앙) — Admin Settlement/Audit Log, Agent Payouts/Dashboard 좌측정렬 전환

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

### 이번 스프린트(4/24) 추가 결정
| 항목 | 결정 | 이유 |
|------|------|------|
| 온보딩 진입 방식 | Temp 계정 → **초대 링크** | 보안↑, 번호 충돌 제거, 핸드오프 깔끔 |
| 온보딩 variant | B (placeholder 계정 → Setup에서 덮어쓰기) | 기존 auth-session 기반 가드 재사용 가능 (A는 재작성 부담) |
| Invite 재확인 | Admin 상세에 상시 노출 섹션 | 복사 놓쳐도 회복 경로 필요 |
| Agent Reject 정책 | Soft (사유+재시도) + Delete (완전제거) **2단계** | 유연성 확보, 케이스 있으면 Delete 차단 |
| Admin broadcast 발송 | server API (service role) 우선 + client fallback | RLS/세션 경계에서 실패 방지 |
| Invoice/Schedule 열람 추적 | 고객 URL 서버 컴포넌트에 직접 기록 | 간단, `?preview=1`로 내부 구분 |
| Pipeline UI | 카운트만 → **Kanban + status-specific 맥락** | 상태 + urgency + 구체 케이스를 한 섹션에 |
| Dashboard 섹션 구조 | 6개 → 3개 (Header / Hero / Pipeline) | "뭐 빼도 되나" 관점 — 중복 섹션 제거 |
| Admin 재무 지표 | 1개(Revenue) → 4개(Revenue/Earnings/Partner/Agent) | Admin 관점 4가지 돈 흐름 구분 |
| "Net" 라벨 | **제거** | base 포함된 gross라 이익으로 오해 유발 |
| Earnings 정의 | `Σ base × company_margin_rate` | 실제 회사 마진 (gross 아닌 순수) |
| Settlement 그룹핑 | Case → **Agent** 단위 | 실제 송금 플로우 (한 번 송금 = 한 명에게 여러 케이스) |
| Settlement 정렬 | 오래 기다린 Agent 순 | 공평성, 14일+ red 경고 |
| Bank Info 위치 | Profile → **Payouts** | Settlement 관련 정보 한곳에 모음 |
| 레이아웃 정책 | 모두 `mx-auto` → **듀얼 모드** | 페이지 성격별 차등 (테이블은 좌측 / 폼은 중앙) |
| 고객 chip에 맥락 | 모든 셀에 travel 날짜 vs 상태별 맞춤 | **상태별 맞춤** (예: Awaiting Payment엔 payment_due_date, 이후 단계엔 travel_start_date) |
| 차트 바 vs 선 | 한 차트에 둘 다 — **콤보** | 금액은 덩어리(바) · 환자 수는 추세(선), 다른 성격 다른 모양 |
| 차트 Y축 스케일 | nice-number ceiling (1·2·5 × 10ⁿ) | $12,686 → $20K 같이 깔끔한 눈금 |
| SVG 원이 찌그러짐 | SVG + CSS div 혼합 (선은 SVG, 점은 div) | `preserveAspectRatio="none"`에서 circle 타원화 회피 |

### 이전 스프린트 결정
(참고용 — 자세히는 이전 연구노트 참조)
- UI 언어 영어, 가격 USD 2자리, Quote=Invoice, RLS 전체 비활성화, Tiktak 브랜드, 상품 카테고리 정렬 고정, ENUM 대신 TEXT+CHECK, Cases에서 신규 생성 금지 (Home 플로우만)

---

## DB 스키마 변경사항 누적

### 4/29 추가분

```sql
-- Invoice signer (PIC) — 매 finalize/reprice 시 현재 admin name+title을 동결
ALTER TABLE admins ADD COLUMN title TEXT;
ALTER TABLE quotes ADD COLUMN signer_snapshot JSONB;
-- signer_snapshot 형태: { name: string|null, title: string|null }

-- Super admin 권한
ALTER TABLE admins ADD COLUMN is_super_admin BOOLEAN DEFAULT false;
-- 첫 super admin은 SQL로 직접 지정:
-- UPDATE admins SET is_super_admin = true WHERE email = '...';

-- Admin 초대 링크 (agent invite 패턴 mirror)
ALTER TABLE admins ADD COLUMN invite_token TEXT UNIQUE;
ALTER TABLE admins ADD COLUMN invite_secret TEXT;
ALTER TABLE admins ADD COLUMN invited_at TIMESTAMPTZ;
ALTER TABLE admins ADD COLUMN invite_expires_at TIMESTAMPTZ;

-- Country 데이터 정합성 (사용자 직접 실행 완료)
UPDATE agents SET country = 'United Arab Emirates' WHERE country = 'United Arb Emirates';
```

### 4/28 추가분

```sql
-- Schedule 재업로드 메모 (admin → agent 변경 사유 텍스트)
ALTER TABLE schedules ADD COLUMN admin_note TEXT;
```

### 4/24 추가분

```sql
-- Invite flow (온보딩 구조 변경)
ALTER TABLE agents ADD COLUMN invite_token TEXT UNIQUE;
ALTER TABLE agents ADD COLUMN invite_secret TEXT;  -- placeholder password, cleared on setup
ALTER TABLE agents ADD COLUMN invited_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN invite_expires_at TIMESTAMPTZ;  -- +7일 만료

-- Reject (soft)
ALTER TABLE agents ADD COLUMN rejection_reason TEXT;
ALTER TABLE agents ADD COLUMN rejected_at TIMESTAMPTZ;

-- Schedule opened by client (알림용)
ALTER TABLE schedules ADD COLUMN first_opened_at TIMESTAMPTZ;
ALTER TABLE schedules ADD COLUMN open_count INTEGER DEFAULT 0;
```

### 4/23 추가분

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
- **schedules**: 기본 + `file_name`, `revision_note`, `confirmed_at`, `first_opened_at`, `open_count`, status CHECK(pending/confirmed/revision_requested), (case_id, version) UNIQUE, slug index
- **settlements**: 기본 + `case_id` (UNIQUE, 1:1), amount는 KRW 저장
- **agents**: 기본 + `onboarding_status` (pending/awaiting/approved), `setup_completed_at`, `bank_info` (JSONB), `invite_token`(UNIQUE), `invite_secret`, `invited_at`, `invite_expires_at`, `rejection_reason`, `rejected_at`
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
