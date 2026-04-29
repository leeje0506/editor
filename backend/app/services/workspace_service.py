"""
backend/app/services/workspace_service.py
Python 3.9 호환

워크스페이스 트리 관리:
- 깊이 계산/검증 (max 3)
- 같은 부모 아래 이름 중복 자동 번호 부여
- 브레드크럼 경로 조회
- 통계 집계 (재귀 CTE + 후손 프로젝트 합산)
- 강제 삭제 (트랜잭션 내 leaf-first)

명세 v8.3 PART 1 ACT-B03 참조.
"""
from __future__ import annotations
from typing import List, Optional, Set, Dict
import os

from fastapi import HTTPException
from sqlalchemy import text, func
from sqlalchemy.orm import Session

from app.models import Workspace, Project, Subtitle


MAX_DEPTH = 3


# ── 깊이 계산 / 검증 ──────────────────────────────────────────

def compute_depth(db: Session, parent_id: Optional[int]) -> int:
    """parent_id 기준으로 새 노드의 depth를 계산.

    - parent_id is None → depth 1 (루트)
    - parent_id 있으면 parent.depth + 1
    - parent.depth가 이미 MAX_DEPTH(3)이면 HTTPException(400)
    """
    if parent_id is None:
        return 1
    parent = db.query(Workspace).get(parent_id)
    if parent is None:
        raise HTTPException(404, "부모 워크스페이스를 찾을 수 없습니다")
    if parent.depth >= MAX_DEPTH:
        raise HTTPException(
            400,
            f"depth {MAX_DEPTH} 워크스페이스 안에는 새 워크스페이스를 만들 수 없습니다",
        )
    return parent.depth + 1


# ── 이름 중복 자동 번호 부여 ──────────────────────────────────

def generate_unique_name(
    db: Session,
    parent_id: Optional[int],
    base_name: str,
    exclude_id: Optional[int] = None,
) -> str:
    """같은 부모 아래 동일 이름이 이미 있으면 자동으로 번호를 붙여 고유 이름 생성.

    "드라마" → "드라마_2" → "드라마_3" → ...

    - parent_id: 부모 워크스페이스 ID (None이면 루트)
    - base_name: 사용자 입력 이름
    - exclude_id: 이름 변경 시 자기 자신 제외 (있으면)
    """
    base_name = (base_name or "").strip()
    if not base_name:
        raise HTTPException(400, "워크스페이스 이름은 비어 있을 수 없습니다")

    def _exists(name: str) -> bool:
        q = db.query(Workspace).filter(Workspace.name == name)
        if parent_id is None:
            q = q.filter(Workspace.parent_id.is_(None))
        else:
            q = q.filter(Workspace.parent_id == parent_id)
        if exclude_id is not None:
            q = q.filter(Workspace.id != exclude_id)
        return q.first() is not None

    if not _exists(base_name):
        return base_name

    n = 2
    while _exists(f"{base_name}_{n}"):
        n += 1
    return f"{base_name}_{n}"


# ── 경로 (브레드크럼) ─────────────────────────────────────────

def get_workspace_path(db: Session, workspace_id: int) -> List[str]:
    """워크스페이스의 root → current 이름 경로 배열.

    Project.workspace_path 응답과 TopNav 브레드크럼에 사용.
    """
    path: List[str] = []
    current = db.query(Workspace).get(workspace_id)
    while current is not None:
        path.append(current.name)
        if current.parent_id is None:
            break
        current = db.query(Workspace).get(current.parent_id)
    path.reverse()
    return path


# ── 평탄 리스트 (트리 응답) ───────────────────────────────────

