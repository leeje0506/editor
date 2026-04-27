import api from "./client";

export interface BroadcasterPermission {
  id: number;
  user_id: number;
  broadcaster: string;
  granted_by: number | null;
  granted_by_name: string | null;
  created_at: string;
}

export interface UserPermissionSummary {
  user_id: number;
  user_name: string | null;
  role: string | null;
  broadcasters: string[];
}

export interface PermissionRequest {
  id: number;
  user_id: number;
  user_name: string | null;
  broadcaster: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export const permissionsApi = {
  // ── 권한 조회 ──

  /** 내 방송사 권한 (방송사명 배열) */
  getMyPermissions: async (): Promise<string[]> => {
    const { data } = await api.get("/permissions/me");
    return data;
  },

  /** 특정 사용자 권한 상세 */
  getUserPermissions: async (userId: number): Promise<BroadcasterPermission[]> => {
    const { data } = await api.get(`/permissions/users/${userId}`);
    return data;
  },

  /** 전체 사용자 권한 (관리자) */
  getAllPermissions: async (): Promise<UserPermissionSummary[]> => {
    const { data } = await api.get("/permissions/all");
    return data;
  },

  // ── 권한 부여/해제 (관리자) ──

  /** 단건 부여 */
  grant: async (userId: number, broadcaster: string) => {
    const { data } = await api.post("/permissions/grant", { user_id: userId, broadcaster });
    return data;
  },

  /** 일괄 설정 (기존 교체) */
  bulkGrant: async (userId: number, broadcasters: string[]) => {
    const { data } = await api.post("/permissions/bulk-grant", { user_id: userId, broadcasters });
    return data;
  },

  /** 단건 해제 */
  revoke: async (userId: number, broadcaster: string) => {
    const { data } = await api.post("/permissions/revoke", { user_id: userId, broadcaster });
    return data;
  },

  // ── 권한 요청 ──

  /** 권한 요청 생성 */
  createRequest: async (broadcaster: string, reason?: string): Promise<PermissionRequest> => {
    const { data } = await api.post("/permissions/requests", { broadcaster, reason });
    return data;
  },

  /** 권한 요청 목록 */
  listRequests: async (status?: string): Promise<PermissionRequest[]> => {
    const params: any = {};
    if (status) params.status = status;
    const { data } = await api.get("/permissions/requests", { params });
    return data;
  },

  /** 대기 중 요청 수 */
  pendingCount: async (): Promise<number> => {
    const { data } = await api.get("/permissions/requests/pending/count");
    return data.count;
  },

  /** 요청 승인/거절 */
  reviewRequest: async (requestId: number, status: "approved" | "rejected"): Promise<PermissionRequest> => {
    const { data } = await api.patch(`/permissions/requests/${requestId}`, { status });
    return data;
  },
};