import { create } from "zustand";
import type { Workspace, Project } from "../types";
import { workspacesApi } from "../api/workspaces";
import { projectsApi } from "../api/projects";

const EXPANDED_STORAGE_KEY = "editor_workspaceTreeExpanded";

// ── localStorage 동기화 헬퍼 ─────────────────────────

function loadExpandedFromStorage(): Set<number> {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.filter((n) => typeof n === "number"));
  } catch {
    return new Set();
  }
}

function saveExpandedToStorage(ids: Set<number>): void {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
}

// ── 내부 헬퍼 ──────────────────────────────────────

function buildById(tree: Workspace[]): Map<number, Workspace> {
  const m = new Map<number, Workspace>();
  for (const w of tree) m.set(w.id, w);
  return m;
}

function buildPath(byId: Map<number, Workspace>, id: number | null): string[] {
  if (id === null) return [];
  const path: string[] = [];
  let current = byId.get(id);
  while (current) {
    path.push(current.name);
    if (current.parent_id === null) break;
    current = byId.get(current.parent_id);
  }
  return path.reverse();
}

// ── 스토어 ─────────────────────────────────────────

interface WorkspaceState {
  // 데이터
  tree: Workspace[];                    // 평탄 리스트 (depth ASC, name ASC 정렬됨)
  byId: Map<number, Workspace>;         // 빠른 lookup
  currentId: number | null;             // 현재 보고 있는 워크스페이스
  currentPath: string[];                // 브레드크럼 (root → current 이름 배열)
  expandedIds: Set<number>;             // 사이드바 펼침 상태 (localStorage 동기화)
  loading: boolean;
  error: string | null;

  // 프로젝트 캐시 (워크스페이스별 lazy fetch)
  projectsByWs: Map<number, Project[]>;
  fetchingProjectsForWs: Set<number>;

  // 조회
  fetch: () => Promise<void>;
  setCurrentId: (id: number | null) => void;

  // 트리 헬퍼
  getChildren: (parentId: number | null) => Workspace[];
  getDescendantIds: (id: number) => number[];               // 후손 ID들 (자기 제외)
  isAncestor: (ancestorId: number, descendantId: number) => boolean;

  // 펼침/접힘
  toggleExpanded: (id: number) => void;
  expandPath: (id: number) => void;                          // 활성 노드의 조상 경로 자동 펼침
  isExpanded: (id: number) => boolean;

  // 프로젝트 캐시 액션
  fetchProjectsForWs: (workspaceId: number) => Promise<void>;
  invalidateProjectsForWs: (workspaceId: number) => void;
  invalidateAllProjects: () => void;

  // CRUD 액션 (master/manager만 — 권한 체크는 백엔드에서)
  create: (name: string, parentId: number | null) => Promise<Workspace>;
  rename: (id: number, name: string) => Promise<Workspace>;
  remove: (
    id: number,
    force?: boolean,
  ) => Promise<{ deleted_workspaces: number; deleted_projects: number }>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  tree: [],
  byId: new Map(),
  currentId: null,
  currentPath: [],
  expandedIds: loadExpandedFromStorage(),
  loading: false,
  error: null,

