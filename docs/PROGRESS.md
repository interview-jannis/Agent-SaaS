# Project Progress

## 현재 상태
- **Phase**: Agent/Admin UI 패턴 통일 완료, Invoice 흐름 정리, 미팅 피드백 반영 대기
- **마지막 작업**: Admin Cases 표→50/50 재설계, Agent Cases/Clients 상세 페이지 생성, Invoice Preview+Send 분리, supabase-server.ts 404 수정
- **마지막 업데이트**: 2026-04-21
- **SaaS 브랜드명**: **Tiktak** (UI만 반영, 법인명은 Interview Co., Ltd 유지)

> 2026-04-17 회사 미팅 피드백 반영 작업 추가됨 (`docs/meetings/26.04.17-kickoff-feedback.md` 참고)

---

## 다음 할 일

### 긴급 확인
- [ ] `/quote/[slug]` Invoice 페이지 404 해결 — `window.print()` 핸들러가 async server component에 있어 오류 발생 가능성 높음. Print 버튼만 별도 client component로 분리 필요
- [ ] Invoice Subject 로직 변경 — 현재 `nationality` 기반("for {국적} VIP Clients") → **`clients.needs_muslim_friendly` 기반**으로 교체
  - true → "K-Beauty & Medical Premium Tour Package for **Muslim** VIP Clients"
  - false → "K-Beauty & Medical Premium Tour Package for VIP Clients"
- [ ] `system_settings` DB에 `exchange_rate` 값이 `{ "usd_krw": 1350 }` 형식으로 저장됐는지 확인

### 브랜딩 (Tiktak 적용)
- [ ] 로고·사이드바·로그인 페이지·탭 타이틀(`<title>`)에 "Tiktak" 반영
- [ ] Invoice 발행 주체는 Interview Co., Ltd 유지 (법인명이므로 변경 금지)

### Agent Pre-Onboarding & 전자서명 (신규 플로우)
- [ ] `/onboarding` 진입 페이지 — 사업 소개 + 서비스 구조 + OT 자료
- [ ] NDA 전자서명 페이지 — Canvas 서명 + SMS 본인 인증
- [ ] 파트너십 계약서 전자서명 페이지
- [ ] 서명 완료 PDF 생성 + 에이전트 이메일 발송 (Resend)
- [ ] `agent_contracts` 테이블 신규 생성 (signer_email, contract_type, signature_image_url, pdf_url, signed_at, ip, device_info)
- [ ] 서명 완료 후에만 `/register` 진입 허용하는 가드 추가

### Agent 회원가입 개편
- [ ] `/register` 폼에 **정산 계좌(bank_info)** 필수 입력 필드 추가 — 은행명, 계좌번호, 예금주, Swift 등

### 상품 카테고리
- [ ] `product_categories` 테이블에 `order` 컬럼 추가 (또는 코드 상수로 순서 정의)
- [ ] **Medical → Beauty → Wellness** 고정 순서 적용 (Agent Home 필터, Admin Categories, Admin Products 목록) — 알파벳 정렬 금지
- [ ] 치과 / 안과 / 한방 카테고리 신규 등록

### 상품 데이터 관리
- [ ] Admin Products에 **"Export to Excel"** 버튼 추가 (`xlsx` 라이브러리 활용, 카테고리명·환산가격 등 가공 형태)

### 미구현 탭
- [ ] Agent Payouts (`/agent/payouts`)
- [ ] Agent Dashboard (`/agent/dashboard`)
- [ ] Agent Profile (`/agent/profile`)
- [ ] Admin Agents (`/admin/agents`) — 에이전트 목록/상세/마진율 관리
- [ ] Admin Settlement (`/admin/settlement`) — 정산 관리

### 기능 보완
- [ ] 고객용 스케줄 페이지 (`/schedule/[slug]`)
- [ ] Resend 이메일 연동 (결제 요청 자동 발송 + 서명 PDF 발송 공용)

---

## 완료된 작업