def list_workspaces_flat(
    db: Session,
    accessible_ids: Optional[Set[int]] = None,
) -> List[Workspace]:
    """워크스페이스 평탄 리스트.

    - accessible_ids is None → 전체 (master/manager)
    - accessible_ids 가 set → 그 ID들만 (worker, 권한 트리 전개 결과)
    - accessible_ids 가 빈 set → 빈 리스트

    정렬: depth ASC, name ASC (트리 빌드 시 부모가 자식보다 먼저 나오도록)
    """
    q = db.query(Workspace)
    if accessible_ids is not None:
        if not accessible_ids:
            return []
        q = q.filter(Workspace.id.in_(accessible_ids))
    return q.order_by(Workspace.depth.asc(), Workspace.name.asc()).all()


# ── 통계 집계 ────────────────────────────────────────────────

def get_workspace_stats(db: Session, workspace_id: int) -> Dict:
    """워크스페이스 통계 (재귀 합산). 관리자 응답용.

    Returns:
        {
            'sub_workspace_count': int,   # 후손 워크스페이스 수 (자기 제외)
            'project_count': int,          # 후손 프로젝트 수 (재귀)
            'completed_count': int,        # 완료 조건(status='completed' OR progress_ms>=video_duration_ms)
            'member_count': int,           # assigned_to ∪ created_by 고유 수
            'total_progress_ms': int,
            'total_video_ms': int,
            'progress_ratio': float,       # 0.0 ~ 1.0
        }
    """
    sql_descendants = text(
        """
        WITH RECURSIVE descendants AS (
            SELECT id FROM workspaces WHERE id = :ws_id
            UNION ALL
            SELECT w.id
              FROM workspaces w
              JOIN descendants d ON w.parent_id = d.id
        )
        SELECT id FROM descendants
        """
    )
    rows = db.execute(sql_descendants, {"ws_id": workspace_id}).all()
    descendant_ids = [r[0] for r in rows]

    empty_result = {
        "sub_workspace_count": 0,
        "project_count": 0,
        "completed_count": 0,
        "member_count": 0,
        "total_progress_ms": 0,
        "total_video_ms": 0,
        "progress_ratio": 0.0,
    }
    if not descendant_ids:
        return empty_result

    sub_workspace_count = len(descendant_ids) - 1  # 자기 자신 제외

    projects = (
        db.query(Project).filter(Project.workspace_id.in_(descendant_ids)).all()
    )
    project_count = len(projects)

    completed_count = sum(
        1
        for p in projects
        if p.status == "completed"
        or (p.video_duration_ms and (p.progress_ms or 0) >= p.video_duration_ms)
    )

    total_progress_ms = sum((p.progress_ms or 0) for p in projects)
    total_video_ms = sum((p.video_duration_ms or 0) for p in projects)
    progress_ratio = (
        (total_progress_ms / total_video_ms) if total_video_ms > 0 else 0.0
    )

    members: Set[int] = set()
    for p in projects:
        if p.assigned_to is not None:
            members.add(p.assigned_to)
        if p.created_by is not None:
            members.add(p.created_by)

    return {
        "sub_workspace_count": sub_workspace_count,
        "project_count": project_count,
        "completed_count": completed_count,
        "member_count": len(members),
        "total_progress_ms": total_progress_ms,
        "total_video_ms": total_video_ms,
        "progress_ratio": progress_ratio,
    }


# ── 비어있지 않은 카운트 (DELETE 거부 안내용) ────────────────

def count_workspace_contents(db: Session, workspace_id: int) -> Dict:
    """워크스페이스가 직접/하위로 보유한 컨텐츠 카운트.

    DELETE 시 비어있지 않으면 409 응답에 동봉할 정보.

    Returns:
        {
            'workspace_count': int,   # 후손 워크스페이스 수 (자기 제외)
            'project_count': int,
            'subtitle_count': int,    # 후손 프로젝트들의 자막 총합
        }
    """
    sql = text(
        """
        WITH RECURSIVE descendants AS (
            SELECT id FROM workspaces WHERE id = :ws_id
            UNION ALL
            SELECT w.id FROM workspaces w
              JOIN descendants d ON w.parent_id = d.id
        )
        SELECT id FROM descendants
        """
    )
    rows = db.execute(sql, {"ws_id": workspace_id}).all()
    descendant_ids = [r[0] for r in rows]
    if not descendant_ids:
        return {"workspace_count": 0, "project_count": 0, "subtitle_count": 0}

    workspace_count = len(descendant_ids) - 1

    project_count = (
        db.query(func.count(Project.id))
          .filter(Project.workspace_id.in_(descendant_ids))
          .scalar()
        or 0
    )

    subtitle_count = (
        db.query(func.count(Subtitle.id))
          .join(Project, Subtitle.project_id == Project.id)
          .filter(Project.workspace_id.in_(descendant_ids))
          .scalar()
        or 0
    )

    return {
        "workspace_count": workspace_count,
        "project_count": project_count,
        "subtitle_count": subtitle_count,
    }


