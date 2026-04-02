"""
backend/app/schemas.py
"""
from __future__ import annotations
from typing import Optional, List
from typing_extensions import Literal
from pydantic import BaseModel

# ── 방송사별 자막 기준 ──
BROADCASTER_RULES = {
    "TVING":  {"max_lines": 2, "max_chars_per_line": 20, "bracket_chars": 5},
    "LGHV":   {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5},
    "SKBB":   {"max_lines": 1, "max_chars_per_line": 20, "bracket_chars": 5},
    "JTBC":   {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5},
    "KBS":    {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5},
    "자유작업": {"max_lines": 99, "max_chars_per_line": 999, "bracket_chars": 0},
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

class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    is_active: bool
    created_at: Optional[str] = None
    class Config:
        from_attributes = True

class MyProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

# ── Project ──
class ProjectCreate(BaseModel):
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

class ProjectResponse(BaseModel):
    id: int
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
    status: str
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
    class Config:
        from_attributes = True

# ── Subtitle ──
class SubtitleCreate(BaseModel):
    after_seq: Optional[int] = None
    start_ms: int
    end_ms: int
    type: Literal["dialogue", "effect"] = "dialogue"
    speaker: str = ""
    speaker_pos: Literal["default", "top"] = "default"
    text_pos: Literal["default", "top"] = "default"
    text: str = ""

class SubtitleUpdate(BaseModel):
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
    type: Optional[Literal["dialogue", "effect"]] = None
    speaker: Optional[str] = None
    speaker_pos: Optional[Literal["default", "top"]] = None
    text_pos: Optional[Literal["default", "top"]] = None
    text: Optional[str] = None

class SubtitleResponse(BaseModel):
    id: int
    seq: int
    start_ms: int
    end_ms: int
    type: str
    speaker: str
    speaker_pos: str
    text_pos: str
    text: str
    error: str
    class Config:
        from_attributes = True

class SubtitleBatchItem(BaseModel):
    id: int
    start_ms: int
    end_ms: int
    type: Literal["dialogue", "effect"]
    speaker: str
    speaker_pos: Literal["default", "top", "deleted"]
    text_pos: Literal["default", "top", "deleted"]
    text: str

class BatchDeleteRequest(BaseModel):
    ids: List[int]

class MergeRequest(BaseModel):
    ids: List[int]

class SplitRequest(BaseModel):
    split_at_ms: Optional[int] = None

class BulkSpeakerRequest(BaseModel):
    from_speaker: str
    to_speaker: str

class TimerUpdate(BaseModel):
    elapsed_seconds: int