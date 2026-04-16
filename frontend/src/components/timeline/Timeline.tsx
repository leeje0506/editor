import { useRef, useMemo, useCallback, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward, RefreshCw, Minus, Plus } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { subtitlesApi } from "../../api/subtitles";
import { useTimelineStore } from "../../store/useTimelineStore";
import { useSettingsStore } from "../../store/useSettingsStore";
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

/* ── 파형 path 생성 (viewBox 0 0 W H 기준) ── */
const W = 4000;
const H = 400;
const MID = H / 2;
const STEP = 8;

function buildWavePath(
  peaks: number[],
  peaksPerSec: number,
  tlLeft: number,
  visDur: number,
  totalMs: number,
): string {
  const pts: number[] = [];
  for (let i = 0; i <= W; i += STEP) {
    const ms = tlLeft + (i / W) * visDur;
    if (ms > totalMs || ms < 0) { pts.push(0); continue; }
    const idx = (ms / 1000) * peaksPerSec;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, peaks.length - 1);
    const frac = idx - lo;
    const val = lo < peaks.length
      ? peaks[lo] * (1 - frac) + (peaks[hi] ?? peaks[lo]) * frac
      : 0;
    pts.push(val * MID * 0.9);
  }

  let upper = `M0,${MID} `;
  for (let i = 0; i < pts.length; i++) upper += `L${i * STEP},${MID - pts[i]} `;
  upper += `L${W},${MID} `;
  let lower = "";
  for (let i = pts.length - 1; i >= 0; i--) lower += `L${i * STEP},${MID + pts[i]} `;
  return upper + lower + "Z";
}

