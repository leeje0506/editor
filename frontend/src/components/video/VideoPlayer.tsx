import { useRef, useEffect, useCallback, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { msToTimecode } from "../../utils/time";
import { SubtitleOverlay } from "./SubtitleOverlay";

interface Props {
  dark: boolean;
  projectId?: number;
  /** 비디오 영역 너비 (부모가 관리) */
  videoWidth: number;
  /** 너비 변경 콜백 */
  onWidthChange: (w: number) => void;
  /** 영상+컨트롤 전체 최대 높이 (상단 영역 초과 방지) */
  maxHeight?: number;
}

const CONTROLS_H = 36;
const MIN_W = 240;
const MAX_W = 960;

export function VideoPlayer({ dark, projectId, videoWidth, onWidthChange, maxHeight }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekingRef = useRef(false);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [resizing, setResizing] = useState(false);

  const { currentMs, playing, muted, totalMs, togglePlay, toggleMute, setCurrentMs, setTotalMs } =
    usePlayerStore();
  const videoPreviewMs = usePlayerStore((s) => s.videoPreviewMs);
  const subtitles = useSubtitleStore((s) => s.subtitles);
  const activeNow = subtitles.filter((s) => currentMs >= s.start_ms && currentMs < s.end_ms);
  const videoSrc = projectId ? `/api/projects/${projectId}/stream/video` : "";

  // 너비 기준으로 높이를 비율에 맞게 계산, maxHeight로 클램핑
  let videoH = Math.floor(videoWidth / videoAspect);
  const maxVideoH = maxHeight ? maxHeight - CONTROLS_H : Infinity;
  if (videoH > maxVideoH) {
    videoH = Math.max(100, maxVideoH);
  }
  const totalH = videoH + CONTROLS_H;

  /* ───── 좌측 드래그: 너비 변경 (비율 자동 유지) ───── */
  const handleLeftResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = videoWidth;
      setResizing(true);

      const onMove = (ev: MouseEvent) => {
        ev.preventDefault();
        const dx = -(ev.clientX - startX);
        onWidthChange(Math.max(MIN_W, Math.min(MAX_W, startW + dx)));
      };
      const onUp = () => {
        setResizing(false);
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
    [videoWidth, onWidthChange],
  );

  /* ───── 좌하단 코너 드래그 (대각선, 비율 유지) ───── */
  const handleCornerResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = videoWidth;
      setResizing(true);

      const onMove = (ev: MouseEvent) => {
        ev.preventDefault();
        const dx = -(ev.clientX - startX);
        const dy = ev.clientY - startY;
        const dwFromX = dx;
        const dwFromY = dy * videoAspect;
        const dw = Math.abs(dwFromX) > Math.abs(dwFromY) ? dwFromX : dwFromY;
        onWidthChange(Math.max(MIN_W, Math.min(MAX_W, startW + dw)));
      };
      const onUp = () => {
        setResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      document.body.style.cursor = "nesw-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [videoWidth, videoAspect, onWidthChange],
  );

  /* ───── 비디오 메타/싱크 ───── */
  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
    const durationMs = Math.floor(v.duration * 1000);
    if (durationMs > 0 && durationMs !== totalMs) setTotalMs(durationMs);
  }, [totalMs, setTotalMs]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || seekingRef.current) return;
    // videoPreviewMs가 설정되어 있으면 currentMs 동기화 건너뜀
    if (usePlayerStore.getState().videoPreviewMs !== null) return;
    const ms = Math.floor(v.currentTime * 1000);
    if (Math.abs(ms - currentMs) > 80) setCurrentMs(ms);
  }, [currentMs, setCurrentMs]);

  // currentMs → video.currentTime 동기화 (videoPreviewMs가 null일 때만)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    if (usePlayerStore.getState().videoPreviewMs !== null) return;
    const videoMs = Math.floor(v.currentTime * 1000);
    if (Math.abs(videoMs - currentMs) > 200) {
      seekingRef.current = true;
      v.currentTime = currentMs / 1000;
      setTimeout(() => (seekingRef.current = false), 100);
    }
  }, [currentMs]);

  // videoPreviewMs 변경 시 영상만 seek (재생바 currentMs는 변경 안 함)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || videoPreviewMs === null) return;
    const targetSec = videoPreviewMs / 1000;
    if (Math.abs(v.currentTime - targetSec) > 0.1) {
      seekingRef.current = true;
      v.currentTime = targetSec;
      const onSeeked = () => {
        seekingRef.current = false;
        v.removeEventListener("seeked", onSeeked);
      };
      v.addEventListener("seeked", onSeeked);
    }
  }, [videoPreviewMs]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !v.src) return;
    if (playing && v.paused) v.play().catch(() => {});
    else if (!playing && !v.paused) v.pause();
  }, [playing]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  const handleFullscreen = () => {
    const v = videoRef.current;
    if (v) {
      if (document.fullscreenElement) document.exitFullscreen();
      else v.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div className="relative" style={{ width: videoWidth, height: totalH }}>
      {/* 드래그 중 전역 오버레이 */}
      {resizing && <div className="fixed inset-0 z-50" />}

      {/* 비디오 */}
      <div className="bg-black overflow-hidden relative" style={{ width: videoWidth, height: videoH }}>
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full h-full object-fill"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onClick={togglePlay}
            playsInline
            preload="auto"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
            <div className="text-zinc-700 text-lg font-bold opacity-10">영상 없음</div>
          </div>
        )}
        <SubtitleOverlay subtitles={activeNow} />
      </div>

      {/* 컨트롤 바 */}
      <div
        className="bg-black flex items-center justify-between px-3 text-white border-t border-zinc-800"
        style={{ height: CONTROLS_H }}
      >
        <div className="flex items-center gap-2.5">
          <button onClick={togglePlay} className="hover:opacity-80">
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span className="text-[10px] font-mono text-gray-300">
            {msToTimecode(currentMs)} / {msToTimecode(totalMs)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMute}>
            {muted ? <VolumeX size={14} className="text-gray-400" /> : <Volume2 size={14} className="text-gray-300" />}
          </button>
          <button onClick={handleFullscreen}>
            <Maximize size={14} className="text-gray-300" />
          </button>
        </div>
      </div>

      {/* ═══ 리사이즈 핸들 ═══ */}

      {/* 좌측 변 — 수평 리사이즈 */}
      <div
        className="absolute top-0 w-[6px] cursor-ew-resize z-30
                   group hover:bg-blue-500/30 active:bg-blue-500/50"
        style={{ left: -3, height: totalH }}
        onMouseDown={handleLeftResize}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent group-hover:bg-blue-400 transition-colors" />
      </div>

      {/* 좌하단 코너 — 대각선 리사이즈 */}
      <div
        className="absolute w-5 h-5 cursor-nesw-resize z-40 group"
        style={{ left: -4, bottom: -4 }}
        onMouseDown={handleCornerResize}
      >
        <svg className="w-full h-full text-zinc-500 group-hover:text-blue-400 transition-colors" viewBox="0 0 20 20">
          <line x1="2" y1="18" x2="18" y2="2" stroke="currentColor" strokeWidth="2" />
          <line x1="7" y1="18" x2="18" y2="7" stroke="currentColor" strokeWidth="2" />
          <line x1="12" y1="18" x2="18" y2="12" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}