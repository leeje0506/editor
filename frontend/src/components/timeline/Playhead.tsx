import { useRef, useEffect } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useTimelineStore } from "../../store/useTimelineStore";

const TARGET_FPS = 60;
const FRAME_MS = 1000 / TARGET_FPS;

export function Playhead() {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const applyPosition = () => {
      if (!ref.current) return;
      const ms = usePlayerStore.getState().getVisualMs();
      const scrollMs = useTimelineStore.getState().scrollMs;
      const visDur = useTimelineStore.getState().visibleDuration();
      const pct = ((ms - scrollMs) / visDur) * 100;

      if (pct < -1 || pct > 101) {
        ref.current.style.display = "none";
      } else {
        ref.current.style.display = "";
        ref.current.style.left = `${pct}%`;
      }
    };

    let isPlaying = usePlayerStore.getState().playing;
    let lastFrameTime = 0;

    const startRaf = () => {
      lastFrameTime = 0;
      const tick = (ts: number) => {
        if (ts - lastFrameTime >= FRAME_MS) {
          lastFrameTime = ts;
          applyPosition();
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };
    const stopRaf = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    if (isPlaying) startRaf();

    const unsubPlayer = usePlayerStore.subscribe((state, prev) => {
      if (state.playing !== prev.playing) {
        isPlaying = state.playing;
        if (isPlaying) startRaf();
        else { stopRaf(); applyPosition(); }
      }
      if (!isPlaying && state.currentMs !== prev.currentMs) {
        applyPosition();
      }
    });

    const unsubTimeline = useTimelineStore.subscribe((state, prev) => {
      if (!isPlaying && (state.scrollMs !== prev.scrollMs || state.zoomIdx !== prev.zoomIdx)) {
        applyPosition();
      }
    });

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