  projectsByWs: new Map(),
  fetchingProjectsForWs: new Set(),

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const tree = await workspacesApi.list();
      const byId = buildById(tree);
      const { currentId } = get();
      const currentPath = buildPath(byId, currentId);
      // 트리 갱신 시 프로젝트 캐시도 비움 (작업자 권한 변경 등으로 보이는 범위가 달라질 수 있음)
      set({ tree, byId, currentPath, loading: false, projectsByWs: new Map() });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "fetch failed" });
    }
  },

  setCurrentId: (id) => {
    const { byId } = get();
    const currentPath = buildPath(byId, id);
    set({ currentId: id, currentPath });
    if (id !== null) {
      // 활성 노드의 조상 경로 자동 펼침
      get().expandPath(id);
    }
  },

  getChildren: (parentId) => {
    const { tree } = get();
    return tree.filter((w) => w.parent_id === parentId);
  },

  getDescendantIds: (id) => {
    const { tree } = get();
    const result: number[] = [];
    const stack: number[] = [id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const w of tree) {
        if (w.parent_id === cur) {
          result.push(w.id);
          stack.push(w.id);
        }
      }
    }
    return result;
  },

  isAncestor: (ancestorId, descendantId) => {
    const { byId } = get();
    let cur = byId.get(descendantId);
    while (cur && cur.parent_id !== null) {
      if (cur.parent_id === ancestorId) return true;
      cur = byId.get(cur.parent_id);
    }
    return false;
  },

  toggleExpanded: (id) => {
    const { expandedIds } = get();
    const next = new Set(expandedIds);
    const willExpand = !next.has(id);
    if (willExpand) next.add(id);
    else next.delete(id);
    saveExpandedToStorage(next);
    set({ expandedIds: next });
    // 펼치는 순간에 프로젝트 lazy fetch
    if (willExpand) {
      get().fetchProjectsForWs(id);
    }
  },

  expandPath: (id) => {
    const { byId, expandedIds } = get();
    const next = new Set(expandedIds);
    const newlyExpanded: number[] = [];
    // 자기 자신은 안 펼침. 부모부터 root까지 펼침.
    let cur = byId.get(id);
    while (cur && cur.parent_id !== null) {
      if (!next.has(cur.parent_id)) {
        next.add(cur.parent_id);
        newlyExpanded.push(cur.parent_id);
      }
      cur = byId.get(cur.parent_id);
    }
    saveExpandedToStorage(next);
    set({ expandedIds: next });
    // 새로 펼친 조상들의 프로젝트도 fetch
    for (const wsId of newlyExpanded) {
      get().fetchProjectsForWs(wsId);
    }
  },

  isExpanded: (id) => {
    return get().expandedIds.has(id);
  },

  fetchProjectsForWs: async (workspaceId) => {
    const { projectsByWs, fetchingProjectsForWs } = get();
    // 이미 캐시되어 있거나 fetch 중이면 스킵
    if (projectsByWs.has(workspaceId) || fetchingProjectsForWs.has(workspaceId)) {
      return;
    }
    const nextFetching = new Set(fetchingProjectsForWs);
    nextFetching.add(workspaceId);
    set({ fetchingProjectsForWs: nextFetching });
    try {
      const list = await projectsApi.list({ workspace_id: workspaceId });
      const nextMap = new Map(get().projectsByWs);
      nextMap.set(workspaceId, list);
      const nextFetching2 = new Set(get().fetchingProjectsForWs);
      nextFetching2.delete(workspaceId);
      set({ projectsByWs: nextMap, fetchingProjectsForWs: nextFetching2 });
    } catch {
      const nextFetching2 = new Set(get().fetchingProjectsForWs);
      nextFetching2.delete(workspaceId);
      set({ fetchingProjectsForWs: nextFetching2 });
    }
  },

  invalidateProjectsForWs: (workspaceId) => {
    const next = new Map(get().projectsByWs);
    next.delete(workspaceId);
    set({ projectsByWs: next });
  },

  invalidateAllProjects: () => {
    set({ projectsByWs: new Map() });
  },

  create: async (name, parentId) => {
    const ws = await workspacesApi.create({ name, parent_id: parentId });
    await get().fetch();
    return ws;
  },

  rename: async (id, name) => {
    const ws = await workspacesApi.rename(id, name);
    await get().fetch();
    return ws;
  },

  remove: async (id, force = false) => {
    // currentId가 삭제 대상 또는 그 후손이면 미리 null 처리 (fetch 전 상태로 검사)
    const { currentId, isAncestor } = get();
    const shouldClearCurrent =
      currentId === id ||
      (currentId !== null && isAncestor(id, currentId));

    const result = await workspacesApi.remove(id, force);

    if (shouldClearCurrent) {
      set({ currentId: null, currentPath: [] });
    }
    await get().fetch();
    return result;
  },
}));