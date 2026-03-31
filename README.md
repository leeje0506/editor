# editor

### 최종 수정 : 260331
# SubEditor Pro — 기능 명세서 v6

> 영상과 자막(SRT/VTT)을 동기화하여 편집하는 전문 작업자용 웹 툴.
> Subtitle Edit 프로그램의 장점을 웹으로 구현하는 것이 목표.
> 팀 기반 자막 워크플로우를 위해 역할별 접근 제어, 방송사별 자막 기준, 작업 추적 기능을 포함.

---

# PART 0. 사용자 역할 및 권한

## 0.1 역할 정의

| 역할 | 코드 | 설명 | 의도 |
|------|------|------|------|
| 마스터 | `master` | 시스템 전체 관리자. 모든 기능 접근 가능. 관리자/작업자 계정 생성 가능 | 시스템 소유자. 1명 이상 존재해야 함. 관리자와 동일한 기능 보유 |
| 관리자 | `manager` | 프로젝트/멤버 관리, 대시보드, 통계, 설정 접근 가능. 제출된 작업 검수(승인/반려) 담당 | 팀장/PM 역할. 작업자 관리와 검수 담당 |
| 작업자 | `worker` | 프로젝트 작업 + 검수 도구 사용 가능. 대시보드/설정 접근 불가 | 실제 자막 편집 작업을 수행하는 사람 |

## 0.2 페이지별 접근 권한 매트릭스

| 페이지 | master | manager | worker |
|--------|--------|---------|--------|
| 로그인 (`/login`) | ✅ | ✅ | ✅ |
| 대시보드 (`/dashboard`) | ✅ | ✅ | ❌ → `/projects`로 리다이렉트 |
| 프로젝트 리스트 (`/projects`) | ✅ (전체) | ✅ (전체) | ✅ (본인 생성 + 배정분만) |
| 편집기 (`/editor/:id`) | ✅ | ✅ | ✅ |
| 설정 — 방송사 프리셋 | ✅ | ✅ | ❌ |
| 설정 — 조직원 관리 | ✅ | ✅ | ❌ |
| 설정 — 프로젝트 목록 | ✅ | ✅ | ❌ |
| 설정 — 작업자 통계 | ✅ | ✅ | ❌ |
| 설정 — 단축키 설정 | ✅ | ✅ | ✅ |
| 설정 — 마이페이지 | ✅ | ✅ | ✅ |

## 0.3 라우팅 구조

```
/login                          → LoginPage
/                               → RootRedirect (역할에 따라 /dashboard 또는 /projects)
/dashboard                      → HomePage (master/manager: 대시보드 + 프로젝트 리스트)
/projects                       → HomePage (worker: 프로젝트 리스트만)
/editor/:projectId              → AppLayout (편집기)
/settings                       → SettingsPage (관리자: 전체 탭, 작업자: 단축키+마이페이지만)
/settings/:tab                  → SettingsPage (특정 탭 직접 접근)
```

---

# PART 1. BACKEND (FastAPI + SQLAlchemy + SQLite)

> **기술 스택**: Python 3.10, FastAPI, SQLAlchemy (SQLite), JWT 인증 (`python-jose`), bcrypt 비밀번호 해싱 (`passlib`).
> 가상환경: `.edit_venv` (pyenv).
> 실행: `uvicorn app.main:app --reload --port 8001`

---

## ACT-B01. 인증 및 사용자 관리

### B01-T01. User 모델 (`app/models.py`)
- `id` (int PK), `username` (string, unique), `password_hash` (string), `display_name` (string), `role` (string: master/manager/worker), `is_active` (bool, default True), `created_at`, `updated_at`
- `settings` (Text, nullable, default None) — JSON 문자열: `{"shortcuts": {...}, ...}`
- `created_projects`, `assigned_projects` relationship → Project

### B01-T02. 인증 서비스 (`app/services/auth.py`)
- `hash_password(pw)` → bcrypt 해시 생성
- `verify_password(pw, hash)` → bcrypt 검증
- `create_token(user_id, role)` → JWT 토큰 생성 (HS256, 24시간 만료)
- `get_current_user(token)` → 토큰 디코딩 → DB에서 User 조회 → 의존성 주입
- `require_role(roles)` → 특정 역할만 허용하는 의존성 팩토리

### B01-T03. 인증 API (`app/routers/auth.py`)
- `POST /api/auth/login` — `{ username, password }` → `{ token, user }` 반환
- `GET /api/auth/me` — 현재 로그인 사용자 정보
- `PATCH /api/auth/me` — 본인 정보 수정 (display_name, 비밀번호 변경)

### B01-T04. 사용자 관리 API (`app/routers/auth.py`)
- `GET /api/auth/users` — 전체 사용자 목록 (master/manager만)
- `POST /api/auth/users` — 계정 생성. master는 모든 역할 생성 가능, manager는 worker만
- `PATCH /api/auth/users/:id` — 수정 (display_name, role, is_active)
- `DELETE /api/auth/users/:id` — 삭제 또는 비활성화
- `POST /api/auth/users/:id/reset-password` — 비밀번호 초기화 (아이디와 동일하게)

### B01-T05. 사용자 설정 API (`app/routers/auth.py`)
- `GET /api/auth/me/settings` — 현재 사용자의 개인 설정 조회 (단축키 등). 설정 없으면 빈 객체 `{}`
- `PUT /api/auth/me/settings` — 개인 설정 저장 (전체 덮어쓰기). `{ shortcuts: { save: "Ctrl+S", undo: "Ctrl+Z", ... }, ... }`

> **설계 의도**: 사용자별 환경설정을 JSON으로 DB에 저장. 현재는 단축키만 사용하지만, 향후 UI 설정(다크모드 기본값 등)도 추가 가능. `/me/settings` 엔드포인트는 `/users/{user_id}` 보다 먼저 등록하여 FastAPI 라우트 매칭 충돌 방지.

### B01-T06. 초기 시딩 (`app/main.py` startup 이벤트)
- DB에 master 역할 User가 없으면 `admin/admin` 계정 자동 생성
- `BroadcasterRule` 테이블이 비어있으면 기본 6개 방송사 규칙 시딩

---

## ACT-B02. 프로젝트 관리

### B02-T01. Project 모델 (`app/models.py`)
- `id`, `name`, `broadcaster`, `description`, `max_lines`, `max_chars_per_line`, `bracket_chars` — 자막 기준 (방송사에서 자동 설정)
- `subtitle_file`, `video_file`, `total_duration_ms`, `video_duration_ms`, `file_size_mb` — 파일 정보
- `status` (draft/submitted/approved/rejected), `elapsed_seconds`, `last_saved_at`, `submitted_at`, `deadline` — 상태/시간
- `assigned_to` (FK→User), `created_by` (FK→User) — 담당자/생성자
- `subtitles` relationship (cascade delete), `history` relationship (cascade delete)

### B02-T02. 프로젝트 CRUD (`app/routers/projects.py`)
- `GET /api/projects` — 목록. worker는 본인 생성+배정분만. 쿼리: `?status=&broadcaster=&search=`
- `POST /api/projects` — 생성. `broadcaster`에서 `load_rules()`로 자막 기준 자동 적용
- `GET /api/projects/:id` — 상세 (subtitle_count, error_count 포함)
- `PATCH /api/projects/:id` — 수정. 방송사 변경 시 자막 기준 동시 갱신. 작업자 변경은 master/manager만
- `DELETE /api/projects/:id` — 삭제. worker는 본인 생성분만

### B02-T03. 프로젝트 상태 흐름
```
draft → (제출) → submitted → (승인) → approved
                     ↓
                  (반려) → rejected → (재작업 후 재제출) → submitted → ...
```
- `POST /api/projects/:id/submit` — 검수 오류 있으면 400 거부. 없으면 status=submitted
- `POST /api/projects/:id/approve` — status=approved (master/manager만)
- `POST /api/projects/:id/reject` — status=rejected + reject_count +1 (master/manager만)

### B02-T04. 재작업 추적
- `reject_count` (int, default 0) — 반려 횟수
- `first_submitted_at` (datetime, nullable) — 최초 제출 일시. 처음 제출할 때만 기록

