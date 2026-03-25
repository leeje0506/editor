"""
backend/app/routers/settings.py
방송사 규칙 저장/조회 (JSON 파일 기반)
"""
from __future__ import annotations

import json
import os
from fastapi import APIRouter

router = APIRouter()

RULES_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "broadcaster_rules.json")

DEFAULT_RULES = {
    "TVING": {"max_lines": 2, "max_chars_per_line": 20, "bracket_chars": 5},
    "LGHV": {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5},
    "SKBB": {"max_lines": 1, "max_chars_per_line": 20, "bracket_chars": 5},
    "JTBC": {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5},
    "KBS": {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5},
    "자유작업": {"max_lines": 99, "max_chars_per_line": 999, "bracket_chars": 0},
}


def load_rules() -> dict:
    """JSON 파일에서 방송사 규칙 로드. 없으면 기본값 생성."""
    if os.path.exists(RULES_FILE):
        try:
            with open(RULES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    # 기본값 파일 생성
    _save_rules(DEFAULT_RULES)
    return DEFAULT_RULES


def _save_rules(rules: dict) -> None:
    """JSON 파일에 방송사 규칙 저장."""
    with open(RULES_FILE, "w", encoding="utf-8") as f:
        json.dump(rules, f, ensure_ascii=False, indent=2)


@router.get("/broadcaster-rules")
def get_broadcaster_rules():
    """방송사 규칙 전체 조회"""
    return load_rules()


@router.put("/broadcaster-rules")
def save_broadcaster_rules(rules: dict):
    """방송사 규칙 전체 덮어쓰기"""
    # 각 항목 유효성 검증
    validated = {}
    for name, r in rules.items():
        validated[name] = {
            "max_lines": int(r.get("max_lines", 2)),
            "max_chars_per_line": int(r.get("max_chars_per_line", 18)),
            "bracket_chars": int(r.get("bracket_chars", 5)),
        }
    _save_rules(validated)
    return validated