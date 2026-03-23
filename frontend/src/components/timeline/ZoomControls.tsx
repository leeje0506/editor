import { ZoomIn, ZoomOut } from "lucide-react";
import { useTimelineStore } from "../../store/useTimelineStore";
import { ZOOM_LEVELS } from "../../types";
import { formatDuration } from "../../utils/time";

interface Props {
  dark: boolean;
}

export function ZoomControls({ dark }: Props) {
  const { zoomIdx, zoomIn, zoomOut, zoomFit, visibleDuration } = useTimelineStore();

  const dm = dark;
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";

  return (
    <div className={`flex items-center gap-1 ml-2 border-l ${dm ? "border-gray-700" : "border-gray-100"} pl-3`}>
      <button
        onClick={() => zoomIn()}
        className={`w-6 h-5 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80 ${zoomIdx <= 0 ? "opacity-30" : ""}`}
      >
        <ZoomIn size={12} />
      </button>
      <span className={`text-[9px] ${ts} font-mono w-10 text-center`}>
        {formatDuration(visibleDuration())}
      </span>
      <button
        onClick={() => zoomOut()}
        className={`w-6 h-5 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80 ${zoomIdx >= ZOOM_LEVELS.length - 1 ? "opacity-30" : ""}`}
      >
        <ZoomOut size={12} />
      </button>
      <button
        onClick={zoomFit}
        className={`ml-1 px-1.5 h-5 flex items-center justify-center border ${bd} rounded text-[9px] ${ts} hover:opacity-80`}
      >
        전체
      </button>
    </div>
  );
}