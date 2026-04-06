"""
backend/app/routers/projects.py
"""
from __future__ import annotations
from typing import List, Optional
from datetime import datetime, timezone
from urllib.parse import quote
import subprocess
import json
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse, PlainTextResponse
from starlette.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project, Subtitle, User
from app.schemas import ProjectCreate, ProjectUpdate, ProjectResponse, TimerUpdate
from app.routers.settings import load_rules
from app.services.subtitle_service import (
    parse_srt, export_srt, resequence_and_validate, save_snapshot,
)
from app.services.json_import_service import (
    parse_video_project_json, export_to_video_project_json,
    save_original_json,
)
from app.services.auth import get_current_user, require_role
from app.services.waveform_service import extract_waveform_peaks, load_peaks


router = APIRouter()
UPLOAD_DIR = "uploads"
JSON_LIBS_DIR = "uploads/json_libs"
os.makedirs(JSON_LIBS_DIR, exist_ok=True)


# ── 유틸리티 ──

def _dt_str(dt):
    return dt.isoformat() if dt else None


def get_video_duration_ms(filepath: str) -> int | None:
    """ffprobe로 영상 길이(ms) 추출"""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", filepath],
            capture_output=True, text=True, timeout=30,
        )
        info = json.loads(result.stdout)
        duration_sec = float(info["format"]["duration"])
        return int(duration_sec * 1000)
    except Exception:
        return None


def _to_response(project: Project, db: Session) -> dict:
    sub_count = db.query(Subtitle).filter(Subtitle.project_id == project.id).count()
    err_count = db.query(Subtitle).filter(Subtitle.project_id == project.id, Subtitle.error != "").count()
    assignee_name = None
    if project.assigned_to:
        u = db.query(User).get(project.assigned_to)
        if u:
            assignee_name = u.display_name
    creator_name = None
    if project.created_by:
        u = db.query(User).get(project.created_by)
        if u:
            creator_name = u.display_name
    return {
        "id": project.id, "name": project.name, "broadcaster": project.broadcaster,
        "description": project.description,
        "max_lines": project.max_lines, "max_chars_per_line": project.max_chars_per_line,
        "bracket_chars": project.bracket_chars,
        "subtitle_file": project.subtitle_file, "video_file": project.video_file,
        "total_duration_ms": project.total_duration_ms,
        "video_duration_ms": project.video_duration_ms, "file_size_mb": project.file_size_mb,
        "status": project.status, "elapsed_seconds": project.elapsed_seconds or 0,
        "last_saved_at": _dt_str(project.last_saved_at),
        "submitted_at": _dt_str(project.submitted_at),
        "deadline": _dt_str(project.deadline),
        "assigned_to": project.assigned_to, "assigned_to_name": assignee_name,
        "created_by": project.created_by, "created_by_name": creator_name,
        "created_at": _dt_str(project.created_at),
        "reject_count": project.reject_count or 0,
        "first_submitted_at": _dt_str(project.first_submitted_at),
        "subtitle_count": sub_count, "error_count": err_count,
        "fps": project.fps,
        "import_type": project.import_type or "srt",
    }


# ── 프로젝트 CRUD ──

