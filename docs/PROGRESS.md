# Project Progress

## 현재 상태
- **Phase**: Admin Cases + Quote 페이지 + Settings 확장
- **마지막 작업**: Admin Cases(상품 표시/액션), Quote Invoice 페이지, Admin Settings(마진+은행), Agent Cases(케이스 직접 생성 흐름)
- **마지막 업데이트**: 2026-04-20

---

## 다음 할 일
- [x] Admin Cases 탭 (케이스 목록/상세)
- [ ] Admin Agents 탭 (에이전트 목록/상세)
- [ ] Admin Settlement 탭 (정산 관리)
- [ ] Agent Clients 탭 (`/agent/clients`)
- [ ] Agent Payouts 탭 (`/agent/payouts`)
- [ ] Agent Dashboard 탭 (`/agent/dashboard`)
- [ ] Agent Profile 탭 (`/agent/profile`)
- [x] 고객용 견적서 페이지 (`/quote/[slug]`) — Commercial Invoice 디자인
- [ ] 고객용 스케줄 페이지 (`/schedule/[slug]`)
- [ ] Resend 이메일 연동 (결제 요청 자동 발송)
- [ ] 결제 확인 플로우 (Admin 수동 처리)
- [ ] 스케줄 업로드 플로우 (Admin → 고객 확인)

---

## 완료된 작업

### 인프라 / 세팅
- [x] Next.js 16 프로젝트 생성 (TypeScript, Tailwind CSS, App Router)
- [x] Supabase 연결 (`src/lib/supabase.ts`, `src/lib/supabase-server.ts`)
- [x] GitHub 연결 (`interview-jannis/Agent-SaaS`)
- [x] CLAUDE.md 프로젝트 바이블 작성
- [x] `docs/PROGRESS.md` 진행 현황 파일 생성
- [x] 전체 테이블 RLS 비활성화 (내부 B2B 도구, 외부 접근 없음)

### 인증
- [x] 로그인 페이지 (`/login`) — 이메일/비밀번호, 역할 분기(admin/agent)
- [x] 회원가입 페이지 (`/register`) — Agent 전용, `generate_agent_number()` RPC
- [x] `is_active: true` — 가입 즉시 로그인 가능 (Admin 승인 불필요)

### Admin 화면
- [x] Admin 공통 레이아웃 (`src/app/admin/layout.tsx`) — 사이드바 포함
- [x] AdminSidebar
  - 로그인 유저 이름 DB에서 조회해서 표시
  - 로그아웃 버튼 (`supabase.auth.signOut()` → `/login`)
  - 뒤로가기 버튼 (`router.back()`)
  - 미구현 탭(Cases, Agents, Settlement) 비활성화 처리
- [x] Admin Overview (`/admin/overview`) — 액션 필요 / This Month / Top Agents / Recent Cases
- [x] Admin Products (`/admin/products`) — 목록, 등록, 수정, 삭제
  - 가격 통화 선택 (KRW / USD 토글)
  - 3자리 쉼표 자동 포맷팅
  - 실시간 환산 힌트 표시 (₩X ≈ $Y)
  - 이미지 업로드 (Supabase Storage)
- [x] Admin Categories (`/admin/categories`) — CRUD
- [x] Admin Settings (`/admin/settings`) — 환율 설정

### Agent 화면
- [x] Agent 공통 레이아웃 (`src/app/agent/layout.tsx`)
- [x] AgentSidebar
  - 로그인 에이전트 이름 DB에서 조회해서 표시
  - 로그아웃 / 뒤로가기 버튼
  - 미구현 탭(Clients, Payouts, Dashboard, Profile) 비활성화
  - Cases 탭 활성화
- [x] Agent Home (`/agent/home`)
  - 상품 그리드: `is_active = true`인 상품만 표시, DB 연동 (하드코딩 없음)
  - 상품 필터: 카테고리 / 식단(할랄 등) / 여성의사 / 기도실 / 텍스트 검색
  - 이미지 캐러셀: hover 시 ‹ › 화살표, 점 인디케이터
  - 상품 상세 모달: 전체 정보 표시 (주소, 연락처 제외)
  - 그룹 기반 카트: 최대 4개 그룹, 색상 코딩(파랑/에메랄드/주황/보라)
  - 그룹별 인원 수 (+/-) 및 상품가격 × 인원 합산
  - 날짜 유효성 검증 (종료일 > 시작일)
  - USD 환산 총액 표시 (exchange_rate from system_settings)
  - 카트 상태 `localStorage('agent-cart')`에 저장 후 견적 검토로 이동
