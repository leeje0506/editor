"""
backend/app/services/subtitle_service.py
Python 3.9 호환

글자수 카운트:
- 공백 및 특수기호 포함, 줄바꿈만 제외
- 글자 수 넘었는지 판단: 대사글자수 + 화자예약글자수 > 기준값(max_chars_per_line * max_lines)

Position 체계 (v8 리팩터):
  speaker_pos / text_pos : "default" | "top"   ← 위치만
  speaker_deleted        : bool                ← 화자 삭제 표시
  text_deleted           : bool                ← 대사 삭제 표시
  삭제와 위치는 완전히 독립. 삭제 상태에서도 위치 변경 가능.
  SRT export: speaker_deleted → 화자에 {\\ㅅ}, text_deleted → 대사에 {\\ㅅ}, text_pos=="top" → {\\an8}
"""
from __future__ import annotations
from typing import List, Dict, Tuple
import re
import unicodedata
from sqlalchemy.orm import Session
from app.models import Subtitle, Project, EditHistory, BroadcasterRule


def count_text_chars(text: str) -> int:
    """텍스트 글자수 카운트. 공백 및 특수기호 포함, 줄바꿈만 제외. NFC 정규화 후 카운트."""
    normalized = unicodedata.normalize("NFC", text)
    return len(normalized.replace("\n", ""))


def _get_broadcaster_rule(db: Session, project: Project) -> BroadcasterRule | None:
    """프로젝트의 방송사 규칙 조회"""
    if not project.broadcaster:
        return None
    return db.query(BroadcasterRule).filter(
        BroadcasterRule.name == project.broadcaster,
        BroadcasterRule.is_active == True,
    ).first()


def validate_subtitle(sub: Subtitle, project: Project, min_duration_ms: int = 0) -> str:
    """
    검수 로직:
    - 글자수 체크: 대사글자수 + 화자예약글자수 > 기준값(max_chars_per_line * max_lines)
    - 줄 수 체크
    - 시간 오류 체크
    - 최소 길이 체크
    (오버랩 검수는 resequence_and_validate에서 별도 처리)
    """
    errors: List[str] = []

    # 글자수 체크 — 화자 예약: 화자가 있고 삭제 상태가 아닐 때만
    total_chars = count_text_chars(sub.text)
    speaker_reserved = (len(sub.speaker) + 3) if (sub.speaker and not sub.speaker_deleted) else 0
    line_count = max(1, len(sub.text.split("\n")))
    limit = (project.max_chars_per_line or 18) * line_count

    if total_chars + speaker_reserved > limit:
        errors.append("글자초과")

    lines = sub.text.split("\n")
    if len(lines) > project.max_lines:
        errors.append("줄초과")
    if sub.end_ms <= sub.start_ms:
        errors.append("시간오류")

    # 최소 길이 체크
    duration_ms = sub.end_ms - sub.start_ms
    if min_duration_ms > 0 and duration_ms < min_duration_ms:
        errors.append("최소길이")

    return ",".join(errors) if errors else ""


def resequence_and_validate(db: Session, project_id: int) -> List[Subtitle]:
    project = db.query(Project).get(project_id)
    subs = (
        db.query(Subtitle)
        .filter(Subtitle.project_id == project_id)
        .order_by(Subtitle.start_ms, Subtitle.id)
        .all()
    )

    # 방송사 규칙에서 min_duration_ms 가져오기
    rule = _get_broadcaster_rule(db, project)
    min_duration_ms = rule.min_duration_ms if rule else 0

    # 1단계: 순번 재계산 + 기본 검수 (글자초과/줄초과/시간오류/최소길이)
    for i, sub in enumerate(subs, start=1):
        sub.seq = i
        sub.error = validate_subtitle(sub, project, min_duration_ms)

    # 2단계: 오버랩 검수 (항상 수행 — 허용 여부와 무관하게 표시)
    overlap_ids: set = set()
    for i in range(len(subs)):
        for j in range(i + 1, len(subs)):
            if subs[j].start_ms >= subs[i].end_ms:
                break
            overlap_ids.add(subs[i].id)
            overlap_ids.add(subs[j].id)

    for sub in subs:
        if sub.id in overlap_ids:
            if sub.error:
                sub.error = sub.error + ",오버랩"
            else:
                sub.error = "오버랩"

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
            "type": s.type, "speaker": s.speaker,
            "speaker_pos": s.speaker_pos, "text_pos": s.text_pos,
            "speaker_deleted": s.speaker_deleted, "text_deleted": s.text_deleted,
            "text": s.text,
        }
        for s in subs
    ]
    db.add(EditHistory(project_id=project_id, action=action, snapshot=snapshot))
    db.commit()


def restore_snapshot(db: Session, project_id: int, snapshot: List[Dict]) -> List[Subtitle]:
    # 빈 스냅샷이면 복원 거부 (자막 업로드 이전 상태로 되돌리는 것 방지)
    if not snapshot:
        return (
            db.query(Subtitle)
            .filter(Subtitle.project_id == project_id)
            .order_by(Subtitle.start_ms, Subtitle.id)
            .all()
        )

    db.query(Subtitle).filter(Subtitle.project_id == project_id).delete()
    db.flush()
    for item in snapshot:
        db.add(Subtitle(
            project_id=project_id, start_ms=item["start_ms"], end_ms=item["end_ms"],
            type=item["type"], speaker=item["speaker"],
            speaker_pos=item.get("speaker_pos", "default"),
            text_pos=item.get("text_pos", "default"),
            speaker_deleted=item.get("speaker_deleted", False),
            text_deleted=item.get("text_deleted", False),
            text=item["text"],
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

        # {\an8} → 상단 위치
        text_pos = "default"
        if "{\\an8}" in text:
            text_pos = "top"
            text = text.replace("{\\an8}", "").strip()

        # {\ㅅ} → 삭제 표시 감지
        has_delete_tag = "{\\ㅅ}" in text
        text = re.sub(r"\{\\ㅅ\}", "", text)
        text = re.sub(r"\{\\}", "", text)
        text = re.sub(r"\{/an8\}", "", text)
        text = text.strip()

        # 화자 추출
        speaker = ""
        speaker_match = re.match(r"^\(([^)]+)\)\s*", text)
        if speaker_match:
            speaker = speaker_match.group(1)
            text = text[speaker_match.end():]

        # 효과음 판별
        sub_type = "dialogue"
        if re.match(r"^\[.*\]$", text.strip()):
            sub_type = "effect"

        # 삭제 태그가 있으면 화자/대사 모두 삭제 표시
        results.append({
            "start_ms": start_ms, "end_ms": end_ms, "type": sub_type,
            "speaker": speaker,
            "speaker_pos": "default",
            "text_pos": text_pos,
            "speaker_deleted": has_delete_tag and bool(speaker),
            "text_deleted": has_delete_tag,
            "text": text,
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

        # 상단 위치 태그 — 삭제 여부와 무관, 위치만 판별
        if sub.text_pos == "top":
            parts.append("{\\an8}")

        # 화자
        if sub.speaker:
            if sub.speaker_deleted:
                parts.append(f"({sub.speaker}{{\\ㅅ}})")
            else:
                parts.append(f"({sub.speaker}{{\\}})")

        # 대사
        if sub.text_deleted:
            parts.append(f"{sub.text}{{\\ㅅ}}")
        else:
            parts.append(f"{sub.text}{{\\}}")

        out.append("".join(parts))
        out.append("")
    return "\n".join(out)