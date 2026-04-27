"""
backend/app/routers/permissions.py
방송사 권한 관리 + 권한 요청 API
"""
from __future__ import annotations
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, UserBroadcasterPermission, PermissionRequest, BroadcasterRule
from app.services.auth import get_current_user, require_role

router = APIRouter()


# ── Schemas ──

class PermissionGrant(BaseModel):
    user_id: int
    broadcaster: str

class PermissionRevoke(BaseModel):
    user_id: int
    broadcaster: str

class PermissionBulkGrant(BaseModel):
    user_id: int
    broadcasters: List[str]

class PermissionRequestCreate(BaseModel):
    broadcaster: str
    reason: Optional[str] = None

class PermissionRequestReview(BaseModel):
    status: str  # approved / rejected


# ── 헬퍼 ──

def _dt_str(dt):
    return dt.isoformat() if dt else None

def _perm_to_dict(p: UserBroadcasterPermission, db: Session) -> dict:
    granter = db.query(User).get(p.granted_by) if p.granted_by else None
    return {
        "id": p.id,
        "user_id": p.user_id,
        "broadcaster": p.broadcaster,
        "granted_by": p.granted_by,
        "granted_by_name": granter.display_name if granter else None,
        "created_at": _dt_str(p.created_at),
    }

def _request_to_dict(r: PermissionRequest, db: Session) -> dict:
    user = db.query(User).get(r.user_id)
    reviewer = db.query(User).get(r.reviewed_by) if r.reviewed_by else None
    return {
        "id": r.id,
        "user_id": r.user_id,
        "user_name": user.display_name if user else None,
        "broadcaster": r.broadcaster,
        "status": r.status,
        "reason": r.reason,
        "reviewed_by": r.reviewed_by,
        "reviewed_by_name": reviewer.display_name if reviewer else None,
        "reviewed_at": _dt_str(r.reviewed_at),
        "created_at": _dt_str(r.created_at),
    }


# ══════════════════════════════════════
# 1. 권한 조회
# ══════════════════════════════════════

