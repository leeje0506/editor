import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubtitleStore } from "../store/useSubtitleStore";
import { useTimelineStore } from "../store/useTimelineStore";

/** 재생 타이머 + 재생 중 자막 자동 추적 */
export function usePlayback() {
  const intervalRef = useRef<number | null>(null);
  const playing = usePlayerStore((s) => s.playing);
  const currentMs = usePlayerStore((s) => s.currentMs);
  const subtitles = useSubtitleStore((s) => s.subtitles);
  const selectedId = useSubtitleStore((s) => s.selectedId);
  const selectSingle = useSubtitleStore((s) => s.selectSingle);
  const ensureVisible = useTimelineStore((s) => s.ensureVisible);

  useEffect(() => {
    if (playing) {
      intervalRef.current = window.setInterval(() => {
        usePlayerStore.setState((s) => ({
          currentMs: s.currentMs + 100 >= s.totalMs ? 0 : s.currentMs + 100,
        }));
      }, 100);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    const active = subtitles.find((s) => currentMs >= s.start_ms && currentMs < s.end_ms);
    if (active && active.id !== selectedId) selectSingle(active.id);
    ensureVisible(currentMs);
  }, [currentMs, playing]);
}