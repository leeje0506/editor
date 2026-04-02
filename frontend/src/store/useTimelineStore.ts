import { create } from "zustand";
import { ZOOM_LEVELS, DEFAULT_ZOOM_IDX } from "../types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface TimelineState {
  zoomIdx: number;
  scrollMs: number;
  totalMs: number;
  visibleDuration: () => number;
  zoomIn: (anchorPct?: number) => void;
  zoomOut: (anchorPct?: number) => void;
  zoomFit: () => void;
  panBy: (deltaMs: number) => void;
  setScrollMs: (ms: number) => void;
  setTotalMs: (ms: number) => void;
  ensureVisible: (ms: number) => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  zoomIdx: DEFAULT_ZOOM_IDX,
  scrollMs: 0,
  totalMs: 600000,

  visibleDuration: () => ZOOM_LEVELS[get().zoomIdx],

  zoomIn: (anchorPct = 0.5) => {
    const { zoomIdx, scrollMs, totalMs } = get();
    const ni = Math.max(0, zoomIdx - 1);
    const od = ZOOM_LEVELS[zoomIdx], nd = ZOOM_LEVELS[ni];
    const anchor = scrollMs + anchorPct * od;
    set({ zoomIdx: ni, scrollMs: clamp(anchor - anchorPct * nd, 0, Math.max(0, totalMs - nd)) });
  },

  zoomOut: (anchorPct = 0.5) => {
    const { zoomIdx, scrollMs, totalMs } = get();
    const ni = Math.min(ZOOM_LEVELS.length - 1, zoomIdx + 1);
    const od = ZOOM_LEVELS[zoomIdx], nd = ZOOM_LEVELS[ni];
    const anchor = scrollMs + anchorPct * od;
    set({ zoomIdx: ni, scrollMs: clamp(anchor - anchorPct * nd, 0, Math.max(0, totalMs - nd)) });
  },

  zoomFit: () => set({ zoomIdx: DEFAULT_ZOOM_IDX, scrollMs: 0 }),

  panBy: (deltaMs) => {
    const { scrollMs, totalMs, zoomIdx } = get();
    const dur = ZOOM_LEVELS[zoomIdx];
    set({ scrollMs: clamp(scrollMs + deltaMs, 0, Math.max(0, totalMs - dur)) });
  },

  setScrollMs: (ms) => {
    const { totalMs, zoomIdx } = get();
    set({ scrollMs: clamp(ms, 0, Math.max(0, totalMs - ZOOM_LEVELS[zoomIdx])) });
  },

  setTotalMs: (ms) => {
    const { zoomIdx, scrollMs } = get();
    const dur = ZOOM_LEVELS[zoomIdx];
    const safeMs = Math.max(0, ms);

    set({
      totalMs: safeMs,
      scrollMs: clamp(scrollMs, 0, Math.max(0, safeMs - dur)),
    });
  },

  ensureVisible: (ms) => {
    const { scrollMs, totalMs, zoomIdx } = get();
    const dur = ZOOM_LEVELS[zoomIdx];
    if (ms < scrollMs || ms > scrollMs + dur) {
      set({ scrollMs: clamp(ms - dur * 0.3, 0, Math.max(0, totalMs - dur)) });
    }
  },
}));