### B02-T05. 프로젝트 접근 권한
- **목록 조회**: worker는 `assigned_to == me OR created_by == me`인 프로젝트만 조회 가능
- **상세/편집기 접근**: worker는 본인 배정 또는 본인 생성 프로젝트만 접근 가능. 아닌 경우 403

### B02-T06. 작업 시간 추적
- `POST /api/projects/:id/timer` — `{ elapsed_seconds }` 덮어쓰기. 프론트에서 30초 간격 호출
- `POST /api/projects/:id/save` — `last_saved_at = now()` 기록

### B02-T07. 프로젝트 응답 형식 (`_to_response`)
- `assigned_to_name`, `created_by_name` — User 테이블 조인하여 표시명 포함
- `subtitle_count`, `error_count` — 자막 수와 오류 수 실시간 계산
- `reject_count`, `first_submitted_at` — 재작업 횟수와 최초 제출일

---

## ACT-B03. 방송사 규칙 관리

### B03-T01. BroadcasterRule 모델 (`app/models.py`)
- `id`, `name` (unique), `max_lines`, `max_chars_per_line`, `bracket_chars`, `is_active`, `created_at`, `updated_at`

### B03-T02. 방송사 규칙 API (`app/routers/settings.py`)
- `GET /api/settings/broadcaster-rules` — 전체 조회 (is_active=True만)
- `PUT /api/settings/broadcaster-rules` — 전체 덮어쓰기
- `GET /api/projects/rules/broadcasters` — `load_rules()` 호출

### B03-T03. `load_rules()` 함수
- DB에서 활성 규칙 로드. DB가 비어있으면 기본값 시딩 (TVING, LGHV, SKBB, JTBC, DLIV, 자유작업)

### B03-T04. 전역 스토어 연동 (`useBroadcasterStore`)
- 프론트에서 Zustand 전역 스토어로 방송사 규칙 관리

---

## ACT-B04. 파일 관리

### B04-T01. SRT 파싱 (`parse_srt`)
- 타임코드 → `start_ms`, `end_ms`
- 태그: `{\an8}` → `text_pos = "top"`. `{\}` → 유지. `{\ㅅ}` → 삭제
- 화자: `(이름)` 패턴 → `speaker` 필드 분리
- 유형: `[효과음]` → `type = "effect"`, 나머지 → `"dialogue"`

### B04-T02. SRT 생성 (`export_srt`)
- 출력: `순번\n타임코드\n태그+화자+대사\n\n`

### B04-T03. 파일 업로드/다운로드/스트리밍
- `POST /api/projects/:id/upload/subtitle` — SRT 업로드 → 파싱 → DB 저장
- `POST /api/projects/:id/upload/video` — 영상 파일 저장
- `GET /api/projects/:id/download/subtitle` — SRT 다운로드
- `GET /api/projects/:id/stream/video` — 영상 스트리밍 (seek 지원)

---

## ACT-B05. 자막 CRUD

### B05-T01. Subtitle 모델 (`app/models.py`)
- `id`, `project_id`, `seq`, `start_ms`, `end_ms`, `type`, `speaker`, `speaker_pos`, `text_pos`, `text`, `error`

### B05-T02. 자막 API (`app/routers/subtitles.py`)
- `GET /api/projects/:pid/subtitles` — 전체 목록 (seq 순)
- `POST /api/projects/:pid/subtitles` — 싱크 추가
- `PATCH /api/projects/:pid/subtitles/:id` — 단건 수정
- `DELETE /api/projects/:pid/subtitles/:id` — 단건 삭제
- `POST .../subtitles/batch-delete` — 다중 삭제
- `POST .../subtitles/:id/split` — 분할
- `POST .../subtitles/merge` — 병합
- `POST .../subtitles/bulk-speaker` — 화자 일괄 변경
- `PUT .../subtitles/batch-update` — 전체 저장 (임시저장)
- `POST .../subtitles/undo` — 되돌리기

### B05-T03. 검수 (`resequence_and_validate`)
- 순번 재계산 + 검수 자동 실행
- 검수 규칙: 글자초과, 줄초과, 시간오류

### B05-T04. Undo (스냅샷 기반)
- `save_snapshot()` / `restore_snapshot()`

---

# PART 2. FRONTEND (React + TypeScript + Tailwind CSS + Zustand)

> **기술 스택**: Vite, React 18, TypeScript, Tailwind CSS 4, Zustand, Axios, Lucide React.

---

## ACT-F01. 인증

### F01-T01~T04. (변경 없음 — 로그인, useAuthStore, ProtectedRoute, Axios 인터셉터)

---

## ACT-F02. 홈/대시보드 (`HomePage.tsx`)

### F02-T01~T05. (변경 없음 — 헤더, 사이드바, 대시보드 요약, 프로젝트 리스트, ⋮ 메뉴)

---

## ACT-F03. 새 작업 생성 (`NewProjectModal.tsx`)

### F03-T01~T02. (변경 없음)

---

## ACT-F04. 편집기 레이아웃 (`AppLayout.tsx`)

### F04-T01. 레이아웃 구조
```
┌──────────────────────────────────────────┐
│ TopNav                                    │
├───────────────────┬──────────────────────┤
│                   │                      │
│  SubtitleGrid     │  VideoPlayer         │ ← flex-1 (나머지 전부)
│  (flex-1)         │  (너비 드래그 조절)    │
│                   │                      │
├═══════════════════╧═══ 드래그 핸들 ①══════┤ ← QuickEditor 높이 조절
│ QuickEditor (전체 폭, 기본 160px)          │
├══════════════════════ 드래그 핸들 ②═══════┤ ← Timeline 높이 조절
│ Timeline/파형 (기본 220px)                 │
└──────────────────────────────────────────┘
```

### F04-T02. 독립 리사이즈
- **영상 너비**: 좌측 변 드래그. 비율(aspect ratio) 유지하며 너비 변경 → 높이 자동 계산
- **영상 최대 높이 제한**: `maxHeight = 화면높이 - TopNav - 핸들 2개 - EditorH - TimelineH`. 영상이 아무리 넓어져도 QuickEditor/Timeline 영역을 침범 불가
- **QuickEditor 높이**: 핸들 ①로 조절 (80~400px)
- **타임라인 높이**: 핸들 ②로 조절 (100~500px)
- **SubtitleGrid**: 나머지 공간 전부 차지
- 리사이즈 핸들은 `HResizeHandle` 공용 컴포넌트. hover 시 파란 하이라이트
- 드래그 중 `document.body.style.userSelect = "none"` + 전역 오버레이
- 각 패널에 `overflow-hidden` 적용하여 레이어 간 침범 방지

### F04-T03. 프로젝트 로드
- URL에서 `projectId` 추출 → `projectsApi.get(pid)` → project state
- `useSubtitleStore.init(pid)` → 자막 로드
- `usePlayerStore.setTotalMs(project.total_duration_ms)`
- `useSettingsStore.load()` → 개인 설정 (단축키) 로드
- 실패 시 `navigate("/")`

### F04-T04. 읽기전용 모드
- `project.status === "submitted" || "approved"` → `readOnly = true`
- `project.status === "rejected"` → 작업자에겐 편집 가능 (재작업), 관리자에겐 읽기전용

### F04-T05. 작업 시간 추적
- `setInterval(1초)` → `elapsed + 1`
- `setInterval(30초)` → `POST /api/projects/:id/timer`
- 임시저장 시: `updateTimer` + `markSaved`
- 브라우저 닫기: `beforeunload` → `navigator.sendBeacon()`

---

## ACT-F05. 상단 네비게이션 (`TopNav.tsx`)

### F05-T01. 좌측 영역
- 홈 버튼 → 작업 시간 저장 → `navigate("/")`
- 방송사 뱃지 + 프로젝트명
- 읽기전용 시 "제출됨 (읽기전용)" 또는 "승인됨 (읽기전용)" 뱃지
- 설정(⚙) 버튼 → `ProjectSettingsModal` 오픈 (읽기전용 시 숨김)
- 자막 기준: `(최대 N줄, N자)`
- 소요 시간: `HH:MM:SS` 실시간 카운트