function buildMockWavePath(tlLeft: number, visDur: number, totalMs: number): string {
  const pts: number[] = [];
  for (let i = 0; i <= W; i += STEP) {
    const ms = tlLeft + (i / W) * visDur;
    if (ms > totalMs) { pts.push(0); continue; }
    const x = ms * 0.001;
    const amp =
      Math.sin(x * 2.1) * 0.3 + Math.sin(x * 5.7) * 0.25 +
      Math.sin(x * 13.3) * 0.2 + Math.sin(x * 31.7) * 0.15 +
      Math.sin(x * 67.1) * 0.1;
    pts.push(((amp + 1) / 2) * MID * 0.9);
  }

  let upper = `M0,${MID} `;
  for (let i = 0; i < pts.length; i++) upper += `L${i * STEP},${MID - pts[i]} `;
  upper += `L${W},${MID} `;
  let lower = "";
  for (let i = pts.length - 1; i >= 0; i--) lower += `L${i * STEP},${MID + pts[i]} `;
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
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);

  const subtitles = useSubtitleStore((s) => s.subtitles);
  const selectedId = useSubtitleStore((s) => s.selectedId);
  const multiSelect = useSubtitleStore((s) => s.multiSelect);
  const selectSingle = useSubtitleStore((s) => s.selectSingle);
  const updateLocal = useSubtitleStore((s) => s.updateLocal);

  const scrollMs = useTimelineStore((s) => s.scrollMs);
  const visibleDuration = useTimelineStore((s) => s.visibleDuration);
  const { handleWheel } = useTimelineZoom();

  const waveFontSize = useSettingsStore((s) => s.subtitleDisplay.waveFontSize);

  const dm = dark;
  const bdl = dm ? "border-gray-700" : "border-gray-100";
  const ts = dm ? "text-gray-400" : "text-gray-500";

  const rawVisDur = visibleDuration();
  const visDur = Math.min(rawVisDur, Math.max(totalMs, 1));
  const tlLeft = Math.min(scrollMs, Math.max(0, totalMs - visDur));

  /* ── 뷰 내 자막 필터 ── */
  const vtl = useMemo(
    () => subtitles.filter((s) => s.end_ms > tlLeft && s.start_ms < tlLeft + visDur),
    [subtitles, tlLeft, visDur],
  );

  /* ── 눈금 ── */
  const tickCount = visDur <= 10000 ? 10 : visDur <= 30000 ? 8 : visDur <= 120000 ? 6 : 10;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i / tickCount);

  const peaksPerSec = useMemo(() => {
    if (!peaks || peaks.length === 0 || totalMs <= 0) return 0;
    return peaks.length / (totalMs / 1000);
  }, [peaks, totalMs]);

  /* ── 파형 path (뷰 범위 직접 렌더) ── */
  const wavePath = useMemo(() => {
    if (peaks && peaks.length > 0 && peaksPerSec > 0) {
      return buildWavePath(peaks, peaksPerSec, tlLeft, visDur, totalMs);
    }
    return buildMockWavePath(tlLeft, visDur, totalMs);
  }, [peaks, peaksPerSec, tlLeft, visDur, totalMs]);

  /* ── 오버랩 구간 계산 (뷰 기준 퍼센트) ── */
  const overlapRegions = useMemo(() => {
    const regions: { leftPct: number; widthPct: number }[] = [];
    const overlapSubs = subtitles.filter((s) => s.error && s.error.includes("오버랩"));
    for (let i = 0; i < overlapSubs.length; i++) {
      for (let j = i + 1; j < overlapSubs.length; j++) {
        const a = overlapSubs[i];
        const b = overlapSubs[j];
        if (b.start_ms >= a.end_ms) break;
        const oStart = Math.max(a.start_ms, b.start_ms);
        const oEnd = Math.min(a.end_ms, b.end_ms);
        if (oEnd > oStart && oEnd > tlLeft && oStart < tlLeft + visDur) {
          const leftPct = ((Math.max(oStart, tlLeft) - tlLeft) / visDur) * 100;
          const rightPct = ((Math.min(oEnd, tlLeft + visDur) - tlLeft) / visDur) * 100;
          regions.push({ leftPct, widthPct: rightPct - leftPct });
        }
      }
    }
    return regions;
  }, [subtitles, tlLeft, visDur]);

  /* ── clipPath용 rect 데이터 계산 ── */
  const { normalRects, selectedRect } = useMemo(() => {
    const normal: { x: number; w: number; id: number }[] = [];
    let selected: { x: number; w: number } | null = null;

    for (const s of vtl) {
      const x = ((s.start_ms - tlLeft) / visDur) * W;
      const w = ((s.end_ms - s.start_ms) / visDur) * W;
      if (s.id === selectedId) {
        selected = { x, w };
      } else {
        normal.push({ x, w, id: s.id });
      }
    }
    return { normalRects: normal, selectedRect: selected };
  }, [vtl, tlLeft, visDur, selectedId]);

  const updateOne = useSubtitleStore((s) => s.updateOne);

  /* ── 자막 시간 드래그 ── */
  const startDrag = useCallback(
    (e: React.MouseEvent, handle: "start" | "end", subId: number) => {
      e.stopPropagation();
      e.preventDefault();
      const field = handle === "start" ? "start_ms" : "end_ms";
      let lastMs = 0;
      const onMove = (ev: MouseEvent) => {
        if (!tlRef.current) return;
        const rect = tlRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        lastMs = Math.round(tlLeft + pct * visDur);
        updateLocal(subId, { [field]: lastMs });
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        // 드래그 완료 시 서버 검수 + 선택/스크롤 유지하며 자막 갱신
        if (lastMs > 0) {
          updateOne(subId, { [field]: lastMs }).then(() => {
            const { projectId, selectedId, multiSelect } = useSubtitleStore.getState();
            if (projectId) {
              subtitlesApi.list(projectId).then((subs) => {
                useSubtitleStore.setState({ subtitles: subs });
              });
            }
          });
        }
      };
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [tlLeft, visDur, updateLocal, updateOne],
  );

  /* ── non-passive wheel ── */
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

  /* ── 파형 클릭 ── */
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
          {/* 배속 조절 */}
          <div className="flex items-center gap-1 ml-1">
            <button
              onClick={() => setPlaybackRate(playbackRate - 0.1)}
              disabled={playbackRate <= 0.5}
              className={`w-4 h-4 flex items-center justify-center rounded ${ts} hover:text-blue-400 disabled:opacity-30`}
              title="배속 감소"
            >
              <Minus size={10} />
            </button>
            <span
              className={`text-[10px] font-mono min-w-[36px] text-center cursor-pointer ${playbackRate !== 1.0 ? "text-yellow-400 font-bold" : ts}`}
              onClick={() => setPlaybackRate(1.0)}
              title="클릭하면 1.0x로 초기화"
            >
              {playbackRate.toFixed(1)}x
            </span>
            <button
              onClick={() => setPlaybackRate(playbackRate + 0.1)}
              disabled={playbackRate >= 3.0}
              className={`w-4 h-4 flex items-center justify-center rounded ${ts} hover:text-blue-400 disabled:opacity-30`}
              title="배속 증가"
            >
              <Plus size={10} />
            </button>
          </div>
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

      {/* 파형 영역 */}
      <div className={`flex-1 relative ${dm ? "bg-gray-800" : "bg-white"} overflow-hidden p-2`}>
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

          {/* ══════ 단일 SVG: 파형 + clipPath 기반 자막 구간 색상 ══════ */}
          <div className="absolute inset-x-0 top-4 bottom-[6px] pointer-events-none">
            <svg preserveAspectRatio="none" viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
              <defs>
                {/* 일반 자막 구간 클립 */}
                <clipPath id="clip-normal">
                  {normalRects.map((r) => (
                    <rect key={r.id} x={r.x} y="0" width={Math.max(r.w, 1)} height={H} />
                  ))}
                </clipPath>
                {/* 선택 자막 구간 클립 */}
                {selectedRect && (
                  <clipPath id="clip-selected">
                    <rect x={selectedRect.x} y="0" width={Math.max(selectedRect.w, 1)} height={H} />
                  </clipPath>
                )}
              </defs>

              {/* ① 배경 파형 (어두운 초록) */}
              <path d={wavePath} fill="#0a2e0a" opacity="0.7" />
              <path d={wavePath} fill="none" stroke="#1a6e1a" strokeWidth="0.8" opacity="0.5" />

              {/* ② 일반 자막 구간 (밝은 초록) */}
              <g clipPath="url(#clip-normal)">
                <path d={wavePath} fill="#1a5c1a" opacity="0.7" />
                <path d={wavePath} fill="none" stroke="#39ff14" strokeWidth="1" opacity="0.9" />
                <path d={wavePath} fill="#2ecc40" opacity="0.4" />
              </g>

              {/* ③ 선택 자막 구간 (빨간) */}
              {selectedRect && (
                <g clipPath="url(#clip-selected)">
                  <path d={wavePath} fill="#5c1a1a" opacity="0.7" />
                  <path d={wavePath} fill="none" stroke="#ff4444" strokeWidth="1" opacity="0.9" />
                  <path d={wavePath} fill="#cc2222" opacity="0.3" />
                </g>
              )}

              {/* 센터 라인 */}
              <line x1="0" y1={MID} x2={W} y2={MID} stroke="rgba(55,65,81,0.3)" strokeWidth="1" />
            </svg>
          </div>

          {/* ══════ 오버랩 구간 격자무늬 오버레이 ══════ */}
          <div className="absolute inset-x-0 top-4 bottom-[6px] pointer-events-none" style={{ zIndex: 5 }}>
            {overlapRegions.map((r, i) => (
              <div
                key={`ol-${i}`}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${r.leftPct}%`,
                  width: `${r.widthPct}%`,
                  backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(180,180,180,0.3) 3px, rgba(180,180,180,0.3) 4px)`,
                }}
              />
            ))}
          </div>

          {/* ══════ 자막 블록 오버레이 (텍스트 + 경계선 + 선택 하이라이트) ══════ */}
          <div className="absolute inset-x-0 top-4 bottom-[6px] z-10">
            {vtl.map((s) => {
              const rawL = ((s.start_ms - tlLeft) / visDur) * 100;
              const rawW = ((s.end_ms - s.start_ms) / visDur) * 100;
              const clampedL = Math.max(-5, rawL);
              const clampedW = Math.max(0.3, rawW - (clampedL - rawL));
              const isSel = s.id === selectedId;
              const isMulti = multiSelect.has(s.id) && !isSel;
              const durSec = ((s.end_ms - s.start_ms) / 1000).toFixed(3);
              const zIdx = isSel ? 30 : 10;

              return (
                <div key={s.id} data-sub-block className="absolute top-0 bottom-0"
                  style={{ left: `${clampedL}%`, width: `${clampedW}%`, zIndex: zIdx }}>

                  {/* 좌측 경계 */}
                  <div data-h="s"
                    className={`absolute left-0 top-0 bottom-0 w-px cursor-ew-resize z-20 hover:bg-green-400/50 ${
                      isSel ? "bg-red-400" : "bg-gray-400/50"
                    }`}
                    onMouseDown={(e) => startDrag(e, "start", s.id)}
                  />
                  {/* 우측 경계 */}
                  <div data-h="e"
                    className={`absolute right-0 top-0 bottom-0 w-px cursor-ew-resize z-20 hover:bg-green-400/50 ${
                      isSel ? "bg-red-400" : "bg-gray-400/50"
                    }`}
                    onMouseDown={(e) => startDrag(e, "end", s.id)}
                  />

                  {isMulti && (
                    <div className="absolute inset-0 bg-blue-400/5 pointer-events-none" />
                  )}

                  {/* 자막 텍스트 */}
                  <div className="absolute top-0.5 left-1 right-1 pointer-events-none overflow-hidden">
                    <span
                      style={{ fontSize: `${waveFontSize}px` }}
                      className={`leading-tight block whitespace-nowrap overflow-hidden font-medium
                      ${isSel ? "text-red-200 drop-shadow-[0_1px_3px_rgba(255,0,0,0.6)]"
                        : s.type === "effect" ? "text-yellow-400/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                        : "text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"}`}
                    >
                      {s.text.replace(/\n/g, " ")}
                    </span>
                  </div>

                  {/* 하단 정보 */}
                  <div className="absolute bottom-0.5 left-1 pointer-events-none flex items-center gap-1">
                    <span className={`text-[7px] font-mono drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${isSel ? "text-red-300/80" : "text-green-400/70"}`}>#{s.seq}</span>
                    <span className={`text-[7px] font-mono drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${isSel ? "text-red-300/60" : "text-green-300/50"}`}>{durSec}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <Playhead />
          <TimelineTimeDisplay />

          <div className="absolute left-0 right-0 bottom-0 h-[5px] z-20">
            <ProgressBar dark={dm} />
          </div>
        </div>
      </div>
    </div>
  );
}