import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight, ChevronDown, Folder, FolderOpen, Plus, FileText,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { useAuthStore } from "../../store/useAuthStore";
import type { Workspace, Project } from "../../types";

export type TreeMenuAction = "new_workspace" | "new_project" | "rename" | "delete";

interface Props {
  onSelect: (id: number) => void;
  onSelectProject: (id: number) => void;
  onMenuAction: (action: TreeMenuAction, ws: Workspace) => void;
  dark?: boolean;
}

const MAX_DEPTH = 3;

export function WorkspaceTree({
  onSelect,
  onSelectProject,
  onMenuAction,
  dark = false,
}: Props) {
  const tree = useWorkspaceStore((s) => s.tree);
  const currentId = useWorkspaceStore((s) => s.currentId);
  const expandedIds = useWorkspaceStore((s) => s.expandedIds);
  const toggleExpanded = useWorkspaceStore((s) => s.toggleExpanded);
  const projectsByWs = useWorkspaceStore((s) => s.projectsByWs);
  const fetchingProjectsForWs = useWorkspaceStore((s) => s.fetchingProjectsForWs);
  const isAdmin = useAuthStore((s) => s.isAdmin());

  const roots = useMemo(() => {
    // 루트 = parent_id가 null이거나, 부모가 응답에 없는 노드 (작업자는 권한 받은 노드만 보이므로 부모가 누락될 수 있음)
    const ids = new Set(tree.map((w) => w.id));
    return tree.filter((w) => w.parent_id === null || !ids.has(w.parent_id));
  }, [tree]);

  const [menuFor, setMenuFor] = useState<{ ws: Workspace; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);

  const handleMenuClick = (action: TreeMenuAction) => {
    if (!menuFor) return;
    const ws = menuFor.ws;
    setMenuFor(null);
    onMenuAction(action, ws);
  };

  // 색상
  const headerCls = dark ? "text-gray-300" : "text-gray-700";
  const mutedCls = dark ? "text-gray-500" : "text-gray-500";
  const hoverBgCls = dark ? "hover:bg-zinc-800" : "hover:bg-gray-100";
  const activeBgCls = dark ? "bg-blue-900/40" : "bg-blue-50";
  const activeTextCls = dark ? "text-blue-200" : "text-blue-700";
  const menuCardCls = dark
    ? "bg-zinc-900 border-zinc-700 text-gray-100"
    : "bg-white border-gray-200 text-gray-900";
  const menuItemCls = dark ? "hover:bg-zinc-800" : "hover:bg-gray-100";

  return (
    <div className="flex flex-col h-full">
      <div
        className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${headerCls}`}
      >
        {isAdmin ? "워크스페이스" : "내 워크스페이스"}
      </div>

      <div className="flex-1 overflow-y-auto">
        {roots.length === 0 ? (
          <div className={`px-3 py-4 text-xs ${mutedCls}`}>
            {isAdmin
              ? "워크스페이스가 없습니다. 우측 상단에서 새로 만드세요."
              : "접근 권한이 있는 워크스페이스가 없습니다."}
          </div>
        ) : (
          <ul className="py-1">
            {roots.map((ws) => (
              <TreeNode
                key={ws.id}
                ws={ws}
                depth={1}
                tree={tree}
                currentId={currentId}
                expandedIds={expandedIds}
                toggleExpanded={toggleExpanded}
                projectsByWs={projectsByWs}
                fetchingProjectsForWs={fetchingProjectsForWs}
                onSelect={onSelect}
                onSelectProject={onSelectProject}
                onOpenMenu={(w, x, y) => setMenuFor({ ws: w, x, y })}
                isAdmin={isAdmin}
                hoverBgCls={hoverBgCls}
                activeBgCls={activeBgCls}
                activeTextCls={activeTextCls}
                mutedCls={mutedCls}
              />
            ))}
          </ul>
        )}
      </div>

      {menuFor &&
        createPortal(
          <div
            className={`fixed z-50 min-w-[160px] py-1 border rounded shadow-lg ${menuCardCls}`}
            style={{ left: menuFor.x, top: menuFor.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const atMaxDepth = (menuFor.ws.depth ?? 1) >= MAX_DEPTH;
              return (
                <>
                  <button
                    onClick={() => handleMenuClick("new_workspace")}
                    disabled={atMaxDepth}
                    className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between ${
                      atMaxDepth ? "opacity-40 cursor-not-allowed" : menuItemCls
                    }`}
                  >
                    <span>새 워크스페이스</span>
                    {atMaxDepth && (
                      <span className={`text-[10px] ${mutedCls}`}>최대 깊이</span>
                    )}
                  </button>
                  <button
                    onClick={() => handleMenuClick("new_project")}
                    className={`w-full px-3 py-1.5 text-left text-xs ${menuItemCls}`}
                  >
                    새 프로젝트
                  </button>
                  <div
                    className={`my-1 border-t ${dark ? "border-zinc-700" : "border-gray-200"}`}
                  />
                  <button
                    onClick={() => handleMenuClick("rename")}
                    className={`w-full px-3 py-1.5 text-left text-xs ${menuItemCls}`}
                  >
                    이름 변경
                  </button>
                  <button
                    onClick={() => handleMenuClick("delete")}
                    className={`w-full px-3 py-1.5 text-left text-xs text-red-400 ${menuItemCls}`}
                  >
                    삭제
                  </button>
                </>
              );
            })()}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── 단일 노드 ──