### F05-T02. 우측 영역 (편집 모드)
- 다운로드 버튼 — 항상 표시. `{자막파일명}_{작업자이름}_{suffix}.srt`
- Undo 버튼 (Ctrl+Z)
- 다크모드 토글
- 임시저장 → `saveAll()` + `updateTimer()` + `markSaved()` → "저장 완료!" 토스트 표시 → **화면 유지** (나가지 않음)
- 저장하고 나가기 → `saveAll()` + `updateTimer()` + `markSaved()` → "저장 완료!" → 0.6초 후 `/`로 이동
- 제출 → 검수 오류 확인 → `saveAll()` + `submit()` → "제출 완료!" → `/`로 이동

> **설계 의도 — 임시저장/나가기 분리**: 기존에는 임시저장 시 자동으로 홈으로 이동했으나, 작업 중 저장만 하고 계속 편집하는 흐름이 더 자연스러우므로 분리. `Ctrl+S`도 저장만 하고 화면 유지.

### F05-T03. 우측 영역 (읽기전용 모드)
- 다운로드 버튼
- "검수 모드 — 수정 불가" 텍스트

### F05-T04. 설정 변경 즉시 반영
- `ProjectSettingsModal` 닫힐 때 `onSettingsClosed` 콜백 호출
- `projectsApi.get(pid)` + `useSubtitleStore.init(pid)` → 프로젝트 정보 + 자막 새로 로드
- 방송사 변경 시 자막 기준 동시 갱신 → 검수 재실행

---

## ACT-F06. 영상 플레이어 (`VideoPlayer.tsx`)

### F06-T01. 영상 표시
- `<video src="/api/projects/:id/stream/video">` — 실제 영상 스트리밍
- `object-fill`로 컨테이너에 맞춤. `maxHeight` prop으로 상단 영역 초과 방지

### F06-T02. 재생 동기화
- `usePlayerStore.currentMs` ↔ `video.currentTime` 양방향 싱크
- `videoPreviewMs`가 설정되어 있으면 `currentMs` 동기화 건너뜀 (영상은 프리뷰 위치 유지)
- `videoPreviewMs` 변경 시 영상만 seek (재생바 `currentMs`는 변경 안 함)
- `seekingRef`로 무한 루프 방지

### F06-T03. 자막 오버레이 (`SubtitleOverlay.tsx`)
- 현재 시간에 활성인 자막 필터: `start_ms <= currentMs < end_ms`
- `text_pos === "top"` → 화면 상단. `"default"` → 화면 하단
- 화자: 파란색 bold. 효과음: 노란색 italic. 대사: 흰색 bold + 드롭 섀도우
- 줄바꿈 보존: `whitespace-pre-wrap`

### F06-T04. 크기 조절
- 좌측 변 드래그 → 너비 변경, aspect ratio 유지 (240~960px)
- 좌하단 코너 대각선 드래그

### F06-T05. 컨트롤 바
- 재생/일시정지, 타임코드, 음소거, 전체화면

---

## ACT-F07. 자막 리스트 (`SubtitleGrid.tsx`)

### F07-T01. 테이블
- 컬럼: #(seq), 시작, 종료, 유형, 화자위치, 대사위치, 화자, 대사, 검수
- 대사 셀: `whitespace-pre-wrap break-all line-clamp-3` — 줄바꿈 보존

### F07-T02. 클릭 동작

> **설계 의도**: 재생 위치(빨간 재생선)와 자막 선택, 영상 표시 위치는 각각 독립적인 개념. 싱글클릭은 자막을 선택하고 영상만 해당 위치로 프리뷰하지만, 재생바(플레이헤드)는 움직이지 않음. 더블클릭은 해당 자막 시작 위치로 재생바를 이동하고 재생을 시작함.

**재생바(플레이헤드)와 영상 위치 분리:**
- `currentMs` — 재생바(빨간 플레이헤드) 위치. 재생 시 기준점.
- `videoPreviewMs` — 영상 프리뷰 전용 시간. 싱글클릭 시 영상만 해당 위치로 seek. 재생바는 안 움직임.
- 재생 시작 시 `videoPreviewMs = null`로 리셋 → 영상이 재생바(`currentMs`) 위치로 복귀하여 재생.

**자막 리스트 (SubtitleGrid):**

| 상태 | 동작 | 결과 |
|------|------|------|
| 정지 + 싱글클릭 | 자막 선택 (QuickEditor 반영) + 영상 프리뷰 | 재생바 변경 없음. 파형에서 해당 자막 빨갛게. 영상만 해당 자막 시작 위치로 이동. 다시 재생 시 재생바 위치에서 시작. |
| 정지 + 더블클릭 | 자막 선택 + 재생바 이동 + 재생 시작 | 파형 뷰도 이동 |
| 재생 + 아무 클릭 | 완전 무효 | 선택 안 바뀜, 재생 계속 |
| Shift+더블클릭 | 범위 선택 | (정지 상태에서만) |
| Ctrl+더블클릭 | 다중 선택 토글 | (정지 상태에서만) |

**파형 (Timeline):**

| 상태 | 동작 | 결과 |
|------|------|------|
| 정지 + 클릭 | 재생 위치를 클릭한 정확한 위치로 이동 | 해당 위치에 자막 있으면 선택, 없으면 이전 선택 유지. `videoPreviewMs` 해제. |
| 재생 + 클릭 | 정지 → 클릭 위치로 재생 위치 이동 | 해당 위치에 자막 있으면 선택, 없으면 이전 선택 유지. `videoPreviewMs` 해제. |

**파형 빨간색 표시 규칙:**
- `selectedId`인 자막만 전체 구간 빨간 파형. 재생 중이든 정지 중이든 동일.
- 재생바가 지나가는 다른 자막은 빨갛게 안 함 (초록 유지).
- 오버랩 구간: 오버랩된 자막 중 첫 번째 자막(seq 순)이 선택 유지. 첫 번째 자막의 `end_ms`를 지나면 두 번째 자막으로 전환. 전환 후 두 번째 자막 전체 구간 빨갛게 (오버랩 부분 포함).

### F07-T03. 필터 (`GridFilters`)
- 유형: 전체 / dialogue / effect
- 대사 위치: 전체 / top / default
- 검수 상태: 전체 / 오류만 / 정상만
- 텍스트 검색: speaker 또는 text 포함

### F07-T04. 툴바 (`GridToolbar`)
- 싱크 추가, 화자 일괄변경, 분할, 병합, 삭제, 단축키 안내
- `readOnly` 시 편집 버튼 전부 숨김

---

## ACT-F08. 퀵 에디터 (`QuickEditor.tsx`)

### F08-T01. 선택된 자막 편집
- 유형 드롭다운 (대사/효과)
- 화자 명칭 input
- 화자 위치 / 대사 위치 토글 버튼
- 텍스트 textarea — `text-base` (16px). `data-quick-editor-textarea` 속성 (Enter 단축키 포커스용)

### F08-T02. 글자수 표시
- 현재 줄 글자수 / 사용 가능 글자수. 초과 시 빨간색
- **작업자(worker)는 글자수/줄수 표기 안 함**
- NFD → NFC 정규화 후 카운트

### F08-T03. 읽기전용 모드
- `readOnly` 시: textarea `readOnly`, select/input `disabled`

---

## ACT-F09. 타임라인/파형 (`Timeline.tsx`)

### F09-T01. 파형 렌더링
- SVG 기반 의사(mock) 파형. 사인 함수 조합으로 시간 기반 파형 생성
- **성능 최적화**: SVG 포인트 step=6, `useMemo` 의존성 `[tlLeft, visDur]`
- 자막 없는 구간: 어두운 초록
- 자막 있는 구간: 밝은 초록
- 선택된 자막: 빨간 파형. `selectedId`인 자막만 (재생바 위치와 무관)
- **파형 연속성 보장**: 자막 블록의 파형 오버레이 SVG 위치 계산 시 클램핑 전 원본 값(`rawL`, `rawW`)으로 역산하여 뷰 경계에 걸린 자막도 파형이 끊기지 않고 자연스럽게 이어짐

### F09-T02. 자막 블록
- 파형과 완전히 겹침. 전체 높이 관통
- 좌우 경계선: 드래그로 시간 조절 가능. 선택됨=빨강, 그 외=반투명 회색
- 상단: 자막 텍스트. 하단: `#번호 길이(초)`

### F09-T03. 파형 클릭 동작

