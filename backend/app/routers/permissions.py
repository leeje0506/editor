"""
backend/app/routers/permissions.py

워크스페이스 단위 권한 관리.
v8.3에서 방송사 권한 시스템 폐기, 워크스페이스 권한으로 대체.
권한 요청 흐름은 v1에서 미지원 (관리자 일방 부여만, v2 검토).

명세 v8.3 PART 1 ACT-B02 / PART 4 참조.
"""
from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Workspace, UserWorkspacePermission
from app.schemas import WorkspacePermissionGrant, WorkspacePermissionBulkGrant
from app.services.auth import get_current_user, require_role
from app.services.permission_service import get_direct_permissions, to_workspace_brief

router = APIRouter()


# ── Schemas ──

class WorkspacePermissionRevoke(BaseModel):
    user_id: int
    workspace_id: int


# ── 헬퍼 ──

def _dt_str(dt):
    return dt.isoformat() if dt else None


def _perm_to_dict(p: UserWorkspacePermission, db: Session) -> dict:
    """권한 row → 응답 dict (granter 정보 포함)."""
    granter = db.query(User).get(p.granted_by) if p.granted_by else None
    return {
        "id": p.id,
        "user_id": p.user_id,
        "workspace": to_workspace_brief(p.workspace) if p.workspace else None,
        "granted_by": p.granted_by,
        "granted_by_name": granter.display_name if granter else None,
        "created_at": _dt_str(p.created_at),
    }


# ══════════════════════════════════════
# 1. 권한 조회
# ══════════════════════════════════════

@router.get("/me")
def get_my_permissions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """내 워크스페이스 권한 목록 (직접 부여 받은 노드만)."""
    perms = get_direct_permissions(db, current_user)
    return [_perm_to_dict(p, db) for p in perms]


@router.get("/users/{user_id}")
def get_user_permissions(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """특정 사용자의 워크스페이스 권한. worker는 본인 것만 조회 가능."""
    if current_user.role == "worker" and current_user.id != user_id:
        raise HTTPException(403, "본인의 권한만 조회할 수 있습니다")

    perms = (
        db.query(UserWorkspacePermission)
          .filter(UserWorkspacePermission.user_id == user_id)
          .all()
    )
    return [_perm_to_dict(p, db) for p in perms]


@router.get("/all")
def get_all_permissions(
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """전체 사용자의 워크스페이스 권한 (관리자용). user_id별 그룹핑."""
    perms = db.query(UserWorkspacePermission).all()

    result = {}
    for p in perms:
        uid = p.user_id
        if uid not in result:
            user = db.query(User).get(uid)
            result[uid] = {
                "user_id": uid,
                "user_name": user.display_name if user else None,
                "role": user.role if user else None,
                "workspaces": [],
            }
        if p.workspace:
            result[uid]["workspaces"].append(to_workspace_brief(p.workspace))

    return list(result.values())


# ══════════════════════════════════════
# 2. 권한 부여 / 해제 (master/manager)
# ══════════════════════════════════════

@router.post("/grant")
def grant_permission(
    data: WorkspacePermissionGrant,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """워크스페이스 권한 단건 부여.

    중복 부여 허용 정책: 같은 (user, workspace) 쌍만 막음.
    [A-1]과 [A-1-1]은 동시에 부여 가능.
    """
    user = db.query(User).get(data.user_id)
    if not user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")

    ws = db.query(Workspace).get(data.workspace_id)
    if not ws:
        raise HTTPException(404, "워크스페이스를 찾을 수 없습니다")

    # 같은 쌍 중복 체크
    existing = db.query(UserWorkspacePermission).filter(
        UserWorkspacePermission.user_id == data.user_id,
        UserWorkspacePermission.workspace_id == data.workspace_id,
    ).first()
    if existing:
        return {"message": "이미 권한이 있습니다", "already_exists": True}

    perm = UserWorkspacePermission(
        user_id=data.user_id,
        workspace_id=data.workspace_id,
        granted_by=current_user.id,
    )
    db.add(perm)
    db.commit()
    db.refresh(perm)
    return _perm_to_dict(perm, db)


@router.post("/bulk-grant")
def bulk_grant_permissions(
    data: WorkspacePermissionBulkGrant,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """워크스페이스 권한 일괄 설정.

    해당 사용자의 기존 권한을 전체 삭제하고 workspace_ids 목록으로 교체.
    존재하지 않는 워크스페이스 ID는 무시 (silent skip).
    """
    user = db.query(User).get(data.user_id)
    if not user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")

    # 기존 권한 전체 삭제
    db.query(UserWorkspacePermission).filter(
        UserWorkspacePermission.user_id == data.user_id
    ).delete(synchronize_session=False)

    # 새 권한 부여 (존재하는 워크스페이스만)
    added: List[dict] = []
    for ws_id in data.workspace_ids:
        ws = db.query(Workspace).get(ws_id)
        if not ws:
            continue
        perm = UserWorkspacePermission(
            user_id=data.user_id,
            workspace_id=ws_id,
            granted_by=current_user.id,
        )
        db.add(perm)
        added.append(to_workspace_brief(ws))

    db.commit()
    return {"user_id": data.user_id, "workspaces": added}


@router.post("/revoke")
def revoke_permission(
    data: WorkspacePermissionRevoke,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """워크스페이스 권한 단건 해제.

    중복 부여 정책상 같은 사용자가 [A-1]과 [A-1-1]을 동시 보유할 수 있는데,
    이 함수는 단일 (user, workspace) 쌍만 정확히 해제. 다른 권한은 영향 없음.
    """
    deleted = db.query(UserWorkspacePermission).filter(
        UserWorkspacePermission.user_id == data.user_id,
        UserWorkspacePermission.workspace_id == data.workspace_id,
    ).delete(synchronize_session=False)

    if not deleted:
        raise HTTPException(404, "해당 권한을 찾을 수 없습니다")

    db.commit()
    return {"message": "권한이 해제되었습니다"}