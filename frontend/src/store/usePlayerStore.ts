import { create } from "zustand";

interface PlayerState {
  currentMs: number;
  playing: boolean;
  muted: boolean;
  totalMs: number;

  /**
   * 영상 프리뷰 전용 시간.
   * - 자막 리스트 싱글클릭 시 설정 → 영상만 해당 위치로 seek (재생바는 안 움직임)
   * - 재생 시작 시 null로 리셋 → 영상이 currentMs(재생바) 위치로 복귀
   * - null이면 영상은 currentMs를 따름 (기존 동작)
   */
  videoPreviewMs: number | null;

  setCurrentMs: (ms: number) => void;
  setTotalMs: (ms: number) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  seekForward: (ms?: number) => void;
  seekBackward: (ms?: number) => void;
  setVideoPreviewMs: (ms: number | null) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentMs: 0,
  playing: false,
  muted: false,
  totalMs: 600000,
  videoPreviewMs: null,

  setCurrentMs: (ms) => set({ currentMs: Math.max(0, Math.min(ms, get().totalMs)) }),
  setTotalMs: (ms) => set({ totalMs: ms }),
  togglePlay: () =>
    set((s) => {
      if (!s.playing) {
        // 재생 시작 → videoPreviewMs 리셋 (영상이 재생바 위치로 복귀)
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
}));