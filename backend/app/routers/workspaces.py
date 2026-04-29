"""
backend/app/routers/workspaces.py

워크스페이스 트리 CRUD + 통계 + 강제 삭제.
명세 v8.3 PART 1 ACT-B03 / PART 4 참조.
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Workspace
from app.schemas import WorkspaceCreate, WorkspaceUpdate
from app.services.auth import get_current_user, require_role
from app.services.permission_service import (
    get_accessible_workspace_ids, can_access_workspace,
)
from app.services.workspace_service import (
    compute_depth, generate_unique_name,
    list_workspaces_flat, get_workspace_stats, count_workspace_contents,
    force_delete_workspace,
)

router = APIRouter()


def _dt_str(dt):
    return dt.isoformat() if dt else None


def _to_response(db: Session, ws: Workspace, with_stats: bool = False) -> dict:
    """Workspace ORM → 응답 dict. with_stats=True면 재귀 통계 포함(관리자용)."""
    creator_name = None
    if ws.created_by is not None:
        creator = db.query(User).get(ws.created_by)
        creator_name = creator.display_name if creator else None

    payload = {
        "id": ws.id,
        "name": ws.name,
        "parent_id": ws.parent_id,
        "depth": ws.depth,
        "created_by": ws.created_by,
        "created_by_name": creator_name,
        "created_at": _dt_str(ws.created_at),
        "updated_at": _dt_str(ws.updated_at),
        "stats": None,
    }
    if with_stats:
        payload["stats"] = get_workspace_stats(db, ws.id)
    return payload


# ── 조회 ──────────────────────────────────────────────────────

@router.get("")
def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """워크스페이스 평탄 리스트 조회.

    - master/manager: 전체 + stats 포함
    - worker: 권한 트리(가상 루트 + 후손)만, stats 미포함 (가시성 정책)
    """
    accessible = get_accessible_workspace_ids(db, current_user)
    workspaces = list_workspaces_flat(db, accessible)
    is_admin = current_user.role in ("master", "manager")
    return [_to_response(db, ws, with_stats=is_admin) for ws in workspaces]


@router.get("/{ws_id}")
def get_workspace(
    ws_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """단건 상세."""
    if not can_access_workspace(db, current_user, ws_id):
        raise HTTPException(403, "이 워크스페이스에 접근할 수 없습니다")
    ws = db.query(Workspace).get(ws_id)
    if ws is None:
        raise HTTPException(404, "워크스페이스를 찾을 수 없습니다")
    is_admin = current_user.role in ("master", "manager")
    return _to_response(db, ws, with_stats=is_admin)


@router.get("/{ws_id}/stats")
def get_stats(
    ws_id: int,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """워크스페이스 통계 (관리자만). 재귀 합산."""
    ws = db.query(Workspace).get(ws_id)
    if ws is None:
        raise HTTPException(404, "워크스페이스를 찾을 수 없습니다")
    return get_workspace_stats(db, ws_id)


# ── 생성/수정/삭제 (master/manager) ────────────────────────

@router.post("", status_code=201)
def create_workspace(
    data: WorkspaceCreate,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """워크스페이스 생성.

    - depth는 서버에서 자동 계산 (parent.depth + 1, 또는 parent_id None이면 1)
    - parent.depth가 이미 3이면 400 (depth 3 안에는 워크스페이스 못 만듦)
    - 같은 부모 아래 이름 중복 시 자동 번호 부여 ("드라마" → "드라마_2" → ...)
    """
    depth = compute_depth(db, data.parent_id)
    unique_name = generate_unique_name(db, data.parent_id, data.name)

    ws = Workspace(
        name=unique_name,
        parent_id=data.parent_id,
        depth=depth,
        created_by=current_user.id,
    )
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return _to_response(db, ws, with_stats=True)


@router.patch("/{ws_id}")
def rename_workspace(
    ws_id: int,
    data: WorkspaceUpdate,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """이름 변경만 지원 (v1). 부모 변경/이동은 미지원.

    같은 부모 아래 이름 중복 시 자동 번호 부여.
    """
    ws = db.query(Workspace).get(ws_id)
    if ws is None:
        raise HTTPException(404, "워크스페이스를 찾을 수 없습니다")
    if data.name is not None:
        ws.name = generate_unique_name(db, ws.parent_id, data.name, exclude_id=ws.id)
    db.commit()
    db.refresh(ws)
    return _to_response(db, ws, with_stats=True)


@router.delete("/{ws_id}")
def delete_workspace(
    ws_id: int,
    force: bool = Query(False),
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """워크스페이스 삭제.

    - 비어있으면 즉시 삭제
    - 비어있지 않고 force=false → 409 + 카운트 안내 (`{"error": "not_empty", "workspace_count": ..., "project_count": ..., "subtitle_count": ...}`)
    - force=true → 트랜잭션 내 leaf-first 강제 삭제 (안의 워크스페이스/프로젝트/자막 모두 삭제 + 파일 정리)
    """
    ws = db.query(Workspace).get(ws_id)
    if ws is None:
        raise HTTPException(404, "워크스페이스를 찾을 수 없습니다")

    counts = count_workspace_contents(db, ws_id)
    is_empty = counts["workspace_count"] == 0 and counts["project_count"] == 0

    if is_empty:
        return force_delete_workspace(db, ws_id)

    if not force:
        raise HTTPException(
            status_code=409,
            detail={"error": "not_empty", **counts},
        )

    return force_delete_workspace(db, ws_id)