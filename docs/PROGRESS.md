# Project Progress

## 현재 상태
- **Phase**: Agent/Admin 핵심 플로우 안정화 완료, 무슬림 UX·Tiktak 브랜딩·고객용 스케줄 페이지 적용
- **마지막 작업**: Invoice 404 복구, member_count, Admin 카테고리 그룹핑, Home 2×2 섹션 뷰, 무슬림 조건부 필드, Tiktak 브랜딩, Schedule Preview/Send
- **마지막 업데이트**: 2026-04-21
- **SaaS 브랜드명**: **Tiktak** (UI 전역 반영 완료, 법인명은 Interview Co., Ltd 유지)

> 2026-04-17 회사 미팅 피드백 반영 작업 반영됨 (`docs/meetings/26.04.17-kickoff-feedback.md`)
> 2026-04-21 상세 작업 로그: `docs/26.04.21.md`

---

## 다음 할 일

### 긴급 확인
- [ ] `/schedule/[slug]` 실제 PDF 업로드 테스트 — Supabase Storage `schedules` 버킷 수동 생성 필요 (Public bucket)

### Agent Pre-Onboarding & 전자서명 (신규 플로우)
- [ ] `/onboarding` 진입 페이지 — 사업 소개 + 서비스 구조 + OT 자료
- [ ] NDA 전자서명 페이지 — Canvas 서명 + SMS 본인 인증
- [ ] 파트너십 계약서 전자서명 페이지
- [ ] 서명 완료 PDF 생성 + 에이전트 이메일 발송 (Resend)
- [ ] `agent_contracts` 테이블 신규 생성 (signer_email, contract_type, signature_image_url, pdf_url, signed_at, ip, device_info)
- [ ] 서명 완료 후에만 `/register` 진입 허용하는 가드 추가

### Agent 회원가입 개편
- [ ] `/register` 폼에 **정산 계좌(bank_info)** 필수 입력 필드 추가 — 은행명, 계좌번호, 예금주, Swift 등

### 상품 데이터 관리
- [ ] Admin Products에 **"Export to Excel"** 버튼 추가 (`xlsx` 라이브러리, 카테고리명·환산가격 가공 형태)

### 미구현 탭
- [ ] Agent Payouts (`/agent/payouts`)
- [ ] Agent Dashboard (`/agent/dashboard`)
- [ ] Agent Profile (`/agent/profile`)
- [ ] Admin Agents (`/admin/agents`) — 에이전트 목록/상세/마진율 관리
- [ ] Admin Settlement (`/admin/settlement`) — 정산 관리

### 기능 보완
- [ ] Resend 이메일 연동 (결제 요청 자동 발송 + 서명 PDF 발송 공용 + 스케줄 링크 발송)

---

## 완료된 작업

### 인프라 / 세팅
- [x] Next.js 프로젝트 생성 (TypeScript, Tailwind CSS, App Router)
- [x] Supabase 연결 (`src/lib/supabase.ts`, `src/lib/supabase-server.ts`)
- [x] GitHub 연결 (`interview-jannis/Agent-SaaS`)
- [x] CLAUDE.md 프로젝트 바이블 작성
- [x] `docs/PROGRESS.md` 진행 현황 파일 생성
- [x] 전체 테이블 RLS 비활성화 (+ agents/quote_group_members/schedules 정책 완전 제거)
- [x] Admin layout `min-h-screen → h-screen` (sticky 활성)
- [x] `supabase-server.ts` — `SUPABASE_SERVICE_ROLE_KEY` ?? anon key fallback

### 인증
- [x] 로그인 페이지 (`/login`) — 이메일/비밀번호, 역할 분기(admin/agent), Tiktak 브랜딩
- [x] 회원가입 페이지 (`/register`) — Agent 전용, Tiktak 브랜딩

### 브랜딩
- [x] 전역 metadata title = "Tiktak"
- [x] Agent/Admin Sidebar 로고 = Tiktak
- [x] 로그인/회원가입 안내 문구 = Tiktak
- [x] Invoice 상단 로고 = Tiktak (하단 "by Interview Co., Ltd" 부기), 법적 발행 주체 Interview Co., Ltd 유지

### Admin 화면
- [x] Admin 공통 레이아웃 + 사이드바 (로그인 유저 이름, 로그아웃)
- [x] Admin Overview (`/admin/overview`) — 액션 필요 / This Month / Top Agents / Recent Cases
- [x] Admin Products (`/admin/products`)
  - 목록/등록/수정/삭제, 이미지 업로드 + **hover 캐러셀**
  - Partner Name 컬럼 + Description 줄바꿈 보존
  - 원가 + 3 tier(15/20/25%) 최종가 (USD 통일), Price 헤더 정렬
  - **카테고리별 그룹핑 + Sticky Jump-to pill 네비게이션**
  - 파트너 필터(카테고리 선택 시 해당 카테고리 파트너만 표시)
