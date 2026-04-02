import { useRef, useEffect } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useTimelineStore } from "../../store/useTimelineStore";

/**
 * 플레이헤드 — requestAnimationFrame으로 DOM 직접 조작.
 * React 리렌더 없이 부드럽게 이동.
 */
export function Playhead() {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const update = () => {
      if (ref.current) {
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
      }
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      ref={ref}
      className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
    >
      <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[5px] border-l-transparent border-r-transparent border-t-red-500 -ml-[2.5px] -mt-px" />
    </div>
  );
}