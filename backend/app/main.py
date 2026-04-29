"""
backend/app/main.py
uvicorn app.main:app --reload --port 8001
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base, SessionLocal
from app.models import User, Workspace
from app.services.auth import hash_password
from app.routers import projects, subtitles, auth, settings, workspaces, permissions

Base.metadata.create_all(bind=engine)

app = FastAPI(title="SubEditor Pro API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://10.0.0.113:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(subtitles.router, prefix="/api/projects/{project_id}/subtitles", tags=["subtitles"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(workspaces.router, prefix="/api/workspaces", tags=["workspaces"])
app.include_router(permissions.router, prefix="/api/permissions", tags=["permissions"])


@app.on_event("startup")
def create_initial_data():
    """초기 마스터 계정 + 방송사 기본 규칙 + 기본 워크스페이스 생성"""
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.role == "master").first():
            master = User(
                username="admin",
                password_hash=hash_password("admin"),
                display_name="관리자",
                role="master",
            )
            worker = User(
                username="worker1",
                password_hash=hash_password("worker1"),
                display_name="작업1",
                role="worker",
            )
            db.add(master)
            db.add(worker)
            db.commit()
            print("✅ 초기 마스터 계정 생성: admin / admin")
            print("✅ 초기 작업자 계정 생성: worker1 / worker1")

        # 기본 워크스페이스 시딩 (워크스페이스가 하나도 없을 때만)
        if not db.query(Workspace).first():
            master_user = db.query(User).filter(User.role == "master").first()
            default_ws = Workspace(
                name="작업 공간",
                parent_id=None,
                depth=1,
                created_by=master_user.id if master_user else None,
            )
            db.add(default_ws)
            db.commit()
            print("✅ 기본 워크스페이스 생성: 기본 작업 공간")

        # 방송사 규칙 시딩
        from app.routers.settings import seed_defaults
        seed_defaults(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}