| 상태 | 동작 | 결과 |
|------|------|------|
| 정지 + 클릭 | 클릭한 위치로 재생 위치 이동 | 해당 위치에 자막 있으면 선택. `videoPreviewMs` 해제. |
| 재생 + 클릭 | 정지 → 클릭 위치로 이동 | 동일. |

### F09-T04. 플레이헤드
- 빨간 수직선 + 삼각형 핸들
- 시간순 좌→우 이동. 뷰 벗어나면 페이지 넘김

### F09-T05. 줌/스크롤
- 6단계 줌: 5초 → 10초 → 20초 → 40초 → 1분 → 2분
- `Ctrl+마우스휠`: 확대/축소. `마우스휠`: 좌우 패닝

### F09-T06. 파형/영상 새로고침
- 🔄 버튼 → `timelineKey` 변경 → 컴포넌트 리마운트

---

## ACT-F10. 재생 엔진 (`usePlayback.ts`)

### F10-T01. 재생 타이머
- `playing === true` → `setInterval(100ms)` → `currentMs += 100`

### F10-T02. 자막 자동 추적
- 재생 중 100ms마다 현재 시간에 해당하는 자막 찾기 (`subtitles.find()` — seq 순 탐색)
- 발견 & 현재 선택과 다르면 → `selectSingle(active.id)`
- `lastActiveIdRef`로 중복 방지
- **오버랩 처리**: `find()`가 seq 순으로 탐색하므로, 오버랩 구간에서는 항상 첫 번째 자막이 선택됨. 첫 번째 자막 `end_ms`를 지나면 두 번째 자막으로 전환.

### F10-T03. 플레이헤드 뷰 추적
- 뷰 밖으로 완전히 나갔을 때만 뷰 이동 (페이지 넘김)

---

## ACT-F11. 키보드 단축키 (`useKeyboardShortcuts.ts`)

> **의도**: 사용자별 커스텀 단축키 지원. 기본 단축키가 제공되며, 설정 페이지에서 개인별로 변경 가능. DB에 저장되어 로그인 시 자동 로드. 동일 단축키 중복 등록 불가. 기본값 초기화 기능 제공. 모든 단축키는 textarea 입력 중에도 동작.

### F11-T01. 기본 단축키

| 액션 ID | 기본 키 | 설명 |
|---------|---------|------|
| `play_pause` | `Space` | 재생 / 일시정지 |
| `set_start` | `F9` | 선택 싱크 시작점을 현재시간으로 |
| `set_end` | `F10` | 선택 싱크 종료점을 현재시간으로 |
| `add_sync` | `Alt+I` | 현재 선택 자막 뒤에 새 싱크 추가 |
| `snap_prev` | `Alt+[` | 앞 싱크 end_ms에 현재 싱크 start_ms 맞춤 |
| `snap_next` | `Alt+]` | 뒤 싱크 start_ms에 현재 싱크 end_ms 맞춤 |
| `split` | `Ctrl+Enter` | 현재 싱크 분할 |
| `undo` | `Ctrl+Z` | 실행 취소 (서버 스냅샷 복원) |
| `redo` | `Ctrl+Shift+Z` | 다시 실행 (Redo) — 예약 |
| `search` | `Ctrl+F` | 텍스트 검색 — 예약 |
| `replace` | `Ctrl+H` | 텍스트 검색·치환 — 예약 |
| `prev` | `↑` | 이전 싱크로 이동 |
| `next` | `↓` | 다음 싱크로 이동 |
| `focus_text` | `Enter` | 텍스트 입력창(QuickEditor textarea) 포커스 |
| `save` | `Ctrl+S` | 임시저장 (화면 유지, 나가지 않음) |
| `delete` | `Delete` | 선택 삭제 |

### F11-T02. 커스텀 단축키 저장
- 사용자별 단축키 설정이 DB에 저장 (User.settings JSON)
- 로그인/편집기 진입 시 `useSettingsStore.load()` → 서버에서 개인 설정 로드
- `useKeyboardShortcuts` 훅이 `useSettingsStore`의 `shortcuts` 맵을 구독하여 동적 매핑
- `eventToKeyString()`: 키 이벤트를 `"Ctrl+S"`, `"Alt+I"`, `"F9"` 등 문자열로 변환

### F11-T03. 중복 방지
- 동일 키 조합을 두 액션에 등록 불가
- 변경 시도 시 이미 사용 중인 액션명 표시 → 변경 거부

### F11-T04. 기본값 초기화
- 설정 페이지에서 "기본값으로 초기화" 버튼 → 모든 단축키를 기본값으로 리셋 + 서버 저장

### F11-T05. 실시간 적용
- 설정 변경 즉시 편집기에서 적용 (store 구독, 새로고침 불필요)
- 모든 단축키는 textarea/input 입력 중에도 동작 (`isInput` 체크 없음)

### F11-T06. 단축키 액션 구현

| 액션 | 동작 |
|------|------|
| `play_pause` | `playerStore.togglePlay()` |
| `set_start` | 선택된 자막의 `start_ms`를 `currentMs`로 업데이트 |
| `set_end` | 선택된 자막의 `end_ms`를 `currentMs`로 업데이트 |
| `add_sync` | `subtitleStore.addAfter()` — 선택된 자막 뒤에 추가 |
| `snap_prev` | 이전 자막 `end_ms` → 현재 자막 `start_ms` |
| `snap_next` | 다음 자막 `start_ms` → 현재 자막 `end_ms` |
| `split` | `subtitleStore.splitSelected()` |
| `undo` | `subtitleStore.undo()` |
| `prev` | `navigatePrev()` + `selectSingle` + `setVideoPreviewMs` |
| `next` | `navigateNext()` + `selectSingle` + `setVideoPreviewMs` |
| `focus_text` | `document.querySelector("[data-quick-editor-textarea]").focus()` |
| `save` | `onSave()` (화면 유지) |
| `delete` | `subtitleStore.deleteSelected()` |

---

## ACT-F12. 설정 페이지 (`SettingsPage.tsx`)

### F12-T01. 레이아웃
- 경로: `/settings`, `/settings/:tab`
- 상단 탭 네비게이션. admin 전체 탭, worker는 단축키+마이페이지만
- 진입 시 `useSettingsStore.load()` 호출

### F12-T02. 방송사 프리셋 (`BroadcasterPresetsTab.tsx`)
- DB 연동. 추가/수정/삭제. 저장 시 `useBroadcasterStore.fetch()`

### F12-T03. 조직원 관리 (`MembersTab.tsx`)
- 계정 생성, 인라인 편집, 비밀번호 초기화, 삭제

### F12-T04. 단축키 설정 (`ShortcutsTab.tsx`)
- 모든 사용자 접근 가능 (설정 페이지 항상 다크 테마)
- 액션 목록 테이블: 액션명 | 설명 | 현재 단축키 | 변경 버튼
- **변경 흐름**: 변경 클릭 → 키 입력 대기 (animate-pulse) → 키 조합 감지 → 중복 체크 → 저장 or 거부
  - 중복 시: "이미 '{액션명}'에 사용 중" 빨간 경고, 롤백
  - Esc: 취소
- **기본값 초기화**: confirm → `useSettingsStore.resetToDefaults()`
- **저장**: `useSettingsStore.saveAll()` → `PUT /api/auth/me/settings`
- 기본값과 다른 단축키는 파란색 하이라이트로 구분

### F12-T05. 마이페이지 (`MyPageTab.tsx`)
- 이름 수정, 비밀번호 변경

---

## ACT-F13. 상태 관리 (Zustand Stores)

### F13-T01. usePlayerStore
- `currentMs`, `playing`, `muted`, `totalMs`, `videoPreviewMs`
- `setCurrentMs`, `setTotalMs`, `togglePlay`, `toggleMute`, `seekForward(ms)`, `seekBackward(ms)`, `setVideoPreviewMs`
- `videoPreviewMs`: 영상 프리뷰 전용. 싱글클릭 시 설정. `togglePlay()`에서 재생 시작 시 `null` 리셋.

### F13-T02. useSubtitleStore
- `projectId`, `subtitles`, `selectedId`, `multiSelect`, `loading`
- 선택: `selectSingle`, `toggleMulti`, `selectRange`, `navigateNext`, `navigatePrev`
- API 연동: `init`, `addAfter`, `deleteSelected`, `splitSelected`, `mergeSelected`, `updateOne`, `bulkSpeaker`, `saveAll`, `undo`

