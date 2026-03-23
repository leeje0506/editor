import { useRef, useMemo, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { useTimelineStore } from "../../store/useTimelineStore";
import { useTimelineZoom } from "../../hooks/useTimelineZoom";
import { msToTimecode } from "../../utils/time";
import { ZoomControls } from "./ZoomControls";
import { Playhead } from "./Playhead";
import { TimelineTrack } from "./TimelineTrack";

interface Props {
  dark: boolean;
}

export function Timeline({ dark }: Props) {
  const tlRef = useRef<HTMLDivElement>(null);
  const { currentMs, playing, togglePlay, seekForward, seekBackward, setCurrentMs } = usePlayerStore();
  const { subtitles, selectedId, multiSelect, selectSingle, deleteSelected } = useSubtitleStore();
  const { scrollMs, visibleDuration, zoomIdx } = useTimelineStore();
  const { handleWheel } = useTimelineZoom();

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const bdl = dm ? "border-gray-700" : "border-gray-100";

  const visDur = visibleDuration();
  const tlLeft = scrollMs;

  // Visible subs
  const vtl = useMemo(
    () => subtitles.filter((s) => s.end_ms > tlLeft && s.start_ms < tlLeft + visDur),
    [subtitles, tlLeft, visDur],
  );

  // Playhead pct
  const playPct = ((currentMs - tlLeft) / visDur) * 100;

  // Ticks
  const tickCount = visDur <= 10000 ? 10 : visDur <= 30000 ? 8 : visDur <= 120000 ? 6 : 10;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i / tickCount);

  // Waveform (memoized)
  const wavePath = useMemo(() => {
    let p = "M0,100 ";
    for (let i = 0; i <= 2000; i += 3) {
      const a = 30 + Math.sin(i * 0.02) * 25 + Math.sin(i * 0.07) * 15 + Math.sin(i * 0.13) * 10;
      p += `L${i},${100 - a} `;
    }
    p += "L2000,100 ";
    for (let i = 2000; i >= 0; i -= 3) {
      const a = 30 + Math.sin(i * 0.02) * 25 + Math.sin(i * 0.07) * 15 + Math.sin(i * 0.13) * 10;
      p += `L${i},${100 + a} `;
    }
    return p + "Z";
  }, []);

  const totalMs = usePlayerStore((s) => s.totalMs);

  const onTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-h]")) return;
      if (!tlRef.current) return;
      const rect = tlRef.current.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      setCurrentMs(Math.round(tlLeft + pct * visDur));
    },
    [tlLeft, visDur, setCurrentMs],
  );

  const onWheelHandler = useCallback(
    (e: React.WheelEvent) => {
      if (!tlRef.current) return;
      handleWheel(e, tlRef.current.getBoundingClientRect());
    },
    [handleWheel],
  );

  return (
    <div className={`shrink-0 ${card} border-t ${bd} flex flex-col`} style={{ height: "155px" }}>
      {/* Controls header */}
      <div className={`h-7 shrink-0 border-b ${bdl} flex items-center justify-between px-4`}>
        <div className="flex items-center gap-3">
          <button onClick={() => seekBackward()}>
            <SkipBack size={13} className={`${ts} cursor-pointer hover:opacity-80`} />
          </button>
          <button onClick={togglePlay}>
            {playing ? <Pause size={13} className={ts} /> : <Play size={13} className={`${ts} fill-current`} />}
          </button>
          <button onClick={() => seekForward()}>
            <SkipForward size={13} className={`${ts} cursor-pointer hover:opacity-80`} />
          </button>
          <ZoomControls dark={dm} />
        </div>
        <div className={`text-[10px] ${ts}`}>
          <span className={dm ? "text-gray-500" : "text-gray-400"}>Ctrl+휠: 확대/축소 | 휠: 좌우이동 | </span>
          <strong className="text-yellow-500 font-normal">노란색 바</strong> 드래그: 시간 조정
        </div>
      </div>

      {/* Track area */}
      <div
        ref={tlRef}
        className={`flex-1 relative ${dm ? "bg-gray-850" : "bg-gray-50"} overflow-hidden cursor-crosshair`}
        onClick={onTrackClick}
        onWheel={onWheelHandler}
      >
        <Playhead pct={playPct} />

        {/* Ticks */}
        {ticks.map((p) => (
          <div key={p}>
            <div
              className={`absolute top-1 text-[7px] font-mono ${ts} pointer-events-none`}
              style={{ left: `${p * 100}%`, transform: "translateX(-50%)" }}
            >
              {msToTimecode(Math.round(tlLeft + p * visDur))}
            </div>
            <div
              className={`absolute top-4 bottom-0 w-px pointer-events-none ${dm ? "bg-gray-700/40" : "bg-gray-200/70"}`}
              style={{ left: `${p * 100}%` }}
            />
          </div>
        ))}

        {/* Waveform */}
        <div
          className="absolute top-4 bottom-0 z-0 pointer-events-none flex items-center"
          style={{
            opacity: 0.12,
            left: `${(-tlLeft / totalMs) * 100}%`,
            width: `${(totalMs / visDur) * 100}%`,
          }}
        >
          <svg preserveAspectRatio="none" viewBox="0 0 2000 200" className={`w-full h-full ${dm ? "fill-blue-400" : "fill-blue-500"}`}>
            <path d={wavePath} />
          </svg>
        </div>

        {/* Subtitle blocks */}
        <TimelineTrack
          dark={dm}
          subtitles={vtl}
          selectedId={selectedId}
          multiSelect={multiSelect}
          tlLeft={tlLeft}
          visDur={visDur}
        />

        {/* 휴지통 */}
        <div className="absolute bottom-2 right-3 z-30">
          <button
            onClick={(e) => { e.stopPropagation(); deleteSelected(); }}
            className={`${dm ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-500 hover:bg-gray-600"} text-white px-3 py-1 rounded text-[10px] flex items-center gap-1 shadow`}
          >
            <Trash2 size={12} /> 휴지통
          </button>
        </div>
      </div>
    </div>
  );
}