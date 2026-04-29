// src/api/projects.ts
import api from "./client";
import type { Project } from "../types";
import { ensureArray, ensureObject } from "./guards";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

type BroadcasterRule = {
  max_lines: number;
  max_chars_per_line: number;
  bracket_chars: number;
  allow_overlap: boolean;
  min_duration_ms: number;
  speaker_mode: string;
};

export const projectsApi = {
  list: async (params?: {
    status?: string;
    broadcaster?: string;
    search?: string;
    workspace_id?: number;
  }) => {
    const r = await api.get("/projects", { params });
    return ensureArray<Project>(r.data, "projectsApi.list");
  },

  get: async (id: number) => {
    const r = await api.get(`/projects/${id}`);
    return ensureObject<Project>(r.data, "projectsApi.get");
  },

  create: async (data: {
    workspace_id: number;          // ★ 필수 — 모든 프로젝트는 워크스페이스 소속
    name: string;
    broadcaster?: string;
    description?: string;
    deadline?: string;
    assigned_to?: number;
  }) => {
    const r = await api.post("/projects", data);
    return ensureObject<Project>(r.data, "projectsApi.create");
  },

  update: async (id: number, data: Record<string, unknown>) => {
    const r = await api.patch(`/projects/${id}`, data);
    return ensureObject<Project>(r.data, "projectsApi.update");
  },

  delete: (id: number) => api.delete(`/projects/${id}`),

  /** 다중 삭제 — 백엔드는 한 번에 한 건씩 DELETE 받으므로 클라이언트에서 Promise.all로 묶음 */
  deleteMany: async (ids: number[]) => {
    await Promise.all(ids.map((id) => api.delete(`/projects/${id}`)));
  },

  submit: async (id: number) => {
    const r = await api.post(`/projects/${id}/submit`);
    return ensureObject<Project>(r.data, "projectsApi.submit");
  },

  approve: async (id: number) => {
    const r = await api.post(`/projects/${id}/approve`);
    return ensureObject<Project>(r.data, "projectsApi.approve");
  },

  reject: async (id: number) => {
    const r = await api.post(`/projects/${id}/reject`);
    return ensureObject<Project>(r.data, "projectsApi.reject");
  },

  updateTimer: async (id: number, elapsedSeconds: number) => {
    const r = await api.post(`/projects/${id}/timer`, {
      elapsed_seconds: elapsedSeconds,
    });
    return ensureObject<Project>(r.data, "projectsApi.updateTimer");
  },

  markSaved: async (id: number, lastPositionMs?: number, lastSelectedId?: number | null) => {
    const r = await api.post(`/projects/${id}/save`, {
      last_position_ms: lastPositionMs ?? 0,
      last_selected_id: lastSelectedId ?? null,
    });
    return ensureObject<Project>(r.data, "projectsApi.markSaved");
  },

  getBroadcasterRules: async () => {
    const r = await api.get("/projects/rules/broadcasters");
    return ensureObject<Record<string, BroadcasterRule>>(
      r.data,
      "projectsApi.getBroadcasterRules",
    );
  },

  saveBroadcasterRules: async (rules: Record<string, BroadcasterRule>) => {
    const r = await api.put("/settings/broadcaster-rules", rules);
    return ensureObject<Record<string, BroadcasterRule>>(
      r.data,
      "projectsApi.saveBroadcasterRules",
    );
  },

  uploadSubtitle: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);

    return api.post(`/projects/${id}/upload/subtitle`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  uploadVideo: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);

    return api.post(`/projects/${id}/upload/video`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  uploadJson: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);

    return api.post(`/projects/${id}/upload/json`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /** SRT/자막 파일을 받기 위한 URL을 만든다. suffix는 파일명 접미사 (기본 'final') */
  downloadSubtitle: (id: number, suffix?: string) => {
    const qs = suffix ? `?suffix=${encodeURIComponent(suffix)}` : "";
    return `${API_BASE}/projects/${id}/download/subtitle${qs}`;
  },

  /** video_project.json 형식 다운로드 URL. suffix는 파일명 접미사 (기본 'export') */
  downloadJson: (id: number, suffix?: string) => {
    const qs = suffix ? `?suffix=${encodeURIComponent(suffix)}` : "";
    return `${API_BASE}/projects/${id}/download/json${qs}`;
  },
  
  videoStreamUrl: (id: number) => `${API_BASE}/projects/${id}/stream/video`,

  getWaveform: async (id: number) => {
    const r = await api.get(`/projects/${id}/waveform`);
    return ensureObject<{ peaks: number[]; peaks_per_second: number; duration_ms: number }>(
      r.data,
      "projectsApi.getWaveform",
    );
  },
};