- [x] Admin Categories (`/admin/categories`) — CRUD + sort_order 기반 정렬
- [x] Admin Settings (`/admin/settings`) — 환율 + 회사 마진 + 은행 계좌 정보
- [x] Admin Cases (`/admin/cases`) — 표 + 50/50 분할 뷰
  - Agent/Lead/Status/Members(=member_count 합)/Travel/Total(USD)
  - Admin 액션: 결제 확인 / **드래그&드롭 PDF 업로드** / 여행 완료 처리
  - 우측 Selected Products 패널 가독성 개선 (글자 확대, description 2줄 클램프)

### Agent 화면
- [x] Agent 공통 레이아웃 + 사이드바 (Home / Cases / Clients 활성)
- [x] Agent Home (`/agent/home`)
  - **2×2 카테고리 섹션 뷰** (Medical/Beauty/Wellness/Subpackage), See all → 단일 카테고리 flat grid
  - 장바구니 pinned 정렬 (섹션 진입 시점 스냅샷)
  - 상품 카드 이미지 캐러셀, 상세 모달 (모달 이미지 index 독립)
  - 그룹 기반 카트 (최대 4그룹, 색상 코딩)
  - **마진 적용된 최종 USD 가격** 표시 (Home·Review·Invoice 완전 일치)
  - 카테고리 라디오(단일 선택), 무슬림/식단/여성의사 필터
  - **Client 등록 모달** (Clients 탭과 동일 스타일), Muslim=Yes 조건부 3개 필드
- [x] Agent 견적 검토 (`/agent/home/review`)
  - 동반자 관리, 그룹 배정
  - **Send Quote → 새 케이스 상세 페이지로 redirect**
  - `quote_groups.member_count` 저장, 마진 적용가 2자리 USD
- [x] Agent Cases (`/agent/cases`) — 리스트 전용 (New Case 생성 기능 제거, Home 플로우로만)
- [x] Agent Cases 상세 (`/agent/cases/[id]`)
  - 여행 기간 편집, Lead Client 링크, 동반자 관리 (Muslim Yes/No 조건부)
  - Selected Products (각 상품 USD 단가 × Qty = Amount) — member_count 기반
  - **Schedule Preview/Send 버튼** (Invoice의 Preview/Send와 동일 패턴)
  - Financials: 총액 USD, 결제 마감일, 예상 수익
- [x] Agent Clients (`/agent/clients`)
  - 리스트 + 검색, **Add Client 버튼 + 등록 모달**
  - Muslim Yes/No 조건부 3개 필드
- [x] Agent Clients 상세 (`/agent/clients/[id]`)
  - 편집/뷰 모드, Muslim=Yes 시 Dietary/Prayer Frequency/Prayer Location 노출

### 고객용 페이지
- [x] 인보이스 페이지 (`/quote/[slug]`) — Commercial Invoice 양식
  - To / CC / From / Ref.No / Issue Date / Due Date
  - Subject: **Muslim VIP Clients** (leadClient.needs_muslim_friendly 기반) / VIP Clients
  - 상품 테이블, 총액 USD 2자리 소수점
  - 은행 계좌 (`system_settings.bank_details`), colon 정렬 통일
  - Print 버튼(client component 분리), Tiktak 로고
- [x] 스케줄 페이지 (`/schedule/[slug]`) — PDF iframe 풀스크린 (간소화)

---

## 주요 결정사항

| 항목 | 결정 | 이유 |
|------|------|------|
| UI 패턴 | 표(list) → 클릭 → 상세(detail) | Admin/Agent 모두 동일한 패턴으로 통일 |
| 전체 UI 언어 | 영어 | 해외 에이전트 대상 |
| Agent 가격 표시 | 무조건 USD, 2자리 소수점 | 해외 에이전트 기준 통화, 일관성 |
| Admin 가격 표시 | 원가(원화 or USD) + 3 tier USD | 내부 관리용 + 에이전트 tier별 최종가 |
| Quote = Invoice | 견적 생성 시 slug 발급, 그게 인보이스 URL | 별도 Invoice 발행 단계 불필요 |
| Agent Invoice/Schedule 접근 | Preview(새 탭) + Send(링크 복사) 분리 | 에이전트가 확인도 하고 고객에게도 공유 |
| Admin Invoice 접근 | 조용한 View ↗ 링크만 | Admin은 인보이스 발송 주체가 아님 |
| RLS 정책 | 전체 비활성화 + 정책 완전 제거 | 내부 전용 B2B 도구 |
| Client 편집 필드 | 여행 필드 제외 | 여행 정보는 Case에 속함 |
| 카트 지속성 | localStorage | 페이지 이동 간 상태 유지 |
| 서버 DB 클라이언트 | anon key fallback | service role key 미설정 환경 대응 |
| Supabase nested select FK | `!constraint_name` 명시 힌트 | PostgREST 자동 인식 불안정 회피 |
| SaaS 브랜드명 | Tiktak (UI 전역) | 법적 발행 주체는 Interview Co., Ltd 유지 |
| Agent 가입 선행 절차 | Pre-Onboarding → 전자서명 → 회원가입 | 계약 이전 검토 시간 확보 + 종이 계약 제거 |
| 전자서명 방식 | 자체 구현 (Canvas + SMS 인증 + PDF 이메일 발송) | 가입 UX 매끄러움 우선 |
| Agent 정산 계좌 | 가입 폼에서 필수 입력 | 정산 누락 방지 |
| 상품 카테고리 정렬 | Medical → Beauty → Wellness → Subpackage 고정 | 비즈니스 의도 기반, 알파벳 금지 |
| 상품 데이터 관리 | SaaS 직접 등록 + Excel Export | 양방향 동기화 충돌 방지 |
| Enum 관리 방식 | **TEXT + CHECK constraint** (ENUM 지양) | 값 추가/삭제/이름변경이 ALTER TYPE보다 쉬움 |
| 고객 등록 진입점 | Clients 탭 Add Client + Home 모달 양쪽 | Cases에서는 생성 기능 제거 (플로우 명확화) |
| Muslim 질문 방식 | "Muslim?" Yes/No 라디오 | 대부분 비무슬림이라 "Not required" 부정형 어색 |
| Muslim 조건부 필드 | Yes일 때만 Dietary/Prayer Frequency/Prayer Location | 비무슬림에겐 무관, 폼 간결 |

