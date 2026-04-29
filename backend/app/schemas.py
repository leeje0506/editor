"""
backend/app/schemas.py
"""
from __future__ import annotations
from typing import Optional, List
from typing_extensions import Literal
from pydantic import BaseModel

# ── TODO : 방송사별 자막 기준, 최소 길이, 화자 구분 추가 필요 ──
BROADCASTER_RULES = {
    "TVING":  {"max_lines": 2, "max_chars_per_line": 20},
    "LGHV":   {"max_lines": 2, "max_chars_per_line": 18},
    "SKBB":   {"max_lines": 1, "max_chars_per_line": 20},
    "JTBC":   {"max_lines": 2, "max_chars_per_line": 18},
    "KBS":    {"max_lines": 2, "max_chars_per_line": 18},
    "자유작업": {"max_lines": 99, "max_chars_per_line": 999},
}

# ── Auth ──
class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    display_name: str
    role: Literal["master", "manager", "worker"] = "worker"

class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[Literal["master", "manager", "worker"]] = None
    is_active: Optional[bool] = None


class WorkspaceBrief(BaseModel):
    """사용자 권한 응답 등에서 워크스페이스를 간결히 표현."""
    id: int
    name: str
    depth: int
    parent_id: Optional[int] = None

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    is_active: bool
    created_at: Optional[str] = None
    workspace_permissions: Optional[List[WorkspaceBrief]] = None

    class Config:
        from_attributes = True

class MyProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


# ── Workspace ──
class WorkspaceCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None  # None이면 depth 1 (루트)


class WorkspaceUpdate(BaseModel):
    """v1에서는 이름 변경만 지원. 부모 변경(이동)은 미지원."""
    name: Optional[str] = None


class WorkspaceStats(BaseModel):
    """워크스페이스 통계 (재귀 합산). 관리자에게만 응답."""
    sub_workspace_count: int = 0           # 하위 워크스페이스 수 (자기 제외)
    project_count: int = 0                 # 하위 프로젝트 수 (재귀)
    completed_count: int = 0               # 완료 조건(status='completed' OR progress_ms >= video_duration_ms)
    member_count: int = 0                  # assigned_to ∪ created_by 고유 사용자 수
    total_progress_ms: int = 0             # SUM(progress_ms)
    total_video_ms: int = 0                # SUM(video_duration_ms)
    progress_ratio: float = 0.0            # total_progress_ms / total_video_ms (0.0 ~ 1.0)


class WorkspaceResponse(BaseModel):
    id: int
    name: str
    parent_id: Optional[int] = None
    depth: int
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    stats: Optional[WorkspaceStats] = None  # 트리/상세 응답 시 관리자에게만 채워짐

    class Config:
        from_attributes = True


# ── Workspace 권한 ──
class WorkspacePermissionGrant(BaseModel):
    user_id: int
    workspace_id: int


class WorkspacePermissionBulkGrant(BaseModel):
    """bulk-grant: 기존 권한 전체 삭제 후 이 목록으로 교체."""
    user_id: int
    workspace_ids: List[int]


# ── Project ──
class ProjectCreate(BaseModel):
    workspace_id: int  # ★ 필수 — 모든 프로젝트는 워크스페이스 소속
    name: str
    broadcaster: str = ""
    description: Optional[str] = None
    max_lines: Optional[int] = None
    max_chars_per_line: Optional[int] = None
    bracket_chars: Optional[int] = None
    deadline: Optional[str] = None
    assigned_to: Optional[int] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    broadcaster: Optional[str] = None
    description: Optional[str] = None
    max_lines: Optional[int] = None
    max_chars_per_line: Optional[int] = None
    bracket_chars: Optional[int] = None
    subtitle_file: Optional[str] = None
    video_file: Optional[str] = None
    total_duration_ms: Optional[int] = None
    deadline: Optional[str] = None
    assigned_to: Optional[int] = None
    # ※ workspace_id 변경(이동)은 v1 미지원 (필드 없음)

