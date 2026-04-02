# editor

### 최종 수정 : 260402
# SubEditor Pro — 기능 명세서 v7.2

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
/settings                       → SettingsPage (항상 다크 테마 고정)
/settings/:tab                  → SettingsPage (특정 탭 직접 접근)
```

---

# PART 1. BACKEND (FastAPI + SQLAlchemy + PostgreSQL)

> **기술 스택**: Python 3.10, FastAPI, SQLAlchemy (PostgreSQL), JWT 인증 (`python-jose`), bcrypt 비밀번호 해싱 (`passlib`), ffprobe/ffmpeg (영상 길이 감지 + 오디오 파형 추출).
> 가상환경: `.edit_venv` (pyenv). DB: PostgreSQL (`subtitle_editor`).
> 실행: `uvicorn app.main:app --reload --port 8001`

---

## ACT-B01. 인증 및 사용자 관리

### B01-T01. User 모델 (`app/models.py`)
- `id` (int PK), `username` (string, unique), `password_hash` (string), `display_name` (string), `role` (string: master/manager/worker), `is_active` (bool, default True), `created_at`, `updated_at`
- `settings` (Text, nullable, default None) — JSON 문자열: `{"shortcuts": {...}, "subtitle_display": {...}, ...}`
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
- `GET /api/auth/me/settings` — 현재 사용자의 개인 설정 조회 (단축키, 자막 표시 설정 등). 설정 없으면 빈 객체 `{}`
- `PUT /api/auth/me/settings` — 개인 설정 저장 (전체 덮어쓰기). `{ shortcuts: {...}, subtitle_display: {...}, ... }`

### B01-T06. 초기 시딩 (`app/main.py` startup 이벤트)
- DB에 master 역할 User가 없으면 `admin/admin` 계정 자동 생성
- `BroadcasterRule` 테이블이 비어있으면 기본 6개 방송사 규칙 시딩

---

## ACT-B02. 프로젝트 관리

### B02-T01. Project 모델 (`app/models.py`)
- `id`, `name`, `broadcaster`, `description`, `max_lines`, `max_chars_per_line` — 자막 기준 (방송사에서 자동 설정)
- `subtitle_file`, `video_file`, `total_duration_ms`, `video_duration_ms`, `file_size_mb` — 파일 정보
- `status` (draft/submitted/approved/rejected), `elapsed_seconds`, `last_saved_at`, `submitted_at`, `deadline` — 상태/시간
- `assigned_to` (FK→User), `created_by` (FK→User) — 담당자/생성자
- `subtitles` relationship (cascade delete), `history` relationship (cascade delete)

> **변경 (v7)**: `bracket_chars` 필드 제거. 화자 예약 글자수는 동적 계산 (`화자명.length + 3`).

### B02-T02~T07. (변경 없음)

---

## ACT-B03. 방송사 규칙 관리

### B03-T01. BroadcasterRule 모델 (`app/models.py`)
- `id`, `name` (unique), `max_lines`, `max_chars_per_line`, `allow_overlap` (bool, default False), `is_active`, `created_at`, `updated_at`

> **변경 (v7)**: `bracket_chars` 필드 제거. `allow_overlap` 필드 추가.

### B03-T02. 방송사 규칙 API (`app/routers/settings.py`)
- `GET /api/settings/broadcaster-rules` — 전체 조회 (is_active=True만). `allow_overlap` 포함
- `PUT /api/settings/broadcaster-rules` — 전체 덮어쓰기. `allow_overlap` 포함

### B03-T03. `load_rules()` 함수
- DB에서 활성 규칙 로드. DB가 비어있으면 기본값 시딩 (TVING, LGHV, SKBB, JTBC, DLIV, 자유작업)
- 기본값에 `allow_overlap` 포함 (자유작업만 True, 나머지 False)

### B03-T04. 전역 스토어 연동 (`useBroadcasterStore`)
- 프론트에서 Zustand 전역 스토어로 방송사 규칙 관리

---

## ACT-B04. 파일 관리

### B04-T01~T03. (변경 없음 — SRT 파싱/생성, 파일 업로드/다운로드)

### B04-T04. SRT 업로드 최적화 (v7.1 추가)
- `bulk_insert_mappings()` 배치 INSERT — 개별 `db.add()` 대신 한번에 삽입
- 2000개 자막 기준 수 초 이내 처리

### B04-T05. 영상 업로드 (v7.1 변경)
- 2MB 청크 단위 파일 쓰기 (메모리 부담 없음)
- 업로드 완료 후 `ffprobe`로 영상 길이(ms) 자동 감지 → `total_duration_ms`, `video_duration_ms` 업데이트
- `ffprobe` 실패 시 기존 기본값 유지 (600000ms)
- 업로드 완료 후 waveform peaks 추출 실행 (B04-T08 참조)

### B04-T06. 영상 스트리밍 (v7.1 변경)
- `FileResponse`에 `stat_result` 전달 → Starlette이 자동으로 Range 요청 처리
- 대용량 파일(수 GB) seek 지원

### B04-T07. SRT 다운로드 (v7.1 변경)
- 한글 파일명 `filename*=UTF-8''` RFC 5987 인코딩 → `latin-1` 에러 해결
- 프론트에서 Axios blob 방식으로 다운로드 (JWT 인증 헤더 포함)

### B04-T08. Waveform Peaks 추출 (v7.2 추가)
- **서비스**: `app/services/waveform_service.py`
- `extract_waveform_peaks(video_path, project_id, duration_ms)` — ffmpeg로 영상에서 오디오 peaks 데이터 추출
  - 영상 → raw PCM (16bit signed LE, mono, 8kHz) 변환 (`ffmpeg -vn -ac 1 -ar 8000 -f s16le pipe:1`)
  - PCM 데이터를 chunk 단위로 나눠서 각 chunk의 max amplitude를 peaks로 추출 (0.0~1.0 정규화)
  - 해상도: 초당 10포인트 (`PEAKS_PER_SECOND = 10`). 2시간 영상 = 72000 포인트
  - JSON 파일로 저장: `uploads/waveforms/project_{id}_peaks.json`
  - 타임아웃: 5분
- `load_peaks(project_id)` — 저장된 peaks JSON 로드
- **API**: `GET /api/projects/:id/waveform` — peaks 데이터 JSON 반환 (404 if not available)
- 영상 업로드 완료 시 자동 실행 (B04-T05에서 호출)

---

## ACT-B05. 자막 CRUD

### B05-T01~T02. (변경 없음)

### B05-T03. 검수 (`resequence_and_validate`)
- 순번 재계산 + 검수 자동 실행
- **글자수 체크**: 대사 글자수 + 화자 예약(화자명.length + 3) > 기준값(줄당 글자수 × 실제 줄 수)이면 "글자초과"
- **줄 수 체크**: 실제 줄 수 > max_lines이면 "줄초과"
- **시간 오류**: end_ms <= start_ms이면 "시간오류"
- **오버랩 검수 (v7 추가)**: 방송사 규칙이 `allow_overlap=False`인 경우, 시간이 겹치는 자막 모두에 "오버랩" 에러 태그. 기존 에러가 있으면 쉼표로 이어붙임 (예: "글자초과,오버랩")

> **변경 (v7)**: 글자수 카운트 공백 포함 (줄바꿈만 제외), NFC 정규화 후 카운트. 화자 예약은 `bracket_chars` 고정값이 아닌 `화자명.length + 3`으로 동적 계산. 오버랩 검수 추가.

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

### F02-T06. 다크모드 전역 유지 (v7 추가)
- `localStorage.getItem("editor_darkMode")`에서 초기값 복원. 기본값 `true`(다크)
- 변경 시 `localStorage.setItem("editor_darkMode", ...)` 저장
- HomePage, AppLayout 모두 동일한 키로 읽기/쓰기 → 페이지 이동해도 모드 유지
- SettingsPage는 항상 다크 테마 고정 (localStorage 연동 안 함)

---

## ACT-F03. 새 작업 생성 (`NewProjectModal.tsx`)

### F03-T01~T02. (변경 없음)

---

## ACT-F04. 편집기 레이아웃 (`AppLayout.tsx`)

### F04-T01. 레이아웃 구조
```
┌──────────────────────────────────────────┐
│ TopNav                                    │
├──────────────────────────┬───────────────┤
│ SubtitleGrid             │               │
│ (자막 리스트, flex-1)     │  VideoPlayer  │
├═══ 드래그 핸들 ① ════════┤  (오른쪽,     │
│ QuickEditor              │   세로 전체)  │
│ (왼쪽 컬럼 내, 고정높이)   │               │
├──────────────────────────┴───────────────┤
│ ═══════════ 드래그 핸들 ② ═══════════════│
│ Timeline/파형 (전체 폭, 고정 높이)         │
└──────────────────────────────────────────┘
```

### F04-T02. 독립 리사이즈 + localStorage 유지 (v7 변경)
- **영상 너비**: 좌측 변 드래그. 너비만 변경 (240~960px, 화면 60% 상한). 높이는 컨테이너에 자동 맞춤
- **QuickEditor 높이**: 핸들 ①로 조절 (80~400px) — 왼쪽 컬럼 내부
- **타임라인 높이**: 핸들 ②로 조절 (100~500px) — 전체 폭
- **SubtitleGrid**: 왼쪽 컬럼의 나머지 공간 전부 차지
- **영상 너비 상한**: `window.innerWidth * 0.6`으로 제한하여 왼쪽 컬럼이 최소 40% 유지
- **localStorage 저장**: `editor_videoWidth`, `editor_editorHeight`, `editor_timelineHeight` 키로 저장/복원. 새로고침해도 패널 크기 유지
- 리사이즈 핸들은 `HResizeHandle` 공용 컴포넌트. hover 시 파란 하이라이트
- 드래그 중 `document.body.style.userSelect = "none"` + 전역 오버레이
- 각 패널에 `overflow-hidden` 적용하여 레이어 간 침범 방지

### F04-T03~T04. (변경 없음 — 프로젝트 로드, 읽기전용 모드, 작업 시간 추적)

### F04-T05. 자막 표시 설정 패널 (v7.2 추가)
- `showSubPanel` 상태로 패널 표시/숨김 토글
- `SubtitleDisplayPanel` 컴포넌트를 VideoPlayer div 안에 오버레이로 렌더링
- TopNav의 자막설정 버튼 클릭으로 토글

---

## ACT-F05. 상단 네비게이션 (`TopNav.tsx`) (v7.2 변경)

### F05-T01. 버튼 구성 및 순서 (v7.2 변경)
- **좌측**: 홈 버튼, 프로젝트명 · 방송사 · 설정 아이콘, 작업 시간, 상태 뱃지, 저장 메시지
- **우측 (편집 모드)**: 자막설정(Subtitles) → 밝기모드(Sun/Moon) → 다운로드(Download) → 임시저장(Save) → 저장하고나가기(LogOut) → 제출(Send)
- **우측 (readOnly 모드)**: 다운로드(Download) + "검수 모드 — 수정 불가" 텍스트
- **Undo 버튼 제거** (v7.2) — Ctrl+Z 단축키로만 실행 취소 가능
- **다운로드**: readOnly/편집 모드 모두에서 표시 (v7.2 변경)
- **자막설정 버튼**: `Subtitles` 아이콘. 클릭 시 `onToggleSubtitlePanel` 콜백 호출

### F05-T02~T04. (변경 없음 — 프로젝트 설정 모달, 상태 표시, 홈 이동)

---

## ACT-F06. 영상 플레이어 (`VideoPlayer.tsx`)

### F06-T01~T06. (변경 없음)

### F06-T07. 자막 표시 설정 패널 (`SubtitleDisplayPanel.tsx`) (v7.2 추가)
- VideoPlayer 영역 위에 오버레이로 표시되는 설정 패널
- **설정 항목**: 글자 크기(fontSize), 기본 위치(defaultY), 상단 위치(topY) — 각각 슬라이더로 조절
- 초기화 버튼 (기본값 복원) + 저장 버튼
- `useSettingsStore`의 `subtitleDisplay` 상태와 연동
- 닫기(X) 버튼으로 패널 숨김

### F06-T08. 자막 오버레이 설정 연동 (`SubtitleOverlay.tsx`) (v7.2 변경)
- `useSettingsStore`에서 `subtitleDisplay` 설정 읽어서 자막 위치/크기 적용
- `deleted` 상태 자막은 빨간 텍스트 + 취소선으로 표시

---

## ACT-F07. 자막 리스트 (`SubtitleGrid.tsx`)

### F07-T01. 테이블 (v7 변경)
- **헤더 고정**: GridToolbar + GridFilters + 컬럼 헤더를 스크롤 밖 고정 영역으로 분리
- **본문 스크롤**: 자막 행만 `overflow-y-auto`로 스크롤
- 테이블을 2개로 분리 — 헤더 테이블(고정) + 바디 테이블(스크롤)
- 컬럼: #(seq), 시작, 종료, 유형, 화자위치, 대사위치, 화자, 대사, 검수
- 대사 셀: `whitespace-pre-wrap break-all line-clamp-3` — 줄바꿈 보존

### F07-T02~T04. (변경 없음 — 클릭 동작, 필터, 툴바)

---

## ACT-F08. 퀵 에디터 (`QuickEditor.tsx`)

### F08-T01. 선택된 자막 편집 (v7 변경)
- 유형 드롭다운 (대사/효과)
- 화자 명칭 input
- 화자 위치 / 대사 위치 토글 버튼
- 텍스트 textarea — `text-base` (16px). `data-quick-editor-textarea` 속성 (Enter 단축키 포커스용)
- **로컬 편집**: `updateLocal()` 사용 — 서버 호출 없이 Zustand 로컬 상태만 변경. 한글 조합 중 자소 분리 방지. 서버 반영은 임시저장(`saveAll`) 시 일괄 처리.

### F08-T02. 글자수 표시 (v7 변경)
- 텍스트 입력창 오른쪽 위에 표시
- **형식**: `현재 글자 수 : {n} ({n+화자예약}) / 기준 : {기준값}`
  - `n` = 대사 글자수 (공백 및 특수기호 포함, 줄바꿈만 제외, NFC 정규화 후 카운트)
  - 화자예약 = 화자명.length + 3 (괄호+공백 등). 화자 없으면 0
  - 기준값 = 줄당 글자수 × 실제 줄 수 (줄바꿈 기준). 1줄이면 20, 2줄이면 40 등
  - 화자가 없으면 `(n+화자예약)` 부분 미표시
- **초과 판정**: `n + 화자예약 > 기준값`이면 빨간색
- 모든 역할(master/manager/worker)에서 글자수 표시 (hideCharCount 제거)

### F08-T03. 읽기전용 모드
- `readOnly` 시: textarea `readOnly`, select/input `disabled`

---

## ACT-F09. 타임라인/파형 (`Timeline.tsx`) (v7.2 변경)

### F09-T01. 파형 렌더링 (v7.2 변경 — 실제 오디오 파형)
- **이전**: 사인 함수 조합으로 생성한 mock 파형
- **현재**: 백엔드에서 추출한 실제 오디오 peaks 데이터 기반 렌더링
- 편집기 진입 시 `GET /api/projects/:id/waveform` 호출하여 peaks JSON 로드
- peaks 미존재 시 fallback 없음 (빈 파형)
- 파형은 `totalMs` 이후 구간에서 그려지지 않음 (영상 길이만큼만)

### F09-T02. 파형 영역 레이아웃 (v7.2 변경)
- **구조**: 컨트롤 헤더(재생/줌 버튼) → Track area(파형+자막+재생바 포함) → 하단 여백 없음
- **Track area 내부**: 좌/우/아래 여백(margin)을 가진 inner div 안에 시간눈금 + 파형 + 자막블록 + Playhead + TimeDisplay + ProgressBar 전부 포함
- 바깥(Track area)은 다크/라이트 모드에 맞는 배경색. inner div는 항상 `bg-black`

### F09-T03. 자막 블록 경계선 (v7.2 변경)
- 자막 블록 좌/우 경계선: `w-px` (1px 얇은 선)
- `cursor-ew-resize` + 드래그로 시작/종료 시간 조정 — 모든 자막에서 항상 가능 (선택 여부 무관)
- hover 시 경계선 초록색 하이라이트

### F09-T04~T07. (변경 없음 — 줌/스크롤, 클릭 동작, 드래그 시간 조정, 마우스 휠)

### F09-T08. 성능 최적화 — RAF 분리 (v7.2 추가)
- **Playhead** (`Playhead.tsx`): `requestAnimationFrame`으로 DOM 직접 조작. `usePlayerStore.getState()`에서 `currentMs` 읽어서 `ref.current.style.left` 직접 변경. React 리렌더 0.
- **ProgressBar** (`ProgressBar.tsx`): 하단 전체 재생바. RAF로 독립 업데이트. 클릭으로 재생 위치 이동 + 해당 위치 자막 선택. knob(동그라미) 핸들 표시.
- **TimelineTimeDisplay** (`TimelineTimeDisplay.tsx`): 좌하단 현재시간 텍스트. RAF로 DOM 직접 조작.
- **Timeline 본체**: `currentMs` Zustand 구독 완전 제거. 파형/자막블록은 `scrollMs`/`visDur`/`subtitles` 변경 시에만 리렌더. 재생 중 Timeline 리렌더 없음.

---

## ACT-F10. 재생 엔진 (`usePlayback.ts`)

### F10-T01~T03. (변경 없음)

---

## ACT-F11. 키보드 단축키 (`useKeyboardShortcuts.ts`)

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
| `search` | `Ctrl+F` | 자막 검색 input 포커스 (`[data-grid-search]`) |
| `replace` | `Ctrl+H` | 찾아서 바꾸기 — TODO (현재 미구현, 예약) |
| `prev` | `↑` | 이전 싱크로 이동 |
| `next` | `↓` | 다음 싱크로 이동 |
| `focus_text` | `Enter` | 텍스트 입력창(QuickEditor textarea) 포커스 |
| `save` | `Ctrl+S` | 임시저장 (화면 유지, 나가지 않음) |
| `delete` | `Delete` | 선택 삭제 |

### F11-T02. 입력 중 단축키 차단 (v7 변경)
- textarea/input 포커스 중일 때 **차단되는 단축키**: `play_pause`(Space), `prev`(↑), `next`(↓), `delete`(Delete), `focus_text`(Enter)
- textarea/input 포커스 중에도 **동작하는 단축키**: `undo`(Ctrl+Z), `save`(Ctrl+S), `set_start`(F9), `set_end`(F10), `add_sync`(Alt+I), `snap_prev`(Alt+[), `snap_next`(Alt+]), `split`(Ctrl+Enter), `search`(Ctrl+F), `replace`(Ctrl+H)

### F11-T03~T06. (변경 없음 — 커스텀 저장, 중복 방지, 기본값 초기화, 실시간 적용, 액션 구현)

---

## ACT-F12. 설정 페이지 (`SettingsPage.tsx`)

### F12-T01. 레이아웃
- 경로: `/settings`, `/settings/:tab`
- 상단 탭 네비게이션. admin 전체 탭, worker는 단축키+마이페이지만
- 진입 시 `useSettingsStore.load()` 호출
- **항상 다크 테마 고정** (localStorage 연동 안 함)

### F12-T02. 방송사 프리셋 (`BroadcasterPresetsTab.tsx`) (v7 변경)
- DB 연동. 추가/수정/삭제. 저장 시 `useBroadcasterStore.fetch()`
- **컬럼**: 방송사명, 최대 줄, 글자 수, 오버랩(허용/미허용)
- `bracket_chars`(화자 예약) 필드 제거 — 동적 계산으로 대체
- `allow_overlap` 토글 추가

### F12-T03~T05. (변경 없음 — 조직원 관리, 단축키 설정, 마이페이지)

---

## ACT-F13. 상태 관리 (Zustand Stores)

### F13-T01. usePlayerStore
- `currentMs`, `playing`, `muted`, `totalMs`, `videoPreviewMs`
- `setCurrentMs`, `setTotalMs`, `togglePlay`, `toggleMute`, `seekForward(ms)`, `seekBackward(ms)`, `setVideoPreviewMs`

### F13-T02. useSubtitleStore (v7 변경)
- `projectId`, `subtitles`, `selectedId`, `multiSelect`, `loading`
- 선택: `selectSingle`, `toggleMulti`, `selectRange`, `navigateNext`, `navigatePrev`
- **`updateLocal(id, data)`** — 로컬 상태만 즉시 변경 (서버 호출 없음). 텍스트/화자 입력 중 사용. 한글 자소 분리 방지.
- **`updateOne(id, data)`** — 서버 API 호출하여 단건 수정 + 응답으로 교체. 시간 변경 등 즉시 검수가 필요한 경우 사용.
- API 연동: `init`, `addAfter`, `deleteSelected`, `splitSelected`, `mergeSelected`, `bulkSpeaker`, `saveAll`, `undo`
- **싱크 추가 (`addAfter`)**: 기본 간격 1ms (0.001초), 기본 길이 1000ms (1초)

### F13-T03~T05. (변경 없음 — useTimelineStore, useAuthStore, useBroadcasterStore)

### F13-T06. useSettingsStore (v7.2 변경)
- `shortcuts` — 커스텀 단축키 매핑
- `subtitleDisplay` — 자막 표시 설정 `{ fontSize, defaultY, topY }` (v7.2 추가)
- `load()` — `GET /api/auth/me/settings`에서 shortcuts + subtitle_display 로드
- `saveAll()` — `PUT /api/auth/me/settings`로 shortcuts + subtitle_display 저장

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
| settings | JSON/text (nullable) | 개인 설정. `{ shortcuts: {...}, subtitle_display: { fontSize, defaultY, topY } }` |

## Project
| 필드 | 타입 | 설명 |
|------|------|------|
| id | int PK | |
| name | string | 프로젝트명 |
| broadcaster | string | 방송사 |
| description | string | 설명/부제 |
| max_lines, max_chars_per_line | int | 자막 기준 |
| subtitle_file, video_file | string | 파일 경로 |
| total_duration_ms, video_duration_ms, file_size_mb | int/float | 미디어 정보 |
| status | string | draft / submitted / approved / rejected |
| elapsed_seconds | int | 누적 작업 시간 |
| last_saved_at, submitted_at, deadline | datetime | 시간 정보 |
| first_submitted_at | datetime | 최초 제출 일시 |
| reject_count | int | 반려 횟수 |
| assigned_to, created_by | int FK→User | 담당/생성자 |

> **변경 (v7)**: `bracket_chars` 필드 제거.

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
| error | string | 검수 결과 (쉼표 구분 가능: "글자초과,오버랩") |

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
| max_lines, max_chars_per_line | int | 자막 기준 |
| allow_overlap | bool | 오버랩 허용 여부 (default False) |
| is_active | bool | 활성 상태 |

> **변경 (v7)**: `bracket_chars` 필드 제거. `allow_overlap` 필드 추가.

---

# PART 4. API 엔드포인트 전체 목록

## 인증
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 로그인 → JWT |
| GET | `/api/auth/me` | 현재 사용자 |
| PATCH | `/api/auth/me` | 본인 정보 수정 |
| GET | `/api/auth/me/settings` | 개인 설정 조회 (단축키, 자막표시 등) |
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
| GET | `/api/projects/:id/waveform` | 오디오 파형 peaks 조회 (v7.2 추가) |

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
│   ├── projects.ts            # 프로젝트/파일/방송사/파형 API
│   └── subtitles.ts           # 자막 CRUD API
├── store/
│   ├── useAuthStore.ts        # 인증 상태
│   ├── usePlayerStore.ts      # 재생 상태 + videoPreviewMs
│   ├── useSubtitleStore.ts    # 자막 + 선택 상태 + updateLocal/updateOne
│   ├── useTimelineStore.ts    # 타임라인 줌/스크롤
│   ├── useBroadcasterStore.ts # 방송사 규칙 (전역)
│   └── useSettingsStore.ts    # 개인 설정 (단축키 + 자막표시설정)
├── components/
│   ├── auth/        LoginPage, ProtectedRoute
│   ├── home/        HomePage, NewProjectModal
│   ├── layout/      AppLayout
│   ├── nav/         TopNav
│   ├── video/       VideoPlayer, SubtitleOverlay, SubtitleDisplayPanel
│   ├── grid/        SubtitleGrid, GridToolbar, GridFilters
│   ├── editor/      QuickEditor
│   ├── timeline/    Timeline, Playhead, ProgressBar, TimelineTimeDisplay, ZoomControls
│   ├── modals/      ProjectSettingsModal, BulkSpeakerModal, ShortcutsModal
│   └── settings/    SettingsPage, tabs/ (7개 탭 컴포넌트)
├── hooks/
│   ├── usePlayback.ts
│   ├── useKeyboardShortcuts.ts  # eventToKeyString + 커스텀 단축키 + 입력 중 차단
│   └── useTimelineZoom.ts
├── utils/
│   ├── time.ts                # ms ↔ timecode 변환
│   └── validation.ts          # 글자수 카운트 (NFC, 공백 포함), 검수
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
│   ├── database.py            # SQLAlchemy 엔진/세션 (PostgreSQL)
│   ├── models.py              # User(+settings), Project, Subtitle, EditHistory, BroadcasterRule(+allow_overlap)
│   ├── schemas.py             # Pydantic 스키마
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py            # 인증 + 사용자 CRUD + 개인설정 API
│   │   ├── projects.py        # 프로젝트 CRUD + 파일 + ffprobe 길이 감지 + 파형 API
│   │   ├── subtitles.py       # 자막 CRUD + 일괄작업
│   │   └── settings.py        # 방송사 규칙 (DB) + allow_overlap
│   └── services/
│       ├── __init__.py
│       ├── auth.py            # JWT, bcrypt, 의존성
│       ├── subtitle_service.py # SRT 파싱/생성, 검수(글자수+오버랩), 스냅샷
│       └── waveform_service.py # ffmpeg 오디오 peaks 추출 (v7.2 추가)
├── uploads/
│   ├── (영상 파일들)
│   └── waveforms/             # peaks JSON 파일 저장 (v7.2 추가)
└── subtitle_editor.db         # (더 이상 사용 안 함 — PostgreSQL로 이전)
```

