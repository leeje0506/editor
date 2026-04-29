import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronRight, Plus, Home as HomeIcon } from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { useAuthStore } from "../../store/useAuthStore";
import { projectsApi } from "../../api/projects";
import { workspacesApi } from "../../api/workspaces";
import type { Project, Workspace } from "../../types";
import { TopBar } from "../layout/TopBar";
import { WorkspaceTree, type TreeMenuAction } from "./WorkspaceTree";
import { WorkspaceCard } from "./WorkspaceCard";
import { ProjectCard } from "./ProjectCard";
import { WorkspaceRenameModal } from "./WorkspaceRenameModal";
import {
  WorkspaceDeleteModal,
  type WorkspaceCounts,
} from "./WorkspaceDeleteModal";
import { NewProjectModal } from "./NewProjectModal";

const DARK_KEY = "editor_darkMode";
const MAX_DEPTH = 3;

interface Stats {
  sub_workspace_count: number;
  project_count: number;
  completed_count: number;
  member_count: number;
  progress_ratio: number;
}

export function WorkspaceExplorer() {
  const navigate = useNavigate();
  const { workspaceId: workspaceIdParam } = useParams<{ workspaceId?: string }>();

  const isAdmin = useAuthStore((s) => s.isAdmin());

  const tree = useWorkspaceStore((s) => s.tree);
  const byId = useWorkspaceStore((s) => s.byId);
  const currentId = useWorkspaceStore((s) => s.currentId);
  const currentPath = useWorkspaceStore((s) => s.currentPath);
  const fetchTree = useWorkspaceStore((s) => s.fetch);
  const setCurrentId = useWorkspaceStore((s) => s.setCurrentId);
  const createWorkspace = useWorkspaceStore((s) => s.create);
  const removeWorkspace = useWorkspaceStore((s) => s.remove);
  const invalidateProjectsForWs = useWorkspaceStore((s) => s.invalidateProjectsForWs);

  // ── 다크 모드 ──
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DARK_KEY) !== "false"; // 기본값 true (HomePage와 동일)
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(DARK_KEY, String(dark));
    } catch {
      /* ignore */
    }
  }, [dark]);

  // ── 본문 데이터 ──
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // ── 모달 상태 ──
  const [renameTarget, setRenameTarget] = useState<Workspace | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ws: Workspace; counts: WorkspaceCounts } | null>(null);
  const [newProjectFor, setNewProjectFor] = useState<number | null>(null);

  // ── 초기 트리 fetch ──
  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // ── URL ↔ store 동기화 ──
  useEffect(() => {
    const nextId = workspaceIdParam ? parseInt(workspaceIdParam, 10) : null;
    if (nextId !== currentId) {
      setCurrentId(nextId);
    }
  }, [workspaceIdParam, currentId, setCurrentId]);

  // ── 본문 데이터 fetch (프로젝트 + 통계) ──
  const fetchBody = useCallback(async () => {
    if (currentId === null) {
      setProjects([]);
      setStats(null);
      return;
    }
    try {
      const p = await projectsApi.list({ workspace_id: currentId });
      setProjects(p);
    } catch {
      setProjects([]);
    }
    if (isAdmin) {
      try {
        const s = await workspacesApi.getStats(currentId);
        setStats(s as Stats);
      } catch {
        setStats(null);
      }
    } else {
      setStats(null);
    }
  }, [currentId, isAdmin]);

  useEffect(() => {
    fetchBody();
  }, [fetchBody]);

  // ── 워크스페이스 생성 (공통 헬퍼) ──
  const promptAndCreate = useCallback(
    async (parentId: number | null) => {
      const name = window.prompt("새 워크스페이스 이름:");
      if (!name || !name.trim()) return;
      try {
        const created = await createWorkspace(name.trim(), parentId);
        // 부모 워크스페이스를 보고 있던 중이면 본문 카드 그리드도 갱신
        void fetchBody();
        navigate(`/projects/${created.id}`);
      } catch (err: any) {
        alert(err?.response?.data?.detail || "생성 실패");
      }
    },
    [createWorkspace, navigate, fetchBody],
  );

  // ── 워크스페이스 삭제 흐름 ──
  const startDelete = useCallback(
    async (ws: Workspace) => {
      if (!confirm(`'${ws.name}' 워크스페이스를 삭제하시겠습니까?`)) return;
      try {
        await removeWorkspace(ws.id, false);
        // 비어있어서 성공 — store가 트리/현재 자동 갱신, 본문도 갱신
        void fetchBody();
      } catch (err: any) {
        const status = err?.response?.status;
        // FastAPI HTTPException은 응답 본문이 { detail: ... } 형태로 감싸짐.
        // detail이 객체면 풀어서 사용, 문자열이면 그대로 메시지로 표시.
        const detail = err?.response?.data?.detail;
        if (
          status === 409 &&
          detail &&
          typeof detail === "object" &&
          detail.error === "not_empty"
        ) {
          setDeleteTarget({
            ws,
            counts: {
              workspace_count: detail.workspace_count ?? 0,
              project_count: detail.project_count ?? 0,
              subtitle_count: detail.subtitle_count ?? 0,
            },
          });
        } else {
          alert(typeof detail === "string" ? detail : "삭제 실패");
        }
      }
    },
    [removeWorkspace, fetchBody],
  );

  // ── 트리 메뉴 액션 ──
  const handleMenuAction = useCallback(
    (action: TreeMenuAction, ws: Workspace) => {
      if (action === "new_workspace") {
        promptAndCreate(ws.id);
      } else if (action === "new_project") {
        setNewProjectFor(ws.id);
      } else if (action === "rename") {
        setRenameTarget(ws);
      } else if (action === "delete") {
        startDelete(ws);
      }
    },
    [promptAndCreate, startDelete],
  );

  // ── 카드/사이드바 클릭 ──
  const handleSelectWs = useCallback(
    (id: number) => navigate(`/projects/${id}`),
    [navigate],
  );
  const handleOpenProject = useCallback(
    (id: number) => navigate(`/editor/${id}`),
    [navigate],
  );

  // ── 본문 데이터 ──
  const currentWs = currentId !== null ? byId.get(currentId) ?? null : null;
  const childWorkspaces = useMemo(() => {
    if (currentId !== null) {
      return tree.filter((w) => w.parent_id === currentId);
    }
    // 루트 뷰 — parent_id null이거나 부모가 응답에 없는 노드
    const ids = new Set(tree.map((w) => w.id));
    return tree.filter((w) => w.parent_id === null || !ids.has(w.parent_id));
  }, [tree, currentId]);
  const atMaxDepth = currentWs ? (currentWs.depth ?? 1) >= MAX_DEPTH : false;
  const isEmptyView =
    childWorkspaces.length === 0 && projects.length === 0;

  // ── 색상 ──
  const bgCls = dark ? "bg-zinc-950" : "bg-gray-50";
  const sidebarCls = dark ? "bg-zinc-900 border-zinc-800" : "bg-white border-gray-200";
  const headerBarCls = dark ? "bg-zinc-900 border-zinc-800 text-gray-100" : "bg-white border-gray-200 text-gray-900";
  const sectionCardCls = dark ? "bg-zinc-900 border-zinc-800" : "bg-white border-gray-200";
  const breadcrumbCls = dark ? "text-gray-500" : "text-gray-500";
  const breadcrumbActiveCls = dark ? "text-gray-300" : "text-gray-700";
  const titleCls = dark ? "text-gray-100" : "text-gray-900";
  const mutedCls = dark ? "text-gray-400" : "text-gray-600";
  const outlineBtnCls = dark
    ? "border-zinc-700 hover:bg-zinc-800 text-gray-200"
    : "border-gray-300 hover:bg-gray-100 text-gray-700";
  const barBgCls = dark ? "bg-zinc-800" : "bg-gray-200";

  return (
    <div className={`flex flex-col h-screen ${bgCls}`}>
      {/* 공통 상단바 */}
      <TopBar dark={dark} onToggleDark={() => setDark((d) => !d)} />

      <div className="flex flex-1 min-h-0">
        {/* ── 좌측 사이드바 ── */}
        <aside className={`w-[220px] border-r flex flex-col shrink-0 ${sidebarCls}`}>
          <WorkspaceTree
            onSelect={handleSelectWs}
            onSelectProject={handleOpenProject}
            onMenuAction={handleMenuAction}
            onCreateRoot={() => promptAndCreate(null)}
            dark={dark}
          />
        </aside>

        {/* ── 우측 본문 ── */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* 헤더: 브레드크럼 + 제목 + 액션 */}
          <div className={`px-6 py-4 border-b shrink-0 ${headerBarCls}`}>
            <div className={`text-xs ${breadcrumbCls} flex items-center gap-1 mb-2`}>
              <button
                onClick={() => navigate("/projects")}
                className={`hover:underline flex items-center gap-1 ${
                  currentId === null ? breadcrumbActiveCls : ""
                }`}
              >
                <HomeIcon size={11} />
                <span>{isAdmin ? "워크스페이스" : "내 작업"}</span>
              </button>
              {currentPath.map((name, idx) => {
                const isLast = idx === currentPath.length - 1;
                return (
                  <span key={idx} className="flex items-center gap-1">
                    <ChevronRight size={11} />
                    <span className={isLast ? breadcrumbActiveCls : ""}>{name}</span>
                  </span>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3">
              <h1 className={`text-lg font-semibold truncate ${titleCls}`}>
                {currentWs ? currentWs.name : isAdmin ? "워크스페이스" : "내 작업"}
              </h1>
              <div className="flex items-center gap-2">
                {/* 새 워크스페이스 — 관리자만, depth 3 미만 */}
                {isAdmin && !atMaxDepth && (
                  <button
                    onClick={() => promptAndCreate(currentId)}
                    className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 border ${outlineBtnCls}`}
                  >
                    <Plus size={12} />
                    <span>새 워크스페이스</span>
                  </button>
                )}
                {/* 새 프로젝트 — 워크스페이스 안에서만 */}
                {currentId !== null && (
                  <button
                    onClick={() => setNewProjectFor(currentId)}
                    className="px-3 py-1.5 rounded text-xs flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    <Plus size={12} />
                    <span>새 프로젝트</span>
                  </button>
                )}
              </div>
            </div>

            {/* 메타 (관리자 + 현재 워크스페이스) */}
            {isAdmin && currentWs && stats && (
              <div className={`mt-3 text-xs ${mutedCls}`}>
                하위 {stats.sub_workspace_count} · 완료 {stats.completed_count}/{stats.project_count} · 멤버 {stats.member_count}
              </div>
            )}
          </div>

          {/* 진척률 카드 (관리자, 현재 워크스페이스, 프로젝트 1개 이상) */}
          {isAdmin && currentWs && stats && stats.project_count > 0 && (() => {
            const pct = Math.min(100, Math.round(stats.progress_ratio * 100));
            return (
              <div className={`mx-6 mt-4 p-4 border rounded-lg shrink-0 ${sectionCardCls}`}>
                <div className="flex items-end justify-between mb-2">
                  <span className={`text-xs ${mutedCls}`}>전체 진척률</span>
                  <span className={`text-2xl font-bold ${titleCls}`}>
                    {pct}%
                    <span className={`ml-2 text-xs font-normal ${mutedCls}`}>완료</span>
                  </span>
                </div>
                <div className={`h-2 rounded-full overflow-hidden ${barBgCls}`}>
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className={`mt-1 text-xs ${mutedCls} text-right`}>
                  {stats.completed_count}/{stats.project_count}
                </div>
              </div>
            );
          })()}

          {/* 카드 그리드 */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isEmptyView ? (
              <div className={`text-center py-12 text-sm ${mutedCls}`}>
                {currentId === null
                  ? isAdmin
                    ? "워크스페이스가 없습니다. 우측 상단 [새 워크스페이스]로 만들어 보세요."
                    : "접근 권한이 있는 워크스페이스가 없습니다."
                  : "이 워크스페이스에 항목이 없습니다."}
              </div>
            ) : (
              <>
                {childWorkspaces.length > 0 && (
                  <section className="mb-6">
                    <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${mutedCls}`}>
                      워크스페이스
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {childWorkspaces.map((ws) => (
                        <WorkspaceCard
                          key={ws.id}
                          ws={ws}
                          onClick={handleSelectWs}
                          onRenamed={() => { void fetchTree(); void fetchBody(); }}
                          onDeleted={() => { void fetchTree(); void fetchBody(); }}
                          dark={dark}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {currentId !== null && projects.length > 0 && (
                  <section>
                    <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${mutedCls}`}>
                      프로젝트
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {projects.map((p) => (
                        <ProjectCard
                          key={p.id}
                          project={p}
                          onClick={handleOpenProject}
                          isWorker={!isAdmin}
                          onRenamed={() => { void fetchBody(); if (currentId !== null) invalidateProjectsForWs(currentId); }}
                          onDeleted={() => { void fetchBody(); if (currentId !== null) invalidateProjectsForWs(currentId); }}
                          dark={dark}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* ── 모달들 ── */}
      {renameTarget && (
        <WorkspaceRenameModal
          isOpen={true}
          onClose={() => setRenameTarget(null)}
          workspaceId={renameTarget.id}
          currentName={renameTarget.name}
          onRenamed={() => {
            void fetchTree();
            void fetchBody();
          }}
          dark={dark}
        />
      )}
      {deleteTarget && (
        <WorkspaceDeleteModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          workspaceId={deleteTarget.ws.id}
          workspaceName={deleteTarget.ws.name}
          counts={deleteTarget.counts}
          onDeleted={() => {
            void fetchTree();
            void fetchBody();
          }}
          dark={dark}
        />
      )}
      {newProjectFor !== null && (
        <NewProjectModal
          dark={dark}
          initialWorkspaceId={newProjectFor}
          onClose={() => setNewProjectFor(null)}
          onCreate={(project) => {
            setNewProjectFor(null);
            // 트리·본문 갱신 후 편집기로 이동 (다른 워크스페이스에 만들었으면 그쪽 카드도 최신)
            void fetchTree();
            void fetchBody();
            // 새 프로젝트가 들어간 워크스페이스의 사이드바 캐시 무효화
            invalidateProjectsForWs(project.workspace_id);
            navigate(`/editor/${project.id}`);
          }}
        />
      )}
    </div>
  );
}