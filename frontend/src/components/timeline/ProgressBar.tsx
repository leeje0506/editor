import { useRef, useEffect, useCallback } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";

interface Props {
  dark: boolean;
}

/**
 * 파형 하단 전체 재생바 — requestAnimationFrame으로 DOM 직접 조작.
 * React 리렌더 없이 부드럽게 진행률 표시.
 */
export function ProgressBar({ dark }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dm = dark;

  useEffect(() => {
    const update = () => {
      const { currentMs, totalMs } = usePlayerStore.getState();
      const pct = totalMs > 0 ? (currentMs / totalMs) * 100 : 0;
      if (barRef.current) barRef.current.style.width = `${pct}%`;
      if (knobRef.current) knobRef.current.style.left = `${pct}%`;
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const totalMs = usePlayerStore.getState().totalMs;
    const ms = Math.round(pct * totalMs);

    usePlayerStore.getState().setCurrentMs(ms);
    usePlayerStore.getState().setVideoPreviewMs(null);

    // 해당 위치에 자막 있으면 선택
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
      <div
        ref={barRef}
        className="absolute left-0 top-0 bottom-0 bg-red-500/80"
        style={{ width: "0%" }}
      />
      {/* 현재 위치 인디케이터 */}
      <div ref={knobRef} className="absolute top-0 bottom-0 w-0.5 bg-red-400" style={{ left: "0%" }} />
      <div className="absolute inset-0 bg-transparent group-hover:bg-white/10 transition-colors" />
    </div>
  );
}