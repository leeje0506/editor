"""
backend/app/routers/settings.py
방송사 규칙 CRUD (DB 기반)
"""
from __future__ import annotations
from typing import Dict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import BroadcasterRule

router = APIRouter()

# 초기 기본값 (DB에 아무것도 없을 때 시딩용)
DEFAULT_RULES = {
    "TVING": {"max_lines": 2, "max_chars_per_line": 20, "bracket_chars": 5},
    "LGHV": {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5},
    "SKBB": {"max_lines": 1, "max_chars_per_line": 20, "bracket_chars": 5},
    "JTBC": {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5},
    "DLIV": {"max_lines": 3, "max_chars_per_line": 17, "bracket_chars": 5},
    "자유작업": {"max_lines": 99, "max_chars_per_line": 999, "bracket_chars": 0},
}


def seed_defaults(db: Session) -> None:
    """DB에 방송사 규칙이 없으면 기본값 시딩"""
    if db.query(BroadcasterRule).count() == 0:
        for name, r in DEFAULT_RULES.items():
            db.add(BroadcasterRule(
                name=name,
                max_lines=r["max_lines"],
                max_chars_per_line=r["max_chars_per_line"],
                bracket_chars=r["bracket_chars"],
            ))
        db.commit()


def load_rules(db: Session = None) -> dict:
    """DB에서 방송사 규칙 로드. 다른 모듈에서도 호출 가능."""
    close_after = False
    if db is None:
        db = SessionLocal()
        close_after = True
    try:
        seed_defaults(db)
        rules = {}
        for r in db.query(BroadcasterRule).filter(BroadcasterRule.is_active == True).all():
            rules[r.name] = {
                "max_lines": r.max_lines,
                "max_chars_per_line": r.max_chars_per_line,
                "bracket_chars": r.bracket_chars,
            }
        return rules
    finally:
        if close_after:
            db.close()


@router.get("/broadcaster-rules")
def get_broadcaster_rules(db: Session = Depends(get_db)):
    """방송사 규칙 전체 조회"""
    seed_defaults(db)
    rules = {}
    for r in db.query(BroadcasterRule).filter(BroadcasterRule.is_active == True).all():
        rules[r.name] = {
            "max_lines": r.max_lines,
            "max_chars_per_line": r.max_chars_per_line,
            "bracket_chars": r.bracket_chars,
        }
    return rules


@router.put("/broadcaster-rules")
def save_broadcaster_rules(rules: Dict[str, dict], db: Session = Depends(get_db)):
    """방송사 규칙 전체 덮어쓰기 (추가/수정/삭제 반영)"""
    # 기존 규칙 모두 비활성화
    db.query(BroadcasterRule).update({"is_active": False})

    for name, r in rules.items():
        existing = db.query(BroadcasterRule).filter(BroadcasterRule.name == name).first()
        if existing:
            existing.max_lines = int(r.get("max_lines", 2))
            existing.max_chars_per_line = int(r.get("max_chars_per_line", 18))
            existing.bracket_chars = int(r.get("bracket_chars", 5))
            existing.is_active = True
        else:
            db.add(BroadcasterRule(
                name=name,
                max_lines=int(r.get("max_lines", 2)),
                max_chars_per_line=int(r.get("max_chars_per_line", 18)),
                bracket_chars=int(r.get("bracket_chars", 5)),
                is_active=True,
            ))

    db.commit()

    # 저장 후 최신 데이터 반환
    result = {}
    for row in db.query(BroadcasterRule).filter(BroadcasterRule.is_active == True).all():
        result[row.name] = {
            "max_lines": row.max_lines,
            "max_chars_per_line": row.max_chars_per_line,
            "bracket_chars": row.bracket_chars,
        }
    return result