import { useRef, useEffect } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { msToTimecode } from "../../utils/time";

/**
 * 타임라인 좌하단 현재시간 표시 — RAF로 DOM 직접 조작.
 */
export function TimelineTimeDisplay() {
  const ref = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const update = () => {
      if (ref.current) {
        const { currentMs, totalMs } = usePlayerStore.getState();
        ref.current.textContent = `${msToTimecode(currentMs)} / ${msToTimecode(totalMs)}`;
      }
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="absolute bottom-1 left-2 z-30 pointer-events-none">
      <span ref={ref} className="text-[9px] font-mono text-gray-400 bg-black/60 px-1 rounded" />
    </div>
  );
}