@router.get("/users/{user_id}")
def get_user_permissions(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """특정 사용자의 방송사 권한 목록"""
    # worker는 본인 것만 조회 가능
    if current_user.role == "worker" and current_user.id != user_id:
        raise HTTPException(403, "본인의 권한만 조회할 수 있습니다")

    perms = db.query(UserBroadcasterPermission).filter(
        UserBroadcasterPermission.user_id == user_id
    ).all()
    return [_perm_to_dict(p, db) for p in perms]


@router.get("/me")
def get_my_permissions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """내 방송사 권한 목록"""
    perms = db.query(UserBroadcasterPermission).filter(
        UserBroadcasterPermission.user_id == current_user.id
    ).all()
    return [p.broadcaster for p in perms]


@router.get("/all")
def get_all_permissions(
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """전체 사용자의 방송사 권한 (관리자용)"""
    perms = db.query(UserBroadcasterPermission).all()

    # user_id별로 그룹핑
    result = {}
    for p in perms:
        uid = p.user_id
        if uid not in result:
            user = db.query(User).get(uid)
            result[uid] = {
                "user_id": uid,
                "user_name": user.display_name if user else None,
                "role": user.role if user else None,
                "broadcasters": [],
            }
        result[uid]["broadcasters"].append(p.broadcaster)

    return list(result.values())


# ══════════════════════════════════════
# 2. 권한 부여 / 해제 (관리자)
# ══════════════════════════════════════

@router.post("/grant")
def grant_permission(
    data: PermissionGrant,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """방송사 권한 부여 (단건)"""
    # 방송사 존재 확인
    rule = db.query(BroadcasterRule).filter(
        BroadcasterRule.name == data.broadcaster,
        BroadcasterRule.is_active == True,
    ).first()
    if not rule:
        raise HTTPException(404, f"방송사 '{data.broadcaster}'를 찾을 수 없습니다")

    # 대상 사용자 확인
    user = db.query(User).get(data.user_id)
    if not user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")

    # 중복 체크
    existing = db.query(UserBroadcasterPermission).filter(
        UserBroadcasterPermission.user_id == data.user_id,
        UserBroadcasterPermission.broadcaster == data.broadcaster,
    ).first()
    if existing:
        return {"message": "이미 권한이 있습니다", "already_exists": True}

    perm = UserBroadcasterPermission(
        user_id=data.user_id,
        broadcaster=data.broadcaster,
        granted_by=current_user.id,
    )
    db.add(perm)
    db.commit()
    db.refresh(perm)
    return _perm_to_dict(perm, db)


@router.post("/bulk-grant")
def bulk_grant_permissions(
    data: PermissionBulkGrant,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """방송사 권한 일괄 설정 (해당 사용자의 권한을 broadcasters 리스트로 교체)"""
    user = db.query(User).get(data.user_id)
    if not user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")

    # 기존 권한 전체 삭제
    db.query(UserBroadcasterPermission).filter(
        UserBroadcasterPermission.user_id == data.user_id
    ).delete(synchronize_session=False)

    # 새 권한 부여
    added = []
    for bc in data.broadcasters:
        rule = db.query(BroadcasterRule).filter(
            BroadcasterRule.name == bc,
            BroadcasterRule.is_active == True,
        ).first()
        if not rule:
            continue
        perm = UserBroadcasterPermission(
            user_id=data.user_id,
            broadcaster=bc,
            granted_by=current_user.id,
        )
        db.add(perm)
        added.append(bc)

    db.commit()
    return {"user_id": data.user_id, "broadcasters": added}


@router.post("/revoke")
def revoke_permission(
    data: PermissionRevoke,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """방송사 권한 해제"""
    deleted = db.query(UserBroadcasterPermission).filter(
        UserBroadcasterPermission.user_id == data.user_id,
        UserBroadcasterPermission.broadcaster == data.broadcaster,
    ).delete(synchronize_session=False)

    if not deleted:
        raise HTTPException(404, "해당 권한을 찾을 수 없습니다")

    db.commit()
    return {"message": "권한이 해제되었습니다"}


# ══════════════════════════════════════
# 3. 권한 요청 (작업자)
# ══════════════════════════════════════

@router.post("/requests")
def create_permission_request(
    data: PermissionRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """방송사 권한 요청"""
    # 이미 권한 있는지 확인
    existing_perm = db.query(UserBroadcasterPermission).filter(
        UserBroadcasterPermission.user_id == current_user.id,
        UserBroadcasterPermission.broadcaster == data.broadcaster,
    ).first()
    if existing_perm:
        raise HTTPException(400, "이미 해당 방송사 권한이 있습니다")

    # 이미 대기 중인 요청 있는지
    pending = db.query(PermissionRequest).filter(
        PermissionRequest.user_id == current_user.id,
        PermissionRequest.broadcaster == data.broadcaster,
        PermissionRequest.status == "pending",
    ).first()
    if pending:
        raise HTTPException(400, "이미 대기 중인 요청이 있습니다")

    req = PermissionRequest(
        user_id=current_user.id,
        broadcaster=data.broadcaster,
        reason=data.reason,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _request_to_dict(req, db)


@router.get("/requests")
def list_permission_requests(
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """권한 요청 목록. 관리자: 전체, 작업자: 본인 것만"""
    q = db.query(PermissionRequest)

    if current_user.role == "worker":
        q = q.filter(PermissionRequest.user_id == current_user.id)

    if status:
        q = q.filter(PermissionRequest.status == status)

    requests = q.order_by(PermissionRequest.created_at.desc()).all()
    return [_request_to_dict(r, db) for r in requests]


@router.get("/requests/pending/count")
def pending_request_count(
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """대기 중인 권한 요청 수 (관리자 배지용)"""
    count = db.query(PermissionRequest).filter(
        PermissionRequest.status == "pending"
    ).count()
    return {"count": count}


@router.patch("/requests/{request_id}")
def review_permission_request(
    request_id: int,
    data: PermissionRequestReview,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    """권한 요청 처리 (승인/거절)"""
    req = db.query(PermissionRequest).get(request_id)
    if not req:
        raise HTTPException(404, "요청을 찾을 수 없습니다")
    if req.status != "pending":
        raise HTTPException(400, "이미 처리된 요청입니다")

    if data.status not in ("approved", "rejected"):
        raise HTTPException(400, "status는 approved 또는 rejected만 가능합니다")

    req.status = data.status
    req.reviewed_by = current_user.id
    req.reviewed_at = datetime.now(timezone.utc)

    # 승인이면 실제 권한 부여
    if data.status == "approved":
        existing = db.query(UserBroadcasterPermission).filter(
            UserBroadcasterPermission.user_id == req.user_id,
            UserBroadcasterPermission.broadcaster == req.broadcaster,
        ).first()
        if not existing:
            perm = UserBroadcasterPermission(
                user_id=req.user_id,
                broadcaster=req.broadcaster,
                granted_by=current_user.id,
            )
            db.add(perm)

    db.commit()
    db.refresh(req)
    return _request_to_dict(req, db)