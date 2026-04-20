import { create } from "zustand";

interface PlayerState {
  currentMs: number;
  playing: boolean;
  muted: boolean;
  totalMs: number;
  videoPreviewMs: number | null;
  playbackRate: number;

  // 시각용 시간 소스: video element ref
  videoElement: HTMLVideoElement | null;
  setVideoElement: (el: HTMLVideoElement | null) => void;

  /** 시각용 현재 시간 (ms) — 재생 중엔 video.currentTime, 정지 중엔 currentMs */
  getVisualMs: () => number;

  setCurrentMs: (ms: number) => void;
  setTotalMs: (ms: number) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  seekForward: (ms?: number) => void;
  seekBackward: (ms?: number) => void;
  setVideoPreviewMs: (ms: number | null) => void;
  setPlaybackRate: (rate: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentMs: 0,
  playing: false,
  muted: false,
  totalMs: 600000,
  videoPreviewMs: null,
  playbackRate: 1.0,
  videoElement: null,

  setVideoElement: (el) => set({ videoElement: el }),

  getVisualMs: () => {
    const state = get();
    if (state.playing && state.videoElement) {
      return Math.floor(state.videoElement.currentTime * 1000);
    }
    return state.currentMs;
  },

  setCurrentMs: (ms) => set({ currentMs: Math.max(0, Math.min(ms, get().totalMs)) }),
  setTotalMs: (ms) =>
    set((s) => {
      const safeMs = Math.max(0, ms);
      return {
        totalMs: safeMs,
        currentMs: Math.min(s.currentMs, safeMs),
        videoPreviewMs: s.videoPreviewMs === null ? null : Math.min(s.videoPreviewMs, safeMs),
      };
    }),
  togglePlay: () =>
    set((s) => {
      if (!s.playing) {
        return { playing: true, videoPreviewMs: null };
      }
      return { playing: false };
    }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  seekForward: (ms = 5000) =>
    set((s) => ({ currentMs: Math.min(s.totalMs, s.currentMs + ms) })),
  seekBackward: (ms = 5000) =>
    set((s) => ({ currentMs: Math.max(0, s.currentMs - ms) })),
  setVideoPreviewMs: (ms) => set({ videoPreviewMs: ms }),
  setPlaybackRate: (rate) => set({ playbackRate: Math.max(0.5, Math.min(3.0, rate)) }),
}));