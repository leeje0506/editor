"""
backend/app/services/subtitle_service.py
Python 3.9 호환

글자수 카운트:
- 원래 글자수 = 텍스트 그대로 (공백 제외). 효과음이면 [] 포함.
- 실제 사용 가능 글자수 = max_chars_per_line - bracket_chars (화자가 있을 때)
  bracket_chars는 "(화자) " 자리 예약 글자수 (방송사별 설정)
"""
from __future__ import annotations
from typing import List, Dict, Tuple
import re
from sqlalchemy.orm import Session
from app.models import Subtitle, Project, EditHistory


def count_text_chars(text: str) -> int:
    """텍스트 글자수 카운트. 공백 제외, 나머지 모든 문자 포함 ([], () 등)"""
    return len(text.replace(" ", "").replace("\t", ""))


def validate_subtitle(sub: Subtitle, project: Project) -> str:
    """
    검수 로직:
    - 줄당 글자수 체크: 화자가 있으면 bracket_chars만큼 차감한 한도로 비교
    - 효과음이면 [] 포함하여 센다
    """
    errors: List[str] = []
    lines = sub.text.split("\n")
    
    for line in lines:
        char_count = count_text_chars(line)
        max_allowed = project.max_chars_per_line
        
        # 화자가 있으면 괄호 예약분 차감
        if sub.speaker:
            max_allowed = project.max_chars_per_line - (project.bracket_chars or 0)
        
        if char_count > max_allowed:
            errors.append("글자초과")
            break
    
    if len(lines) > project.max_lines:
        errors.append("줄초과")
    if sub.end_ms <= sub.start_ms:
        errors.append("시간오류")
    return errors[0] if errors else ""


def resequence_and_validate(db: Session, project_id: int) -> List[Subtitle]:
    project = db.query(Project).get(project_id)
    subs = (
        db.query(Subtitle)
        .filter(Subtitle.project_id == project_id)
        .order_by(Subtitle.start_ms, Subtitle.id)
        .all()
    )
    for i, sub in enumerate(subs, start=1):
        sub.seq = i
        sub.error = validate_subtitle(sub, project)
    db.commit()
    for sub in subs:
        db.refresh(sub)
    return subs


def save_snapshot(db: Session, project_id: int, action: str) -> None:
    subs = (
        db.query(Subtitle)
        .filter(Subtitle.project_id == project_id)
        .order_by(Subtitle.seq)
        .all()
    )
    snapshot = [
        {
            "id": s.id, "seq": s.seq, "start_ms": s.start_ms, "end_ms": s.end_ms,
            "type": s.type, "speaker": s.speaker, "speaker_pos": s.speaker_pos,
            "text_pos": s.text_pos, "text": s.text,
        }
        for s in subs
    ]
    db.add(EditHistory(project_id=project_id, action=action, snapshot=snapshot))
    db.commit()


def restore_snapshot(db: Session, project_id: int, snapshot: List[Dict]) -> List[Subtitle]:
    db.query(Subtitle).filter(Subtitle.project_id == project_id).delete()
    db.flush()
    for item in snapshot:
        db.add(Subtitle(
            project_id=project_id, start_ms=item["start_ms"], end_ms=item["end_ms"],
            type=item["type"], speaker=item["speaker"], speaker_pos=item["speaker_pos"],
            text_pos=item["text_pos"], text=item["text"],
        ))
    db.commit()
    return resequence_and_validate(db, project_id)


def smart_split_text(text: str) -> Tuple[str, str]:
    """텍스트를 절반 지점에서 스마트 분할. 공백 기준."""
    if not text:
        return ("", "")
    mid = len(text) // 2
    if mid < len(text) and text[mid] == " ":
        return (text[:mid].rstrip(), text[mid + 1:].lstrip())
    left = text.rfind(" ", 0, mid)
    right = text.find(" ", mid)
    if left == -1 and right == -1:
        return (text[:mid], text[mid:])
    if left == -1:
        split_pos = right
    elif right == -1:
        split_pos = left
    else:
        split_pos = left if (mid - left) <= (right - mid) else right
    return (text[:split_pos].rstrip(), text[split_pos + 1:].lstrip())


def parse_srt(content: str) -> List[Dict]:
    blocks = re.split(r"\n\s*\n", content.strip())
    results: List[Dict] = []
    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 3:
            continue
        time_match = re.match(
            r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*"
            r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})",
            lines[1],
        )
        if not time_match:
            continue
        g = time_match.groups()
        start_ms = int(g[0]) * 3600000 + int(g[1]) * 60000 + int(g[2]) * 1000 + int(g[3])
        end_ms = int(g[4]) * 3600000 + int(g[5]) * 60000 + int(g[6]) * 1000 + int(g[7])
        text = "\n".join(lines[2:])

        text_pos = "default"
        if "{\\an8}" in text:
            text_pos = "top"
            text = text.replace("{\\an8}", "").strip()

        # 태그 제거 (UI에서는 보이지 않음)
        text = re.sub(r"\{\\ㅅ\}", "", text)
        text = re.sub(r"\{\\}", "", text)
        text = re.sub(r"\{/an8\}", "", text)
        text = text.strip()

        speaker = ""
        speaker_match = re.match(r"^\(([^)]+)\)\s*", text)
        if speaker_match:
            speaker = speaker_match.group(1)
            text = text[speaker_match.end():]

        sub_type = "dialogue"
        if re.match(r"^\[.*\]$", text.strip()):
            sub_type = "effect"

        results.append({
            "start_ms": start_ms, "end_ms": end_ms, "type": sub_type,
            "speaker": speaker, "speaker_pos": "default",
            "text_pos": text_pos, "text": text,
        })
    return results


def export_srt(subtitles: List[Subtitle]) -> str:
    out: List[str] = []
    for sub in subtitles:
        out.append(str(sub.seq))

        def fmt(ms: int) -> str:
            h, r = divmod(ms, 3600000)
            m, r = divmod(r, 60000)
            s, mil = divmod(r, 1000)
            return f"{h:02d}:{m:02d}:{s:02d},{mil:03d}"

        out.append(f"{fmt(sub.start_ms)} --> {fmt(sub.end_ms)}")

        parts = []
        if sub.text_pos == "top":
            parts.append("{\\an8}")
        if sub.speaker:
            parts.append(f"({sub.speaker}{{\\}})")
        if sub.type == "effect":
            parts.append(f"{sub.text}{{\\}}")
        else:
            parts.append(f"{sub.text}{{\\}}")
        out.append("".join(parts))
        out.append("")
    return "\n".join(out)