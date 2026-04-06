"""
backend/app/services/json_import_service.py
video_project.json → Subtitle 레코드 변환

Import: audioContent에서 dialogues/sfx/bgm/ambience 추출 → ms 변환 → Subtitle 리스트
Export: 보존된 원본 JSON에서 audioContent만 편집 데이터로 교체하여 원본 구조 유지

Position 매핑:
  dialogue: personPosition → speaker_pos, textPosition → text_pos
  sfx/bgm/ambience: position → text_pos (speaker_pos는 "default" 고정)
"""
from __future__ import annotations
from typing import List, Dict, Any, Optional
import json
import os

ORIGINAL_JSON_DIR = "uploads/json_originals"
os.makedirs(ORIGINAL_JSON_DIR, exist_ok=True)


# ──────────────────────────────────────────
# 유틸
# ──────────────────────────────────────────

def _frame_to_ms(frame: int, fps: float) -> int:
    if fps <= 0:
        return 0
    return round((frame / fps) * 1000)


def _ms_to_frame(ms: int, fps: float) -> int:
    if fps <= 0:
        return 0
    return round((ms / 1000) * fps)


def _resolve_person_name(person_id: str, libraries: Dict[str, Any]) -> str:
    persons = libraries.get("persons", {})
    person = persons.get(person_id)
    if not person:
        return person_id
    return person.get("displayName") or person.get("name") or person_id


def _resolve_person_id_with_mappings(
    person_id: str, id_mappings: Optional[Dict[str, Any]]
) -> str:
    if not id_mappings:
        return person_id
    for mapping in id_mappings.get("persons", []):
        if mapping.get("tempId") == person_id:
            return mapping.get("finalId", person_id)
    return person_id


def _safe_pos(val: Any) -> str:
    """position 값을 안전하게 변환. default/top/deleted만 허용."""
    if val in ("default", "top", "deleted"):
        return val
    return "default"


# ──────────────────────────────────────────
# 원본 JSON 보존/로드
# ──────────────────────────────────────────