interface TreeNodeProps {
  ws: Workspace;
  depth: number;
  tree: Workspace[];
  currentId: number | null;
  expandedIds: Set<number>;
  toggleExpanded: (id: number) => void;
  projectsByWs: Map<number, Project[]>;
  fetchingProjectsForWs: Set<number>;
  onSelect: (id: number) => void;
  onSelectProject: (id: number) => void;
  onOpenMenu: (ws: Workspace, x: number, y: number) => void;
  isAdmin: boolean;
  hoverBgCls: string;
  activeBgCls: string;
  activeTextCls: string;
  mutedCls: string;
}

function TreeNode({
  ws,
  depth,
  tree,
  currentId,
  expandedIds,
  toggleExpanded,
  projectsByWs,
  fetchingProjectsForWs,
  onSelect,
  onSelectProject,
  onOpenMenu,
  isAdmin,
  hoverBgCls,
  activeBgCls,
  activeTextCls,
  mutedCls,
}: TreeNodeProps) {
  const children = useMemo(
    () => tree.filter((w) => w.parent_id === ws.id),
    [tree, ws.id],
  );
  const projects = projectsByWs.get(ws.id) ?? [];
  const isLoadingProjects =
    fetchingProjectsForWs.has(ws.id) && !projectsByWs.has(ws.id);
  const hasChildren = children.length > 0;
  // "펼칠 거리"가 있는지: 자식 워크스페이스 또는 프로젝트가 있거나 로딩 중
  const hasContent = hasChildren || projects.length > 0 || isLoadingProjects;
  const isExpanded = expandedIds.has(ws.id);
  const isActive = currentId === ws.id;
  const plusBtnRef = useRef<HTMLButtonElement>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpanded(ws.id);
  };

  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = plusBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    onOpenMenu(ws, rect.right + 4, rect.top);
  };

  const progressPct =
    typeof ws.progress_ratio === "number"
      ? Math.round(ws.progress_ratio * 100)
      : null;

  // 화살표 노출: 자식 워크스페이스가 있거나, 캐시상 프로젝트가 있을 때.
  // (캐시 미스 상태에선 안 보이지만, 펼치면 lazy fetch 후 표시됨 — 일단 누를 수 있게 자식 없어도 항상 보이게 함)
  const showChevron = true;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 pr-1 py-1 cursor-pointer ${
          isActive ? `${activeBgCls} ${activeTextCls}` : hoverBgCls
        }`}
        style={{ paddingLeft: `${(depth - 1) * 12 + 8}px` }}
        onClick={() => onSelect(ws.id)}
      >
        <button
          onClick={handleToggle}
          className="p-0.5 shrink-0 hover:opacity-70"
          aria-label={isExpanded ? "접기" : "펼치기"}
          style={{ visibility: showChevron ? "visible" : "hidden" }}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {isExpanded && hasContent ? (
          <FolderOpen size={13} className="shrink-0" />
        ) : (
          <Folder size={13} className="shrink-0" />
        )}

        <span className="flex-1 text-xs truncate">{ws.name}</span>

        {isAdmin && progressPct !== null && (
          <span className={`text-[10px] ${mutedCls} shrink-0`}>{progressPct}%</span>
        )}

        {isAdmin && (
          <button
            ref={plusBtnRef}
            onClick={handlePlusClick}
            className="p-0.5 shrink-0 opacity-0 group-hover:opacity-100 hover:bg-black/10 rounded"
            aria-label="메뉴"
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      {isExpanded && (
        <ul>
          {/* 자식 워크스페이스 */}
          {children.map((child) => (
            <TreeNode
              key={child.id}
              ws={child}
              depth={depth + 1}
              tree={tree}
              currentId={currentId}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              projectsByWs={projectsByWs}
              fetchingProjectsForWs={fetchingProjectsForWs}
              onSelect={onSelect}
              onSelectProject={onSelectProject}
              onOpenMenu={onOpenMenu}
              isAdmin={isAdmin}
              hoverBgCls={hoverBgCls}
              activeBgCls={activeBgCls}
              activeTextCls={activeTextCls}
              mutedCls={mutedCls}
            />
          ))}

          {/* 프로젝트 로딩 인디케이터 */}
          {isLoadingProjects && (
            <li
              className={`text-[10px] ${mutedCls} py-0.5`}
              style={{ paddingLeft: `${depth * 12 + 8 + 14}px` }}
            >
              로딩 중...
            </li>
          )}

          {/* 프로젝트 노드들 */}
          {projects.map((p) => (
            <li
              key={`p-${p.id}`}
              className={`group flex items-center gap-1 pr-1 py-1 cursor-pointer ${hoverBgCls}`}
              style={{ paddingLeft: `${depth * 12 + 8 + 14}px` }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectProject(p.id);
              }}
            >
              <FileText size={12} className="shrink-0 text-blue-500" />
              <span className="flex-1 text-xs truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}