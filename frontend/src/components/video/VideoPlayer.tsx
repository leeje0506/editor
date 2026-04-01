import { useRef, useEffect, useCallback, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { msToTimecode } from "../../utils/time";
import { SubtitleOverlay } from "./SubtitleOverlay";

interface Props {
  dark: boolean;
  projectId?: number;
  videoWidth: number;
  onWidthChange: (w: number) => void;
}

const CONTROLS_H = 36;
const PROGRESS_H = 6;
const MIN_W = 240;
const MAX_W = 960;

export function VideoPlayer({ dark, projectId, videoWidth, onWidthChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const seekingRef = useRef(false);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [resizing, setResizing] = useState(false);

  const { currentMs, playing, muted, totalMs, togglePlay, toggleMute, setCurrentMs, setTotalMs } =
    usePlayerStore();
  const videoPreviewMs = usePlayerStore((s) => s.videoPreviewMs);
  const subtitles = useSubtitleStore((s) => s.subtitles);
  const activeNow = subtitles.filter((s) => currentMs >= s.start_ms && currentMs < s.end_ms);
  const videoSrc = projectId ? `/api/projects/${projectId}/stream/video` : "";

  // 컨테이너 높이 감시 → 영상 영역 높이 계산
  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerW(entry.contentRect.width);
        setContainerH(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 영상 영역: 컨테이너에서 컨트롤바+재생바 뺀 나머지 전부
  const videoAreaH = Math.max(100, containerH - CONTROLS_H - PROGRESS_H);

  // 영상 비율 유지하면서 컨테이너에 꽉 차게 계산 (contain 방식)
  let fitW = containerW;
  let fitH = containerW / videoAspect;
  if (fitH > videoAreaH) {
    fitH = videoAreaH;
    fitW = videoAreaH * videoAspect;
  }

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
    <div ref={containerRef} className="relative w-full h-full flex flex-col">
      {/* 드래그 중 전역 오버레이 */}
      {resizing && <div className="fixed inset-0 z-50" />}

      {/* 비디오 — 남은 공간 전부 차지, 영상은 비율 유지하며 최대 크기로 중앙 배치 */}
      <div className="flex-1 bg-black overflow-hidden relative flex items-center justify-center min-h-0">
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            style={{ width: fitW, height: fitH }}
            className="object-fill"
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

      {/* 재생바 (프로그레스 바) */}
      <div
        className="relative w-full cursor-pointer group"
        style={{ height: 6 }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const ms = Math.round(pct * totalMs);
          setCurrentMs(ms);
          usePlayerStore.getState().setVideoPreviewMs(null);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          const bar = e.currentTarget;
          const onMove = (ev: MouseEvent) => {
            const rect = bar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
            setCurrentMs(Math.round(pct * totalMs));
          };
          const onUp = () => {
            document.body.style.cursor = "";
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          document.body.style.cursor = "pointer";
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      >
        <div className="absolute inset-0 bg-gray-700 rounded-sm" />
        <div
          className="absolute left-0 top-0 bottom-0 bg-red-500 rounded-sm transition-none"
          style={{ width: `${totalMs > 0 ? (currentMs / totalMs) * 100 : 0}%` }}
        />
        <div className="absolute inset-0 bg-transparent group-hover:bg-white/10 rounded-sm transition-colors" />
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
        className="absolute top-0 bottom-0 w-[6px] cursor-ew-resize z-30
                   group hover:bg-blue-500/30 active:bg-blue-500/50"
        style={{ left: -3 }}
        onMouseDown={handleLeftResize}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent group-hover:bg-blue-400 transition-colors" />
      </div>
    </div>
  );
}