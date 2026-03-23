"""
backend/app/routers/projects.py
"""
from __future__ import annotations
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse, PlainTextResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
import os

from app.database import get_db
from app.models import Project, Subtitle, User
from app.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, TimerUpdate, BROADCASTER_RULES,
)
from app.services.subtitle_service import (
    parse_srt, export_srt, resequence_and_validate, save_snapshot,
)
from app.services.auth import get_current_user, require_role

router = APIRouter()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _dt_str(dt):
    return dt.isoformat() if dt else None


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
        "subtitle_count": sub_count, "error_count": err_count,
    }


@router.get("", response_model=List[ProjectResponse])
def list_projects(
    status: Optional[str] = Query(None),
    broadcaster: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Project)
    # worker: 본인 생성 + 배정분만
    if current_user.role == "worker":
        q = q.filter(or_(Project.created_by == current_user.id, Project.assigned_to == current_user.id))
    if status:
        q = q.filter(Project.status == status)
    if broadcaster:
        q = q.filter(Project.broadcaster == broadcaster)
    if search:
        q = q.filter(Project.name.contains(search))
    return [_to_response(p, db) for p in q.order_by(Project.updated_at.desc()).all()]


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(data: ProjectCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rules = BROADCASTER_RULES.get(data.broadcaster, {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5})
    max_lines = data.max_lines if data.max_lines is not None else rules["max_lines"]
    max_chars = data.max_chars_per_line if data.max_chars_per_line is not None else rules["max_chars_per_line"]
    bracket_chars = data.bracket_chars if data.bracket_chars is not None else rules.get("bracket_chars", 5)
    deadline = None
    if data.deadline:
        try:
            deadline = datetime.fromisoformat(data.deadline)
        except ValueError:
            pass
    project = Project(
        name=data.name, broadcaster=data.broadcaster, description=data.description,
        max_lines=max_lines, max_chars_per_line=max_chars, bracket_chars=bracket_chars,
        deadline=deadline, created_by=current_user.id,
        assigned_to=data.assigned_to,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_response(project, db)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return _to_response(p, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, data: ProjectUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    update_data = data.model_dump(exclude_unset=True)
    # 작업자 변경은 master/manager만
    if "assigned_to" in update_data and current_user.role == "worker":
        raise HTTPException(403, "작업자 변경 권한이 없습니다")
    if "broadcaster" in update_data:
        bc = update_data["broadcaster"]
        rules = BROADCASTER_RULES.get(bc, {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5})
        if "max_lines" not in update_data:
            update_data["max_lines"] = rules["max_lines"]
        if "max_chars_per_line" not in update_data:
            update_data["max_chars_per_line"] = rules["max_chars_per_line"]
        if "bracket_chars" not in update_data:
            update_data["bracket_chars"] = rules.get("bracket_chars", 5)
    if "deadline" in update_data:
        dl = update_data.pop("deadline")
        p.deadline = datetime.fromisoformat(dl) if dl else None
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
    p.status = "draft"
    p.submitted_at = None
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


@router.get("/rules/broadcasters")
def get_broadcaster_rules():
    return BROADCASTER_RULES


# ── 파일 ──

@router.post("/{project_id}/upload/subtitle")
def upload_subtitle(project_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    content = file.file.read().decode("utf-8-sig")
    save_snapshot(db, project_id, "upload_subtitle")
    db.query(Subtitle).filter(Subtitle.project_id == project_id).delete()
    for item in parse_srt(content):
        db.add(Subtitle(project_id=project_id, **item))
    p.subtitle_file = file.filename
    db.commit()
    subs = resequence_and_validate(db, project_id)
    return {"message": f"{len(subs)}개 자막 로드 완료", "count": len(subs)}


@router.post("/{project_id}/upload/video")
async def upload_video(project_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    filepath = os.path.join(UPLOAD_DIR, f"project_{project_id}_{file.filename}")
    total_size = 0
    with open(filepath, "wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
            total_size += len(chunk)
    p.video_file = filepath
    p.file_size_mb = round(total_size / (1024 * 1024), 2)
    db.commit()
    return {"message": "영상 업로드 완료", "path": filepath, "size_mb": p.file_size_mb}


@router.get("/{project_id}/download/subtitle")
def download_subtitle(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    subs = db.query(Subtitle).filter(Subtitle.project_id == project_id).order_by(Subtitle.seq).all()
    return PlainTextResponse(
        content=export_srt(subs), media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{p.subtitle_file or p.name + ".srt"}"'},
    )


@router.get("/{project_id}/stream/video")
def stream_video(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p or not p.video_file or not os.path.exists(p.video_file):
        raise HTTPException(404, "Video not found")
    def iterfile():
        with open(p.video_file, "rb") as f:
            while True:
                chunk = f.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk
    return StreamingResponse(iterfile(), media_type="video/mp4")