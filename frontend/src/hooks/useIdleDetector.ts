import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useActivityStore, IDLE_TIMEOUT_MS, PRESENCE_THROTTLE_MS, TAB_AWAY_THRESHOLD_MS } from "../store/useActivityStore";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubtitleStore } from "../store/useSubtitleStore";
import { projectsApi } from "../api/projects";

interface UseIdleDetectorOptions {
  projectId: number;
  /** 서버에 보낼 현재 누적 시간 (초) */
  getElapsed: () => number;
  /** 부모에서 elapsed를 갱신 */
  addElapsed: (delta: number) => void;
  /** 저장 완료 후 호출 (메시지 표시 등) */
  onAutoSaved?: () => void;
}

export function useIdleDetector({ projectId, getElapsed, addElapsed, onAutoSaved }: UseIdleDetectorOptions) {
  const navigate = useNavigate();
  const tickRef = useRef<number | null>(null);
  const flushRef = useRef<number | null>(null);
  const lastPresenceThrottleRef = useRef(0);

  /* ── 보조 활동 이벤트 핸들러 (mousemove, mousedown, wheel, scroll, touchstart) ── */
  const handlePresenceEvent = useCallback(() => {
    const now = Date.now();
    if (now - lastPresenceThrottleRef.current < PRESENCE_THROTTLE_MS) return;
    lastPresenceThrottleRef.current = now;
    useActivityStore.getState().reportPresence();
  }, []);

  /* ── keydown: 키 입력은 확정 활동 ── */
  const handleKeydown = useCallback(() => {
    useActivityStore.getState().reportMeaningful();
  }, []);

  /* ── visibility change ── */
  const handleVisibilityChange = useCallback(() => {
    const store = useActivityStore.getState();

    if (document.hidden) {
      // 탭 이탈
      store.setForeground(false);
      store.setHiddenSince(Date.now());
    } else {
      // 탭 복귀
      const hiddenSince = store.hiddenSince;
      store.setForeground(true);
      store.setHiddenSince(null);

      if (hiddenSince) {
        const awayMs = Date.now() - hiddenSince;
        if (awayMs >= TAB_AWAY_THRESHOLD_MS) {
          // 오래 이탈 → idle 모달 표시
          store.setIdleModalOpen(true);
        } else {
          // 짧은 이탈 → 자동 재개, presence 갱신
          store.reportPresence();
        }
      }
    }
  }, []);

  /* ── 이벤트 리스너 등록/해제 ── */
  useEffect(() => {
    // 보조 활동
    window.addEventListener("mousemove", handlePresenceEvent, { passive: true });
    window.addEventListener("mousedown", handlePresenceEvent, { passive: true });
    window.addEventListener("wheel", handlePresenceEvent, { passive: true });
    window.addEventListener("scroll", handlePresenceEvent, { passive: true, capture: true });
    window.addEventListener("touchstart", handlePresenceEvent, { passive: true });

    // 확정 활동 (키보드 입력)
    window.addEventListener("keydown", handleKeydown, { passive: true });

    // 탭 이탈
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("mousemove", handlePresenceEvent);
      window.removeEventListener("mousedown", handlePresenceEvent);
      window.removeEventListener("wheel", handlePresenceEvent);
      window.removeEventListener("scroll", handlePresenceEvent, { capture: true });
      window.removeEventListener("touchstart", handlePresenceEvent);
      window.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handlePresenceEvent, handleKeydown, handleVisibilityChange]);

  /* ── 1초 tick: 시간 누적 판정 + 즉시 elapsed 반영 ── */
  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      const isPlaying = usePlayerStore.getState().playing;
      const accepted = useActivityStore.getState().tickAccumulate(isPlaying);

      // 인정된 1초를 즉시 UI에 반영 (TopNav 소요시간 실시간 표시)
      if (accepted) {
        addElapsed(1);
      }

      // idle 판정: 마지막 보조 활동(presence) 이후 IDLE_TIMEOUT_MS 초과
      const store = useActivityStore.getState();
      if (
        store.isForeground &&
        !store.idleModalOpen &&
        !store.autoExitPending
      ) {
        const now = Date.now();
        const sincePresence = now - store.lastPresenceAt;
        if (sincePresence >= IDLE_TIMEOUT_MS) {
          store.setIdleModalOpen(true);
          // idle 진입 시 재생 중이면 일시정지
          if (usePlayerStore.getState().playing) {
            usePlayerStore.getState().togglePlay();
          }
        }
      }
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [addElapsed]);

  /* ── 30초 flush: 서버에 현재 elapsed 전송 + 자막 자동 저장 ── */
  useEffect(() => {
    flushRef.current = window.setInterval(async () => {
      if (!projectId) return;

      // accumulatedSeconds 리셋 (서버 전송 확인용)
      // elapsed는 이미 1초 tick에서 실시간으로 올라가므로 addElapsed 불필요
      useActivityStore.getState().flushAccumulated();

      try {
        await projectsApi.updateTimer(projectId, getElapsed());
      } catch {
        // 실패 시 다음 flush에서 재시도
      }

      // flush 시 자막도 자동 저장 + 위치 저장
      try {
        await useSubtitleStore.getState().saveAll();
        const currentMs = usePlayerStore.getState().currentMs;
        const selectedId = useSubtitleStore.getState().selectedId;
        await projectsApi.markSaved(projectId, currentMs, selectedId);
      } catch {}
    }, 30000);

    return () => {
      if (flushRef.current) clearInterval(flushRef.current);
    };
  }, [projectId, getElapsed]);

  /* ── 자동 퇴장 실행 ── */
  const executeAutoExit = useCallback(async () => {
    const store = useActivityStore.getState();
    store.setAutoExitPending(true);
    store.setIdleModalOpen(false);

    // 남은 누적 카운터 리셋 (elapsed는 이미 tick에서 반영됨)
    store.flushAccumulated();

    try {
      // 자막 저장
      await useSubtitleStore.getState().saveAll();

      // 타이머 + 위치 저장
      const currentMs = usePlayerStore.getState().currentMs;
      const selectedId = useSubtitleStore.getState().selectedId;
      await projectsApi.updateTimer(projectId, getElapsed());
      await projectsApi.markSaved(projectId, currentMs, selectedId);

      onAutoSaved?.();
    } catch {
      // 저장 실패해도 나감
    }

    navigate("/projects");
  }, [projectId, getElapsed, navigate, onAutoSaved]);

  /* ── beforeunload: 남은 누적 시간 전송 ── */
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!projectId) return;
      const delta = useActivityStore.getState().flushAccumulated();
      const total = getElapsed() + delta;
      const API_BASE = import.meta.env.VITE_API_BASE_URL;
      navigator.sendBeacon(
        `${API_BASE}/projects/${projectId}/timer`,
        JSON.stringify({ elapsed_seconds: total })
      );
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [projectId, getElapsed]);

  return { executeAutoExit };
}