# ── 파일 정리 (프로젝트 단위) ────────────────────────────────

def cleanup_project_files(project: Project) -> None:
    """프로젝트 삭제 시 디스크 파일 best-effort 정리.

    영상, 자막, 파형 peaks JSON, JSON 원본 등.
    파일이 없거나 정리 실패해도 silently 진행 (운영에서는 로깅 권장).

    단일 프로젝트 DELETE와 워크스페이스 강제 삭제 양쪽에서 재사용.
    """
    paths: List[str] = []
    if project.video_file:
        paths.append(project.video_file)
    if project.subtitle_file:
        paths.append(project.subtitle_file)
    paths.append(f"uploads/waveforms/project_{project.id}_peaks.json")
    paths.append(f"uploads/json_originals/project_{project.id}_original.json")

    for p in paths:
        try:
            if os.path.exists(p):
                os.remove(p)
        except OSError:
            pass  # 로깅 권장. 실패해도 삭제 흐름 멈추지 않음.


# ── 강제 삭제 ────────────────────────────────────────────────

def force_delete_workspace(db: Session, workspace_id: int) -> Dict:
    """워크스페이스 + 안의 모든 후손 워크스페이스/프로젝트를 트랜잭션 내 강제 삭제.

    1. 후손 워크스페이스 ID들을 depth DESC(leaf-first)로 수집
    2. 각 워크스페이스에 대해:
       - 그 안의 프로젝트들의 파일 정리 + DB 삭제 (Subtitle/EditHistory CASCADE)
       - 워크스페이스 자체 삭제 (UserWorkspacePermission CASCADE)
    3. 단일 트랜잭션 → 중간 실패 시 롤백

    Returns: {'deleted_workspaces': int, 'deleted_projects': int}
    """
    target = db.query(Workspace).get(workspace_id)
    if target is None:
        raise HTTPException(404, "워크스페이스를 찾을 수 없습니다")

    sql = text(
        """
        WITH RECURSIVE descendants AS (
            SELECT id, depth FROM workspaces WHERE id = :ws_id
            UNION ALL
            SELECT w.id, w.depth
              FROM workspaces w
              JOIN descendants d ON w.parent_id = d.id
        )
        SELECT id FROM descendants ORDER BY depth DESC
        """
    )
    rows = db.execute(sql, {"ws_id": workspace_id}).all()
    workspace_ids_in_order = [r[0] for r in rows]  # 깊은 것부터(leaf-first)

    deleted_workspaces = 0
    deleted_projects = 0

    try:
        for ws_id in workspace_ids_in_order:
            # 1) 이 워크스페이스 직속 프로젝트들 파일 정리 + 삭제
            projects = (
                db.query(Project).filter(Project.workspace_id == ws_id).all()
            )
            for p in projects:
                cleanup_project_files(p)
                db.delete(p)  # Subtitle/EditHistory CASCADE
                deleted_projects += 1
            db.flush()

            # 2) 워크스페이스 자체 삭제 (UserWorkspacePermission CASCADE)
            db.query(Workspace).filter(Workspace.id == ws_id).delete()
            deleted_workspaces += 1
            db.flush()

        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "deleted_workspaces": deleted_workspaces,
        "deleted_projects": deleted_projects,
    }