- [x] Agent 견적 검토 (`/agent/home/review`)
  - Lead Client 정보 표시
  - 동반자(Companion) 관리
    - "+ Add existing": 기존 고객 드롭다운 선택
    - "+ Register new": 인라인 폼으로 신규 고객 즉시 등록
    - 동반자 제거 기능
  - 그룹 배정 (Group Assignment)
    - 그룹별 미배정 멤버 드롭다운 배정
    - 멤버 칩(chip) 표시 및 × 버튼으로 제거
    - 한 멤버는 한 그룹에만 속하도록 자동 처리
  - 견적 상세 (그룹별 상품 목록, 소계, 총계 — USD 기준)
  - 견적 생성 DB 저장: `cases` → `case_members` → `quotes` → `quote_groups` → `quote_items` → `quote_group_members`
- [x] Agent Cases (`/agent/cases`)
  - 좌측 케이스 목록 (w-96) + 우측 상세 패널 (데스크톱 split view)
  - 모바일: 목록 → 상세 단일 뷰 전환
  - 상태 배지: Awaiting Payment / Payment Confirmed / Schedule Reviewed / Schedule Confirmed / Travel Completed
  - 상세: Lead Client 정보, 동반자 목록 / 추가(기존 선택 or 신규 등록) / 삭제
  - Quote 정보: 총액(₩), 결제 마감일 (초과 시 빨간색 강조)

### 버그 수정 / 트러블슈팅
- [x] `NavigatorLockAcquireTimeoutError`: `getUser()` → `getSession()` 변경 (React Strict Mode navigator lock 경합 해결)
- [x] Agent 로그인 "Access denied": `agents` 테이블 RLS 차단 → DISABLE ROW LEVEL SECURITY
- [x] "No products found": `products` 테이블 RLS 차단 → DISABLE ROW LEVEL SECURITY
- [x] "User already registered": 첫 가입 실패 시 `auth.users` 고아 레코드 생성 → Supabase 대시보드 수동 삭제
- [x] Turbopack F드라이브 경로 panic → `.next` 삭제 후 재시작
- [x] `useSearchParams` Suspense 미적용 빌드 오류
- [x] Next.js 15+ `params` Promise 처리

---

## 주요 결정사항

| 항목 | 결정 | 이유 |
|------|------|------|
| 전체 UI 언어 | 영어 | 해외 에이전트 대상 |
| 가격 저장 방식 | 입력값 그대로 + `price_currency` 컬럼 | 원화/달러 동시 지원, 환율 변동 독립 |
| Agent 가격 표시 | 무조건 USD 환산 | 해외 에이전트 기준 통화 통일 |
| Admin 가격 표시 | 입력 통화 그대로 | KRW면 ₩, USD면 $ |
| RLS 정책 | 전체 비활성화 | 내부 전용 B2B 도구, 외부 접근 없음 |
| 동반자 입력 시점 | 선택 사항 (결제 후 추가 가능) | 일정 업로드 전까지만 필수 |
| 에이전트 승인 절차 | 없음 (가입 즉시 로그인) | MVP 단계, 관리 오버헤드 최소화 |
| Auth 세션 조회 | `getSession()` | React Strict Mode navigator lock 오류 방지 |
| 카트 지속성 | `localStorage('agent-cart')` | 페이지 이동 간 상태 유지, 서버 불필요 |
| 디자인 | 흰 배경, 딥 그린(`#0f4c35`) 포인트, 미니멀 | 프리미엄 의료관광 이미지 |

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
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;

-- generate_agent_number RPC 함수 (미등록 시)
CREATE OR REPLACE FUNCTION generate_agent_number()
RETURNS TEXT AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COUNT(*) + 1 INTO next_num FROM agents;
  RETURN '#AG-' || LPAD(next_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;
```

---

## 블로커 / 이슈
- Supabase Storage `product-images` 버킷 수동 생성 필요 (대시보드에서)
- `generate_agent_number()` PostgreSQL 함수 Supabase에 미등록 시 회원가입 실패

---

## 참고 링크
- GitHub: https://github.com/interview-jannis/Agent-SaaS
- Supabase: https://supabase.com/dashboard/project/tknucfjnqapriadgiwuv
- 로컬 개발: http://localhost:3000
