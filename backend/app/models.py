"""
backend/app/models.py
"""
from __future__ import annotations
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False, default="worker")  # master / manager / worker
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    created_projects = relationship("Project", foreign_keys="Project.created_by", back_populates="creator")
    assigned_projects = relationship("Project", foreign_keys="Project.assigned_to", back_populates="assignee")
    settings = Column(Text, nullable=True, default=None)  # JSON 문자열: {"shortcuts": {...}, ...}


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    broadcaster = Column(String(100), default="")
    description = Column(String(500), nullable=True)
    max_lines = Column(Integer, default=2)
    max_chars_per_line = Column(Integer, default=15)
    bracket_chars = Column(Integer, default=5)
    subtitle_file = Column(String(500), nullable=True)
    video_file = Column(String(500), nullable=True)
    total_duration_ms = Column(Integer, default=600000)
    video_duration_ms = Column(Integer, nullable=True)
    file_size_mb = Column(Float, nullable=True)
    status = Column(String(20), default="draft")  # draft / submitted / approved
    elapsed_seconds = Column(Integer, default=0)
    last_saved_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    deadline = Column(DateTime, nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    creator = relationship("User", foreign_keys=[created_by], back_populates="created_projects")
    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="assigned_projects")
    subtitles = relationship("Subtitle", back_populates="project", cascade="all, delete-orphan", order_by="Subtitle.seq")
    history = relationship("EditHistory", back_populates="project", cascade="all, delete-orphan", order_by="EditHistory.created_at")
    # 재작업 관련
    reject_count = Column(Integer, default=0)              # 반려(재작업) 횟수
    first_submitted_at = Column(DateTime, nullable=True)   # 최초 제출 일시 (재작업해도 변경 안 함)
    # 영상 업로드
    # video_status = Column(String(20), default="none")  # none / uploading / ready / error
    fps = Column(Float, nullable=True)  # JSON import 시 frame↔ms 변환용
    import_type = Column(String(20), default="srt")  # srt / json
    last_position_ms = Column(Integer, default=0)
    last_selected_id = Column(Integer, nullable=True)
    min_duration_ms = Column(Integer, default=500)

class Subtitle(Base):
    __tablename__ = "subtitles"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    seq = Column(Integer, nullable=False, default=0)
    start_ms = Column(Integer, nullable=False)
    end_ms = Column(Integer, nullable=False)
    type = Column(String(20), default="dialogue")
    speaker = Column(String(100), default="")
    speaker_pos = Column(String(20), default="default")
    text_pos = Column(String(20), default="default")
    text = Column(Text, default="")
    error = Column(String(50), default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # track_type: 어떤 오디오 트랙인지 (기존 SRT는 전부 "dialogue" 또는 "effect" → dialogue로)
    track_type = Column(String(20), default="dialogue")  # dialogue / sfx / bgm / ambience

    # position: JSON 모드에서 사용. default / top / deleted
    position = Column(String(20), default="default")

    # source_id: 원본 JSON의 ID 보존 (dialogueId, sfxId 등)
    source_id = Column(String(100), nullable=True)
    project = relationship("Project", back_populates="subtitles")
    # 삭제 분리 
    speaker_deleted = Column(Boolean, default=False)
    text_deleted = Column(Boolean, default=False)


class EditHistory(Base):
    __tablename__ = "edit_history"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    action = Column(String(50), nullable=False)
    snapshot = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="history")


class ShortcutSetting(Base):
    __tablename__ = "shortcut_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(50), nullable=False)
    key_combo = Column(String(50), nullable=False)


class BroadcasterRule(Base):
    __tablename__ = "broadcaster_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    max_lines = Column(Integer, default=2)
    max_chars_per_line = Column(Integer, default=18)
    bracket_chars = Column(Integer, default=5)
    allow_overlap = Column(Boolean, default=False)  # 오버랩 허용 여부
    min_duration_ms = Column(Integer, default=500)  # 최소 길이 (ms). 기본 0.5초
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))