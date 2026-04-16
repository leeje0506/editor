import { useTimelineStore } from "../../store/useTimelineStore";
import { ZOOM_LEVELS } from "../../types";

interface Props {
  dark: boolean;
}

/** 스케일 퍼센트 옵션 (50~300%, 50 단위) */
const SCALE_OPTIONS = [50, 100, 150, 200, 250, 300];

/** 100% 기준 ms (약 27초) */
const BASE_MS = 26667;

/** 스케일% → 가장 가까운 ZOOM_LEVELS 인덱스 */
function scaleToZoomIdx(scale: number): number {
  const targetMs = BASE_MS / (scale / 100);
  let bestIdx = 0;
  let bestDiff = Math.abs(ZOOM_LEVELS[0] - targetMs);
  for (let i = 1; i < ZOOM_LEVELS.length; i++) {
    const diff = Math.abs(ZOOM_LEVELS[i] - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** ZOOM_LEVELS 인덱스 → 가장 가까운 스케일% */
function zoomIdxToScale(idx: number): number {
  const ms = ZOOM_LEVELS[idx];
  const rawScale = (BASE_MS / ms) * 100;
  // 가장 가까운 SCALE_OPTIONS 값 반환
  let best = SCALE_OPTIONS[0];
  let bestDiff = Math.abs(SCALE_OPTIONS[0] - rawScale);
  for (const s of SCALE_OPTIONS) {
    const diff = Math.abs(s - rawScale);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

export function ZoomControls({ dark }: Props) {
  const { zoomIdx, zoomFit } = useTimelineStore();
  const setScrollMs = useTimelineStore((s) => s.setScrollMs);
  const scrollMs = useTimelineStore((s) => s.scrollMs);
  const visibleDuration = useTimelineStore((s) => s.visibleDuration);

  const currentScale = zoomIdxToScale(zoomIdx);

  const dm = dark;
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const selectBg = dm ? "bg-gray-700 text-gray-200 border-gray-600" : "bg-white text-gray-700 border-gray-300";

  const handleScaleChange = (newScale: number) => {
    const oldDur = visibleDuration();
    const centerMs = scrollMs + oldDur / 2;
    const newIdx = scaleToZoomIdx(newScale);
    const newDur = ZOOM_LEVELS[newIdx];
    useTimelineStore.setState({ zoomIdx: newIdx });
    // 중심 유지 스크롤
    setScrollMs(Math.max(0, centerMs - newDur / 2));
  };

  return (
    <div className={`flex items-center gap-1.5 ml-2 border-l ${dm ? "border-gray-700" : "border-gray-100"} pl-3`}>
      <select
        value={currentScale}
        onChange={(e) => handleScaleChange(Number(e.target.value))}
        className={`h-5 text-[10px] font-mono border rounded px-1 outline-none cursor-pointer ${selectBg}`}
      >
        {SCALE_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}%</option>
        ))}
      </select>
      <button
        onClick={zoomFit}
        className={`px-1.5 h-5 flex items-center justify-center border ${bd} rounded text-[9px] ${ts} hover:opacity-80`}
      >
        전체
      </button>
    </div>
  );
}