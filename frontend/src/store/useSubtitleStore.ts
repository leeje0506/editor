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

  /** 로컬 상태만 즉시 변경 (서버 호출 안 함). 텍스트/화자 등 입력 중 사용. */
  updateLocal: (id: number, data: Partial<Subtitle>) => void;
  /** 서버 API 호출하여 단건 수정 + 응답으로 교체. 시간 변경 등 즉시 검수가 필요한 경우 사용. */
  updateOne: (id: number, data: SubtitleUpdate) => Promise<void>;

  addAfter: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  splitSelected: () => Promise<void>;
  mergeSelected: () => Promise<void>;
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

  /**
   * 로컬 상태만 즉시 변경. 서버 호출 없음.
   * 텍스트, 화자, 유형, 위치 등 입력 중 사용.
   * 서버 반영은 saveAll() 시점에서 일괄 처리.
   */
  updateLocal: (id, data) => {
    set((s) => ({
      subtitles: s.subtitles.map((sub) => (sub.id === id ? { ...sub, ...data } : sub)),
    }));
  },

  /**
   * 서버 API 호출하여 단건 수정.
   * 시간(start_ms/end_ms) 변경 등 즉시 검수가 필요한 경우 사용.
   */
  updateOne: async (id, data) => {
    const { projectId } = get();
    if (!projectId) return;
    const updated = await subtitlesApi.update(projectId, id, data);
    set((s) => ({ subtitles: s.subtitles.map((sub) => (sub.id === id ? updated : sub)) }));
  },

  addAfter: async () => {
    const { projectId, subtitles, selectedId } = get();
    if (!projectId || !selectedId) return;
    const sel = subtitles.find((s) => s.id === selectedId);
    if (!sel) return;
    // 기본 간격: 1ms (0.001초), 기본 길이: 1000ms (1초)
    const startMs = sel.end_ms + 1;
    const endMs = startMs + 1000;
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