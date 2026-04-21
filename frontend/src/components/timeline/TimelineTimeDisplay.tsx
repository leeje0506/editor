import { useRef, useEffect } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { msToTimecode } from "../../utils/time";

export function TimelineTimeDisplay() {
  const ref = useRef<HTMLSpanElement>(null);
  const intervalRef = useRef<number>(0);

  useEffect(() => {
    const applyText = () => {
      if (!ref.current) return;
      const ms = usePlayerStore.getState().getVisualMs();
      const totalMs = usePlayerStore.getState().totalMs;
      ref.current.textContent = `${msToTimecode(ms)} / ${msToTimecode(totalMs)}`;
    };

    let isPlaying = usePlayerStore.getState().playing;

    const startInterval = () => {
      intervalRef.current = window.setInterval(applyText, 200);
    };
    const stopInterval = () => {
      clearInterval(intervalRef.current);
      intervalRef.current = 0;
    };

    if (isPlaying) startInterval();

    const unsub = usePlayerStore.subscribe((state, prev) => {
      if (state.playing !== prev.playing) {
        isPlaying = state.playing;
        if (isPlaying) startInterval();
        else { stopInterval(); applyText(); }
      }
      if (!isPlaying && (state.currentMs !== prev.currentMs || state.totalMs !== prev.totalMs)) {
        applyText();
      }
    });

    applyText();
    return () => { stopInterval(); unsub(); };
  }, []);

  return (
    <div className="absolute bottom-1 left-2 z-30 pointer-events-none">
      <span ref={ref} className="text-[9px] font-mono text-gray-400 bg-black/60 px-1 rounded" />
    </div>
  );
}