### F13-T03. useTimelineStore
- `zoomIdx`, `scrollMs`, `totalMs`
- `visibleDuration()`, `zoomIn(pct)`, `zoomOut(pct)`, `zoomFit()`, `panBy(ms)`, `setScrollMs`, `ensureVisible(ms)`

### F13-T04. useAuthStore
- `user`, `token`, `isAuthenticated`
- `login()`, `logout()`, `loadUser()`, `isAdmin()`

### F13-T05. useBroadcasterStore
- `rules`, `names`, `loaded`
- `fetch()` — API에서 최신 방송사 규칙 로드

### F13-T06. useSettingsStore
- `shortcuts` — 액션ID→키조합 맵
- `loaded` — 로드 완료 여부
- `load()` — `GET /api/auth/me/settings` → shortcuts 갱신
- `updateShortcut(actionId, key)` — 중복 체크 → 로컬 업데이트
- `saveAll()` — `PUT /api/auth/me/settings` → 서버 저장
- `resetToDefaults()` — 기본 단축키로 리셋 + 서버 저장
- `DEFAULT_SHORTCUTS` — 16개 기본 단축키 상수
- `SHORTCUT_ACTIONS` — 액션 정의 배열 (id, label, description)

---

# PART 3. 데이터 모델

## User
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| username | string unique | 로그인 아이디 |
| password_hash | string | bcrypt |
| display_name | string | 표시 이름 |
| role | string | master / manager / worker |
| is_active | bool | 활성 상태 |
| settings | JSON/text (nullable) | 개인 설정 (단축키 등). `{ shortcuts: { save: "Ctrl+S", ... } }` |

## Project
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| name | string | 프로젝트명 |
| broadcaster | string | 방송사 |
| description | string | 설명/부제 |
| max_lines, max_chars_per_line, bracket_chars | int | 자막 기준 |
| subtitle_file, video_file | string | 파일 경로 |
| total_duration_ms, video_duration_ms, file_size_mb | int/float | 미디어 정보 |
| status | string | draft / submitted / approved / rejected |
| elapsed_seconds | int | 누적 작업 시간 |
| last_saved_at, submitted_at, deadline | datetime | 시간 정보 |
| first_submitted_at | datetime | 최초 제출 일시 |
| reject_count | int | 반려 횟수 |
| assigned_to, created_by | int FK→User | 담당/생성자 |

## Subtitle
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| project_id | int FK | |
| seq | int | 순번 |
| start_ms, end_ms | int | 시간 |
| type | string | dialogue / effect |
| speaker | string | 화자명 |
| speaker_pos, text_pos | string | default / top |
| text | text | 자막 텍스트 |
| error | string | 검수 결과 |

## EditHistory
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| project_id | int FK | |
| action | string | 작업 종류 |
| snapshot | JSON | 변경 전 자막 전체 스냅샷 |

## BroadcasterRule
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| name | string unique | 방송사명 |
| max_lines, max_chars_per_line, bracket_chars | int | 자막 기준 |
| is_active | bool | 활성 상태 |

---

# PART 4. API 엔드포인트 전체 목록

## 인증
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 로그인 → JWT |
| GET | `/api/auth/me` | 현재 사용자 |
| PATCH | `/api/auth/me` | 본인 정보 수정 |
| GET | `/api/auth/me/settings` | 개인 설정 조회 (단축키 등) |
| PUT | `/api/auth/me/settings` | 개인 설정 저장 |
| GET | `/api/auth/users` | 사용자 목록 |
| POST | `/api/auth/users` | 계정 생성 |
| PATCH | `/api/auth/users/:id` | 계정 수정 |
| DELETE | `/api/auth/users/:id` | 계정 삭제 |
| POST | `/api/auth/users/:id/reset-password` | 비밀번호 초기화 |

## 프로젝트
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects` | 목록 |
| POST | `/api/projects` | 생성 |
| GET | `/api/projects/:id` | 상세 |
| PATCH | `/api/projects/:id` | 수정 |
| DELETE | `/api/projects/:id` | 삭제 |
| POST | `/api/projects/:id/submit` | 제출 |
| POST | `/api/projects/:id/approve` | 승인 |
| POST | `/api/projects/:id/reject` | 반려 |
| POST | `/api/projects/:id/timer` | 작업 시간 업데이트 |
| POST | `/api/projects/:id/save` | 임시저장 시간 기록 |
| GET | `/api/projects/rules/broadcasters` | 방송사 규칙 조회 |

## 파일
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/projects/:id/upload/subtitle` | SRT 업로드 |
| POST | `/api/projects/:id/upload/video` | 영상 업로드 |
| GET | `/api/projects/:id/download/subtitle` | SRT 다운로드 |
| GET | `/api/projects/:id/stream/video` | 영상 스트리밍 |

## 자막
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects/:pid/subtitles` | 전체 목록 |
| POST | `/api/projects/:pid/subtitles` | 싱크 추가 |
| PATCH | `/api/projects/:pid/subtitles/:id` | 단건 수정 |
| DELETE | `/api/projects/:pid/subtitles/:id` | 단건 삭제 |
| POST | `.../subtitles/batch-delete` | 다중 삭제 |
| POST | `.../subtitles/:id/split` | 분할 |
| POST | `.../subtitles/merge` | 병합 |
| POST | `.../subtitles/bulk-speaker` | 화자 일괄변경 |
| PUT | `.../subtitles/batch-update` | 전체 저장 |
| POST | `.../subtitles/undo` | 되돌리기 |

## 설정
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/settings/broadcaster-rules` | 방송사 규칙 조회 |
| PUT | `/api/settings/broadcaster-rules` | 방송사 규칙 저장 |

---

# PART 5. 프론트엔드 디렉토리 구조

```
frontend/src/
├── api/
│   ├── client.ts              # Axios 인스턴스 + 인터셉터
│   ├── auth.ts                # 인증/사용자/설정 API
│   ├── projects.ts            # 프로젝트/파일/방송사 API
│   └── subtitles.ts           # 자막 CRUD API
├── store/
│   ├── useAuthStore.ts        # 인증 상태
│   ├── usePlayerStore.ts      # 재생 상태 + videoPreviewMs
│   ├── useSubtitleStore.ts    # 자막 + 선택 상태
│   ├── useTimelineStore.ts    # 타임라인 줌/스크롤
│   ├── useBroadcasterStore.ts # 방송사 규칙 (전역)
│   └── useSettingsStore.ts    # 개인 설정 (단축키 등)
├── components/
│   ├── auth/        LoginPage, ProtectedRoute
│   ├── home/        HomePage, NewProjectModal
│   ├── layout/      AppLayout
│   ├── nav/         TopNav
│   ├── video/       VideoPlayer, SubtitleOverlay
│   ├── grid/        SubtitleGrid, GridToolbar, GridFilters
│   ├── editor/      QuickEditor
│   ├── timeline/    Timeline, Playhead, ZoomControls
│   ├── modals/      ProjectSettingsModal, BulkSpeakerModal, ShortcutsModal
│   └── settings/    SettingsPage, tabs/ (7개 탭 컴포넌트)
├── hooks/
│   ├── usePlayback.ts
│   ├── useKeyboardShortcuts.ts  # eventToKeyString + 커스텀 단축키 훅
│   └── useTimelineZoom.ts
├── utils/
│   ├── time.ts                # ms ↔ timecode 변환
│   └── validation.ts          # 글자수 카운트 (NFC), 검수
├── types/
│   └── index.ts               # 공유 타입, ZOOM_LEVELS 상수
├── main.tsx                   # 라우팅 (BrowserRouter)
└── index.css                  # Tailwind import
```

---

