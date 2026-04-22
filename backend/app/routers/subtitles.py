"""
backend/app/routers/subtitles.py
Python 3.9 호환
"""
from __future__ import annotations
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Subtitle, Project, EditHistory, BroadcasterRule
from app.schemas import (
    SubtitleCreate, SubtitleUpdate, SubtitleResponse, SubtitleBatchItem,
    BatchDeleteRequest, MergeRequest, SplitRequest, BulkSpeakerRequest,
)
from app.services.subtitle_service import (
    resequence_and_validate, save_snapshot, restore_snapshot, smart_split_text,
)
from app.services.auth import get_current_user
from app.models import User as UserModel

router = APIRouter()


def _get_project(pid: int, db: Session) -> Project:
    p = db.query(Project).get(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


def _get_min_duration_ms(project: Project) -> int:
    """프로젝트의 min_duration_ms. 없으면 기본 500ms."""
    return project.min_duration_ms if project.min_duration_ms else 500


@router.get("", response_model=List[SubtitleResponse])
def list_subtitles(project_id: int, db: Session = Depends(get_db)):
    _get_project(project_id, db)
    return db.query(Subtitle).filter(Subtitle.project_id == project_id).order_by(Subtitle.seq).all()


@router.post("", response_model=List[SubtitleResponse], status_code=201)
def create_subtitle(project_id: int, data: SubtitleCreate, db: Session = Depends(get_db)):
    """싱크 추가: 선택된 싱크 바로 아래에, 끝시간+1ms부터 min_duration_ms 길이"""
    p = _get_project(project_id, db)
    save_snapshot(db, project_id, "add")

    min_dur = _get_min_duration_ms(p)

    start = data.start_ms
    end = start + min_dur

    sub = Subtitle(
        project_id=project_id, start_ms=start, end_ms=end,
        type=data.type, speaker=data.speaker,
        speaker_pos=data.speaker_pos, text_pos=data.text_pos,
        speaker_deleted=False, text_deleted=False,
        text=data.text, seq=0,
    )
    db.add(sub)
    db.commit()
    return resequence_and_validate(db, project_id)


@router.patch("/{subtitle_id}", response_model=SubtitleResponse)
def update_subtitle(project_id: int, subtitle_id: int, data: SubtitleUpdate, db: Session = Depends(get_db)):
    _get_project(project_id, db)
    sub = db.query(Subtitle).filter(Subtitle.id == subtitle_id, Subtitle.project_id == project_id).first()
    if not sub:
        raise HTTPException(404, "Subtitle not found")
    save_snapshot(db, project_id, "update")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(sub, k, v)
    db.commit()
    subs = resequence_and_validate(db, project_id)
    return next((s for s in subs if s.id == subtitle_id), None)


@router.delete("/{subtitle_id}", response_model=List[SubtitleResponse])
def delete_subtitle(project_id: int, subtitle_id: int, db: Session = Depends(get_db)):
    _get_project(project_id, db)
    sub = db.query(Subtitle).filter(Subtitle.id == subtitle_id, Subtitle.project_id == project_id).first()
    if not sub:
        raise HTTPException(404)
    save_snapshot(db, project_id, "delete")
    db.delete(sub)
    db.commit()
    return resequence_and_validate(db, project_id)


@router.post("/batch-delete", response_model=List[SubtitleResponse])
def batch_delete(project_id: int, data: BatchDeleteRequest, db: Session = Depends(get_db)):
    _get_project(project_id, db)
    save_snapshot(db, project_id, "batch_delete")
    db.query(Subtitle).filter(Subtitle.project_id == project_id, Subtitle.id.in_(data.ids)).delete(synchronize_session=False)
    db.commit()
    return resequence_and_validate(db, project_id)


@router.post("/{subtitle_id}/split", response_model=List[SubtitleResponse])
def split_subtitle(project_id: int, subtitle_id: int, data: SplitRequest, db: Session = Depends(get_db)):
    """분할: 시간을 절반으로, 대사도 스마트 분할(공백 기준)"""
    _get_project(project_id, db)
    sub = db.query(Subtitle).filter(Subtitle.id == subtitle_id, Subtitle.project_id == project_id).first()
    if not sub:
        raise HTTPException(404)
    save_snapshot(db, project_id, "split")

    split_at = data.split_at_ms if data.split_at_ms else (sub.start_ms + sub.end_ms) // 2
    original_end = sub.end_ms

    text_first, text_second = smart_split_text(sub.text)

    sub.end_ms = split_at
    sub.text = text_first

    db.add(Subtitle(
        project_id=project_id, start_ms=split_at, end_ms=original_end,
        type=sub.type, speaker=sub.speaker,
        speaker_pos=sub.speaker_pos, text_pos=sub.text_pos,
        speaker_deleted=sub.speaker_deleted, text_deleted=sub.text_deleted,
        text=text_second,
    ))
    db.commit()
    return resequence_and_validate(db, project_id)


@router.post("/merge", response_model=List[SubtitleResponse])
def merge_subtitles(project_id: int, data: MergeRequest, db: Session = Depends(get_db)):
    _get_project(project_id, db)
    if len(data.ids) < 2:
        raise HTTPException(400, "2개 이상 선택 필요")
    subs = db.query(Subtitle).filter(Subtitle.project_id == project_id, Subtitle.id.in_(data.ids)).order_by(Subtitle.seq).all()
    if len(subs) < 2:
        raise HTTPException(404)
    save_snapshot(db, project_id, "merge")
    subs[0].end_ms = subs[-1].end_ms
    subs[0].text = "\n".join(s.text for s in subs)
    for s in subs[1:]:
        db.delete(s)
    db.commit()
    return resequence_and_validate(db, project_id)


@router.post("/bulk-speaker", response_model=List[SubtitleResponse])
def bulk_speaker(project_id: int, data: BulkSpeakerRequest, db: Session = Depends(get_db)):
    _get_project(project_id, db)
    save_snapshot(db, project_id, "bulk_speaker")
    for sub in db.query(Subtitle).filter(Subtitle.project_id == project_id, Subtitle.speaker == data.from_speaker).all():
        sub.speaker = data.to_speaker
    db.commit()
    return resequence_and_validate(db, project_id)


@router.put("/batch-update", response_model=List[SubtitleResponse])
def batch_update(project_id: int, items: List[SubtitleBatchItem], db: Session = Depends(get_db)):
    _get_project(project_id, db)
    save_snapshot(db, project_id, "batch_update")
    for item in items:
        sub = db.query(Subtitle).filter(Subtitle.id == item.id, Subtitle.project_id == project_id).first()
        if sub:
            for k, v in item.model_dump(exclude={"id"}).items():
                setattr(sub, k, v)
    db.commit()
    return resequence_and_validate(db, project_id)


@router.post("/undo", response_model=List[SubtitleResponse])
def undo(project_id: int, db: Session = Depends(get_db)):
    _get_project(project_id, db)
    hist = db.query(EditHistory).filter(EditHistory.project_id == project_id).order_by(EditHistory.created_at.desc()).first()
    if not hist:
        raise HTTPException(400, "되돌릴 작업이 없습니다")
    snapshot = hist.snapshot
    db.delete(hist)
    db.commit()
    return restore_snapshot(db, project_id, snapshot)