def save_original_json(project_id: int, data: dict) -> None:
    path = os.path.join(ORIGINAL_JSON_DIR, f"project_{project_id}_original.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def load_original_json(project_id: int) -> dict | None:
    path = os.path.join(ORIGINAL_JSON_DIR, f"project_{project_id}_original.json")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ──────────────────────────────────────────
# Import: JSON → Subtitle 리스트
# ──────────────────────────────────────────

def parse_video_project_json(data: Dict[str, Any]) -> Dict[str, Any]:
    video_info = data.get("videoInfo", {})
    fps = video_info.get("fps", 24)
    total_frames = video_info.get("totalFrames", 0)
    total_duration_ms = _frame_to_ms(total_frames, fps) if total_frames else 0

    libraries = data.get("libraries", {})
    id_mappings = data.get("idMappings")
    audio = data.get("audioContent", {})
    subtitles: List[Dict[str, Any]] = []

    # 1) dialogues — personPosition → speaker_pos, textPosition → text_pos
    for dlg in audio.get("dialogues", []):
        person_id = dlg.get("personId", "")
        resolved_pid = _resolve_person_id_with_mappings(person_id, id_mappings)
        speaker_name = _resolve_person_name(resolved_pid, libraries)

        subtitles.append({
            "start_ms": _frame_to_ms(dlg.get("startFrame", 0), fps),
            "end_ms": _frame_to_ms(dlg.get("endFrame", 0), fps),
            "track_type": "dialogue",
            "type": "dialogue",
            "speaker": speaker_name,
            "text": dlg.get("spokenText", "") or dlg.get("normalizedText", "") or "",
            "speaker_pos": _safe_pos(dlg.get("personPosition")),
            "text_pos": _safe_pos(dlg.get("textPosition")),
            "position": "default",
            "source_id": dlg.get("dialogueId", ""),
        })

    # 2) sfx — position → text_pos
    for sfx in audio.get("sfx", []):
        subtitles.append({
            "start_ms": _frame_to_ms(sfx.get("startFrame", 0), fps),
            "end_ms": _frame_to_ms(sfx.get("endFrame", 0), fps),
            "track_type": "sfx",
            "type": "effect",
            "speaker": "",
            "text": sfx.get("description", "") or "",
            "speaker_pos": "default",
            "text_pos": _safe_pos(sfx.get("position")),
            "position": _safe_pos(sfx.get("position")),
            "source_id": sfx.get("sfxId", ""),
        })

    # 3) bgm — position → text_pos
    for bgm in audio.get("bgm", []):
        subtitles.append({
            "start_ms": _frame_to_ms(bgm.get("startFrame", 0), fps),
            "end_ms": _frame_to_ms(bgm.get("endFrame", 0), fps),
            "track_type": "bgm",
            "type": "effect",
            "speaker": "",
            "text": bgm.get("description", "") or "",
            "speaker_pos": "default",
            "text_pos": _safe_pos(bgm.get("position")),
            "position": _safe_pos(bgm.get("position")),
            "source_id": bgm.get("bgmId", ""),
        })

    # 4) ambience — position → text_pos
    for amb in audio.get("ambience", []):
        subtitles.append({
            "start_ms": _frame_to_ms(amb.get("startFrame", 0), fps),
            "end_ms": _frame_to_ms(amb.get("endFrame", 0), fps),
            "track_type": "ambience",
            "type": "effect",
            "speaker": "",
            "text": amb.get("description", "") or "",
            "speaker_pos": "default",
            "text_pos": _safe_pos(amb.get("position")),
            "position": _safe_pos(amb.get("position")),
            "source_id": amb.get("ambienceId", ""),
        })

    subtitles.sort(key=lambda s: (s["start_ms"], s["end_ms"]))

    return {
        "fps": fps,
        "total_duration_ms": total_duration_ms,
        "subtitles": subtitles,
    }


# ──────────────────────────────────────────
# Export: Subtitle 리스트 → 원본 JSON 구조
# ──────────────────────────────────────────

def export_to_video_project_json(
    subtitles: list,
    fps: float,
    project_id: int,
) -> Dict[str, Any]:
    original = load_original_json(project_id)
    new_audio = _build_audio_content(subtitles, fps, original)

    if original:
        result = {**original}
        result["audioContent"] = new_audio
        return result
    else:
        return {"audioContent": new_audio}


def _build_audio_content(
    subtitles: list,
    fps: float,
    original: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    # 원본 lookup
    orig_lookup: Dict[str, Dict[str, Any]] = {}
    if original:
        orig_audio = original.get("audioContent", {})
        for key in ("dialogues", "sfx", "bgm", "ambience"):
            for item in orig_audio.get(key, []):
                item_id = (
                    item.get("dialogueId") or item.get("sfxId") or
                    item.get("bgmId") or item.get("ambienceId") or ""
                )
                if item_id:
                    orig_lookup[item_id] = item

    dialogues = []
    sfx_list = []
    bgm_list = []
    ambience_list = []

    for sub in subtitles:
        track = getattr(sub, "track_type", "dialogue") or "dialogue"
        source_id = getattr(sub, "source_id", "") or ""
        speaker_pos = getattr(sub, "speaker_pos", "default") or "default"
        text_pos = getattr(sub, "text_pos", "default") or "default"

        start_frame = _ms_to_frame(sub.start_ms, fps)
        end_frame = _ms_to_frame(sub.end_ms, fps)
        duration_frames = end_frame - start_frame

        orig_item = orig_lookup.get(source_id, {})

        if track == "dialogue":
            dlg = {**orig_item}
            dlg.update({
                "dialogueId": source_id or f"dlg-{sub.seq:04d}",
                "trackType": "A1",
                "startFrame": start_frame,
                "endFrame": end_frame,
                "durationFrames": duration_frames,
                "personId": orig_item.get("personId", ""),
                "personPosition": speaker_pos,
                "spokenText": sub.text,
                "normalizedText": sub.text,
                "textPosition": text_pos,
            })
            if "description" in dlg:
                dlg["description"] = sub.text
            dialogues.append(dlg)

        elif track == "sfx":
            sfx = {**orig_item}
            sfx.update({
                "sfxId": source_id or f"sfx-{sub.seq:04d}",
                "trackType": "A2",
                "startFrame": start_frame,
                "endFrame": end_frame,
                "durationFrames": duration_frames,
                "description": sub.text,
                "position": text_pos,
            })
            sfx_list.append(sfx)

        elif track == "bgm":
            bgm = {**orig_item}
            bgm.update({
                "bgmId": source_id or f"bgm-{sub.seq:04d}",
                "trackType": "A3",
                "startFrame": start_frame,
                "endFrame": end_frame,
                "durationFrames": duration_frames,
                "description": sub.text,
                "position": text_pos,
            })
            bgm_list.append(bgm)

        elif track == "ambience":
            amb = {**orig_item}
            amb.update({
                "ambienceId": source_id or f"amb-{sub.seq:04d}",
                "trackType": "A4",
                "startFrame": start_frame,
                "endFrame": end_frame,
                "durationFrames": duration_frames,
                "description": sub.text,
                "position": text_pos,
            })
            ambience_list.append(amb)

    return {
        "dialogues": dialogues,
        "sfx": sfx_list,
        "bgm": bgm_list,
        "ambience": ambience_list,
    }