# PART 6. 백엔드 디렉토리 구조

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                # FastAPI 앱 + startup 시딩
│   ├── database.py            # SQLAlchemy 엔진/세션
│   ├── models.py              # User(+settings), Project, Subtitle, EditHistory, BroadcasterRule
│   ├── schemas.py             # Pydantic 스키마
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py            # 인증 + 사용자 CRUD + 개인설정 API
│   │   ├── projects.py        # 프로젝트 CRUD + 파일
│   │   ├── subtitles.py       # 자막 CRUD + 일괄작업
│   │   └── settings.py        # 방송사 규칙 (DB)
│   └── services/
│       ├── __init__.py
│       ├── auth.py            # JWT, bcrypt, 의존성
│       └── subtitle_service.py # SRT 파싱/생성, 검수, 스냅샷
├── uploads/                   # 영상 파일 저장
├── subtitle_editor.db         # SQLite DB
└── broadcaster_rules.json     # (더 이상 사용 안 함 — DB로 이전)
```
### F05-T01. 좌측 영역
- 홈 버튼 → 작업 시간 저장 → `navigate("/")`
- 방송사 뱃지 + 프로젝트명
- 읽기전용 시 "제출됨 (읽기전용)" 또는 "승인됨 (읽기전용)" 뱃지
- 설정(⚙) 버튼 → `ProjectSettingsModal` 오픈 (읽기전용 시 숨김)
- 자막 기준: `(최대 N줄, N자)`
- 소요 시간: `HH:MM:SS` 실시간 카운트

### F05-T02. 우측 영역 (편집 모드)
- 다운로드 버튼 — 항상 표시. `{자막파일명}_{작업자이름}_{suffix}.srt`
- Undo 버튼 (Ctrl+Z)
- 다크모드 토글
- 임시저장 → `saveAll()` + `updateTimer()` + `markSaved()` → "저장 완료!" → 0.6초 후 `/`로 이동
- 제출 → 검수 오류 확인 → `saveAll()` + `submit()` → "제출 완료!" → `/`로 이동

### F05-T03. 우측 영역 (읽기전용 모드)
- 다운로드 버튼
- "검수 모드 — 수정 불가" 텍스트

### F05-T04. 설정 변경 즉시 반영
- `ProjectSettingsModal` 닫힐 때 `onSettingsClosed` 콜백 호출
- `projectsApi.get(pid)` + `useSubtitleStore.init(pid)` → 프로젝트 정보 + 자막 새로 로드
- QuickEditor의 maxChars/maxLines/bracketChars가 project state에서 오므로 자동 반영
- 방송사 변경 시 자막 기준(줄수/글자수/화자예약) 동시 갱신 → 검수 재실행

> **설계 의도**: 편집 중 설정을 변경하면 모달 닫는 즉시 새 기준이 적용되어, 글자수 초과 등 검수 결과가 바로 업데이트됨.

---

## ACT-F06. 영상 플레이어 (`VideoPlayer.tsx`)

### F06-T01. 영상 표시
- `<video src="/api/projects/:id/stream/video">` — 실제 영상 스트리밍
- `object-fill`로 컨테이너에 맞춤. 영상 메타데이터에서 aspect ratio 자동 감지
- 영상 없으면 "영상 없음" 플레이스홀더

### F06-T02. 재생 동기화
- `usePlayerStore.currentMs` ↔ `video.currentTime` 양방향 싱크
- `seekingRef`로 무한 루프 방지 (200ms 이상 차이날 때만 seek)
- `playing` 변경 → `video.play()` / `video.pause()`
- `muted` 변경 → `video.muted`

### F06-T03. 자막 오버레이 (`SubtitleOverlay.tsx`)
- 현재 시간에 활성인 자막 필터: `start_ms <= currentMs < end_ms`
- `text_pos === "top"` → 화면 상단 + `\an8` 뱃지
- `text_pos === "default"` → 화면 하단
- 화자: `(화자명)` 파란색 bold. 효과음: 노란색 italic. 대사: 흰색 bold + 드롭 섀도우
- **줄바꿈 보존**: `whitespace-pre-wrap`으로 `\n` 그대로 표시

### F06-T04. 크기 조절
- 좌측 변 드래그 → 너비 변경, aspect ratio 유지하며 높이 자동 계산 (240~960px)
- 좌하단 코너 대각선 드래그
- 남는 공간은 검은 배경, 영상은 항상 중앙 정렬

### F06-T05. 컨트롤 바
- 재생/일시정지, 타임코드 표시, 음소거, 전체화면

---

## ACT-F07. 자막 리스트 (`SubtitleGrid.tsx`)

### F07-T01. 테이블
- 컬럼: #(seq), 시작, 종료, 유형, 화자위치, 대사위치, 화자, 대사, 검수
- 대사 셀: `whitespace-pre-wrap break-all line-clamp-3` — 줄바꿈 보존, 텍스트 12px
- 유형 뱃지: dialogue="대사" 회색, effect="효과" 보라색
- 위치: top="상단이동" 파란색, default="-"
- 검수: 오류 시 빨간 태그, 없으면 "-"

### F07-T02. 클릭 동작

> **설계 의도**: 재생 위치(빨간 재생선 + 영상 재생 시간)와 자막 선택은 독립적인 개념. 싱글클릭은 자막을 선택할 뿐 재생 위치를 움직이지 않음. 더블클릭은 해당 자막 시작 위치부터 재생을 시작함. 재생 중에는 자막 리스트 클릭이 무효 처리되어 작업 흐름을 방해하지 않음.

**자막 리스트 (SubtitleGrid):**

| 상태 | 동작 | 결과 |
|------|------|------|
| 정지 + 싱글클릭 | 자막 선택 (QuickEditor 반영) | 재생 위치/파형/영상 변경 없음 |
| 정지 + 더블클릭 | 자막 선택 + 시작 위치로 이동 + 재생 시작 | 파형 뷰도 이동 |
| 재생 + 아무 클릭 | 완전 무효 | 선택 안 바뀜, 재생 계속 |
| Shift+더블클릭 | 범위 선택 | (정지 상태에서만) |
| Ctrl+더블클릭 | 다중 선택 토글 | (정지 상태에서만) |

**파형 (Timeline):**

| 상태 | 동작 | 결과 |
|------|------|------|
| 정지 + 클릭 | 재생 위치를 클릭한 정확한 위치로 이동 | 해당 위치에 자막 있으면 선택, 없으면 이전 선택 유지 |
| 재생 + 클릭 | 정지 → 클릭 위치로 재생 위치 이동 | 해당 위치에 자막 있으면 선택, 없으면 이전 선택 유지 |

**파형 빨간색 표시 규칙:**
- 선택된 자막(`selectedId`) 또는 현재 재생 위치가 범위 안인 자막 → 빨간 파형
- 클릭 위치에 자막이 있을 경우에만 파형을 빨갛게 함

### F07-T03. 필터 (`GridFilters`)
- 유형: 전체 / dialogue / effect
- 대사 위치: 전체 / top / default
- 검수 상태: 전체 / 오류만 / 정상만
- 텍스트 검색: speaker 또는 text 포함

### F07-T04. 툴바 (`GridToolbar`)
- 싱크 추가, 화자 일괄변경, 분할, 병합(다중선택 시), 삭제, 단축키 안내
- `readOnly` 시 편집 버튼 전부 숨김, "검수 모드 — 편집 불가" 텍스트 표시
- 선택 행 자동 스크롤: `scrollIntoView({ block: "nearest", smooth })`

---

## ACT-F08. 퀵 에디터 (`QuickEditor.tsx`)

### F08-T01. 선택된 자막 편집
- 유형 드롭다운 (대사/효과)
- 화자 명칭 input
- 화자 위치 / 대사 위치 토글 버튼 (유지/상단/삭제)
- 텍스트 textarea — `text-base` (16px). `Shift+마우스휠`로 이전/다음 자막 이동

### F08-T02. 글자수 표시
- 현재 줄 글자수 / 사용 가능 글자수 (화자 있으면 `maxChars - bracketChars`)
- 초과 시 빨간색
- **작업자(worker)는 글자수/줄수 표기 안 함** — `hideCharCount` prop으로 제어
- NFD → NFC 정규화 후 카운트. 공백 포함, 줄바꿈만 제외

### F08-T03. 읽기전용 모드
- `readOnly` 시: textarea `readOnly`, select/input `disabled`, 토글 버튼 `disabled`
- `opacity-60 cursor-not-allowed` 스타일
- "읽기전용" 노란 뱃지

---

## ACT-F09. 타임라인/파형 (`Timeline.tsx`)

> **의도**: Subtitle Edit의 파형 타임라인을 웹으로 구현. 초록색 파형, 자막 블록 오버레이, 빨간 플레이헤드. 자막이 있는 구간은 밝은 초록, 없는 구간은 어두운 초록으로 구분. 현재 재생 중인 자막은 빨간 파형.

### F09-T01. 파형 렌더링
- SVG 기반 의사(mock) 파형. 사인 함수 조합으로 시간 기반 파형 생성
- **성능 최적화**: SVG 포인트 step=6 (약 667개), `useMemo` 의존성은 `[tlLeft, visDur]`만
- 자막 없는 구간: 어두운 초록 (`#0a2e0a` + `#1a6e1a` 스트로크)
- 자막 있는 구간: 밝은 초록 (`#1a5c1a` + `#39ff14` 스트로크 + `#2ecc40` 하이라이트)
- 선택/재생 중인 자막: 빨간 파형 (`#5c1a1a` + `#ff4444` 스트로크)
- 각 자막 블록이 CSS 클리핑으로 자기 범위만큼 밝은 파형을 덮어씌움

