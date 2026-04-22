"""
backend/app/services/json_import_service.py

JSON import/export 서비스.
- video_project.json (기존)
- barrier_free JSON (신규: shots > closed_caption + audio_event)

Position 체계 (v8 리팩터):
  speaker_pos / text_pos : "default" | "top"   ← 위치만
  speaker_deleted        : bool                ← 화자 삭제 표시
  text_deleted           : bool                ← 대사 삭제 표시

  JSON ↔ DB 변환:
    Import: JSON의 "deleted" → deleted=True, pos="default"
            JSON의 "top"     → deleted=False, pos="top"
    Export: deleted=True → JSON "deleted"
            pos="top"   → JSON "top"
            (deleted 우선: deleted=True + pos="top" → JSON "deleted")
"""
from __future__ import annotations
from typing import List, Dict, Any
import json
import os

from app.models import Subtitle

ORIGINALS_DIR = "uploads/json_originals"
os.makedirs(ORIGINALS_DIR, exist_ok=True)


# ══════════════════════════════════════════════
# 공통
# ══════════════════════════════════════════════

def save_original_json(project_id: int, data: dict) -> str:
    """원본 JSON 전체 보존 (export 시 원본 구조 복원용)"""
    path = os.path.join(ORIGINALS_DIR, f"project_{project_id}_original.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def load_original_json(project_id: int) -> dict | None:
    """보존된 원본 JSON 로드"""
    path = os.path.join(ORIGINALS_DIR, f"project_{project_id}_original.json")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def detect_json_format(data: dict) -> str:
    """JSON 포맷 자동 판별"""
    if "shots" in data:
        return "barrier_free"
    if "audioContent" in data:
        return "video_project"
    return "unknown"


def _import_pos(val: str | None) -> tuple:
    """JSON position 값 → (pos, deleted) 변환.
    "deleted" → ("default", True)
    "top"     → ("top", False)
    기타      → ("default", False)
    """
    if val == "deleted":
        return ("default", True)
    if val == "top":
        return ("top", False)
    return ("default", False)


def _export_pos(pos: str, deleted: bool) -> str:
    """DB (pos, deleted) → JSON position 값 변환. 삭제 우선."""
    if deleted:
        return "deleted"
    if pos == "top":
        return "top"
    return "default"


# ══════════════════════════════════════════════
# Barrier-Free JSON 파싱
# ══════════════════════════════════════════════

def _map_action(action: str | None) -> tuple:
    """action 문자열 → (pos, deleted) 매핑.
    "삭제" → ("default", True)
    "이동" → ("top", False)
    기타   → ("default", False)
    """
    if not action:
        return ("default", False)
    a = action.strip()
    if a == "삭제":
        return ("default", True)
    if a == "이동":
        return ("top", False)
    return ("default", False)


def parse_barrier_free_json(data: dict) -> dict:
    """
    barrier_free JSON 파싱.
    shots[] > closed_caption[] + audio_event[] → Subtitle 리스트
    """
    shots = data.get("shots", [])
    items: List[Dict[str, Any]] = []

    for shot in shots:
        # closed_caption → dialogue
        for cc in shot.get("closed_caption", []):
            speaker = cc.get("speaker", "") or ""
            content = cc.get("content", "") or ""
            start_ms = cc.get("start_ms", 0)
            end_ms = cc.get("end_ms", 0)

            text_pos, text_deleted = _map_action(cc.get("subtitle_action", "유지"))
            speaker_pos, speaker_deleted = _map_action(cc.get("speaker_action", "유지"))

            sub_type = "dialogue"
            text = content.strip()
            if text.startswith("[") and text.endswith("]"):
                sub_type = "effect"

            items.append({
                "start_ms": start_ms,
                "end_ms": end_ms,
                "type": sub_type,
                "track_type": "dialogue",
                "speaker": speaker,
                "speaker_pos": speaker_pos,
                "text_pos": text_pos,
                "speaker_deleted": speaker_deleted,
                "text_deleted": text_deleted,
                "position": "default",
                "text": text,
                "source_id": None,
            })

        # audio_event → bgm/sfx/ambience
        for ae in shot.get("audio_event", []):
            ae_type = ae.get("type", "sfx")
            context = ae.get("context", "") or ""
            start_ms = ae.get("start_ms", 0)
            end_ms = ae.get("end_ms", 0)

            text_pos, text_deleted = _map_action(ae.get("audio_move_action", "유지"))
            track_type = ae_type if ae_type in ("bgm", "sfx", "ambience") else "sfx"

            items.append({
                "start_ms": start_ms,
                "end_ms": end_ms,
                "type": "effect",
                "track_type": track_type,
                "speaker": "",
                "speaker_pos": "default",
                "text_pos": text_pos,
                "speaker_deleted": False,
                "text_deleted": text_deleted,
                "position": "default",
                "text": f"[{context}]" if context else "",
                "source_id": None,
            })

    items.sort(key=lambda x: (x["start_ms"], x["end_ms"]))

    total_duration_ms = 0
    if items:
        total_duration_ms = max(item["end_ms"] for item in items)

    return {
        "subtitles": items,
        "fps": None,
        "total_duration_ms": total_duration_ms,
    }


# ══════════════════════════════════════════════
# Video Project JSON 파싱 (기존)
# ══════════════════════════════════════════════

def _frame_to_ms(frame: int, fps: float) -> int:
    if fps <= 0:
        return 0
    return round((frame / fps) * 1000)


def _ms_to_frame(ms: int, fps: float) -> int:
    if fps <= 0:
        return 0
    return round((ms / 1000) * fps)


def _resolve_person_name(person_id: str, libraries: dict) -> str:
    persons = libraries.get("persons", [])
    for p in persons:
        if p.get("personId") == person_id or p.get("id") == person_id:
            return p.get("displayName") or p.get("name") or person_id
    return person_id or ""


def _resolve_id(raw_id: str, id_mappings: dict) -> str:
    if not id_mappings:
        return raw_id
    return id_mappings.get(raw_id, raw_id)


def parse_video_project_json(data: dict) -> dict:
    """
    video_project.json 파싱.
    audioContent의 dialogues/sfx/bgm/ambience → Subtitle 리스트
    """
    fps = data.get("fps", 24.0) or 24.0
    audio_content = data.get("audioContent", {})
    libraries = data.get("libraries", {})
    id_mappings = data.get("idMappings", {})

    items: List[Dict[str, Any]] = []

    # dialogues
    for d in audio_content.get("dialogues", []):
        start_frame = d.get("startFrame", 0)
        end_frame = d.get("endFrame", 0)

        if start_frame == 0 and end_frame == 0 and ("start_ms" in d or "end_ms" in d):
            s_ms = d.get("start_ms", 0)
            e_ms = d.get("end_ms", 0)
        else:
            s_ms = _frame_to_ms(start_frame, fps)
            e_ms = _frame_to_ms(end_frame, fps)

        person_id = d.get("personId", "")
        speaker = _resolve_person_name(person_id, libraries)
        text = d.get("text", "") or d.get("content", "")
        dialogue_id = d.get("dialogueId", "") or d.get("id", "")
        dialogue_id = _resolve_id(dialogue_id, id_mappings)

        speaker_pos, speaker_deleted = _import_pos(d.get("personPosition"))
        text_pos, text_deleted = _import_pos(d.get("textPosition"))

        sub_type = "dialogue"
        if text.strip().startswith("[") and text.strip().endswith("]"):
            sub_type = "effect"

        items.append({
            "start_ms": s_ms,
            "end_ms": e_ms,
            "type": sub_type,
            "track_type": "dialogue",
            "speaker": speaker,
            "speaker_pos": speaker_pos,
            "text_pos": text_pos,
            "speaker_deleted": speaker_deleted,
            "text_deleted": text_deleted,
            "position": "default",
            "text": text,
            "source_id": dialogue_id,
        })

    # sfx, bgm, ambience
    for track_name, track_type in [("sfx", "sfx"), ("bgm", "bgm"), ("ambience", "ambience")]:
        for item in audio_content.get(track_name, []):
            start_frame = item.get("startFrame", 0)
            end_frame = item.get("endFrame", 0)

            if start_frame == 0 and end_frame == 0 and ("start_ms" in item or "end_ms" in item):
                s_ms = item.get("start_ms", 0)
                e_ms = item.get("end_ms", 0)
            else:
                s_ms = _frame_to_ms(start_frame, fps)
                e_ms = _frame_to_ms(end_frame, fps)

            text = item.get("text", "") or item.get("content", "") or item.get("description", "")
            item_id = item.get(f"{track_name}Id", "") or item.get("id", "")
            item_id = _resolve_id(item_id, id_mappings)

            text_pos, text_deleted = _import_pos(item.get("position"))

            items.append({
                "start_ms": s_ms,
                "end_ms": e_ms,
                "type": "effect",
                "track_type": track_type,
                "speaker": "",
                "speaker_pos": "default",
                "text_pos": text_pos,
                "speaker_deleted": False,
                "text_deleted": text_deleted,
                "position": "default",
                "text": text,
                "source_id": item_id,
            })

    items.sort(key=lambda x: (x["start_ms"], x["end_ms"]))

    total_duration_ms = 0
    if items:
        total_duration_ms = max(item["end_ms"] for item in items)

    return {
        "subtitles": items,
        "fps": fps,
        "total_duration_ms": total_duration_ms,
        "libraries": libraries,
    }


# ══════════════════════════════════════════════
# Export (video_project.json 형식)
# ══════════════════════════════════════════════

def export_to_video_project_json(subtitles: List[Subtitle], fps: float, project_id: int) -> dict:
    """
    Subtitle 레코드 → video_project.json audioContent 형식.
    보존된 원본 JSON이 있으면 audioContent만 교체.
    """
    original = load_original_json(project_id)

    dialogues = []
    sfx_list = []
    bgm_list = []
    ambience_list = []

    # 원본 데이터 매핑 (source_id 기준)
    original_map: Dict[str, dict] = {}
    if original:
        ac = original.get("audioContent", {})
        for d in ac.get("dialogues", []):
            did = d.get("dialogueId") or d.get("id", "")
            if did:
                original_map[did] = d
        for track_name in ["sfx", "bgm", "ambience"]:
            for item in ac.get(track_name, []):
                iid = item.get(f"{track_name}Id") or item.get("id", "")
                if iid:
                    original_map[iid] = item

    for sub in subtitles:
        start_frame = _ms_to_frame(sub.start_ms, fps)
        end_frame = _ms_to_frame(sub.end_ms, fps)

        if sub.track_type == "dialogue":
            # DB → JSON: (pos, deleted) → JSON position 값
            person_position = _export_pos(sub.speaker_pos or "default", sub.speaker_deleted)
            text_position = _export_pos(sub.text_pos or "default", sub.text_deleted)

            base = {}
            if sub.source_id and sub.source_id in original_map:
                base = {**original_map[sub.source_id]}

            base.update({
                "startFrame": start_frame,
                "endFrame": end_frame,
                "text": sub.text,
                "personPosition": person_position,
                "textPosition": text_position,
            })
            if sub.source_id:
                base["dialogueId"] = sub.source_id
            dialogues.append(base)

        elif sub.track_type in ("sfx", "bgm", "ambience"):
            position = _export_pos(sub.text_pos or "default", sub.text_deleted)

            base = {}
            if sub.source_id and sub.source_id in original_map:
                base = {**original_map[sub.source_id]}

            base.update({
                "startFrame": start_frame,
                "endFrame": end_frame,
                "text": sub.text,
                "position": position,
            })
            if sub.source_id:
                base[f"{sub.track_type}Id"] = sub.source_id

            if sub.track_type == "sfx":
                sfx_list.append(base)
            elif sub.track_type == "bgm":
                bgm_list.append(base)
            else:
                ambience_list.append(base)

    audio_content = {
        "dialogues": dialogues,
        "sfx": sfx_list,
        "bgm": bgm_list,
        "ambience": ambience_list,
    }

    if original:
        result = {**original}
        result["audioContent"] = audio_content
        return result

    return {"audioContent": audio_content}