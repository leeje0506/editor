import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubtitleStore } from "../store/useSubtitleStore";
import { useTimelineStore } from "../store/useTimelineStore";

/**
 * 재생 타이머 + 재생 중 자막 자동 추적.
 *
 * - 재생 중 100ms마다 currentMs 증가
 * - 재생 중 현재 시간에 해당하는 자막 자동 선택 (QuickEditor 연동)
 * - lastActiveIdRef로 같은 자막 구간 내 중복 selectSingle 방지
 * - 플레이헤드가 뷰 밖으로 나가면 페이지 넘김
 */
export function usePlayback() {
  const intervalRef = useRef<number | null>(null);
  const lastActiveIdRef = useRef<number | null>(null);
  const { playing } = usePlayerStore();

  useEffect(() => {
    if (playing) {
      // 재생 시작 시 lastActiveIdRef 리셋
      lastActiveIdRef.current = null;

      intervalRef.current = window.setInterval(() => {
        const { currentMs, totalMs } = usePlayerStore.getState();
        const nextMs = currentMs + 100 >= totalMs ? 0 : currentMs + 100;
        usePlayerStore.setState({ currentMs: nextMs });

        // 재생 중 자막 자동 추적
        const { subtitles, selectSingle } = useSubtitleStore.getState();
        const active = subtitles.find(
          (s) => nextMs >= s.start_ms && nextMs < s.end_ms
        );
        if (active && active.id !== lastActiveIdRef.current) {
          lastActiveIdRef.current = active.id;
          selectSingle(active.id);
        }

        // 플레이헤드가 뷰 밖으로 완전히 나갔을 때만 뷰 이동
        const tlState = useTimelineStore.getState();
        const visDur = tlState.visibleDuration();
        const viewRight = tlState.scrollMs + visDur;

        if (nextMs > viewRight || nextMs < tlState.scrollMs) {
          const newScroll = nextMs - visDur * 0.1;
          tlState.setScrollMs(Math.max(0, newScroll));
        }
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      lastActiveIdRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing]);
}