import { create } from "zustand";

interface PlayerState {
  currentMs: number;
  playing: boolean;
  muted: boolean;
  totalMs: number;
  videoPreviewMs: number | null;
  playbackRate: number;

  videoElement: HTMLVideoElement | null;
  setVideoElement: (el: HTMLVideoElement | null) => void;

  /** 시각용 현재 시간 — 재생 중엔 video.currentTime, 정지 중엔 currentMs */
  getVisualMs: () => number;

  setCurrentMs: (ms: number) => void;
  /** state + video.currentTime을 동시에 맞추는 단일 seek 진입점 */
  seekTo: (ms: number) => void;
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
    const s = get();
    if (s.playing && s.videoElement) {
      return Math.floor(s.videoElement.currentTime * 1000);
    }
    return s.currentMs;
  },

  setCurrentMs: (ms) => set({ currentMs: Math.max(0, Math.min(ms, get().totalMs)) }),

  seekTo: (ms) =>
    set((s) => {
      const safeMs = Math.max(0, Math.min(ms, s.totalMs));

      // video.currentTime도 즉시 동기화
      if (s.videoElement) {
        s.videoElement.currentTime = safeMs / 1000;
      }

      return {
        currentMs: safeMs,
        videoPreviewMs: null,
      };
    }),

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
        // play 시작: currentMs를 덮지 않음 (seekTo에서 이미 맞춰져 있음)
        return { playing: true, videoPreviewMs: null };
      }
      // pause: video.currentTime을 스냅샷
      const snapMs = s.videoElement
        ? Math.floor(s.videoElement.currentTime * 1000)
        : s.currentMs;
      const safeMs = Math.max(0, Math.min(snapMs, s.totalMs));
      return { playing: false, currentMs: safeMs };
    }),

  toggleMute: () => set((s) => ({ muted: !s.muted })),

  seekForward: (ms = 5000) => {
    const s = get();
    get().seekTo(s.currentMs + ms);
  },

  seekBackward: (ms = 5000) => {
    const s = get();
    get().seekTo(s.currentMs - ms);
  },

  setVideoPreviewMs: (ms) => set({ videoPreviewMs: ms }),
  setPlaybackRate: (rate) => set({ playbackRate: Math.max(0.5, Math.min(3.0, rate)) }),
}));