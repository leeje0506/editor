"""
backend/app/services/permission_service.py

워크스페이스 권한 트리 전개 + 접근 권한 체크.

- worker는 직접 부여받은 워크스페이스 노드 + 그 후손 모두에 접근 가능
- master/manager는 전체 접근 (권한 체크 면제)
- 권한 트리 전개는 재귀 CTE 사용 (PostgreSQL/SQLite 양쪽 표준 지원)
- depth 1~3 고정이라 재귀 깊이 최대 2 → 빠름

명세 v8.3 PART 1 ACT-B02 참조.
"""
from __future__ import annotations
from typing import Optional, Set, List

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import User, Project, Workspace, UserWorkspacePermission


def get_accessible_workspace_ids(db: Session, user: User) -> Optional[Set[int]]:
    """worker가 접근 가능한 모든 워크스페이스 id를 set으로 반환.

    - master/manager → None 반환 (= "전체 접근" 신호. 호출 측에서 필터 미적용)
    - worker → 직접 권한받은 노드 + 그 후손 모두 (재귀 CTE 전개)
    - 권한이 하나도 없는 worker → 빈 set 반환
    """
    if user.role in ("master", "manager"):
        return None

    sql = text(
        """
        WITH RECURSIVE accessible AS (
            SELECT w.id
              FROM workspaces w
              JOIN user_workspace_permissions p ON p.workspace_id = w.id
             WHERE p.user_id = :uid
            UNION ALL
            SELECT w.id
              FROM workspaces w
              JOIN accessible a ON w.parent_id = a.id
        )
        SELECT id FROM accessible
        """
    )
    rows = db.execute(sql, {"uid": user.id}).all()
    return {r[0] for r in rows}


def can_access_workspace(db: Session, user: User, workspace_id: int) -> bool:
    """단일 워크스페이스 접근 가능 여부.

    master/manager는 항상 True. worker는 권한 트리 안이어야 True.
    """
    if user.role in ("master", "manager"):
        return True
    accessible = get_accessible_workspace_ids(db, user)
    if accessible is None:
        return True  # 안전장치 (실제론 위 분기에서 처리됨)
    return workspace_id in accessible


def can_access_project(db: Session, user: User, project: Project) -> bool:
    """프로젝트 접근 가능 여부 (워크스페이스 권한 + ownership 결합).

    - master/manager → 항상 True (검수용 진입 포함)
    - worker → 워크스페이스 권한 있음 AND 본인이 담당자
        담당자 판정:
          - assigned_to가 명시되어 있으면 → assigned_to == me
          - assigned_to가 null이면 → created_by == me (생성자 = 기본 담당자)
        담당자가 다른 사람으로 변경되면 즉시 접근 불가.
    """
    if user.role in ("master", "manager"):
        return True
    if not can_access_workspace(db, user, project.workspace_id):
        return False
    if project.assigned_to is not None:
        return project.assigned_to == user.id
    return project.created_by == user.id


def get_direct_permissions(db: Session, user: User) -> List[UserWorkspacePermission]:
    """사용자가 직접 부여받은 워크스페이스 권한 row 목록 (재귀 X).

    UserResponse.workspace_permissions 응답 채울 때 사용.
    """
    return (
        db.query(UserWorkspacePermission)
          .filter(UserWorkspacePermission.user_id == user.id)
          .all()
    )


def to_workspace_brief(ws: Workspace) -> dict:
    """Workspace ORM → 응답용 brief dict (id/name/depth/parent_id).

    UserResponse.workspace_permissions, 권한 라우터 응답 등에서 공통 사용.
    schemas.WorkspaceBrief와 같은 형태.
    """
    return {
        "id": ws.id,
        "name": ws.name,
        "depth": ws.depth,
        "parent_id": ws.parent_id,
    }