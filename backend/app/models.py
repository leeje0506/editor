"""
backend/app/models.py
"""
from __future__ import annotations
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON, UniqueConstraint, CheckConstraint
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
    settings = Column(Text, nullable=True, default=None)

    # 워크스페이스 관련
    created_workspaces = relationship(
        "Workspace",
        foreign_keys="Workspace.created_by",
        back_populates="creator",
    )
    workspace_permissions = relationship(
        "UserWorkspacePermission",
        foreign_keys="UserWorkspacePermission.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Workspace(Base):
    """작업 공간 (트리 구조, depth 1~3)"""
    __tablename__ = "workspaces"
    __table_args__ = (
        CheckConstraint("depth BETWEEN 1 AND 3", name="chk_workspace_depth"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    parent_id = Column(Integer, ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=True, index=True)
    depth = Column(Integer, nullable=False)  # 1 / 2 / 3 (서버에서 parent.depth + 1로 자동 계산)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    parent = relationship("Workspace", remote_side="Workspace.id", back_populates="children")
    children = relationship("Workspace", back_populates="parent", cascade="all")
    creator = relationship("User", foreign_keys=[created_by], back_populates="created_workspaces")
    projects = relationship("Project", back_populates="workspace")
    permissions = relationship(
        "UserWorkspacePermission",
        foreign_keys="UserWorkspacePermission.workspace_id",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )


class UserWorkspacePermission(Base):
    """사용자별 워크스페이스 접근 권한.
    부여된 노드 + 그 후손 모두 접근 가능 (재귀 CTE로 전개).
    중복 부여 허용: [A-1]과 [A-1-1] 동시 보유 가능 (회수 시 독립 처리).
    """
    __tablename__ = "user_workspace_permissions"
    __table_args__ = (
        UniqueConstraint("user_id", "workspace_id", name="uq_user_workspace"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    granted_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", foreign_keys=[user_id], back_populates="workspace_permissions")
    workspace = relationship("Workspace", foreign_keys=[workspace_id], back_populates="permissions")
    granter = relationship("User", foreign_keys=[granted_by])


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "status IN ('in_progress', 'submitted', 'rejected', 'completed')",
            name="chk_project_status",
        ),
    )

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
    status = Column(String(20), default="in_progress")  # in_progress / submitted / rejected / completed
    elapsed_seconds = Column(Integer, default=0)
    last_saved_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    deadline = Column(DateTime, nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    creator = relationship("User", foreign_keys=[created_by], back_populates="created_projects")
    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="assigned_projects")
    subtitles = relationship("Subtitle", back_populates="project", cascade="all, delete-orphan", order_by="Subtitle.seq")
    history = relationship("EditHistory", back_populates="project", cascade="all, delete-orphan", order_by="EditHistory.created_at")
    reject_count = Column(Integer, default=0)
    first_submitted_at = Column(DateTime, nullable=True)
    fps = Column(Float, nullable=True)
    import_type = Column(String(20), default="srt")
    last_position_ms = Column(Integer, default=0)
    last_selected_id = Column(Integer, nullable=True)
    min_duration_ms = Column(Integer, default=500)
    speaker_mode = Column(String(20), default="name")

    # 워크스페이스 소속 + 진척률 (v8.3 신규)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False, index=True)
    progress_ms = Column(Integer, nullable=False, default=0)  # MAX(seq) 자막의 end_ms (진척률 계산 기준값)

    workspace = relationship("Workspace", back_populates="projects")


class Subtitle(Base):
    __tablename__ = "subtitles"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
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
    track_type = Column(String(20), default="dialogue")
    position = Column(String(20), default="default")
    source_id = Column(String(100), nullable=True)
    project = relationship("Project", back_populates="subtitles")
    speaker_deleted = Column(Boolean, default=False)
    text_deleted = Column(Boolean, default=False)
    # 사용자가 실제로 수정한 자막인지 (진척률 계산 기준)
    # 임포트 직후엔 False. 사용자가 텍스트/시각/화자 등을 실제로 바꾸면 True.
    is_modified = Column(Boolean, default=False, nullable=False)


class EditHistory(Base):
    __tablename__ = "edit_history"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(50), nullable=False)
    snapshot = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="history")


class ShortcutSetting(Base):
    __tablename__ = "shortcut_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(50), nullable=False)
    key_combo = Column(String(50), nullable=False)


class BroadcasterRule(Base):
    __tablename__ = "broadcaster_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    max_lines = Column(Integer, default=2)
    max_chars_per_line = Column(Integer, default=18)
    bracket_chars = Column(Integer, default=5)
    allow_overlap = Column(Boolean, default=False)
    min_duration_ms = Column(Integer, default=500)
    speaker_mode = Column(String(20), default="name")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