---

# PART 7. 변경 이력

## v6 → v7 (260401)

| 영역 | 변경 내용 |
|------|-----------|
| **글자수 카운트** | 공백 포함, 줄바꿈만 제외, NFC 정규화. 백엔드/프론트 동일 |
| **화자 예약** | `bracket_chars` 고정값 제거 → `화자명.length + 3` 동적 계산 |
| **글자수 기준값** | `maxChars × maxLines` 고정 → `maxChars × 실제줄수` 동적 계산 |
| **글자수 표시** | 모든 역할에서 표시 (hideCharCount 제거). 형식: `현재 글자 수 : n (n+화자예약) / 기준 : {기준값}` |
| **오버랩 검수** | BroadcasterRule에 `allow_overlap` 추가. 미허용 시 겹치는 자막 모두에 "오버랩" 에러 |
| **자소 분리 수정** | QuickEditor에서 `updateOne`(서버 호출) → `updateLocal`(로컬만) 변경. 한글 조합 중 깨짐 방지 |
| **싱크 추가** | 기본 간격 10ms→1ms, 기본 길이 2초→1초 |
| **단축키 입력 차단** | Space/↑↓/Delete/Enter는 textarea 포커스 중 차단 |
| **Ctrl+F/H** | 자막 검색 input(`[data-grid-search]`) 포커스로 연결 |
| **자막 리스트 고정** | GridToolbar + GridFilters + 컬럼 헤더를 스크롤 밖 고정. 본문만 스크롤 |
| **패널 크기 유지** | 영상 너비, 에디터 높이, 타임라인 높이를 localStorage에 저장/복원 |
| **영상 너비 상한** | `window.innerWidth * 0.6`으로 제한하여 왼쪽 컬럼 찌그러짐 방지 |
| **다크모드 전역** | localStorage `editor_darkMode` 키로 HomePage/AppLayout 간 유지. SettingsPage는 다크 고정 |
| **방송사 설정** | `bracket_chars` 컬럼 제거. `allow_overlap` 컬럼 추가 |

