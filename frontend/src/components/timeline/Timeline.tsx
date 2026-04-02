import { useRef, useMemo, useCallback, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward, RefreshCw } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { useTimelineStore } from "../../store/useTimelineStore";
import { useTimelineZoom } from "../../hooks/useTimelineZoom";
import { ZoomControls } from "./ZoomControls";
import { Playhead } from "./Playhead";
import { ProgressBar } from "./ProgressBar";
import { TimelineTimeDisplay } from "./TimelineTimeDisplay";

interface Props {
  dark: boolean;
  peaks?: number[] | null;
  onReload?: () => void;
}

/** peaks 배열 + 현재 뷰 범위로 SVG path 생성 */
function buildWavePath(
  peaks: number[],
  peaksPerSec: number,
  tlLeft: number,
  visDur: number,
  totalMs: number,
): string {
  const W = 4000, H = 400, mid = H / 2;
  const pts: number[] = [];

  for (let i = 0; i <= W; i += 4) {
    const ms = tlLeft + (i / W) * visDur;
    if (ms > totalMs || ms < 0) { pts.push(0); continue; }
    // peaks 인덱스 계산: ms → 초 → 초당 peaksPerSec개
    const idx = (ms / 1000) * peaksPerSec;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, peaks.length - 1);
    const frac = idx - lo;
    // 선형 보간
    const val = lo < peaks.length
      ? peaks[lo] * (1 - frac) + (peaks[hi] ?? peaks[lo]) * frac
      : 0;
    pts.push(val * mid * 0.9);
  }

  let upper = `M0,${mid} `;
  for (let i = 0; i < pts.length; i++) upper += `L${i * 4},${mid - pts[i]} `;
  upper += `L${W},${mid} `;
  let lower = "";
  for (let i = pts.length - 1; i >= 0; i--) lower += `L${i * 4},${mid + pts[i]} `;
  return upper + lower + "Z";
}

/** peaks 없을 때 mock 사인 파형 (fallback) */
function buildMockWavePath(tlLeft: number, visDur: number, totalMs: number): string {
  const W = 4000, H = 400, mid = H / 2;
  const pts: number[] = [];
  for (let i = 0; i <= W; i += 6) {
    const ms = tlLeft + (i / W) * visDur;
    if (ms > totalMs) { pts.push(0); continue; }
    const x = ms * 0.001;
    const amp =
      Math.sin(x * 2.1) * 0.3 + Math.sin(x * 5.7) * 0.25 +
      Math.sin(x * 13.3) * 0.2 + Math.sin(x * 31.7) * 0.15 +
      Math.sin(x * 67.1) * 0.1;
    pts.push(((amp + 1) / 2) * mid * 0.9);
  }
  let upper = `M0,${mid} `;
  for (let i = 0; i < pts.length; i++) upper += `L${i * 6},${mid - pts[i]} `;
  upper += `L${W},${mid} `;
  let lower = "";
  for (let i = pts.length - 1; i >= 0; i--) lower += `L${i * 6},${mid + pts[i]} `;
  return upper + lower + "Z";
}