### F09-T02. 자막 블록
- 파형과 완전히 겹침 (같은 영역). 전체 높이 관통
- 좌우 경계선: 자막 블록의 시작/종료 경계. 드래그로 시간 조절 가능 (`cursor-ew-resize`)
  - 경계선 색상: 선택/재생중=빨강, 그 외=반투명 회색
  - hover 시 초록 하이라이트로 드래그 가능 표시
  - 모든 자막에서 항상 드래그 가능 (선택 여부 무관, Subtitle Edit 방식)
- 상단: 자막 텍스트 (선택/재생중=빨간 톤, 효과음=노란색, 대사=흰색)
- 하단: `#번호 길이(초)`

> **설계 의도**: 기존 노란 드래그 핸들(선택 시에만 표시)을 제거하고, Subtitle Edit처럼 자막 블록의 좌/우 경계선 자체를 직접 드래그하여 시간을 조절. 어떤 자막이든 경계선에 마우스를 올리면 드래그 커서가 표시되어 직관적.

### F09-T03. 파형 클릭 동작

| 상태 | 동작 | 결과 |
|------|------|------|
| 정지 + 클릭 | 클릭한 정확한 위치로 재생 위치 이동 | 해당 위치에 자막 있으면 선택, 없으면 이전 선택 유지 |
| 재생 + 클릭 | 정지 → 클릭 위치로 재생 위치 이동 | 해당 위치에 자막 있으면 선택, 없으면 이전 선택 유지 |

> **설계 의도**: 파형 클릭은 항상 재생 위치를 이동시킴 (자막 리스트 싱글클릭과 다른 점). 재생 중 파형 클릭 시 그 위치에서 정지하여 정밀한 시간 탐색 가능.

### F09-T04. 플레이헤드
- 빨간 수직선 + 삼각형 핸들
- **중앙 고정이 아닌 시간순 좌→우 이동** — `(currentMs - scrollMs) / visDur * 100`%
- 뷰 오른쪽 끝을 벗어나면 페이지 넘김 (뷰를 플레이헤드 10% 위치로 이동)

### F09-T05. 줌/스크롤
- 6단계 줌: 5초 → 10초 → 20초 → 40초 → 1분 → 2분 (5분 이상은 성능 문제로 제거)
- `Ctrl+마우스휠`: 커서 위치 기준 확대/축소 (anchorPct 계산)
- `마우스휠`: 좌우 패닝 (visDur × 15%)
- 줌 컨트롤: 🔍+, 🔍- 버튼, "전체" 버튼
- wheel 이벤트는 `{ passive: false }`로 직접 등록하여 `preventDefault()` 허용

### F09-T06. 파형/영상 새로고침
- 타임라인 컨트롤 바에 🔄 새로고침 버튼
- 클릭 시 `AppLayout`에서 `timelineKey` 변경 → Timeline 컴포넌트 완전 언마운트/리마운트
- 파형 SVG 렌더링 오류, 영상 동기화 오류 등을 복구

> **설계 의도**: 파형이 간헐적으로 렌더링 실패하는 경우 사용자가 직접 복구할 수 있는 수단 제공. React key 변경으로 컴포넌트를 완전히 재생성하여 모든 내부 state와 ref를 초기화.

---

## ACT-F10. 재생 엔진 (`usePlayback.ts`)

### F10-T01. 재생 타이머
- `playing === true` → `setInterval(100ms)` → `currentMs += 100`
- `totalMs` 도달 → 0으로 리셋

### F10-T02. 자막 자동 추적
- 재생 중 100ms마다 현재 시간에 해당하는 자막 찾기
- 발견 & 현재 선택과 다르면 → `selectSingle(active.id)` (단, 자막이 실제로 바뀔 때만 호출하여 불필요한 리렌더링 방지)
- `lastActiveIdRef`로 이전 활성 자막 ID 추적 → 같은 자막 구간 내에서는 `selectSingle` 호출 안 함
- **QuickEditor 연동**: 재생 중 자막이 바뀌면 QuickEditor도 해당 자막 내용으로 자동 전환

> **설계 의도**: 재생하면 파형에서 현재 자막이 빨갛게 표시되면서, QuickEditor도 해당 자막 내용으로 자동 전환. 정지 상태에서는 사용자 싱글클릭으로 선택, 더블클릭으로 재생 시작.

### F10-T03. 플레이헤드 뷰 추적
- 플레이헤드가 뷰 밖으로 완전히 나갔을 때만 뷰 이동 (페이지 넘김)
- 뷰 안에서는 자유롭게 좌→우 이동

---

## ACT-F11. 키보드 단축키 (`useKeyboardShortcuts.ts`)

| 키 | 동작 | 입력 중(textarea) |
|----|------|-------------------|
| `Ctrl+Z` | Undo (서버 스냅샷 복원) | ✅ 동작 |
| `Ctrl+S` | 임시저장 | ✅ 동작 |
| `Space` | 재생/일시정지 | ❌ 무시 |
| `↑` / `↓` | 이전/다음 자막 이동 | ❌ 무시 |
| `Delete` | 선택 삭제 | ❌ 무시 |

---

## ACT-F12. 설정 페이지 (`SettingsPage.tsx`)

### F12-T01. 레이아웃
- 경로: `/settings`, `/settings/:tab`
- 상단 탭 네비게이션. admin 전체 탭, worker는 단축키+마이페이지만
- 홈 버튼, 다크모드 토글

### F12-T02. 방송사 프리셋 (`BroadcasterPresetsTab.tsx`)
- DB 연동 (`GET/PUT /api/settings/broadcaster-rules`)
- 추가 폼: 명칭, 최대 줄, 글자 수, 화자 예약
- 규칙 리스트: 테이블 형태 (방송사, 최대 줄, 글자 수, 화자 예약, 수정/삭제)
- 인라인 편집: ✏ 클릭 → input으로 전환 → ✓/✗ 저장/취소
- 저장 시 `useBroadcasterStore.fetch()` 호출 → 전역 즉시 반영

### F12-T03. 조직원 관리 (`MembersTab.tsx`)
- 계정 생성: 아이디 + 이름(표시명) + 권한 선택 → `authApi.createUser()`. 초기 비밀번호 = 아이디
- 서브 탭: 마스터·관리자 / 작업자
- 역할별 그룹 접기/펼치기 (CollapsibleSection)
- 각 사용자 행: 이름 + 아이디 + 역할 뱃지 + 수정/비밀번호초기화/삭제 버튼
- **수정**: 인라인 편집 — 이름 input + 권한 select → `authApi.updateUser(id, { display_name, role })`
  - master는 모든 역할 부여 가능, manager는 worker만 가능
- **비밀번호 초기화**: `authApi.resetPassword(id)` — 아이디와 동일하게 설정
- **삭제**: confirm → `authApi.deleteUser(id)`. 자기 자신은 삭제 불가 (비활성화)

### F12-T04. 마이페이지 (`MyPageTab.tsx`)
- 프로필: 아바타(이니셜), 이름, 역할 뱃지
- 이름 수정 → `authApi.updateMe({ display_name })`
- 비밀번호 변경: 현재 비밀번호 + 새 비밀번호 → `authApi.updateMe({ current_password, new_password })`

---

## ACT-F13. 상태 관리 (Zustand Stores)