## v7 → v7.1 (260401)

| 영역 | 변경 내용 |
|------|-----------|
| **DB 전환** | SQLite → PostgreSQL. 동시 쓰기 지원, 대량 데이터 처리 최적화 |
| **SRT 배치 INSERT** | `bulk_insert_mappings()`로 한번에 삽입. 2000개 자막 수 초 이내 |
| **영상 길이 감지** | `ffprobe`로 업로드 시 `total_duration_ms` 자동 감지 (10분 고정값 제거) |
| **영상 스트리밍** | `FileResponse` + `stat_result`로 Range 요청 지원 (대용량 seek) |
| **SRT 다운로드** | 한글 파일명 UTF-8 인코딩 + Axios blob 방식 JWT 인증 |

## v7.1 → v7.2 (260402)

| 영역 | 변경 내용 |
|------|-----------|
| **실제 오디오 파형** | ffmpeg로 peaks 추출 → JSON 저장 → 프론트에서 실제 오디오 파형 렌더링. mock 사인 함수 제거 |
| **Waveform API** | `GET /api/projects/:id/waveform` 추가. `waveform_service.py` 신규 |
| **Timeline 성능** | Playhead/ProgressBar/TimelineTimeDisplay를 RAF 기반 독립 컴포넌트로 분리. Timeline 본체에서 `currentMs` 구독 제거 → 재생 중 리렌더 0 |
| **파형 영역 여백** | Track area 안에 inner div로 좌/우/아래 margin 확보. 시간눈금+파형+자막+재생바 모두 inner에 포함 |
| **자막 블록 경계선** | `w-1` → `w-px` (얇게). 모든 자막에서 드래그 가능 (선택 무관). hover 시 초록 하이라이트 |
| **TopNav 버튼 재구성** | Undo 버튼 제거. 순서: 자막설정→밝기→다운로드→임시저장→저장하고나가기→제출 |
| **readOnly 다운로드** | 검수 모드(readOnly)에서도 다운로드 버튼 표시 |
| **자막 표시 설정** | SubtitleDisplayPanel 신규 — 글자크기/기본위치/상단위치 슬라이더. useSettingsStore에 `subtitleDisplay` 상태 추가. 서버에 저장/로드 |
| **SubtitleOverlay** | useSettingsStore에서 설정 읽어서 위치/크기 적용. deleted 상태 자막은 빨간 텍스트+취소선 |
| **Ctrl+H** | replace 기능 미구현으로 변경 (검색과 동일 → TODO 예약) |