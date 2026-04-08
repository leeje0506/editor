import { useRef, useEffect } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useTimelineStore } from "../../store/useTimelineStore";

/**
 * 플레이헤드 — 재생 중에만 RAF, 정지 시 subscribe로 변경 감지.
 */
export function Playhead() {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const applyPosition = () => {
      if (!ref.current) return;
      const currentMs = usePlayerStore.getState().currentMs;
      const scrollMs = useTimelineStore.getState().scrollMs;
      const visDur = useTimelineStore.getState().visibleDuration();
      const pct = ((currentMs - scrollMs) / visDur) * 100;

      if (pct < -1 || pct > 101) {
        ref.current.style.display = "none";
      } else {
        ref.current.style.display = "";
        ref.current.style.left = `${pct}%`;
      }
    };

    /* ── RAF 루프: playing일 때만 ── */
    let isPlaying = usePlayerStore.getState().playing;

    const startRaf = () => {
      const tick = () => {
        applyPosition();
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const stopRaf = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    if (isPlaying) startRaf();

    /* ── subscribe: playing 토글 감지 + 정지 중 currentMs/scrollMs 변경 감지 ── */
    const unsubPlayer = usePlayerStore.subscribe((state, prev) => {
      if (state.playing !== prev.playing) {
        isPlaying = state.playing;
        if (isPlaying) {
          startRaf();
        } else {
          stopRaf();
          applyPosition();
        }
      }
      // 정지 중 currentMs 변경 (seek 등)
      if (!isPlaying && state.currentMs !== prev.currentMs) {
        applyPosition();
      }
    });

    const unsubTimeline = useTimelineStore.subscribe((state, prev) => {
      // 줌/스크롤 변경 시
      if (!isPlaying && (state.scrollMs !== prev.scrollMs || state.zoomIdx !== prev.zoomIdx)) {
        applyPosition();
      }
    });

    // 초기 위치
    applyPosition();

    return () => {
      stopRaf();
      unsubPlayer();
      unsubTimeline();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="absolute top-0 bottom-0 w-px bg-yellow-300 z-20 pointer-events-none"
    >
      <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[5px] border-l-transparent border-r-transparent border-t-yellow-300 -ml-[2.5px] -mt-px" />
    </div>
  );
}