@router.get("", response_model=List[ProjectResponse])
def list_projects(
    status: Optional[str] = Query(None),
    broadcaster: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Project)
    if current_user.role not in ("master", "manager"):
        from sqlalchemy import or_
        q = q.filter(or_(Project.assigned_to == current_user.id, Project.created_by == current_user.id))
    if status:
        q = q.filter(Project.status == status)
    if broadcaster:
        q = q.filter(Project.broadcaster == broadcaster)
    if search:
        q = q.filter(Project.name.contains(search))
    return [_to_response(p, db) for p in q.order_by(Project.updated_at.desc()).all()]


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(data: ProjectCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bc = data.broadcaster or ""
    rules = load_rules().get(bc, {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5})
    max_lines = data.max_lines if data.max_lines is not None else rules["max_lines"]
    max_chars = data.max_chars_per_line if data.max_chars_per_line is not None else rules["max_chars_per_line"]
    bracket_chars = data.bracket_chars if data.bracket_chars is not None else rules.get("bracket_chars", 5)
    deadline = None
    if data.deadline:
        try:
            deadline = datetime.fromisoformat(data.deadline)
        except ValueError:
            pass
    base_name = data.name.strip()
    existing_names = {p.name for p in db.query(Project.name).all()}
    final_name = base_name
    counter = 1
    while final_name in existing_names:
        final_name = f"{base_name}({counter})"
        counter += 1
    project = Project(
        name=final_name, broadcaster=bc, description=data.description,
        max_lines=max_lines, max_chars_per_line=max_chars, bracket_chars=bracket_chars,
        deadline=deadline, created_by=current_user.id,
        assigned_to=data.assigned_to,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_response(project, db)


@router.get("/rules/broadcasters")
def get_broadcaster_rules():
    return load_rules()


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if current_user.role not in ("master", "manager") and p.assigned_to != current_user.id and p.created_by != current_user.id:
        raise HTTPException(403, "접근 권한이 없습니다")
    return _to_response(p, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, data: ProjectUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    update_data = data.model_dump(exclude_unset=True)
    if "assigned_to" in update_data and current_user.role == "worker":
        raise HTTPException(403, "작업자 변경 권한이 없습니다")
    if "broadcaster" in update_data:
        bc = update_data["broadcaster"]
        rules = load_rules().get(bc, {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5})
        if "max_lines" not in update_data:
            update_data["max_lines"] = rules["max_lines"]
        if "max_chars_per_line" not in update_data:
            update_data["max_chars_per_line"] = rules["max_chars_per_line"]
        if "bracket_chars" not in update_data:
            update_data["bracket_chars"] = rules.get("bracket_chars", 5)
    if "deadline" in update_data:
        dl = update_data.pop("deadline")
        p.deadline = datetime.fromisoformat(dl) if dl else None
    if "name" in update_data:
        new_name = update_data["name"].strip()
        existing = db.query(Project).filter(Project.name == new_name, Project.id != project_id).first()
        if existing:
            raise HTTPException(400, f"이미 같은 이름의 프로젝트가 있습니다: {new_name}")
        update_data["name"] = new_name
    for k, v in update_data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    resequence_and_validate(db, project_id)
    return _to_response(p, db)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    if current_user.role == "worker" and p.created_by != current_user.id:
        raise HTTPException(403, "본인이 생성한 프로젝트만 삭제할 수 있습니다")
    db.delete(p)
    db.commit()


# ── 프로젝트 상태 ──

@router.post("/{project_id}/submit", response_model=ProjectResponse)
def submit_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    err = db.query(Subtitle).filter(Subtitle.project_id == project_id, Subtitle.error != "").count()
    if err > 0:
        raise HTTPException(400, f"검수 오류 {err}건이 있습니다.")
    p.status = "submitted"
    p.submitted_at = datetime.now(timezone.utc)
    if p.first_submitted_at is None:
        p.first_submitted_at = p.submitted_at
    db.commit()
    db.refresh(p)
    return _to_response(p, db)


@router.post("/{project_id}/approve", response_model=ProjectResponse)
def approve_project(project_id: int, current_user: User = Depends(require_role(["master", "manager"])), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    p.status = "approved"
    db.commit()
    db.refresh(p)
    return _to_response(p, db)


@router.post("/{project_id}/reject", response_model=ProjectResponse)
def reject_project(project_id: int, current_user: User = Depends(require_role(["master", "manager"])), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    p.status = "rejected"
    p.reject_count = (p.reject_count or 0) + 1
    db.commit()
    db.refresh(p)
    return _to_response(p, db)


@router.post("/{project_id}/timer", response_model=ProjectResponse)
def update_timer(project_id: int, data: TimerUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    p.elapsed_seconds = data.elapsed_seconds
    db.commit()
    db.refresh(p)
    return _to_response(p, db)


@router.post("/{project_id}/save", response_model=ProjectResponse)
def save_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    p.last_saved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return _to_response(p, db)


# ── 파일: SRT 업로드 ──

@router.post("/{project_id}/upload/subtitle")
def upload_subtitle(project_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    content = file.file.read().decode("utf-8-sig")
    save_snapshot(db, project_id, "upload_subtitle")
    db.query(Subtitle).filter(Subtitle.project_id == project_id).delete()
    db.flush()

    parsed = parse_srt(content)
    if parsed:
        db.bulk_insert_mappings(Subtitle, [
            {**item, "project_id": project_id, "seq": i + 1,
             "track_type": "dialogue", "position": "default", "source_id": None}
            for i, item in enumerate(parsed)
        ])

    p.subtitle_file = file.filename
    p.import_type = "srt"
    db.commit()
    subs = resequence_and_validate(db, project_id)
    return {"message": f"{len(subs)}개 자막 로드 완료", "count": len(subs)}


# ── 파일: JSON 업로드 (video_project.json) ──

@router.post("/{project_id}/upload/json")
def upload_json_subtitle(
    project_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """video_project.json 업로드 → dialogues/sfx/bgm/ambience를 Subtitle 테이블에 삽입"""
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)

    try:
        content = file.file.read().decode("utf-8-sig")
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(400, f"JSON 파싱 실패: {str(e)}")

    # 파싱
    result = parse_video_project_json(data)
    subtitle_items = result["subtitles"]
    fps = result["fps"]
    libraries = result.get("libraries", {})

    if not subtitle_items:
        raise HTTPException(400, "audioContent에서 추출된 항목이 없습니다")

    # 스냅샷 저장 + 기존 자막 삭제
    save_snapshot(db, project_id, "upload_json")
    db.query(Subtitle).filter(Subtitle.project_id == project_id).delete()
    db.flush()

    # 배치 INSERT
    db.bulk_insert_mappings(Subtitle, [
        {**item, "project_id": project_id, "seq": i + 1}
        for i, item in enumerate(subtitle_items)
    ])

    # 프로젝트 메타 업데이트
    p.subtitle_file = file.filename
    p.import_type = "json"
    p.fps = fps
    if result["total_duration_ms"] > 0:
        p.total_duration_ms = result["total_duration_ms"]

    # 원본 JSON 전체 보존 (export 시 원본 구조 복원용)
    save_original_json(project_id, data)

    db.commit()
    subs = resequence_and_validate(db, project_id)

    track_counts = {}
    for item in subtitle_items:
        tt = item.get("track_type", "dialogue")
        track_counts[tt] = track_counts.get(tt, 0) + 1

    return {
        "message": f"JSON에서 {len(subs)}개 항목 로드 완료",
        "count": len(subs),
        "fps": fps,
        "track_counts": track_counts,
    }


# ── 파일: JSON 다운로드 (video_project.json 형식) ──

@router.get("/{project_id}/download/json")
def download_json_subtitle(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Subtitle 레코드 → video_project.json audioContent 형식으로 다운로드"""
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)

    fps = p.fps or 24.0
    subs = db.query(Subtitle).filter(Subtitle.project_id == project_id).order_by(Subtitle.seq).all()

    result = export_to_video_project_json(subs, fps, project_id)

    filename = (p.subtitle_file or p.name).rsplit(".", 1)[0] + "_export.json"
    encoded = quote(filename)
    content = json.dumps(result, ensure_ascii=False, indent=2)

    return PlainTextResponse(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


# ── 파일: SRT 다운로드 (기존) ──

@router.get("/{project_id}/download/subtitle")
def download_subtitle(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    subs = db.query(Subtitle).filter(Subtitle.project_id == project_id).order_by(Subtitle.seq).all()

    filename = p.subtitle_file or (p.name + ".srt")
    encoded = quote(filename)
    return PlainTextResponse(
        content=export_srt(subs), media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


# ── 영상 업로드 ──

@router.post("/{project_id}/upload/video")
async def upload_video(project_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)

    filepath = os.path.join(UPLOAD_DIR, f"project_{project_id}_{file.filename}")

    try:
        total_size = 0
        with open(filepath, "wb") as f:
            while True:
                chunk = await file.read(2 * 1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                total_size += len(chunk)

        p.video_file = filepath
        p.file_size_mb = round(total_size / (1024 * 1024), 2)

        duration_ms = get_video_duration_ms(filepath)
        if duration_ms:
            p.total_duration_ms = duration_ms
            p.video_duration_ms = duration_ms

        extract_waveform_peaks(filepath, project_id, duration_ms)

        db.commit()
        return {
            "message": "영상 업로드 완료",
            "size_mb": p.file_size_mb,
            "duration_ms": duration_ms,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"영상 업로드 실패: {str(e)}")


# ── 영상 스트리밍 ──

@router.get("/{project_id}/stream/video")
def stream_video(project_id: int, db: Session = Depends(get_db)):
    import mimetypes
    p = db.query(Project).get(project_id)
    if not p or not p.video_file or not os.path.exists(p.video_file):
        raise HTTPException(404, "Video not found")
    file_path = p.video_file
    content_type, _ = mimetypes.guess_type(file_path)
    if not content_type:
        content_type = "video/mp4"
    return FileResponse(
        path=file_path, media_type=content_type,
        filename=os.path.basename(file_path), stat_result=os.stat(file_path),
    )


# ── 파형 ──

@router.get("/{project_id}/waveform")
def get_waveform(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    peaks = load_peaks(project_id)
    if not peaks:
        raise HTTPException(404, "Waveform not available")
    return peaks