### 인프라 / 세팅
- [x] Next.js 프로젝트 생성 (TypeScript, Tailwind CSS, App Router)
- [x] Supabase 연결 (`src/lib/supabase.ts`, `src/lib/supabase-server.ts`)
- [x] GitHub 연결 (`interview-jannis/Agent-SaaS`)
- [x] CLAUDE.md 프로젝트 바이블 작성
- [x] `docs/PROGRESS.md` 진행 현황 파일 생성
- [x] 전체 테이블 RLS 비활성화
- [x] `supabase-server.ts` — `SUPABASE_SERVICE_ROLE_KEY` 미설정 시 anon key fallback 추가 (Invoice 404 수정)

### 인증
- [x] 로그인 페이지 (`/login`) — 이메일/비밀번호, 역할 분기(admin/agent)
- [x] 회원가입 페이지 (`/register`) — Agent 전용, `generate_agent_number()` RPC

### Admin 화면
- [x] Admin 공통 레이아웃 + 사이드바 (로그인 유저 이름, 로그아웃)
- [x] Admin Overview (`/admin/overview`) — 액션 필요 / This Month / Top Agents / Recent Cases
- [x] Admin Products (`/admin/products`) — 목록, 등록, 수정, 삭제, 이미지 업로드
- [x] Admin Categories (`/admin/categories`) — CRUD
- [x] Admin Settings (`/admin/settings`) — 환율 설정 + **은행 계좌 정보 입력**
- [x] Admin Cases (`/admin/cases`) — **표 형식 + 50/50 분할 뷰**
  - 미선택: 전체 너비 테이블 (케이스# / 에이전트 / Lead Client / 상태 / 인원 / 여행기간 / USD)
  - 선택: 상단 브레드크럼 + 왼쪽 50%(케이스 정보+액션) / 오른쪽 50%(선택 상품)
  - Admin 액션: 결제 확인 / PDF 스케줄 업로드 / 여행 완료 처리
  - "View Invoice" 제거, Financials에 조용한 `View ↗` 링크만 유지

### Agent 화면
- [x] Agent 공통 레이아웃 + 사이드바 (Home / Cases / Clients 탭 활성화)
- [x] Agent Home (`/agent/home`)
  - 상품 그리드, 필터 (카테고리/식단/여성의사/기도실/검색)
  - 이미지 캐러셀, 상품 상세 모달
  - 그룹 기반 카트 (최대 4그룹, 색상 코딩)
  - **동일 상품 여러 그룹 동시 선택 가능** (버그 수정 완료)
  - USD 환산 총액, localStorage 카트 저장
- [x] Agent 견적 검토 (`/agent/home/review`)
  - 동반자 관리 (기존 선택 / 신규 등록)
  - 그룹 배정 (멤버 → 그룹 드래그 없이 드롭다운 배정)
  - 견적 상세 (그룹별 소계/총계 USD)
  - DB 저장: cases → case_members → quotes → quote_groups → quote_items → quote_group_members
- [x] Agent Cases (`/agent/cases`) — **표 형식**
  - 전체 너비 테이블 (케이스# / Lead Client / 상태 / 인원 / 여행 시작일 / USD)
  - 행 클릭 → `/agent/cases/[id]` 상세 페이지
- [x] Agent Cases 상세 (`/agent/cases/[id]`) — **신규**
  - 여행 기간 편집
  - Lead Client 링크 (`/agent/clients/[id]`)
  - 동반자 추가/삭제 (기존 선택 or 신규 등록)
  - Selected Products (그룹별, USD 단가×인원=합계)
  - Schedule PDF 다운로드
  - Financials: 총액 USD, 결제 마감일, 예상 수익
  - **Preview ↗** (인보이스 새 탭 열기) + **Send Invoice** (링크 클립보드 복사)
- [x] Agent Clients (`/agent/clients`) — **표 형식**
  - 전체 너비 테이블 (클라이언트# / 이름 / 국적 / 성별 / 식단 / 무슬림 프렌들리)
  - 검색 (이름/국적/번호)
  - 행 클릭 → `/agent/clients/[id]` 상세 페이지
- [x] Agent Clients 상세 (`/agent/clients/[id]`) — **신규**
  - 편집: 국적/성별/생년월일/전화/이메일/여권번호/무슬림 여부/식단/특별 요청
  - 여행 관련 필드 완전 제외 (arrival_date 등은 Case에 속함)
  - 하단 Cases 섹션 (이 고객의 케이스 목록, USD 금액, 클릭 → 케이스 상세)

### 고객용 페이지
- [x] 인보이스 페이지 (`/quote/[slug]`) — Commercial Invoice 양식
  - To / Attn / CC / From / Ref.No / Issue Date / Due Date
  - 상품 테이블 (No / Description / Qty / Unit Price / Amount / Remarks)
  - 총액 (USD)
  - 은행 계좌 정보 (`system_settings.bank_details`)
  - 서명, 푸터
  - Print / Save PDF 버튼

---

## 주요 결정사항

| 항목 | 결정 | 이유 |
|------|------|------|
| UI 패턴 | 표(list) → 클릭 → 상세(detail) | Admin/Agent 모두 동일한 패턴으로 통일 |
| 전체 UI 언어 | 영어 | 해외 에이전트 대상 |
| Agent 가격 표시 | 무조건 USD | 해외 에이전트 기준 통화 통일 |
| Admin 가격 표시 | KRW + USD 병기 | 내부 관리용, 두 통화 모두 필요 |
| Quote = Invoice | 견적 생성 시 slug 발급, 그게 인보이스 URL | 별도 Invoice 발행 단계 불필요 |
| Agent Invoice 접근 | Preview(새 탭) + Send(링크 복사) 분리 | 에이전트가 확인도 하고 고객에게도 공유 가능 |
| Admin Invoice 접근 | 조용한 View ↗ 링크만 | Admin은 인보이스 발송 주체가 아님 |
| RLS 정책 | 전체 비활성화 | 내부 전용 B2B 도구 |
| Client 편집 필드 | 여행 필드 제외 | 여행 정보는 Case에 속함 |
| 카트 지속성 | localStorage | 페이지 이동 간 상태 유지 |
| 서버 DB 클라이언트 | anon key fallback | service role key 미설정 환경 대응 |
| SaaS 브랜드명 | Tiktak (UI만) | 법적 발행 주체는 Interview Co., Ltd 유지 (법인명 ≠ 브랜드명) |
| Agent 가입 선행 절차 | Pre-Onboarding → 전자서명 → 회원가입 | 계약 이전 검토 시간 확보 + 종이 계약 제거 |
| 전자서명 방식 | 자체 구현 (Canvas + SMS 인증 + PDF 이메일 발송) | 가입 UX 매끄러움 우선, v2에서 Modusign 재검토 |
| Agent 정산 계좌 | 가입 폼에서 필수 입력 | 정산 누락 방지, 관리자 수작업 제거 |
| 상품 카테고리 정렬 | Medical → Beauty → Wellness 고정 순서 | 알파벳 정렬 금지 — 중요도·플로우 순서 반영 |
| 상품 데이터 관리 | SaaS 직접 등록 (source of truth) + Excel Export 버튼 | 양방향 동기화로 인한 충돌 방지, 200개 넘으면 Bulk Import 재검토 |

---

## DB 변경사항 (Supabase에 직접 적용 필요)

```sql
-- price_currency 컬럼 추가
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_currency TEXT NOT NULL DEFAULT 'KRW';

-- 전체 테이블 RLS 비활성화
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE case_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE quotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE quote_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE quote_group_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;

-- generate_agent_number RPC 함수
CREATE OR REPLACE FUNCTION generate_agent_number()
RETURNS TEXT AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COUNT(*) + 1 INTO next_num FROM agents;
  RETURN '#AG-' || LPAD(next_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- system_settings에 exchange_rate 저장 형식 (확인 필요)
-- key: 'exchange_rate', value: { "usd_krw": 1350 }
```

---

## 블로커 / 이슈

- `supabase-server.ts` 수정 후 **개발 서버 재시작 필요** (Ctrl+C → npm run dev)
- Supabase Storage `product-images`, `schedules` 버킷 수동 생성 필요
- Admin Settings에 은행 계좌 정보 입력 UI 미완성 → 인보이스 하단 "Not configured" 표시 중

---

## 참고 링크
- GitHub: https://github.com/interview-jannis/Agent-SaaS
- Supabase: https://supabase.com/dashboard/project/tknucfjnqapriadgiwuv
- 로컬 개발: http://localhost:3000
- 연구노트: `docs/26.04.20.md`
