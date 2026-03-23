import { create } from "zustand";

interface PlayerState {
  currentMs: number;
  playing: boolean;
  muted: boolean;
  totalMs: number;
  setCurrentMs: (ms: number) => void;
  setTotalMs: (ms: number) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  seekForward: (ms?: number) => void;
  seekBackward: (ms?: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentMs: 0,
  playing: false,
  muted: false,
  totalMs: 600000,
  setCurrentMs: (ms) => set({ currentMs: Math.max(0, Math.min(ms, get().totalMs)) }),
  setTotalMs: (ms) => set({ totalMs: ms }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  seekForward: (ms = 5000) => set((s) => ({ currentMs: Math.min(s.totalMs, s.currentMs + ms) })),
  seekBackward: (ms = 5000) => set((s) => ({ currentMs: Math.max(0, s.currentMs - ms) })),
}));