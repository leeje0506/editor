import { create } from "zustand";

/* ── 상수 (하드코딩, 2차에서 관리자 설정 가능으로 전환) ── */

/** 유휴 판정 — 마지막 보조 활동 이후 이 시간이 지나면 모달 표시 */
export const IDLE_TIMEOUT_MS = 60 * 1000; // 1분

/** 모달 응답 제한 */
export const MODAL_TIMEOUT_SEC = 60; // 60초

/** 영상 재생만으로 시간 인정하는 최대 유예 */
export const PLAYBACK_GRACE_MS = 3 * 60 * 1000; // 3분

/** 탭 이탈 후 복귀 시, 이 시간 이상이면 모달 표시 */
export const TAB_AWAY_THRESHOLD_MS = 3 * 60 * 1000; // 3분

/** mousemove throttle */
export const PRESENCE_THROTTLE_MS = 1000; // 1초

/* ── Store ── */

interface ActivityState {
  /** 마지막 확정 작업 활동 시각 (ms timestamp) */
  lastMeaningfulAt: number;

  /** 마지막 보조 활동 (mousemove 등) 시각 */
  lastPresenceAt: number;

  /** 마지막 사용자 의도 시각 (play, seek, 선택 등 — 재생 grace 판정용) */
  lastUserIntentAt: number;

  /** 포그라운드 여부 */
  isForeground: boolean;

  /** 탭 이탈 시각 (null이면 포그라운드) */
  hiddenSince: number | null;

  /** idle 모달 표시 중 */
  idleModalOpen: boolean;

  /** 자동 퇴장 진행 중 */
  autoExitPending: boolean;

  /** 이번 flush 주기에 누적된 활동 초 */
  accumulatedSeconds: number;

  /* ── Actions ── */

  /** 확정 작업 활동 발생 — store action 래핑에서 호출 */
  reportMeaningful: () => void;

  /** 보조 활동 발생 — mousemove, mousedown, wheel 등 */
  reportPresence: () => void;

  /** 사용자 의도 발생 — play, seek, 자막 선택 이동 등 */
  reportUserIntent: () => void;

  setForeground: (fg: boolean) => void;
  setHiddenSince: (ts: number | null) => void;
  setIdleModalOpen: (open: boolean) => void;
  setAutoExitPending: (pending: boolean) => void;

  /** 1초 tick에서 호출: 조건 충족 시 +1 누적, 인정 여부 반환 */
  tickAccumulate: (isPlaying: boolean) => boolean;

  /** 30초 flush: 누적 값 반환 후 리셋 (서버 전송용) */
  flushAccumulated: () => number;

  /** 모달에서 "계속 작업하기" 클릭 */
  resumeFromIdle: () => void;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  lastMeaningfulAt: Date.now(),
  lastPresenceAt: Date.now(),
  lastUserIntentAt: Date.now(),
  isForeground: true,
  hiddenSince: null,
  idleModalOpen: false,
  autoExitPending: false,
  accumulatedSeconds: 0,

  reportMeaningful: () => {
    const now = Date.now();
    set({
      lastMeaningfulAt: now,
      lastPresenceAt: now,
      lastUserIntentAt: now,
    });
  },

  reportPresence: () => {
    set({ lastPresenceAt: Date.now() });
  },

  reportUserIntent: () => {
    const now = Date.now();
    set({
      lastUserIntentAt: now,
      lastPresenceAt: now,
    });
  },

  setForeground: (fg) => set({ isForeground: fg }),
  setHiddenSince: (ts) => set({ hiddenSince: ts }),
  setIdleModalOpen: (open) => set({ idleModalOpen: open }),
  setAutoExitPending: (pending) => set({ autoExitPending: pending }),

  tickAccumulate: (isPlaying) => {
    const s = get();

    // 조건 불충족 → 미집계
    if (!s.isForeground) return false;
    if (s.idleModalOpen) return false;
    if (s.autoExitPending) return false;

    const now = Date.now();
    const meaningfulRecent = now - s.lastMeaningfulAt < IDLE_TIMEOUT_MS;
    const playbackGraceActive = isPlaying && now - s.lastUserIntentAt < PLAYBACK_GRACE_MS;

    if (!meaningfulRecent && !playbackGraceActive) return false;

    // 조건 충족 → +1초
    set({ accumulatedSeconds: s.accumulatedSeconds + 1 });
    return true;
  },

  flushAccumulated: () => {
    const val = get().accumulatedSeconds;
    set({ accumulatedSeconds: 0 });
    return val;
  },

  resumeFromIdle: () => {
    const now = Date.now();
    set({
      idleModalOpen: false,
      autoExitPending: false,
      lastMeaningfulAt: now,
      lastPresenceAt: now,
      lastUserIntentAt: now,
    });
  },
}));