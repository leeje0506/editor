import { useRef, useEffect } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { msToTimecode } from "../../utils/time";

/**
 * 타임라인 좌하단 현재시간 표시 — 재생 중에만 RAF, 정지 시 subscribe.
 */
export function TimelineTimeDisplay() {
  const ref = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const applyText = () => {
      if (!ref.current) return;
      const { currentMs, totalMs } = usePlayerStore.getState();
      ref.current.textContent = `${msToTimecode(currentMs)} / ${msToTimecode(totalMs)}`;
    };

    let isPlaying = usePlayerStore.getState().playing;

    const startRaf = () => {
      const tick = () => {
        applyText();
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const stopRaf = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    if (isPlaying) startRaf();

    const unsub = usePlayerStore.subscribe((state, prev) => {
      if (state.playing !== prev.playing) {
        isPlaying = state.playing;
        if (isPlaying) {
          startRaf();
        } else {
          stopRaf();
          applyText();
        }
      }
      if (!isPlaying && (state.currentMs !== prev.currentMs || state.totalMs !== prev.totalMs)) {
        applyText();
      }
    });

    applyText();

    return () => {
      stopRaf();
      unsub();
    };
  }, []);

  return (
    <div className="absolute bottom-1 left-2 z-30 pointer-events-none">
      <span ref={ref} className="text-[9px] font-mono text-gray-400 bg-black/60 px-1 rounded" />
    </div>
  );
}