import { useCallback } from "react";
import { useTimelineStore } from "../store/useTimelineStore";

/** 타임라인 마우스 휠: Ctrl+휠=줌, 일반 휠=패닝 */
export function useTimelineZoom() {
  const zoomIn = useTimelineStore((s) => s.zoomIn);
  const zoomOut = useTimelineStore((s) => s.zoomOut);
  const panBy = useTimelineStore((s) => s.panBy);
  const visibleDuration = useTimelineStore((s) => s.visibleDuration);

  const handleWheel = useCallback(
    (e: React.WheelEvent, containerRect: DOMRect) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const pct = (e.clientX - containerRect.left) / containerRect.width;
        if (e.deltaY < 0) zoomIn(pct);
        else zoomOut(pct);
      } else {
        const dur = visibleDuration();
        panBy(e.deltaY > 0 ? dur * 0.15 : -dur * 0.15);
      }
    },
    [zoomIn, zoomOut, panBy, visibleDuration],
  );

  return { handleWheel };
}