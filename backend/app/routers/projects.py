"""
backend/app/routers/projects.py
"""
from __future__ import annotations
from typing import List, Optional
from datetime import datetime, timezone
from urllib.parse import quote
import json
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import PlainTextResponse
from starlette.responses import FileResponse
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project, Subtitle, User, BroadcasterRule, Workspace
from app.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, TimerUpdate, SavePositionBody,
)
from app.routers.settings import load_rules
from app.services.subtitle_service import (
    parse_srt, export_srt, save_snapshot, post_subtitle_change,
)
from app.services.json_import_service import (
    parse_video_project_json, export_to_video_project_json,
    save_original_json,
)
from app.services.auth import get_current_user, require_role
from app.services.waveform_service import extract_waveform_peaks, load_peaks, get_video_duration_ms
from app.services.permission_service import (
    can_access_workspace, can_access_project, get_accessible_workspace_ids,
)
from app.services.workspace_service import (
    get_workspace_path, cleanup_project_files,
)


router = APIRouter()
UPLOAD_DIR = "uploads"
JSON_LIBS_DIR = "uploads/json_libs"
os.makedirs(JSON_LIBS_DIR, exist_ok=True)


# ── 유틸리티 ──

def _dt_str(dt):
    return dt.isoformat() if dt else None


# UI 상태 라벨 → SQL 필터 매핑.
# "재작업"은 별도 status가 아니라 in_progress + reject_count>0 파생 라벨.
_LABEL_TO_FILTER = {
    "진행중": lambda q: q.filter(Project.status == "in_progress", (Project.reject_count == 0) | (Project.reject_count.is_(None))),
    "제출":   lambda q: q.filter(Project.status == "submitted"),
    "반려":   lambda q: q.filter(Project.status == "rejected"),
    "재작업": lambda q: q.filter(Project.status == "in_progress", Project.reject_count > 0),
    "완료":   lambda q: q.filter(Project.status == "completed"),
}


def _apply_status_filter(q, status_label: Optional[str]):
    """UI 라벨 → SQL 조건 적용. '전체' 또는 None이면 필터 미적용.
    그 외는 raw status 값(in_progress/submitted/rejected/completed)도 받아준다.
    """
    if not status_label or status_label == "전체":
        return q
    fn = _LABEL_TO_FILTER.get(status_label)
    if fn:
        return fn(q)
    return q.filter(Project.status == status_label)


def _get_project_or_403(pid: int, user: User, db: Session) -> Project:
    """프로젝트 조회 + 접근 권한 체크.

    404: 프로젝트 없음
    403: 권한 없음 (워크스페이스 권한 + ownership 결합 결과)
    """
    p = db.query(Project).get(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    if not can_access_project(db, user, p):
        raise HTTPException(403, "접근 권한이 없습니다")
    return p


def _generate_unique_project_name(
    db: Session,
    workspace_id: int,
    base_name: str,
    exclude_id: Optional[int] = None,
) -> str:
    """같은 워크스페이스 안에서 프로젝트 이름 중복 시 자동 번호 부여.

    "ep01" → "ep01_2" → "ep01_3" → ...
    다른 워크스페이스끼리는 같은 이름 OK (검사 안 함).
    """
    base_name = (base_name or "").strip()
    if not base_name:
        raise HTTPException(400, "프로젝트 이름은 비어 있을 수 없습니다")

    def _exists(name: str) -> bool:
        q = db.query(Project).filter(
            Project.workspace_id == workspace_id,
            Project.name == name,
        )
        if exclude_id is not None:
            q = q.filter(Project.id != exclude_id)
        return q.first() is not None

    if not _exists(base_name):
        return base_name
    n = 2
    while _exists(f"{base_name}_{n}"):
        n += 1
    return f"{base_name}_{n}"


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
        "id": project.id,
        "workspace_id": project.workspace_id,
        "workspace_path": get_workspace_path(db, project.workspace_id),
        "name": project.name, "broadcaster": project.broadcaster,
        "description": project.description,
        "max_lines": project.max_lines, "max_chars_per_line": project.max_chars_per_line,
        "bracket_chars": project.bracket_chars,
        "min_duration_ms": project.min_duration_ms or 500,
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
        "last_position_ms": project.last_position_ms or 0,
        "last_selected_id": project.last_selected_id,
        "speaker_mode": project.speaker_mode or "name",
        "progress_ms": project.progress_ms or 0,
    }


# ── 프로젝트 CRUD ──

