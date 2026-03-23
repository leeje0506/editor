import { useCallback } from "react";
import type { Subtitle } from "../../types";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";

interface Props {
  dark: boolean;
  subtitles: Subtitle[];
  selectedId: number | null;
  multiSelect: Set<number>;
  tlLeft: number;
  visDur: number;
}

export function TimelineTrack({ dark, subtitles, selectedId, multiSelect, tlLeft, visDur }: Props) {
  const selectSingle = useSubtitleStore((s) => s.selectSingle);
  const updateOne = useSubtitleStore((s) => s.updateOne);
  const setCurrentMs = usePlayerStore((s) => s.setCurrentMs);

  const dm = dark;

  const handleDrag = useCallback(
    (e: MouseEvent, handle: "start" | "end", subId: number) => {
      const track = document.querySelector("[data-timeline-track]") as HTMLElement;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ms = Math.round(tlLeft + pct * visDur);
      const key = handle === "start" ? "start_ms" : "end_ms";
      updateOne(subId, { [key]: ms });
    },
    [tlLeft, visDur, updateOne],
  );

  const startDrag = (e: React.MouseEvent, handle: "start" | "end", subId: number) => {
    e.stopPropagation();
    const move = (ev: MouseEvent) => handleDrag(ev, handle, subId);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div className="absolute inset-x-0 z-10" style={{ top: "22%", height: "42px" }} data-timeline-track>
      {subtitles.map((s) => {
        const l = ((s.start_ms - tlLeft) / visDur) * 100;
        const w = ((s.end_ms - s.start_ms) / visDur) * 100;
        const isSel = s.id === selectedId;
        const isMulti = multiSelect.has(s.id) && !isSel;

        return (
          <div
            key={s.id}
            className={`absolute h-full flex items-center justify-center text-[8px] font-mono cursor-pointer rounded-sm
              ${
                isSel
                  ? "bg-blue-500 text-white font-bold z-20 shadow-md"
                  : isMulti
                    ? dm
                      ? "bg-blue-800/50 border border-blue-600 text-blue-200"
                      : "bg-blue-200/70 border border-blue-300 text-blue-700"
                    : dm
                      ? "bg-gray-700/60 border border-gray-600 text-gray-300"
                      : "bg-blue-50 border border-blue-200 text-blue-600"
              }`}
            style={{
              left: `${Math.max(-5, l)}%`,
              width: `${Math.max(0.3, w)}%`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentMs(s.start_ms);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              selectSingle(s.id);
            }}
          >
            {isSel && (
              <>
                <div
                  data-h="s"
                  className="absolute left-0 top-0 bottom-0 w-2 bg-yellow-400 cursor-ew-resize z-30 hover:bg-yellow-300 rounded-l-sm"
                  onMouseDown={(e) => startDrag(e, "start", s.id)}
                />
                <div
                  data-h="e"
                  className="absolute right-0 top-0 bottom-0 w-2 bg-yellow-400 cursor-ew-resize z-30 hover:bg-yellow-300 rounded-r-sm"
                  onMouseDown={(e) => startDrag(e, "end", s.id)}
                />
              </>
            )}
            <span className="truncate px-1">#{s.seq}</span>
          </div>
        );
      })}
    </div>
  );
}