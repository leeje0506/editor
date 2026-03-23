import { create } from "zustand";
import type { Subtitle, SubtitleUpdate } from "../types";
import { subtitlesApi } from "../api/subtitles";

interface SubtitleState {
  projectId: number | null;
  subtitles: Subtitle[];
  selectedId: number | null;
  multiSelect: Set<number>;
  loading: boolean;

  init: (projectId: number) => Promise<void>;
  selectSingle: (id: number) => void;
  toggleMulti: (id: number) => void;
  selectRange: (id: number) => void;
  navigateNext: () => Subtitle | null;
  navigatePrev: () => Subtitle | null;

  addAfter: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  splitSelected: () => Promise<void>;
  mergeSelected: () => Promise<void>;
  updateOne: (id: number, data: SubtitleUpdate) => Promise<void>;
  bulkSpeaker: (from: string, to: string) => Promise<void>;
  saveAll: () => Promise<void>;
  undo: () => Promise<void>;
}

export const useSubtitleStore = create<SubtitleState>((set, get) => ({
  projectId: null,
  subtitles: [],
  selectedId: null,
  multiSelect: new Set(),
  loading: false,

  init: async (pid) => {
    set({ projectId: pid, loading: true });
    try {
      const subs = await subtitlesApi.list(pid);
      set({ subtitles: subs, loading: false, selectedId: subs[0]?.id ?? null, multiSelect: new Set(subs[0] ? [subs[0].id] : []) });
    } catch {
      set({ loading: false });
    }
  },

  selectSingle: (id) => set({ selectedId: id, multiSelect: new Set([id]) }),
  toggleMulti: (id) => {
    const ms = new Set(get().multiSelect);
    ms.has(id) ? ms.delete(id) : ms.add(id);
    set({ selectedId: id, multiSelect: ms });
  },
  selectRange: (id) => {
    const { subtitles, selectedId } = get();
    const ids = subtitles.map((s) => s.id);
    const ci = ids.indexOf(selectedId!);
    const ni = ids.indexOf(id);
    const [f, t] = ci < ni ? [ci, ni] : [ni, ci];
    set({ multiSelect: new Set(ids.slice(f, t + 1)) });
  },

  navigateNext: () => {
    const { subtitles, selectedId } = get();
    const idx = subtitles.findIndex((s) => s.id === selectedId);
    if (idx < subtitles.length - 1) {
      const next = subtitles[idx + 1];
      set({ selectedId: next.id, multiSelect: new Set([next.id]) });
      return next;
    }
    return null;
  },
  navigatePrev: () => {
    const { subtitles, selectedId } = get();
    const idx = subtitles.findIndex((s) => s.id === selectedId);
    if (idx > 0) {
      const prev = subtitles[idx - 1];
      set({ selectedId: prev.id, multiSelect: new Set([prev.id]) });
      return prev;
    }
    return null;
  },

  addAfter: async () => {
    const { projectId, subtitles, selectedId } = get();
    if (!projectId || !selectedId) return;
    const sel = subtitles.find((s) => s.id === selectedId);
    if (!sel) return;
    // 선택된 싱크 끝시간 + 10ms부터 2초
    const startMs = sel.end_ms + 10;
    const endMs = startMs + 2000;
    const subs = await subtitlesApi.create(projectId, {
      after_seq: sel.seq,
      start_ms: startMs,
      end_ms: endMs,
    });
    // 새로 추가된 자막 찾기
    const newSub = subs.find((s) => !subtitles.some((o) => o.id === s.id));
    set({ subtitles: subs, selectedId: newSub?.id ?? null, multiSelect: new Set(newSub ? [newSub.id] : []) });
  },

  deleteSelected: async () => {
    const { projectId, multiSelect } = get();
    if (!projectId || multiSelect.size === 0) return;
    const subs = await subtitlesApi.batchDelete(projectId, [...multiSelect]);
    set({ subtitles: subs, selectedId: subs[0]?.id ?? null, multiSelect: new Set(subs[0] ? [subs[0].id] : []) });
  },

  splitSelected: async () => {
    const { projectId, selectedId } = get();
    if (!projectId || !selectedId) return;
    const subs = await subtitlesApi.split(projectId, selectedId);
    set({ subtitles: subs });
  },

  mergeSelected: async () => {
    const { projectId, multiSelect } = get();
    if (!projectId || multiSelect.size < 2) return;
    const subs = await subtitlesApi.merge(projectId, [...multiSelect]);
    set({ subtitles: subs, multiSelect: new Set(subs[0] ? [subs[0].id] : []) });
  },

  updateOne: async (id, data) => {
    const { projectId } = get();
    if (!projectId) return;
    const updated = await subtitlesApi.update(projectId, id, data);
    set((s) => ({ subtitles: s.subtitles.map((sub) => (sub.id === id ? updated : sub)) }));
  },

  bulkSpeaker: async (from, to) => {
    const { projectId } = get();
    if (!projectId) return;
    const subs = await subtitlesApi.bulkSpeaker(projectId, from, to);
    set({ subtitles: subs });
  },

  saveAll: async () => {
    const { projectId, subtitles } = get();
    if (!projectId) return;
    const subs = await subtitlesApi.batchUpdate(projectId, subtitles);
    set({ subtitles: subs });
  },

  undo: async () => {
    const { projectId } = get();
    if (!projectId) return;
    try {
      const subs = await subtitlesApi.undo(projectId);
      set({ subtitles: subs });
    } catch { /* nothing to undo */ }
  },
}));