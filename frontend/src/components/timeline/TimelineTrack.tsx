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
      updateOne(subId, { [handle === "start" ? "start_ms" : "end_ms"]: ms });
    },
    [tlLeft, visDur, updateOne],
  );

  const startDrag = (e: React.MouseEvent, handle: "start" | "end", subId: number) => {
    e.stopPropagation();
    const move = (ev: MouseEvent) => handleDrag(ev, handle, subId);
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div className="absolute inset-0 z-10" data-timeline-track>
      {subtitles.map((s) => {
        const l = ((s.start_ms - tlLeft) / visDur) * 100;
        const w = ((s.end_ms - s.start_ms) / visDur) * 100;
        const isSel = s.id === selectedId;
        const isMulti = multiSelect.has(s.id) && !isSel;

        return (
          <div
            key={s.id}
            className={`absolute top-1 bottom-1 flex items-center justify-center text-[8px] font-mono cursor-pointer rounded
              ${isSel
                ? "bg-blue-500/40 border border-blue-400 text-white font-bold z-20 shadow-sm"
                : isMulti
                  ? dm ? "bg-blue-500/15 border border-blue-500/30 text-blue-300" : "bg-blue-200/50 border border-blue-300 text-blue-700"
                  : dm ? "bg-blue-500/10 border border-blue-500/20 text-blue-400/70" : "bg-blue-50 border border-blue-200 text-blue-600"
              }`}
            style={{ left: `${Math.max(-2, l)}%`, width: `${Math.max(0.5, w)}%` }}
            onClick={(e) => { e.stopPropagation(); setCurrentMs(s.start_ms); }}
            onDoubleClick={(e) => { e.stopPropagation(); selectSingle(s.id); }}
          >
            {isSel && (
              <>
                <div data-h="s" className="absolute left-0 top-0 bottom-0 w-1.5 bg-yellow-400 cursor-ew-resize z-30 hover:bg-yellow-300 rounded-l"
                  onMouseDown={(e) => startDrag(e, "start", s.id)} />
                <div data-h="e" className="absolute right-0 top-0 bottom-0 w-1.5 bg-yellow-400 cursor-ew-resize z-30 hover:bg-yellow-300 rounded-r"
                  onMouseDown={(e) => startDrag(e, "end", s.id)} />
              </>
            )}
            <span className="truncate px-1.5">{s.speaker || `#${s.seq}`}</span>
          </div>
        );
      })}
    </div>
  );
}