class ProjectResponse(BaseModel):
    id: int
    workspace_id: int  # ★ 신규
    workspace_path: Optional[List[str]] = None  # ★ 신규 — 브레드크럼용 경로 (root → current 이름 배열)
    name: str
    broadcaster: str
    description: Optional[str] = None
    max_lines: int
    max_chars_per_line: int
    bracket_chars: int
    subtitle_file: Optional[str] = None
    video_file: Optional[str] = None
    total_duration_ms: int
    video_duration_ms: Optional[int] = None
    file_size_mb: Optional[float] = None
    status: str  # in_progress / submitted / rejected / completed
    elapsed_seconds: int = 0
    last_saved_at: Optional[str] = None
    submitted_at: Optional[str] = None
    deadline: Optional[str] = None
    assigned_to: Optional[int] = None
    assigned_to_name: Optional[str] = None
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: Optional[str] = None
    subtitle_count: int = 0
    error_count: int = 0
    fps: Optional[float] = None
    import_type: str = "srt"
    last_position_ms: int = 0
    last_selected_id: Optional[int] = None
    speaker_mode: str = "name"
    reject_count: int = 0  # ★ 신규 — 프론트에서 status 라벨 계산용 (재작업 = in_progress + reject_count > 0)
    first_submitted_at: Optional[str] = None  # ★ 신규
    progress_ms: int = 0  # ★ 신규 — 진척률 기준값 (MAX(seq) 자막의 end_ms)
    class Config:
        from_attributes = True

# ── Subtitle ──
class SubtitleCreate(BaseModel):
    after_seq: Optional[int] = None
    start_ms: int
    end_ms: int
    type: Literal["dialogue", "effect"] = "dialogue"
    track_type: Literal["dialogue", "sfx", "bgm", "ambience"] = "dialogue"
    speaker: str = ""
    speaker_pos: Literal["default", "top"] = "default"  # ★ "deleted" 제거 (speaker_deleted bool로 분리)
    text_pos: Literal["default", "top"] = "default"     # ★ "deleted" 제거 (text_deleted bool로 분리)
    position: Literal["default", "top"] = "default"     # ★ "deleted" 제거
    text: str = ""
    source_id: Optional[str] = None
    speaker_deleted: bool = False
    text_deleted: bool = False

class SubtitleUpdate(BaseModel):
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
    type: Optional[Literal["dialogue", "effect"]] = None
    track_type: Optional[Literal["dialogue", "sfx", "bgm", "ambience"]] = None
    speaker: Optional[str] = None
    speaker_pos: Optional[Literal["default", "top"]] = None  # ★ "deleted" 제거
    text_pos: Optional[Literal["default", "top"]] = None     # ★ "deleted" 제거
    position: Optional[Literal["default", "top"]] = None     # ★ "deleted" 제거
    text: Optional[str] = None
    source_id: Optional[str] = None
    speaker_deleted: bool = False
    text_deleted: bool = False

class SubtitleResponse(BaseModel):
    id: int
    seq: int
    start_ms: int
    end_ms: int
    type: str
    track_type: str = "dialogue"
    speaker: str
    speaker_pos: str
    text_pos: str
    position: str = "default"
    text: str
    error: str
    source_id: Optional[str] = None
    class Config:
        from_attributes = True
    speaker_deleted: bool = False
    text_deleted: bool = False

class SubtitleBatchItem(BaseModel):
    id: int
    start_ms: int
    end_ms: int
    type: Literal["dialogue", "effect"]
    track_type: Literal["dialogue", "sfx", "bgm", "ambience"] = "dialogue"
    speaker: str
    speaker_pos: Literal["default", "top"]                  # ★ "deleted" 제거
    text_pos: Literal["default", "top"]                     # ★ "deleted" 제거
    position: Literal["default", "top"] = "default"         # ★ "deleted" 제거
    text: str
    source_id: Optional[str] = None
    speaker_deleted: bool = False
    text_deleted: bool = False

class BatchDeleteRequest(BaseModel):
    ids: List[int]

class MergeRequest(BaseModel):
    ids: List[int]

class SplitRequest(BaseModel):
    split_at_ms: Optional[int] = None
    text_split_pos: Optional[int] = None  # 텍스트 커서 위치 (0-based index)

class BulkSpeakerRequest(BaseModel):
    from_speaker: str
    to_speaker: str

class TimerUpdate(BaseModel):
    elapsed_seconds: int

class SavePositionBody(BaseModel):
    last_position_ms: Optional[int] = None
    last_selected_id: Optional[int] = None