import { useRef, useMemo, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { useTimelineStore } from "../../store/useTimelineStore";
import { useTimelineZoom } from "../../hooks/useTimelineZoom";
import { msToTimecode } from "../../utils/time";
import { ZoomControls } from "./ZoomControls";
import { Playhead } from "./Playhead";

interface Props {
  dark: boolean;
}

export function Timeline({ dark }: Props) {
  const tlRef = useRef<HTMLDivElement>(null);
  const { currentMs, playing, togglePlay, seekForward, seekBackward, setCurrentMs } = usePlayerStore();
  const { subtitles, selectedId, multiSelect, selectSingle, deleteSelected, updateOne } = useSubtitleStore();
  const { scrollMs, visibleDuration } = useTimelineStore();
  const { handleWheel } = useTimelineZoom();
  const totalMs = usePlayerStore((s) => s.totalMs);

  const dm = dark;
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const bdl = dm ? "border-gray-700" : "border-gray-100";
  const ts = dm ? "text-gray-400" : "text-gray-500";

  const visDur = visibleDuration();
  const tlLeft = scrollMs;

  const vtl = useMemo(
    () => subtitles.filter((s) => s.end_ms > tlLeft && s.start_ms < tlLeft + visDur),
    [subtitles, tlLeft, visDur],
  );

  const playPct = ((currentMs - tlLeft) / visDur) * 100;

  const tickCount = visDur <= 10000 ? 10 : visDur <= 30000 ? 8 : visDur <= 120000 ? 6 : 10;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i / tickCount);

  // 파형 생성
  const wavePath = useMemo(() => {
    const W = 4000, H = 400, mid = H / 2;
    const seed = Math.floor(tlLeft / 100);
    const pts: number[] = [];
    for (let i = 0; i <= W; i += 2) {
      const x = (tlLeft + (i / W) * visDur) * 0.001;
      const amp =
        Math.sin(x * 2.1) * 0.3 + Math.sin(x * 5.7) * 0.25 +
        Math.sin(x * 13.3) * 0.2 + Math.sin(x * 31.7) * 0.15 +
        Math.sin(x * 67.1 + seed * 0.1) * 0.1;
      pts.push(((amp + 1) / 2) * mid * 0.9);
    }
    let upper = `M0,${mid} `;
    for (let i = 0; i < pts.length; i++) upper += `L${i * 2},${mid - pts[i]} `;
    upper += `L${W},${mid} `;
    let lower = "";
    for (let i = pts.length - 1; i >= 0; i--) lower += `L${i * 2},${mid + pts[i]} `;
    return upper + lower + "Z";
  }, [tlLeft, visDur]);

  // 자막 시간 드래그
  const startDrag = useCallback(
    (e: React.MouseEvent, handle: "start" | "end", subId: number) => {
      e.stopPropagation();
      e.preventDefault();
      const onMove = (ev: MouseEvent) => {
        if (!tlRef.current) return;
        const rect = tlRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const ms = Math.round(tlLeft + pct * visDur);
        updateOne(subId, { [handle === "start" ? "start_ms" : "end_ms"]: ms });
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [tlLeft, visDur, updateOne],
  );

  // 빈 영역 싱글클릭 → 재생 위치만 이동
  const onTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-h]")) return;
      if ((e.target as HTMLElement).closest("[data-sub-block]")) return;
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
    <div className={`h-full ${dm ? "bg-gray-900" : "bg-gray-50"} flex flex-col`}>
      {/* Controls header */}
      <div className={`h-7 shrink-0 border-b ${bdl} flex items-center justify-between px-4 ${dm ? "bg-gray-800" : "bg-white"}`}>
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
        className="flex-1 relative bg-black overflow-hidden cursor-crosshair"
        onClick={onTrackClick}
        onWheel={onWheelHandler}
      >
        {/* 시간 눈금 */}
        <div className="absolute inset-x-0 top-0 h-4 z-30 pointer-events-none">
          {ticks.map((p) => (
            <div
              key={p}
              className="absolute bottom-0 text-[7px] font-mono text-gray-500"
              style={{ left: `${p * 100}%`, transform: "translateX(-50%)" }}
            >
              {msToTimecode(Math.round(tlLeft + p * visDur))}
            </div>
          ))}
        </div>
        {ticks.map((p) => (
          <div
            key={`line-${p}`}
            className="absolute top-4 bottom-0 w-px bg-gray-700/30 pointer-events-none"
            style={{ left: `${p * 100}%` }}
          />
        ))}

        {/* 기본 파형 (어두운 — 자막 없는 구간) */}
        <div className="absolute inset-x-0 top-4 bottom-0 pointer-events-none">
          <svg preserveAspectRatio="none" viewBox="0 0 4000 400" className="w-full h-full">
            <path d={wavePath} fill="#0a2e0a" opacity="0.7" />
            <path d={wavePath} fill="none" stroke="#1a6e1a" strokeWidth="0.8" opacity="0.5" />
          </svg>
          <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-700/30" />
        </div>

        {/* 자막 블록 — 파형 겹침 */}
        <div className="absolute inset-x-0 top-4 bottom-0 z-10">
          {vtl.map((s) => {
            const l = ((s.start_ms - tlLeft) / visDur) * 100;
            const w = ((s.end_ms - s.start_ms) / visDur) * 100;
            const isSel = s.id === selectedId;
            const isMulti = multiSelect.has(s.id) && !isSel;
            const durSec = ((s.end_ms - s.start_ms) / 1000).toFixed(3);
            const isActive = currentMs >= s.start_ms && currentMs < s.end_ms;

            return (
              <div
                key={s.id}
                data-sub-block
                className="absolute top-0 bottom-0 cursor-pointer"
                style={{ left: `${Math.max(-5, l)}%`, width: `${Math.max(0.3, w)}%` }}
                onClick={(e) => { e.stopPropagation(); setCurrentMs(s.start_ms); }}
                onDoubleClick={(e) => { e.stopPropagation(); selectSingle(s.id); }}
              >
                {/* 자막 구간 밝은 파형 오버레이 */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <svg
                    preserveAspectRatio="none"
                    viewBox="0 0 4000 400"
                    className="pointer-events-none"
                    style={{
                      position: "absolute",
                      top: 0,
                      height: "100%",
                      left: `${(-l / Math.max(0.3, w)) * 100}%`,
                      width: `${(100 / Math.max(0.3, w)) * 100}%`,
                    }}
                  >
                    {isActive ? (
                      <>
                        <path d={wavePath} fill="#5c1a1a" opacity="0.7" />
                        <path d={wavePath} fill="none" stroke="#ff4444" strokeWidth="1" opacity="0.9" />
                        <path d={wavePath} fill="#cc2222" opacity="0.3" />
                      </>
                    ) : (
                      <>
                        <path d={wavePath} fill="#1a5c1a" opacity="0.7" />
                        <path d={wavePath} fill="none" stroke="#39ff14" strokeWidth="1" opacity="0.9" />
                        <path d={wavePath} fill="#2ecc40" opacity="0.4" />
                      </>
                    )}
                  </svg>
                </div>

                {/* 경계선 */}
                <div className={`absolute left-0 top-0 bottom-0 w-px ${
                  isActive ? "bg-red-400" : isSel ? "bg-yellow-400" : "bg-gray-400/50"
                }`} />
                <div className={`absolute right-0 top-0 bottom-0 w-px ${
                  isActive ? "bg-red-400" : isSel ? "bg-yellow-400" : "bg-gray-400/50"
                }`} />

                {/* 선택 하이라이트 */}
                {isSel && !isActive && (
                  <div className="absolute inset-0 bg-blue-400/10 border-t border-b border-blue-400/30 pointer-events-none" />
                )}
                {isMulti && (
                  <div className="absolute inset-0 bg-blue-400/5 pointer-events-none" />
                )}

                {/* 자막 텍스트 */}
                <div className="absolute top-0.5 left-1 right-1 pointer-events-none">
                  <span className={`text-[9px] leading-tight block truncate font-medium
                    ${isActive
                      ? "text-red-200 drop-shadow-[0_1px_3px_rgba(255,0,0,0.6)]"
                      : isSel
                        ? "text-yellow-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                        : s.type === "effect"
                          ? "text-yellow-400/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                          : "text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                    }`}>
                    {s.text.replace(/\n/g, " ")}
                  </span>
                </div>

                {/* 하단 정보 */}
                <div className="absolute bottom-0.5 left-1 pointer-events-none flex items-center gap-1">
                  <span className={`text-[7px] font-mono drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                    isActive ? "text-red-300/80" : "text-green-400/70"
                  }`}>#{s.seq}</span>
                  <span className={`text-[7px] font-mono drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                    isActive ? "text-red-300/60" : "text-green-300/50"
                  }`}>{durSec}</span>
                </div>

                {/* 노란 드래그 핸들 */}
                {isSel && (
                  <>
                    <div
                      data-h="s"
                      className="absolute left-0 top-0 bottom-0 w-2 bg-yellow-400/80 cursor-ew-resize z-30 hover:bg-yellow-300"
                      onMouseDown={(e) => startDrag(e, "start", s.id)}
                    />
                    <div
                      data-h="e"
                      className="absolute right-0 top-0 bottom-0 w-2 bg-yellow-400/80 cursor-ew-resize z-30 hover:bg-yellow-300"
                      onMouseDown={(e) => startDrag(e, "end", s.id)}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* 플레이헤드 */}
        <Playhead pct={playPct} />

        {/* 현재 시간 */}
        <div className="absolute bottom-1 left-2 z-30 pointer-events-none">
          <span className="text-[9px] font-mono text-gray-400 bg-black/60 px-1 rounded">
            {msToTimecode(currentMs)} / {msToTimecode(totalMs)}
          </span>
        </div>

        {/* 휴지통 */}
        <div className="absolute bottom-1 right-2 z-30">
          <button
            onClick={(e) => { e.stopPropagation(); deleteSelected(); }}
            className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-0.5 rounded text-[9px] flex items-center gap-1 shadow"
          >
            <Trash2 size={10} /> 삭제
          </button>
        </div>
      </div>
    </div>
  );
}