---

## DB 변경사항 (Supabase에 직접 적용 필요 — 누적)

```sql
-- price_currency 컬럼 (원가 통화)
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_currency TEXT NOT NULL DEFAULT 'KRW';

-- 카테고리 정렬
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 99;
UPDATE product_categories SET sort_order = 1 WHERE LOWER(name) = 'medical';
UPDATE product_categories SET sort_order = 2 WHERE LOWER(name) = 'beauty';
UPDATE product_categories SET sort_order = 3 WHERE LOWER(name) = 'wellness';
INSERT INTO product_categories (name, sort_order) VALUES ('Subpackage', 4)
  ON CONFLICT DO NOTHING;

-- 견적 그룹 인원수
ALTER TABLE quote_groups ADD COLUMN IF NOT EXISTS member_count INT NOT NULL DEFAULT 1;

-- 파트너사 이름
ALTER TABLE products ADD COLUMN IF NOT EXISTS partner_name TEXT;

-- dietary ENUM → TEXT+CHECK 마이그레이션
ALTER TABLE products ALTER COLUMN dietary_type DROP DEFAULT;
ALTER TABLE products ALTER COLUMN dietary_type TYPE TEXT USING dietary_type::text;
ALTER TABLE products ALTER COLUMN dietary_type SET DEFAULT 'none';
ALTER TABLE products ADD CONSTRAINT products_dietary_type_check
  CHECK (dietary_type IS NULL OR dietary_type IN
    ('halal_certified','halal_friendly','muslim_friendly','pork_free','none'));
ALTER TABLE clients ALTER COLUMN dietary_restriction DROP DEFAULT;
ALTER TABLE clients ALTER COLUMN dietary_restriction TYPE TEXT USING dietary_restriction::text;
ALTER TABLE clients ADD CONSTRAINT clients_dietary_restriction_check
  CHECK (dietary_restriction IS NULL OR dietary_restriction IN
    ('halal_certified','halal_friendly','muslim_friendly','pork_free','none'));
DROP TYPE dietary_type;

-- 기도 관련 필드
ALTER TABLE clients ADD COLUMN IF NOT EXISTS prayer_frequency TEXT
  CHECK (prayer_frequency IS NULL OR prayer_frequency IN ('strict','moderate','flexible'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS prayer_location TEXT
  CHECK (prayer_location IS NULL OR prayer_location IN
    ('prayer_room','mosque_nearby','quiet_private_space','any_clean_space','no_preference'));

-- 전체 테이블 RLS 비활성화 + 정책 완전 제거
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
DROP POLICY IF EXISTS "agents_self_insert" ON agents;
DROP POLICY IF EXISTS "authenticated users can read agents" ON agents;

-- 권한 (anon, authenticated 모두 SELECT 권한)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- generate_agent_number RPC
CREATE OR REPLACE FUNCTION generate_agent_number()
RETURNS TEXT AS $$
DECLARE next_num INT;
BEGIN
  SELECT COUNT(*) + 1 INTO next_num FROM agents;
  RETURN '#AG-' || LPAD(next_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- system_settings 필수 키
-- exchange_rate: value = { "usd_krw": 1478 }
-- company_margin_rate: value = { "rate": 0.5 }
-- bank_details: value = { bank_name, account_number, address, swift_code, beneficiary, beneficiary_number }
```

---

## 블로커 / 이슈

- Supabase Storage **`schedules` 버킷 수동 생성 필요** (Public bucket으로 설정 — 고객이 URL로 PDF 조회해야 함)
- `product-images` 버킷도 수동 생성 필요 (있을 수도)

---

## 참고 링크
- GitHub: https://github.com/interview-jannis/Agent-SaaS
- Supabase: https://supabase.com/dashboard/project/tknucfjnqapriadgiwuv
- 로컬 개발: http://localhost:3000
- 연구노트: `docs/26.04.21.md` (최신), `docs/26.04.20.md`, `docs/26.04.17.md`, `docs/26.04.16.md`
- 미팅 노트: `docs/meetings/26.04.17-meeting-feedback.md`
