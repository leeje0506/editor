import { create } from "zustand";
import type { Subtitle, SubtitleUpdate } from "../types";
import { subtitlesApi } from "../api/subtitles";
import { useActivityStore } from "./useActivityStore";

interface AddAfterOptions {
  afterId?: number | null;
  startMs?: number;
  endMs?: number;
}

interface SubtitleState {
  projectId: number | null;
  subtitles: Subtitle[];
  selectedId: number | null;
  multiSelect: Set<number>;
  loading: boolean;
  /** redo용: undo 직전 상태 저장 */
  redoStack: Subtitle[][];

  init: (projectId: number) => Promise<void>;
  selectSingle: (id: number) => void;
  toggleMulti: (id: number) => void;
  selectRange: (id: number) => void;
  navigateNext: () => Subtitle | null;
  navigatePrev: () => Subtitle | null;

  updateLocal: (id: number, data: Partial<Subtitle>) => void;
  updateOne: (id: number, data: SubtitleUpdate) => Promise<void>;

  addAfter: (options?: AddAfterOptions) => Promise<void>;
  deleteSelected: () => Promise<void>;
  splitSelected: () => Promise<void>;
  mergeSelected: () => Promise<void>;
  bulkSpeaker: (from: string, to: string) => Promise<void>;
  saveAll: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

function cloneSubtitles(subtitles: Subtitle[]): Subtitle[] {
  return subtitles.map((sub) => ({ ...sub }));
}

function buildSingleSelection(id: number | null): Set<number> {
  return id ? new Set([id]) : new Set<number>();
}

function findSafeSelectedId(subtitles: Subtitle[], preferredId: number | null): number | null {
  if (preferredId && subtitles.some((sub) => sub.id === preferredId)) {
    return preferredId;
  }
  return subtitles[0]?.id ?? null;
}

function findSelectedIdByIndex(subtitles: Subtitle[], index: number): number | null {
  if (subtitles.length === 0) return null;
  const safeIndex = Math.max(0, Math.min(index, subtitles.length - 1));
  return subtitles[safeIndex]?.id ?? null;
}

/** 확정 작업 활동 보고 (시간 누적 기준) */
function reportMeaningful() {
  useActivityStore.getState().reportMeaningful();
}

export const useSubtitleStore = create<SubtitleState>((set, get) => ({
  projectId: null,
  subtitles: [],
  selectedId: null,
  multiSelect: new Set(),
  loading: false,
  redoStack: [],

  init: async (pid) => {
    set({ projectId: pid, loading: true });

    try {
      const subs = await subtitlesApi.list(pid);
      const selectedId = subs[0]?.id ?? null;

      set({
        subtitles: subs,
        loading: false,
        selectedId,
        multiSelect: buildSingleSelection(selectedId),
        redoStack: [],
      });
    } catch {
      set({ loading: false });
    }
  },

  selectSingle: (id) => {
    set({
      selectedId: id,
      multiSelect: new Set([id]),
    });
  },

  toggleMulti: (id) => {
    const ms = new Set(get().multiSelect);
    ms.has(id) ? ms.delete(id) : ms.add(id);

    set({
      selectedId: id,
      multiSelect: ms,
    });
  },

  selectRange: (id) => {
    const { subtitles, selectedId } = get();

    if (!selectedId) {
      set({
        selectedId: id,
        multiSelect: new Set([id]),
      });
      return;
    }

    const ids = subtitles.map((s) => s.id);
    const currentIndex = ids.indexOf(selectedId);
    const nextIndex = ids.indexOf(id);

    if (currentIndex === -1 || nextIndex === -1) {
      set({
        selectedId: id,
        multiSelect: new Set([id]),
      });
      return;
    }

    const [from, to] = currentIndex < nextIndex
      ? [currentIndex, nextIndex]
      : [nextIndex, currentIndex];

    set({
      multiSelect: new Set(ids.slice(from, to + 1)),
    });
  },

  navigateNext: () => {
    const { subtitles, selectedId } = get();
    if (subtitles.length === 0) return null;

    if (!selectedId) {
      const first = subtitles[0];
      set({
        selectedId: first.id,
        multiSelect: new Set([first.id]),
      });
      return first;
    }

    const idx = subtitles.findIndex((s) => s.id === selectedId);
    if (idx >= 0 && idx < subtitles.length - 1) {
      const next = subtitles[idx + 1];
      set({
        selectedId: next.id,
        multiSelect: new Set([next.id]),
      });
      return next;
    }

    return null;
  },

  navigatePrev: () => {
    const { subtitles, selectedId } = get();
    if (subtitles.length === 0) return null;

    if (!selectedId) {
      const first = subtitles[0];
      set({
        selectedId: first.id,
        multiSelect: new Set([first.id]),
      });
      return first;
    }

    const idx = subtitles.findIndex((s) => s.id === selectedId);
    if (idx > 0) {
      const prev = subtitles[idx - 1];
      set({
        selectedId: prev.id,
        multiSelect: new Set([prev.id]),
      });
      return prev;
    }

    return null;
  },

  /* ── 확정 활동 래핑: 실제 데이터 변경 액션 ── */

  updateLocal: (id, data) => {
    reportMeaningful();
    set((state) => ({
      subtitles: state.subtitles.map((sub) =>
        sub.id === id ? { ...sub, ...data } : sub
      ),
      redoStack: [],
    }));
  },

  updateOne: async (id, data) => {
    const { projectId } = get();
    if (!projectId) return;

    reportMeaningful();
    const updated = await subtitlesApi.update(projectId, id, data);

    set((state) => ({
      subtitles: state.subtitles.map((sub) => (sub.id === id ? updated : sub)),
      redoStack: [],
    }));
  },

  addAfter: async (options) => {
    const { projectId, subtitles, selectedId } = get();
    if (!projectId) return;

    reportMeaningful();

    const baseId = options?.afterId ?? selectedId ?? null;
    const baseSub = baseId ? subtitles.find((s) => s.id === baseId) ?? null : null;

    const afterSeq = baseSub?.seq ?? 0;
    const fallbackStartMs = baseSub ? baseSub.end_ms + 1 : 0;

    const startMs = Math.max(0, Math.floor(options?.startMs ?? fallbackStartMs));
    const requestedEndMs = Math.floor(options?.endMs ?? (startMs + 1000));
    const endMs = Math.max(startMs + 1, requestedEndMs);

    const previousIds = new Set(subtitles.map((sub) => sub.id));

    const subs = await subtitlesApi.create(projectId, {
      after_seq: afterSeq,
      start_ms: startMs,
      end_ms: endMs,
    });

    const newSub =
      subs.find((sub) => !previousIds.has(sub.id)) ??
      subs.find((sub) => sub.start_ms === startMs && sub.end_ms === endMs) ??
      null;

    const nextSelectedId = findSafeSelectedId(subs, newSub?.id ?? selectedId);

    set({
      subtitles: subs,
      selectedId: nextSelectedId,
      multiSelect: buildSingleSelection(nextSelectedId),
      redoStack: [],
    });
  },

  deleteSelected: async () => {
    const { projectId, multiSelect, subtitles } = get();
    if (!projectId || multiSelect.size === 0) return;

    reportMeaningful();

    const firstDeletedIndex = subtitles.findIndex((sub) => multiSelect.has(sub.id));
    const subs = await subtitlesApi.batchDelete(projectId, [...multiSelect]);

    const nextSelectedId = findSelectedIdByIndex(
      subs,
      firstDeletedIndex >= 0 ? firstDeletedIndex : 0
    );

    set({
      subtitles: subs,
      selectedId: nextSelectedId,
      multiSelect: buildSingleSelection(nextSelectedId),
      redoStack: [],
    });
  },

  splitSelected: async () => {
    const { projectId, selectedId, subtitles } = get();
    if (!projectId || !selectedId) return;

    reportMeaningful();

    const currentIndex = subtitles.findIndex((sub) => sub.id === selectedId);
    const subs = await subtitlesApi.split(projectId, selectedId);

    const nextSelectedId =
      findSelectedIdByIndex(subs, currentIndex >= 0 ? currentIndex : 0) ??
      findSafeSelectedId(subs, null);

    set({
      subtitles: subs,
      selectedId: nextSelectedId,
      multiSelect: buildSingleSelection(nextSelectedId),
      redoStack: [],
    });
  },

  mergeSelected: async () => {
    const { projectId, multiSelect, subtitles } = get();
    if (!projectId || multiSelect.size < 2) return;

    reportMeaningful();

    const selectedIndexes = subtitles
      .map((sub, index) => (multiSelect.has(sub.id) ? index : -1))
      .filter((index) => index !== -1);

    const targetIndex = selectedIndexes.length > 0 ? Math.min(...selectedIndexes) : 0;
    const subs = await subtitlesApi.merge(projectId, [...multiSelect]);

    const nextSelectedId =
      findSelectedIdByIndex(subs, targetIndex) ?? findSafeSelectedId(subs, null);

    set({
      subtitles: subs,
      selectedId: nextSelectedId,
      multiSelect: buildSingleSelection(nextSelectedId),
      redoStack: [],
    });
  },

  bulkSpeaker: async (from, to) => {
    const { projectId, selectedId } = get();
    if (!projectId) return;

    reportMeaningful();

    const subs = await subtitlesApi.bulkSpeaker(projectId, from, to);
    const nextSelectedId = findSafeSelectedId(subs, selectedId);

    set({
      subtitles: subs,
      selectedId: nextSelectedId,
      multiSelect: buildSingleSelection(nextSelectedId),
      redoStack: [],
    });
  },

  saveAll: async () => {
    const { projectId, subtitles, selectedId } = get();
    if (!projectId) return;

    const subs = await subtitlesApi.batchUpdate(projectId, subtitles);
    const nextSelectedId = findSafeSelectedId(subs, selectedId);

    set({
      subtitles: subs,
      selectedId: nextSelectedId,
      multiSelect: buildSingleSelection(nextSelectedId),
    });
  },

  undo: async () => {
    const { projectId, subtitles, selectedId } = get();
    if (!projectId) return;

    reportMeaningful();

    try {
      const currentSnapshot = cloneSubtitles(subtitles);
      const subs = await subtitlesApi.undo(projectId);
      const nextSelectedId = findSafeSelectedId(subs, selectedId);

      set((state) => ({
        subtitles: subs,
        selectedId: nextSelectedId,
        multiSelect: buildSingleSelection(nextSelectedId),
        redoStack: [...state.redoStack, currentSnapshot],
      }));
    } catch {
      // nothing to undo
    }
  },

  redo: async () => {
    const { projectId, redoStack, selectedId } = get();
    if (!projectId || redoStack.length === 0) return;

    reportMeaningful();

    const lastState = cloneSubtitles(redoStack[redoStack.length - 1]);
    const newStack = redoStack.slice(0, -1);

    try {
      const subs = await subtitlesApi.batchUpdate(projectId, lastState);
      const nextSelectedId = findSafeSelectedId(subs, selectedId);

      set({
        subtitles: subs,
        selectedId: nextSelectedId,
        multiSelect: buildSingleSelection(nextSelectedId),
        redoStack: newStack,
      });
    } catch {
      // redo 실패
    }
  },
}));