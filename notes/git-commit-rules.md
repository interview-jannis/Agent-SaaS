# Git 커밋·푸시 규칙

## 기본 원칙
- **커밋은 작업 완전히 끝난 시점에만**. 중간 작업 상태 커밋 금지.
- **push는 명시적 요청 시에만** (자동으로 push 금지).
- 커밋 전 반드시 `git status`로 staged 목록 확인.

## 포함해야 하는 파일 (전부 커밋)
- `src/` — 소스 코드 전체
- `data/` — Excel 마스터 파일, 이미지 원본 등 **data 폴더 전체** (단, 아래 제외 항목 빼고)
- `notes/` — 연구노트, PROGRESS.md (단, 아래 제외 항목 빼고)
- `public/` — 정적 파일
- `supabase/`, `sql/` — DB 마이그레이션
- `.gitignore`, `package.json`, `tsconfig.json` 등 설정 파일

## 제외해야 하는 파일 (.gitignore에 등록됨)
| 파일/폴더 | 이유 |
|-----------|------|
| `.env*` (`.env.local` 등) | Supabase URL·키 등 민감 정보 |
| `**/node_modules/` | npm install로 재생성 가능, 용량 큼 |
| `/.next/`, `/build/`, `/out/` | 빌드 산출물, 재빌드 가능 |
| `~$*` | Excel 열려있을 때 생기는 임시 잠금 파일 |
| `data/**/pdf to png/` | 로컬 OCR 작업용 임시 파일 |
| `notes/take-*.cjs`, `notes/upload-*.cjs` 등 | service-role 키 포함 스크립트 |
| `notes/screenshots/` | 로컬 디버깅용 스크린샷 |
| `.DS_Store` | macOS 시스템 파일 |
| `*.pem` | 인증서 키 |

## 커밋 메시지 형식
```
type: 한 줄 요약

- 변경 내용 bullet
- ...

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**type 종류:** `feat` (신기능) / `fix` (버그) / `chore` (설정·데이터·문서) / `docs` (노트·README) / `refactor`

## 커밋 전 체크리스트
1. `git status` — 예상치 못한 파일 포함 여부 확인
2. `.env.local` 등 민감 파일이 staged에 없는지 확인
3. `data/` 폴더의 새 파일 있으면 `git add data/` 로 포함
4. `notes/` 연구노트·PROGRESS.md 업데이트됐으면 포함
