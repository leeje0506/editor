"""
backend/app/routers/auth.py
"""
from __future__ import annotations

import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, UserCreate, UserUpdate, UserResponse, MyProfileUpdate
from app.services.auth import (
    hash_password, verify_password, create_token,
    get_current_user, require_role,
)

router = APIRouter()


def _dt_str(dt):
    return dt.isoformat() if dt else None


# ── 로그인 ──

@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(400, "아이디 또는 비밀번호가 올바르지 않습니다")
    if not user.is_active:
        raise HTTPException(400, "비활성화된 계정입니다")
    token = create_token(user.id, user.role)
    return {
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
        },
    }


# ── 내 정보 ──

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "display_name": current_user.display_name,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "created_at": _dt_str(current_user.created_at),
    }


@router.patch("/me", response_model=UserResponse)
def update_me(data: MyProfileUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.display_name is not None:
        current_user.display_name = data.display_name
    if data.new_password:
        if not data.current_password or not verify_password(data.current_password, current_user.password_hash):
            raise HTTPException(400, "현재 비밀번호가 올바르지 않습니다")
        current_user.password_hash = hash_password(data.new_password)
    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "username": current_user.username,
        "display_name": current_user.display_name,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "created_at": _dt_str(current_user.created_at),
    }


# ── 개인 설정 (단축키 등) ──

@router.get("/me/settings")
def get_my_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """개인 설정 조회 (단축키 등)"""
    if current_user.settings:
        try:
            return json.loads(current_user.settings)
        except (json.JSONDecodeError, TypeError):
            return {}
    return {}


@router.put("/me/settings")
def update_my_settings(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """개인 설정 저장 (전체 덮어쓰기)"""
    current_user.settings = json.dumps(body, ensure_ascii=False)
    db.commit()
    db.refresh(current_user)
    try:
        return json.loads(current_user.settings)
    except (json.JSONDecodeError, TypeError):
        return {}


# ── 멤버 관리 (master/manager) ──

@router.get("/users", response_model=List[UserResponse])
def list_users(
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    return [
        {
            "id": u.id, "username": u.username, "display_name": u.display_name,
            "role": u.role, "is_active": u.is_active, "created_at": _dt_str(u.created_at),
        }
        for u in db.query(User).order_by(User.created_at.desc()).all()
    ]


@router.post("/users", response_model=UserResponse, status_code=201)
def create_user(
    data: UserCreate,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    if current_user.role == "manager" and data.role != "worker":
        raise HTTPException(403, "관리자는 작업자만 생성할 수 있습니다")
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(409, "이미 사용 중인 아이디입니다")
    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        display_name=data.display_name,
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id, "username": user.username, "display_name": user.display_name,
        "role": user.role, "is_active": user.is_active, "created_at": _dt_str(user.created_at),
    }


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdate,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if data.display_name is not None:
        user.display_name = data.display_name
    if data.role is not None:
        if current_user.role == "manager" and data.role != "worker":
            raise HTTPException(403, "관리자는 역할을 worker로만 변경할 수 있습니다")
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    db.commit()
    db.refresh(user)
    return {
        "id": user.id, "username": user.username, "display_name": user.display_name,
        "role": user.role, "is_active": user.is_active, "created_at": _dt_str(user.created_at),
    }


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(404)
    user.is_active = False
    db.commit()


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    current_user: User = Depends(require_role(["master", "manager"])),
    db: Session = Depends(get_db),
):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(404)
    temp_pw = "temp1234"
    user.password_hash = hash_password(temp_pw)
    db.commit()
    return {"message": f"비밀번호가 '{temp_pw}'로 초기화되었습니다"}