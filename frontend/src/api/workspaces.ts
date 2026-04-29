// src/api/workspaces.ts
import api from "./client";
import type { Workspace, WorkspaceStats } from "../types";
import { ensureArray, ensureObject } from "./guards";

export const workspacesApi = {
  /** 트리 평탄 리스트 조회.
   * - master/manager: 전체 + stats 포함
   * - worker: 권한 트리(가상 루트 + 후손)만, stats null
   */
  list: async (): Promise<Workspace[]> => {
    const r = await api.get("/workspaces");
    return ensureArray<Workspace>(r.data, "workspacesApi.list");
  },

  /** 단건 상세 */
  get: async (id: number): Promise<Workspace> => {
    const r = await api.get(`/workspaces/${id}`);
    return ensureObject<Workspace>(r.data, "workspacesApi.get");
  },

  /** 통계 (관리자만, 재귀 합산) */
  getStats: async (id: number): Promise<WorkspaceStats> => {
    const r = await api.get(`/workspaces/${id}/stats`);
    return ensureObject<WorkspaceStats>(r.data, "workspacesApi.getStats");
  },

  /** 생성. depth는 서버에서 자동 계산. 같은 부모 아래 이름 중복 시 자동 번호 부여 */
  create: async (data: { name: string; parent_id: number | null }): Promise<Workspace> => {
    const r = await api.post("/workspaces", data);
    return ensureObject<Workspace>(r.data, "workspacesApi.create");
  },

  /** 이름 변경 (v1에서는 이름만 지원, 이동 미지원) */
  rename: async (id: number, name: string): Promise<Workspace> => {
    const r = await api.patch(`/workspaces/${id}`, { name });
    return ensureObject<Workspace>(r.data, "workspacesApi.rename");
  },

  /** 삭제.
   * - 비어있으면 즉시 삭제
   * - 비어있지 않고 force=false → 409 + 카운트 ({error: "not_empty", workspace_count, project_count, subtitle_count})
   * - force=true → 트랜잭션 내 강제 삭제 ({deleted_workspaces, deleted_projects})
   */
  remove: async (id: number, force: boolean = false) => {
    const r = await api.delete(`/workspaces/${id}`, { params: { force } });
    return r.data as { deleted_workspaces: number; deleted_projects: number };
  },
};