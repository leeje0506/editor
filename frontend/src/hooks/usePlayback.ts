import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubtitleStore } from "../store/useSubtitleStore";
import { useTimelineStore } from "../store/useTimelineStore";

export function usePlayback() {
  const rafRef = useRef<number | null>(null);
  const lastActiveIdRef = useRef<number | null>(null);
  const playing = usePlayerStore((s) => s.playing);

  // 디버그용 카운터
  const tickCountRef = useRef(0);
  const logTimeRef = useRef(0);

  useEffect(() => {
    // console.log("[playback] effect fire, playing =", playing);
    if (playing) {
      lastActiveIdRef.current = null;
      tickCountRef.current = 0;
      logTimeRef.current = performance.now();

      const tick = () => {
        const video = document.querySelector("video");
        const { totalMs } = usePlayerStore.getState();

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

        // 자막 자동 추적
        const { subtitles, selectSingle, selectedId } = useSubtitleStore.getState();
        const active = subtitles.find(
          (s) => nextMs >= s.start_ms && nextMs < s.end_ms
        );

        // ★ 1초마다 한 번만 로그 (스팸 방지)
        tickCountRef.current++;
        const now = performance.now();
        if (now - logTimeRef.current > 1000) {
          logTimeRef.current = now;
          // console.log("[playback]", {
          //   tickPerSec: tickCountRef.current,
          //   currentMs: nextMs,
          //   subsCount: subtitles.length,
          //   activeId: active?.id ?? null,
          //   selectedId,
          //   lastRef: lastActiveIdRef.current,
          // });
          tickCountRef.current = 0;
        }

        if (active) {
          if (active.id !== lastActiveIdRef.current && active.id !== selectedId) {
            // console.log("[playback] CALLING selectSingle:", active.id);
            lastActiveIdRef.current = active.id;
            selectSingle(active.id);
          } else if (active.id !== lastActiveIdRef.current) {
            lastActiveIdRef.current = active.id;
          }
        }

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