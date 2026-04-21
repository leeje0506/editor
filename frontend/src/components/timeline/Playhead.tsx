import { useRef, useEffect } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useTimelineStore } from "../../store/useTimelineStore";

const TARGET_FPS = 60;
const FRAME_MS = 1000 / TARGET_FPS;
const EPSILON_PX = 0.08;

export function Playhead() {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const parentWidthRef = useRef(0);
  const lastXRef = useRef(-999);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const parent = el.parentElement;
    let ro: ResizeObserver | null = null;
    if (parent) {
      parentWidthRef.current = parent.getBoundingClientRect().width;
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          parentWidthRef.current = entry.contentRect.width;
        }
      });
      ro.observe(parent);
    }

    // const applyPosition = () => {
    //   if (!el) return;
    //   const ms = usePlayerStore.getState().getVisualMs();
    //   const scrollMs = useTimelineStore.getState().scrollMs;
    //   const visDur = useTimelineStore.getState().visibleDuration();
    //   const w = parentWidthRef.current;

    //   if (visDur <= 0 || w <= 0) return;

    //   const pct = (ms - scrollMs) / visDur;
    //   if (pct < -0.01 || pct > 1.01) {
    //     if (lastXRef.current !== -999) {
    //       el.style.opacity = "0";
    //       lastXRef.current = -999;
    //     }
    //     return;
    //   }

    //   const x = pct * w;

    //   // epsilon 비교 — 변화가 너무 작으면 DOM 안 건드림
    //   if (lastXRef.current !== -999 && Math.abs(lastXRef.current - x) < EPSILON_PX) return;
    //   lastXRef.current = x;

    //   el.style.opacity = "1";
    //   el.style.transform = `translate3d(${x}px, 0, 0)`;
    // };

    const applyPosition = () => {
      if (!el) return;
      const ms = usePlayerStore.getState().getVisualMs();
      const scrollMs = useTimelineStore.getState().scrollMs;
      const visDur = useTimelineStore.getState().visibleDuration();

      if (visDur <= 0) return;

      const pct = ((ms - scrollMs) / visDur) * 100;

      if (pct < -1 || pct > 101) {
        if (lastXRef.current !== -999) {
          el.style.display = "none";
          lastXRef.current = -999;
        }
        return;
      }

      if (lastXRef.current !== -999 && Math.abs(lastXRef.current - pct) < 0.005) return;
      lastXRef.current = pct;

      el.style.display = "";
      el.style.left = `${pct}%`;
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
        if (isPlaying) { lastXRef.current = -999; startRaf(); }
        else { stopRaf(); applyPosition(); }
      }
      if (!isPlaying && state.currentMs !== prev.currentMs) {
        applyPosition();
      }
    });

    const unsubTimeline = useTimelineStore.subscribe((state, prev) => {
      if (state.scrollMs !== prev.scrollMs || state.zoomIdx !== prev.zoomIdx) {
        lastXRef.current = -999;
        applyPosition();
      }
    });

    applyPosition();

    return () => {
      stopRaf();
      unsubPlayer();
      unsubTimeline();
      if (ro) ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="absolute top-0 bottom-0 w-px z-20 pointer-events-none"
      style={{ backgroundColor: "rgba(202, 138, 4, 0.85)" }}
    >
      <div
        className="absolute -top-[1px]"
        style={{
          width: 0,
          height: 0,
          marginLeft: -2,
          borderLeft: "2px solid transparent",
          borderRight: "2px solid transparent",
          borderTop: "4px solid rgba(202, 138, 4, 0.85)",
        }}
      />
    </div>
  );
}