### F13-T01. usePlayerStore
- `currentMs`, `playing`, `muted`, `totalMs`
- `setCurrentMs`, `setTotalMs`, `togglePlay`, `toggleMute`, `seekForward(ms)`, `seekBackward(ms)`

### F13-T02. useSubtitleStore
- `projectId`, `subtitles`, `selectedId`, `multiSelect`, `loading`
- 선택: `selectSingle`, `toggleMulti`, `selectRange`, `navigateNext`, `navigatePrev`
- API 연동: `init`, `addAfter`, `deleteSelected`, `splitSelected`, `mergeSelected`, `updateOne`, `bulkSpeaker`, `saveAll`, `undo`

### F13-T03. useTimelineStore
- `zoomIdx`, `scrollMs`, `totalMs`
- `visibleDuration()`, `zoomIn(pct)`, `zoomOut(pct)`, `zoomFit()`, `panBy(ms)`, `setScrollMs`, `ensureVisible(ms)`

### F13-T04. useAuthStore
- `user`, `token`, `isAuthenticated`
- `login()`, `logout()`, `loadUser()`, `isAdmin()`

### F13-T05. useBroadcasterStore
- `rules`, `names`, `loaded`
- `fetch()` — API에서 최신 방송사 규칙 로드. 페이지 진입 시 호출

---

# PART 3. 데이터 모델

## User
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| username | string unique | 로그인 아이디 |
| password_hash | string | bcrypt |
| display_name | string | 표시 이름 |
| role | string | master / manager / worker |
| is_active | bool | 활성 상태 |

## Project
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| name | string | 프로젝트명 |
| broadcaster | string | 방송사 |
| description | string | 설명/부제 |
| max_lines, max_chars_per_line, bracket_chars | int | 자막 기준 |
| subtitle_file, video_file | string | 파일 경로 |
| total_duration_ms, video_duration_ms, file_size_mb | int/float | 미디어 정보 |
| status | string | draft / submitted / approved / rejected |
| elapsed_seconds | int | 누적 작업 시간 |
| last_saved_at, submitted_at, deadline | datetime | 시간 정보 |
| first_submitted_at | datetime | 최초 제출 일시 (재작업해도 변경 안 함) |
| reject_count | int | 반려(재작업) 횟수 |
| assigned_to, created_by | int FK→User | 담당/생성자 |

## Subtitle
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| project_id | int FK | |
| seq | int | 순번 |
| start_ms, end_ms | int | 시간 |
| type | string | dialogue / effect |
| speaker | string | 화자명 |
| speaker_pos, text_pos | string | default / top |
| text | text | 자막 텍스트 |
| error | string | 검수 결과 |

## EditHistory
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| project_id | int FK | |
| action | string | 작업 종류 |
| snapshot | JSON | 변경 전 자막 전체 스냅샷 |

## BroadcasterRule
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| name | string unique | 방송사명 |
| max_lines, max_chars_per_line, bracket_chars | int | 자막 기준 |
| is_active | bool | 활성 상태 |

---

# PART 4. API 엔드포인트 전체 목록

## 인증
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 로그인 → JWT |
| GET | `/api/auth/me` | 현재 사용자 |
| PATCH | `/api/auth/me` | 본인 정보 수정 |
| GET | `/api/auth/users` | 사용자 목록 |
| POST | `/api/auth/users` | 계정 생성 |
| PATCH | `/api/auth/users/:id` | 계정 수정 |
| DELETE | `/api/auth/users/:id` | 계정 삭제 |
| POST | `/api/auth/users/:id/reset-password` | 비밀번호 초기화 |

## 프로젝트
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects` | 목록 (필터: status, broadcaster, search) |
| POST | `/api/projects` | 생성 |
| GET | `/api/projects/:id` | 상세 |
| PATCH | `/api/projects/:id` | 수정 |
| DELETE | `/api/projects/:id` | 삭제 |
| POST | `/api/projects/:id/submit` | 제출 |
| POST | `/api/projects/:id/approve` | 승인 |
| POST | `/api/projects/:id/reject` | 반려 |
| POST | `/api/projects/:id/timer` | 작업 시간 업데이트 |
| POST | `/api/projects/:id/save` | 임시저장 시간 기록 |
| GET | `/api/projects/rules/broadcasters` | 방송사 규칙 조회 |

## 파일
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/projects/:id/upload/subtitle` | SRT 업로드 |
| POST | `/api/projects/:id/upload/video` | 영상 업로드 |
| GET | `/api/projects/:id/download/subtitle` | SRT 다운로드 |
| GET | `/api/projects/:id/stream/video` | 영상 스트리밍 |

## 자막
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/projects/:pid/subtitles` | 전체 목록 |
| POST | `/api/projects/:pid/subtitles` | 싱크 추가 |
| PATCH | `/api/projects/:pid/subtitles/:id` | 단건 수정 |
| DELETE | `/api/projects/:pid/subtitles/:id` | 단건 삭제 |
| POST | `.../subtitles/batch-delete` | 다중 삭제 |
| POST | `.../subtitles/:id/split` | 분할 |
| POST | `.../subtitles/merge` | 병합 |
| POST | `.../subtitles/bulk-speaker` | 화자 일괄변경 |
| PUT | `.../subtitles/batch-update` | 전체 저장 |
| POST | `.../subtitles/undo` | 되돌리기 |

## 설정
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/settings/broadcaster-rules` | 방송사 규칙 조회 |
| PUT | `/api/settings/broadcaster-rules` | 방송사 규칙 저장 |

---

# PART 5. 프론트엔드 디렉토리 구조

```
frontend/src/
├── api/
│   ├── client.ts              # Axios 인스턴스 + 인터셉터
│   ├── auth.ts                # 인증/사용자 API
│   ├── projects.ts            # 프로젝트/파일/방송사 API
│   └── subtitles.ts           # 자막 CRUD API
├── store/
│   ├── useAuthStore.ts        # 인증 상태
│   ├── usePlayerStore.ts      # 재생 상태
│   ├── useSubtitleStore.ts    # 자막 + 선택 상태
│   ├── useTimelineStore.ts    # 타임라인 줌/스크롤
│   └── useBroadcasterStore.ts # 방송사 규칙 (전역)
├── components/
│   ├── auth/        LoginPage, ProtectedRoute
│   ├── home/        HomePage, NewProjectModal
│   ├── layout/      AppLayout
│   ├── nav/         TopNav
│   ├── video/       VideoPlayer, SubtitleOverlay
│   ├── grid/        SubtitleGrid, GridToolbar, GridFilters
│   ├── editor/      QuickEditor
│   ├── timeline/    Timeline, Playhead, ZoomControls
│   ├── modals/      ProjectSettingsModal, BulkSpeakerModal, ShortcutsModal
│   └── settings/    SettingsPage, tabs/ (7개 탭 컴포넌트)
├── hooks/
│   ├── usePlayback.ts
│   ├── useKeyboardShortcuts.ts
│   └── useTimelineZoom.ts
├── utils/
│   ├── time.ts                # ms ↔ timecode 변환
│   └── validation.ts          # 글자수 카운트 (NFC), 검수
├── types/
│   └── index.ts               # 공유 타입, ZOOM_LEVELS 상수
├── main.tsx                   # 라우팅 (BrowserRouter)
└── index.css                  # Tailwind import
```

---

# PART 6. 백엔드 디렉토리 구조

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                # FastAPI 앱 + startup 시딩
│   ├── database.py            # SQLAlchemy 엔진/세션
│   ├── models.py              # User, Project, Subtitle, EditHistory, BroadcasterRule
│   ├── schemas.py             # Pydantic 스키마
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py            # 인증 + 사용자 CRUD
│   │   ├── projects.py        # 프로젝트 CRUD + 파일
│   │   ├── subtitles.py       # 자막 CRUD + 일괄작업
│   │   └── settings.py        # 방송사 규칙 (DB)
│   └── services/
│       ├── __init__.py
│       ├── auth.py            # JWT, bcrypt, 의존성
│       └── subtitle_service.py # SRT 파싱/생성, 검수, 스냅샷
├── uploads/                   # 영상 파일 저장
├── subtitle_editor.db         # SQLite DB
└── broadcaster_rules.json     # (더 이상 사용 안 함 — DB로 이전)
```
