import api from "./client";
import type { Project } from "../types";

export const projectsApi = {
  list: (params?: { status?: string; broadcaster?: string; search?: string }) =>
    api.get<Project[]>("/projects", { params }).then((r) => r.data),
  get: (id: number) => api.get<Project>(`/projects/${id}`).then((r) => r.data),
  create: (data: {
    name: string;
    broadcaster?: string;
    description?: string;
    deadline?: string;
    assigned_to?: number;
  }) => api.post<Project>("/projects", data).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>) =>
    api.patch<Project>(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/projects/${id}`),
  submit: (id: number) => api.post<Project>(`/projects/${id}/submit`).then((r) => r.data),
  approve: (id: number) => api.post<Project>(`/projects/${id}/approve`).then((r) => r.data),
  reject: (id: number) => api.post<Project>(`/projects/${id}/reject`).then((r) => r.data),
  updateTimer: (id: number, elapsedSeconds: number) =>
    api.post<Project>(`/projects/${id}/timer`, { elapsed_seconds: elapsedSeconds }).then((r) => r.data),
  markSaved: (id: number) => api.post<Project>(`/projects/${id}/save`).then((r) => r.data),
  getBroadcasterRules: () => api.get("/projects/rules/broadcasters").then((r) => r.data),
  saveBroadcasterRules: (rules: Record<string, { max_lines: number; max_chars_per_line: number; allow_overlap: boolean }>) =>
    api.put("/settings/broadcaster-rules", rules).then((r) => r.data),
  uploadSubtitle: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/projects/${id}/upload/subtitle`, form, { headers: { "Content-Type": "multipart/form-data" } });
  },
  uploadVideo: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/projects/${id}/upload/video`, form, { headers: { "Content-Type": "multipart/form-data" } });
  },
  downloadSubtitle: (id: number) => `/api/projects/${id}/download/subtitle`,
  videoStreamUrl: (id: number) => `/api/projects/${id}/stream/video`,
  getWaveform: (id: number) =>
    api.get<{ peaks: number[]; peaks_per_second: number; duration_ms: number }>(`/projects/${id}/waveform`).then((r) => r.data),
};