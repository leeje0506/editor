// src/api/permissions.ts
import api from "./client";
import type { WorkspaceBrief } from "../types";

/**
 * 워크스페이스 권한 응답 (조회 시 사용).
 * granter 정보 포함.
 */
export interface WorkspacePermission {
  id: number;
  user_id: number;
  workspace: WorkspaceBrief | null;
  granted_by: number | null;
  granted_by_name: string | null;
  created_at: string | null;
}

/** 전체 사용자 권한 응답 (관리자) — user_id별 그룹핑 */
export interface UserPermissionSummary {
  user_id: number;
  user_name: string | null;
  role: string | null;
  workspaces: WorkspaceBrief[];
}

export const permissionsApi = {
  // ── 권한 조회 ──

  /** 내 워크스페이스 권한 (직접 부여 받은 노드만) */
  getMyPermissions: async (): Promise<WorkspacePermission[]> => {
    const { data } = await api.get("/permissions/me");
    return data;
  },

  /** 특정 사용자 권한 상세. worker는 본인 것만 조회 가능 */
  getUserPermissions: async (userId: number): Promise<WorkspacePermission[]> => {
    const { data } = await api.get(`/permissions/users/${userId}`);
    return data;
  },

  /** 전체 사용자 권한 (관리자). user_id별 그룹핑 */
  getAllPermissions: async (): Promise<UserPermissionSummary[]> => {
    const { data } = await api.get("/permissions/all");
    return data;
  },

  // ── 권한 부여/해제 (관리자) ──

  /** 단건 부여. 같은 (user, workspace) 쌍이 이미 있으면 already_exists 응답 */
  grant: async (userId: number, workspaceId: number) => {
    const { data } = await api.post("/permissions/grant", {
      user_id: userId,
      workspace_id: workspaceId,
    });
    return data;
  },

  /** 일괄 설정 — 해당 사용자의 권한을 workspaceIds 목록으로 교체 (기존 전체 삭제 후 재부여) */
  bulkGrant: async (userId: number, workspaceIds: number[]) => {
    const { data } = await api.post("/permissions/bulk-grant", {
      user_id: userId,
      workspace_ids: workspaceIds,
    });
    return data;
  },

  /** 단건 해제 */
  revoke: async (userId: number, workspaceId: number) => {
    const { data } = await api.post("/permissions/revoke", {
      user_id: userId,
      workspace_id: workspaceId,
    });
    return data;
  },
};