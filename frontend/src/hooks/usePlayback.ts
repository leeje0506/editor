import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubtitleStore } from "../store/useSubtitleStore";
import { useTimelineStore } from "../store/useTimelineStore";

/**
 * 재생 타이머.
 * - 재생 중 currentMs에 해당하는 자막을 자동 선택 (QuickEditor 연동)
 * - 플레이헤드가 뷰 밖으로 나가면 페이지 넘김
 * - 정지 상태에서는 자동 선택 안 함
 */
export function usePlayback() {
  const intervalRef = useRef<number | null>(null);
  const { playing } = usePlayerStore();

  useEffect(() => {
    if (playing) {
      intervalRef.current = window.setInterval(() => {
        const { currentMs, totalMs } = usePlayerStore.getState();
        const nextMs = currentMs + 100 >= totalMs ? 0 : currentMs + 100;
        usePlayerStore.setState({ currentMs: nextMs });

        // 재생 중 현재 자막 자동 선택 → QuickEditor 연동
        const { subtitles, selectedId, selectSingle } = useSubtitleStore.getState();
        const active = subtitles.find(
          (s) => nextMs >= s.start_ms && nextMs < s.end_ms
        );
        if (active && active.id !== selectedId) {
          selectSingle(active.id);
        }

        // 플레이헤드가 뷰 밖이면 페이지 넘김
        const tlState = useTimelineStore.getState();
        const visDur = tlState.visibleDuration();
        const viewRight = tlState.scrollMs + visDur;
        if (nextMs > viewRight || nextMs < tlState.scrollMs) {
          tlState.setScrollMs(Math.max(0, nextMs - visDur * 0.1));
        }
      }, 100);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing]);
}