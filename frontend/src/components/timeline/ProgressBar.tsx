import { useRef, useEffect, useCallback } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";

interface Props {
  dark: boolean;
}

export function ProgressBar({ dark }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dm = dark;

  useEffect(() => {
    const applyPosition = () => {
      const ms = usePlayerStore.getState().getVisualMs();
      const totalMs = usePlayerStore.getState().totalMs;
      const pct = totalMs > 0 ? (ms / totalMs) * 100 : 0;
      if (barRef.current) barRef.current.style.width = `${pct}%`;
      if (knobRef.current) knobRef.current.style.left = `${pct}%`;
    };

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

    const unsub = usePlayerStore.subscribe((state, prev) => {
      if (state.playing !== prev.playing) {
        isPlaying = state.playing;
        if (isPlaying) startRaf();
        else { stopRaf(); applyPosition(); }
      }
      if (!isPlaying && state.currentMs !== prev.currentMs) {
        applyPosition();
      }
    });

    applyPosition();
    return () => { stopRaf(); unsub(); };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const totalMs = usePlayerStore.getState().totalMs;
    const ms = Math.round(pct * totalMs);
    usePlayerStore.getState().setCurrentMs(ms);
    usePlayerStore.getState().setVideoPreviewMs(null);
    const subtitles = useSubtitleStore.getState().subtitles;
    const hit = subtitles.find((s) => ms >= s.start_ms && ms < s.end_ms);
    if (hit) useSubtitleStore.getState().selectSingle(hit.id);
  }, []);

  return (
    <div
      className="shrink-0 relative cursor-pointer group"
      style={{ height: 10 }}
      onClick={handleClick}
    >
      <div className={`absolute inset-0 ${dm ? "bg-gray-800" : "bg-gray-300"}`} />
      <div ref={barRef} className="absolute left-0 top-0 bottom-0 bg-red-500/80" style={{ width: "0%" }} />
      <div ref={knobRef} className="absolute top-0 bottom-0 w-0.5 bg-red-400" style={{ left: "0%" }} />
      <div className="absolute inset-0 bg-transparent group-hover:bg-white/10 transition-colors" />
    </div>
  );
}