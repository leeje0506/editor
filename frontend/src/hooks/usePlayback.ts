import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubtitleStore } from "../store/useSubtitleStore";
import { useTimelineStore } from "../store/useTimelineStore";

export function usePlayback() {
  const intervalRef = useRef<number | null>(null);
  const lastActiveIdRef = useRef<number | null>(null);
  const lastSelectTimeRef = useRef(0);
  const { playing } = usePlayerStore();

  useEffect(() => {
    if (playing) {
      lastActiveIdRef.current = null;

      intervalRef.current = window.setInterval(() => {
        const { currentMs, totalMs, playbackRate } = usePlayerStore.getState();
        const increment = Math.round(200 * playbackRate);
        const nextMs = currentMs + increment >= totalMs ? 0 : currentMs + increment;
        usePlayerStore.setState({ currentMs: nextMs });

        // 자막 자동 추적 — 500ms throttle
        const now = performance.now();
        const { subtitles, selectSingle } = useSubtitleStore.getState();
        const active = subtitles.find(
          (s) => nextMs >= s.start_ms && nextMs < s.end_ms
        );
        if (active && active.id !== lastActiveIdRef.current) {
          lastActiveIdRef.current = active.id;
          if (now - lastSelectTimeRef.current > 500) {
            lastSelectTimeRef.current = now;
            selectSingle(active.id);
          }
        }

        // 뷰 밖이면 스크롤 — 뷰를 완전히 벗어났을 때만
        const tlState = useTimelineStore.getState();
        const visDur = tlState.visibleDuration();
        const viewRight = tlState.scrollMs + visDur;
        if (nextMs > viewRight || nextMs < tlState.scrollMs) {
          tlState.setScrollMs(Math.max(0, nextMs - visDur * 0.1));
        }
      }, 200);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      lastActiveIdRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing]);
}