@router.get("", response_model=List[ProjectResponse])
def list_projects(
    status: Optional[str] = Query(None),
    broadcaster: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    workspace_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Project)

    # 권한 필터 (worker는 권한 트리 안 + ownership AND 결합)
    accessible = get_accessible_workspace_ids(db, current_user)
    if accessible is not None:
        if not accessible:
            return []

        q = q.filter(Project.workspace_id.in_(accessible))
        # 담당자 판정: assigned_to 명시되면 그것만 봄, null이면 created_by fallback.
        # can_access_project와 같은 로직을 SQL로 표현.
        q = q.filter(or_(
            Project.assigned_to == current_user.id,
            and_(Project.assigned_to.is_(None), Project.created_by == current_user.id),
        ))
    # master/manager는 필터 없음

    # 상태 라벨 필터
    q = _apply_status_filter(q, status)

    if broadcaster:
        q = q.filter(Project.broadcaster == broadcaster)
    if workspace_id is not None:
        q = q.filter(Project.workspace_id == workspace_id)
    if search:
        q = q.filter(Project.name.contains(search))

    return [_to_response(p, db) for p in q.order_by(Project.updated_at.desc()).all()]


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(data: ProjectCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 워크스페이스 존재 + 권한 체크
    ws = db.query(Workspace).get(data.workspace_id)
    if not ws:
        raise HTTPException(404, "워크스페이스를 찾을 수 없습니다")
    if not can_access_workspace(db, current_user, data.workspace_id):
        raise HTTPException(403, "이 워크스페이스에 작업 권한이 없습니다")

    bc = data.broadcaster or ""
    rules = load_rules().get(bc, {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5, "min_duration_ms": 500})
    max_lines = data.max_lines if data.max_lines is not None else rules["max_lines"]
    max_chars = data.max_chars_per_line if data.max_chars_per_line is not None else rules["max_chars_per_line"]
    bracket_chars = data.bracket_chars if data.bracket_chars is not None else rules.get("bracket_chars", 5)
    min_duration_ms = rules.get("min_duration_ms", 500)
    speaker_mode = rules.get("speaker_mode", "name")

    deadline = None
    if data.deadline:
        try:
            deadline = datetime.fromisoformat(data.deadline)
        except ValueError:
            pass

    # 같은 워크스페이스 안 이름 중복 시 자동 번호 부여
    final_name = _generate_unique_project_name(db, data.workspace_id, data.name)

    project = Project(
        workspace_id=data.workspace_id,
        name=final_name, broadcaster=bc, description=data.description,
        max_lines=max_lines, max_chars_per_line=max_chars, bracket_chars=bracket_chars,
        min_duration_ms=min_duration_ms, speaker_mode=speaker_mode,
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
    p = _get_project_or_403(project_id, current_user, db)
    return _to_response(p, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, data: ProjectUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_project_or_403(project_id, current_user, db)

    update_data = data.model_dump(exclude_unset=True)
    if "assigned_to" in update_data and current_user.role == "worker":
        raise HTTPException(403, "작업자 변경 권한이 없습니다")
    if "broadcaster" in update_data:
        bc = update_data["broadcaster"]
        rules = load_rules().get(bc, {"max_lines": 2, "max_chars_per_line": 18, "bracket_chars": 5, "min_duration_ms": 500})
        if "max_lines" not in update_data:
            update_data["max_lines"] = rules["max_lines"]
        if "max_chars_per_line" not in update_data:
            update_data["max_chars_per_line"] = rules["max_chars_per_line"]
        if "bracket_chars" not in update_data:
            update_data["bracket_chars"] = rules.get("bracket_chars", 5)
        if "min_duration_ms" not in update_data:
            update_data["min_duration_ms"] = rules.get("min_duration_ms", 500)
        if "speaker_mode" not in update_data:
            update_data["speaker_mode"] = rules.get("speaker_mode", "name")
    if "deadline" in update_data:
        dl = update_data.pop("deadline")
        p.deadline = datetime.fromisoformat(dl) if dl else None
    if "name" in update_data:
        # 같은 워크스페이스 안에서만 중복 검사 (자기 자신은 제외)
        update_data["name"] = _generate_unique_project_name(
            db, p.workspace_id, update_data["name"], exclude_id=project_id
        )
    for k, v in update_data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    post_subtitle_change(db, project_id)  # 방송사 변경 시 검수 기준 바뀌므로 재검증
    return _to_response(p, db)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    if current_user.role == "worker":
        if not can_access_project(db, current_user, p):
            raise HTTPException(403, "접근 권한이 없습니다")
        if p.created_by != current_user.id:
            raise HTTPException(403, "본인이 생성한 프로젝트만 삭제할 수 있습니다")
    cleanup_project_files(p)
    db.delete(p)
    db.commit()


# ── 프로젝트 상태 ──

@router.post("/{project_id}/submit", response_model=ProjectResponse)
def submit_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_project_or_403(project_id, current_user, db)

    # 오버랩 허용 여부 확인
    rule = db.query(BroadcasterRule).filter(
        BroadcasterRule.name == p.broadcaster,
        BroadcasterRule.is_active == True,
    ).first()
    allow_overlap = rule.allow_overlap if rule else True

    # 오버랩 허용이면 "오버랩"만 있는 에러는 제출 차단 대상에서 제외
    error_subs = db.query(Subtitle).filter(
        Subtitle.project_id == project_id, Subtitle.error != ""
    ).all()

    blocking = 0
    for sub in error_subs:
        errors = set(e.strip() for e in sub.error.split(","))
        if allow_overlap:
            errors.discard("오버랩")
        if errors:
            blocking += 1

    if blocking > 0:
        raise HTTPException(400, f"검수 오류 {blocking}건이 있습니다.")

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
    p.status = "completed"  # ★ v8.3: "approved" → "completed"
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
    p = _get_project_or_403(project_id, current_user, db)
    p.elapsed_seconds = data.elapsed_seconds
    db.commit()
    db.refresh(p)
    return _to_response(p, db)


@router.post("/{project_id}/save", response_model=ProjectResponse)
def save_project(
    project_id: int,
    body: SavePositionBody = SavePositionBody(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _get_project_or_403(project_id, current_user, db)
    p.last_saved_at = datetime.now(timezone.utc)
    if body.last_position_ms is not None:
        p.last_position_ms = body.last_position_ms
    if body.last_selected_id is not None:
        p.last_selected_id = body.last_selected_id
    db.commit()
    db.refresh(p)
    return _to_response(p, db)


# ── 파일: SRT 업로드 ──

@router.post("/{project_id}/upload/subtitle")
def upload_subtitle(project_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_project_or_403(project_id, current_user, db)
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
    subs = post_subtitle_change(db, project_id)
    # 임포트 직후엔 사용자가 아직 손 안 댔으므로 진척률 0% 리셋
    p.progress_ms = 0
    db.commit()
    return {"message": f"{len(subs)}개 자막 로드 완료", "count": len(subs)}


# ── 파일: JSON 업로드 (video_project.json) ──

@router.post("/{project_id}/upload/json")
def upload_json_subtitle(
    project_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _get_project_or_403(project_id, current_user, db)

    try:
        content = file.file.read().decode("utf-8-sig")
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(400, f"JSON 파싱 실패: {str(e)}")

    result = parse_video_project_json(data)
    subtitle_items = result["subtitles"]
    fps = result["fps"]
    libraries = result.get("libraries", {})

    if not subtitle_items:
        raise HTTPException(400, "audioContent에서 추출된 항목이 없습니다")

    save_snapshot(db, project_id, "upload_json")
    db.query(Subtitle).filter(Subtitle.project_id == project_id).delete()
    db.flush()

    db.bulk_insert_mappings(Subtitle, [
        {**item, "project_id": project_id, "seq": i + 1}
        for i, item in enumerate(subtitle_items)
    ])

    p.subtitle_file = file.filename
    p.import_type = "json"
    p.fps = fps
    if result["total_duration_ms"] > 0:
        p.total_duration_ms = result["total_duration_ms"]

    save_original_json(project_id, data)

    db.commit()
    subs = post_subtitle_change(db, project_id)
    # 임포트 직후엔 사용자가 아직 손 안 댔으므로 진척률 0% 리셋
    p.progress_ms = 0
    db.commit()

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
    suffix: str = Query(default="export", description="파일명 접미사"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _get_project_or_403(project_id, current_user, db)

    fps = p.fps or 24.0
    subs = db.query(Subtitle).filter(Subtitle.project_id == project_id).order_by(Subtitle.seq).all()

    result = export_to_video_project_json(subs, fps, project_id)

    base_name = (p.subtitle_file or p.name).rsplit(".", 1)[0]
    user_name = current_user.display_name or current_user.username
    filename = f"{base_name}_{user_name}_{suffix}.json"
    encoded = quote(filename)
    content = json.dumps(result, ensure_ascii=False, indent=2)

    return PlainTextResponse(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


# ── 파일: SRT 다운로드 (기존) ──

@router.get("/{project_id}/download/subtitle")
def download_subtitle(
    project_id: int,
    suffix: str = Query(default="final", description="파일명 접미사"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _get_project_or_403(project_id, current_user, db)
    subs = db.query(Subtitle).filter(Subtitle.project_id == project_id).order_by(Subtitle.seq).all()

    base_name = (p.subtitle_file or p.name).rsplit(".", 1)[0]
    user_name = current_user.display_name or current_user.username
    filename = f"{base_name}_{user_name}_{suffix}.srt"
    encoded = quote(filename)
    return PlainTextResponse(
        content=export_srt(subs), media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


# ── 영상 업로드 ──

@router.post("/{project_id}/upload/video")
async def upload_video(project_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_project_or_403(project_id, current_user, db)

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

        db.commit()

        # 파형 추출 동기 실행 (편집기 진입 시 파형 보장)
        extract_waveform_peaks(filepath, project_id, duration_ms)

        return {
            "message": "영상 업로드 완료",
            "size_mb": p.file_size_mb,
            "duration_ms": duration_ms,
            "waveform": "processing",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"영상 업로드 실패: {str(e)}")


# ── 영상 스트리밍 ──

@router.get("/{project_id}/stream/video")
def stream_video(project_id: int, db: Session = Depends(get_db)):
    """영상 스트리밍.

    <video src> 태그는 axios interceptor를 거치지 않아 JWT가 헤더에
    실리지 않으므로 인증 의존성 없이 동작.
    """
    import mimetypes
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p.video_file or not os.path.exists(p.video_file):
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
def get_waveform(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_project_or_403(project_id, current_user, db)
    peaks = load_peaks(project_id)
    if not peaks:
        raise HTTPException(404, "Waveform not available")
    return peaks