export function Timeline({ dark, peaks, onReload }: Props) {
  const tlRef = useRef<HTMLDivElement>(null);

  const playing = usePlayerStore((s) => s.playing);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const seekForward = usePlayerStore((s) => s.seekForward);
  const seekBackward = usePlayerStore((s) => s.seekBackward);
  const setCurrentMs = usePlayerStore((s) => s.setCurrentMs);
  const totalMs = usePlayerStore((s) => s.totalMs);

  const subtitles = useSubtitleStore((s) => s.subtitles);
  const selectedId = useSubtitleStore((s) => s.selectedId);
  const multiSelect = useSubtitleStore((s) => s.multiSelect);
  const selectSingle = useSubtitleStore((s) => s.selectSingle);
  const updateLocal = useSubtitleStore((s) => s.updateLocal);

  const scrollMs = useTimelineStore((s) => s.scrollMs);
  const visibleDuration = useTimelineStore((s) => s.visibleDuration);
  const { handleWheel } = useTimelineZoom();

  const dm = dark;
  const bdl = dm ? "border-gray-700" : "border-gray-100";
  const ts = dm ? "text-gray-400" : "text-gray-500";

  // const visDur = visibleDuration();
  // const tlLeft = scrollMs;
  const rawVisDur = visibleDuration();
  const visDur = Math.min(rawVisDur, Math.max(totalMs, 1));
  const tlLeft = Math.min(scrollMs, Math.max(0, totalMs - visDur));

  const vtl = useMemo(
    () => subtitles.filter((s) => s.end_ms > tlLeft && s.start_ms < tlLeft + visDur),
    [subtitles, tlLeft, visDur],
  );

  const tickCount = visDur <= 10000 ? 10 : visDur <= 30000 ? 8 : visDur <= 120000 ? 6 : 10;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i / tickCount);

  const peaksPerSec = useMemo(() => {
    if (!peaks || peaks.length === 0 || totalMs <= 0) return 0;
    return peaks.length / (totalMs / 1000);
  }, [peaks, totalMs]);

  // ── 파형 path 생성 ──
  const wavePath = useMemo(() => {
    if (peaks && peaks.length > 0 && peaksPerSec > 0) {
      return buildWavePath(peaks, peaksPerSec, tlLeft, visDur, totalMs);
    }
    return buildMockWavePath(tlLeft, visDur, totalMs);
  }, [peaks, peaksPerSec, tlLeft, visDur, totalMs]);

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
        updateLocal(subId, { [handle === "start" ? "start_ms" : "end_ms"]: ms });
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
    [tlLeft, visDur, updateLocal],
  );

  // non-passive wheel 리스너
  useEffect(() => {
    const el = tlRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      handleWheel(e as unknown as React.WheelEvent, el.getBoundingClientRect());
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [handleWheel]);

  /** 파형 클릭 */
  const onTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-h]")) return;
      if (!tlRef.current) return;
      const rect = tlRef.current.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const clickMs = Math.round(tlLeft + pct * visDur);

      if (usePlayerStore.getState().playing) {
        usePlayerStore.getState().togglePlay();
      }

      setCurrentMs(clickMs);
      usePlayerStore.getState().setVideoPreviewMs(null);

      const hit = subtitles.find((s) => clickMs >= s.start_ms && clickMs < s.end_ms);
      if (hit) selectSingle(hit.id);
    },
    [tlLeft, visDur, setCurrentMs, subtitles, selectSingle],
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
          <button
            onClick={() => { if (onReload) onReload(); }}
            className={`w-6 h-5 flex items-center justify-center border ${dm ? "border-gray-700" : "border-gray-200"} rounded ${ts} hover:text-blue-400 hover:border-blue-400 transition-colors`}
            title="파형/영상 새로고침"
          >
            <RefreshCw size={11} />
          </button>
        </div>
        <div className={`text-[10px] ${ts}`}>
          <span className={dm ? "text-gray-500" : "text-gray-400"}>Ctrl+휠: 확대/축소 | 휠: 좌우이동 | 경계선 드래그: 시간 조정</span>
        </div>
      </div>

      {/* 여백 영역 */}
      <div className={`flex-1 relative ${dm ? "bg-gray-800" : "bg-white"} overflow-hidden p-2`}>

        {/* inner 박스 */}
        <div
          ref={tlRef}
          className="relative w-full h-full bg-black overflow-hidden cursor-crosshair rounded-sm"
          onClick={onTrackClick}
        >
          {/* 시간 눈금 */}
          <div className="absolute inset-x-0 top-0 h-4 z-30 pointer-events-none">
            {ticks.map((p) => (
              <div key={p} className="absolute bottom-0 text-[7px] font-mono text-gray-500"
                style={{
                  left: `${p * 100}%`,
                  transform: p === 0 ? "translateX(0)" : p === 1 ? "translateX(-100%)" : "translateX(-50%)",
                }}>
                {(() => {
                  const ms = Math.round(tlLeft + p * visDur);
                  const h = Math.floor(ms / 3600000);
                  const m = Math.floor((ms % 3600000) / 60000);
                  const s = Math.floor((ms % 60000) / 1000);
                  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
                })()}
              </div>
            ))}
          </div>
          {ticks.map((p) => (
            <div key={`line-${p}`} className="absolute top-4 bottom-0 w-px bg-gray-700/30 pointer-events-none"
              style={{ left: `${p * 100}%` }} />
          ))}

          {/* 기본 파형 (어두운 — 자막 없는 구간) */}
          <div className="absolute inset-x-0 top-4 bottom-[6px] pointer-events-none">
            <svg preserveAspectRatio="none" viewBox="0 0 4000 400" className="w-full h-full">
              <path d={wavePath} fill="#0a2e0a" opacity="0.7" />
              <path d={wavePath} fill="none" stroke="#1a6e1a" strokeWidth="0.8" opacity="0.5" />
            </svg>
            <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-700/30" />
          </div>

          {/* 자막 블록 */}
          <div className="absolute inset-x-0 top-4 bottom-[6px] z-10">
            {vtl.map((s) => {
              const rawL = ((s.start_ms - tlLeft) / visDur) * 100;
              const rawW = ((s.end_ms - s.start_ms) / visDur) * 100;
              const clampedL = Math.max(-5, rawL);
              const clampedW = Math.max(0.3, rawW - (clampedL - rawL));
              const isSel = s.id === selectedId;
              const isMulti = multiSelect.has(s.id) && !isSel;
              const durSec = ((s.end_ms - s.start_ms) / 1000).toFixed(3);
              const isCurrent = isSel;
              const zIdx = isSel ? 30 : 10;

              return (
                <div key={s.id} data-sub-block className="absolute top-0 bottom-0"
                  style={{ left: `${clampedL}%`, width: `${clampedW}%`, zIndex: zIdx }}>
                  {/* 자막 구간 밝은 파형 오버레이 */}
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <svg preserveAspectRatio="none" viewBox="0 0 4000 400" className="pointer-events-none"
                      style={{
                        position: "absolute", top: 0, height: "100%",
                        left: `${((-rawL) / Math.max(0.01, rawW)) * 100}%`,
                        width: `${(100 / Math.max(0.01, rawW)) * 100}%`,
                      }}>
                      {isCurrent ? (
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

                  {/* 좌측 경계 */}
                  <div data-h="s"
                    className={`absolute left-0 top-0 bottom-0 w-px cursor-ew-resize z-20 hover:bg-green-400/50 ${
                      isCurrent ? "bg-red-400" : isSel ? "bg-blue-400" : "bg-gray-400/50"
                    }`}
                    onMouseDown={(e) => startDrag(e, "start", s.id)}
                  />
                  {/* 우측 경계 */}
                  <div data-h="e"
                    className={`absolute right-0 top-0 bottom-0 w-px cursor-ew-resize z-20 hover:bg-green-400/50 ${
                      isCurrent ? "bg-red-400" : isSel ? "bg-blue-400" : "bg-gray-400/50"
                    }`}
                    onMouseDown={(e) => startDrag(e, "end", s.id)}
                  />

                  {/* 선택 하이라이트 */}
                  {isSel && !isCurrent && (
                    <div className="absolute inset-0 bg-blue-400/10 border-t border-b border-blue-400/30 pointer-events-none" />
                  )}
                  {isMulti && (
                    <div className="absolute inset-0 bg-blue-400/5 pointer-events-none" />
                  )}

                  {/* 자막 텍스트 */}
                  <div className="absolute top-0.5 left-1 right-1 pointer-events-none">
                    <span className={`text-[9px] leading-tight block truncate font-medium
                      ${isCurrent ? "text-red-200 drop-shadow-[0_1px_3px_rgba(255,0,0,0.6)]"
                        : isSel ? "text-yellow-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                        : s.type === "effect" ? "text-yellow-400/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                        : "text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"}`}>
                      {s.text.replace(/\n/g, " ")}
                    </span>
                  </div>

                  {/* 하단 정보 */}
                  <div className="absolute bottom-0.5 left-1 pointer-events-none flex items-center gap-1">
                    <span className={`text-[7px] font-mono drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${isCurrent ? "text-red-300/80" : "text-green-400/70"}`}>#{s.seq}</span>
                    <span className={`text-[7px] font-mono drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${isCurrent ? "text-red-300/60" : "text-green-300/50"}`}>{durSec}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 플레이헤드 */}
          <Playhead />

          {/* 현재 시간 */}
          <TimelineTimeDisplay />

          {/* 재생바 */}
          <div className="absolute left-0 right-0 bottom-0 h-[5px] z-20">
            <ProgressBar dark={dm} />
          </div>

        </div>{/* inner 박스 끝 */}
      </div>
    </div>
  );
}