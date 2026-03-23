import api from "./client";
import type { Subtitle, SubtitleCreate, SubtitleUpdate } from "../types";

const base = (pid: number) => `/projects/${pid}/subtitles`;

export const subtitlesApi = {
  list: (pid: number) =>
    api.get<Subtitle[]>(base(pid)).then((r) => r.data),

  create: (pid: number, data: SubtitleCreate) =>
    api.post<Subtitle[]>(base(pid), data).then((r) => r.data),

  update: (pid: number, id: number, data: SubtitleUpdate) =>
    api.patch<Subtitle>(`${base(pid)}/${id}`, data).then((r) => r.data),

  delete: (pid: number, id: number) =>
    api.delete<Subtitle[]>(`${base(pid)}/${id}`).then((r) => r.data),

  batchDelete: (pid: number, ids: number[]) =>
    api.post<Subtitle[]>(`${base(pid)}/batch-delete`, { ids }).then((r) => r.data),

  split: (pid: number, id: number, splitAtMs?: number) =>
    api.post<Subtitle[]>(`${base(pid)}/${id}/split`, { split_at_ms: splitAtMs ?? null }).then((r) => r.data),

  merge: (pid: number, ids: number[]) =>
    api.post<Subtitle[]>(`${base(pid)}/merge`, { ids }).then((r) => r.data),

  bulkSpeaker: (pid: number, from: string, to: string) =>
    api.post<Subtitle[]>(`${base(pid)}/bulk-speaker`, { from_speaker: from, to_speaker: to }).then((r) => r.data),

  batchUpdate: (pid: number, items: Subtitle[]) =>
    api.put<Subtitle[]>(
      `${base(pid)}/batch-update`,
      items.map((s) => ({
        id: s.id, start_ms: s.start_ms, end_ms: s.end_ms, type: s.type,
        speaker: s.speaker, speaker_pos: s.speaker_pos, text_pos: s.text_pos, text: s.text,
      }))
    ).then((r) => r.data),

  undo: (pid: number) =>
    api.post<Subtitle[]>(`${base(pid)}/undo`).then((r) => r.data),
};