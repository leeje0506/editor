import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubtitleStore } from "../store/useSubtitleStore";
import { useTimelineStore } from "../store/useTimelineStore";

export function usePlayback() {
  const rafRef = useRef<number | null>(null);
  const lastActiveIdRef = useRef<number | null>(null);
  const lastSelectTimeRef = useRef(0);
  const { playing } = usePlayerStore();

  useEffect(() => {
    if (playing) {
      lastActiveIdRef.current = null;

      const tick = () => {
        const video = document.querySelector("video");
        const { totalMs } = usePlayerStore.getState();

        // 영상이 있으면 video.currentTime 기준, 없으면 기존 증분 방식
        let nextMs: number;
        if (video && !video.paused && video.readyState >= 2) {
          nextMs = Math.round(video.currentTime * 1000);
        } else {
          const { currentMs, playbackRate } = usePlayerStore.getState();
          const increment = Math.round((performance.now() - (tick as any)._lastTick) * playbackRate);
          nextMs = currentMs + increment >= totalMs ? 0 : currentMs + increment;
        }
        (tick as any)._lastTick = performance.now();

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

        // 뷰 밖이면 스크롤
        const tlState = useTimelineStore.getState();
        const visDur = tlState.visibleDuration();
        const viewRight = tlState.scrollMs + visDur;
        if (nextMs > viewRight || nextMs < tlState.scrollMs) {
          tlState.setScrollMs(Math.max(0, nextMs - visDur * 0.1));
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      (tick as any)._lastTick = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastActiveIdRef.current = null;
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);
}