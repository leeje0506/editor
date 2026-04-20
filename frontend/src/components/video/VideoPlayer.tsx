import { useRef, useEffect, useCallback, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useTimelineStore } from "../../store/useTimelineStore";
import { msToTimecode } from "../../utils/time";
import { SubtitleOverlay } from "./SubtitleOverlay";
const API_BASE = import.meta.env.VITE_API_BASE_URL;

interface Props {
  dark: boolean;
  projectId?: number;
  videoWidth: number;
  onWidthChange: (w: number) => void;
}

const CONTROLS_H = 36;
const PROGRESS_H = 6;
const MIN_W = 240;
const MAX_W = 2400;

export function VideoPlayer({ dark, projectId, videoWidth, onWidthChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const seekingRef = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [resizing, setResizing] = useState(false);

  const playing = usePlayerStore((s) => s.playing);
  const muted = usePlayerStore((s) => s.muted);
  const totalMs = usePlayerStore((s) => s.totalMs);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setCurrentMs = usePlayerStore((s) => s.setCurrentMs);
  const setTotalMs = usePlayerStore((s) => s.setTotalMs);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setTimelineTotalMs = useTimelineStore((s) => s.setTotalMs);
  const setTimelineScrollMs = useTimelineStore((s) => s.setScrollMs);
  const timelineVisibleDuration = useTimelineStore((s) => s.visibleDuration);

  const videoSrc = projectId ? `${API_BASE}/projects/${projectId}/stream/video` : "";

  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);

  // video element를 store에 등록
  useEffect(() => {
    const v = videoRef.current;
    usePlayerStore.getState().setVideoElement(v);
    return () => usePlayerStore.getState().setVideoElement(null);
  }, []);

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

  const videoAreaH = Math.max(100, containerH - CONTROLS_H - PROGRESS_H);
  let fitW = containerW;
  let fitH = containerW / videoAspect;
  if (fitH > videoAreaH) {
    fitH = videoAreaH;
    fitW = videoAreaH * videoAspect;
  }

  /* ── 프로그레스바 + 시간 텍스트: 재생 중 RAF, 정지 중 subscribe ── */
  useEffect(() => {
    const TARGET_FPS = 60;
    const FRAME_MS = 1000 / TARGET_FPS;
    let lastFrameTime = 0;

    const updateDom = () => {
      const ms = usePlayerStore.getState().getVisualMs();
      const total = usePlayerStore.getState().totalMs;
      if (progressRef.current) {
        progressRef.current.style.width = `${total > 0 ? (ms / total) * 100 : 0}%`;
      }
      if (timeRef.current) {
        timeRef.current.textContent = `${msToTimecode(ms)} / ${msToTimecode(total)}`;
      }
    };

    let isPlaying = usePlayerStore.getState().playing;

    const startRaf = () => {
      lastFrameTime = 0;
      const tick = (ts: number) => {
        if (ts - lastFrameTime >= FRAME_MS) {
          lastFrameTime = ts;
          updateDom();
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };
    const stopRaf = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    if (isPlaying) startRaf();

    const unsub = usePlayerStore.subscribe((state, prev) => {
      if (state.playing !== prev.playing) {
        isPlaying = state.playing;
        if (isPlaying) startRaf();
        else { stopRaf(); updateDom(); }
      }
      if (!isPlaying && (state.currentMs !== prev.currentMs || state.totalMs !== prev.totalMs)) {
        updateDom();
      }
    });

    updateDom();
    return () => { stopRaf(); unsub(); };
  }, []);

  const seekAndScrollTimeline = useCallback((ms: number) => {
    setCurrentMs(ms);
    usePlayerStore.getState().setVideoPreviewMs(null);
    const visDur = timelineVisibleDuration();
    setTimelineScrollMs(Math.max(0, ms - visDur * 0.1));
  }, [setCurrentMs, timelineVisibleDuration, setTimelineScrollMs]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = playbackRate;
  }, [playbackRate]);

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

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
    const durationMs = Math.floor(v.duration * 1000);
    if (durationMs > 0 && durationMs !== totalMs) {
      setTotalMs(durationMs);
      setTimelineTotalMs(durationMs);
    }
  }, [totalMs, setTotalMs, setTimelineTotalMs]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || seekingRef.current) return;
    if (usePlayerStore.getState().videoPreviewMs !== null) return;
    if (usePlayerStore.getState().playing) return;
    const ms = Math.floor(v.currentTime * 1000);
    const cur = usePlayerStore.getState().currentMs;
    if (Math.abs(ms - cur) > 80) setCurrentMs(ms);
  }, [setCurrentMs]);

  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state, prev) => {
      if (state.currentMs === prev.currentMs) return;
      if (state.playing) return;
      if (state.videoPreviewMs !== null) return;
      const v = videoRef.current;
      if (!v || !v.duration) return;
      const videoMs = Math.floor(v.currentTime * 1000);
      if (Math.abs(videoMs - state.currentMs) > 200) {
        seekingRef.current = true;
        v.currentTime = state.currentMs / 1000;
        setTimeout(() => (seekingRef.current = false), 100);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state, prev) => {
      if (state.videoPreviewMs === prev.videoPreviewMs) return;
      if (state.videoPreviewMs === null) return;
      const v = videoRef.current;
      if (!v) return;
      const targetSec = state.videoPreviewMs / 1000;
      if (Math.abs(v.currentTime - targetSec) > 0.1) {
        seekingRef.current = true;
        v.currentTime = targetSec;
        const onSeeked = () => {
          seekingRef.current = false;
          v.removeEventListener("seeked", onSeeked);
        };
        v.addEventListener("seeked", onSeeked);
      }
    });
    return () => unsub();
  }, []);

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
      {resizing && <div className="fixed inset-0 z-50" />}

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
        <SubtitleOverlay />
      </div>

      <div
        className="relative w-full cursor-pointer group"
        style={{ height: 6 }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          seekAndScrollTimeline(Math.round(pct * usePlayerStore.getState().totalMs));
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          const bar = e.currentTarget;
          const onMove = (ev: MouseEvent) => {
            const rect = bar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
            seekAndScrollTimeline(Math.round(pct * usePlayerStore.getState().totalMs));
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
        <div ref={progressRef} className="absolute left-0 top-0 bottom-0 bg-red-500 rounded-sm transition-none" />
        <div className="absolute inset-0 bg-transparent group-hover:bg-white/10 rounded-sm transition-colors" />
      </div>

      <div
        className="bg-black flex items-center justify-between px-3 text-white border-t border-zinc-800"
        style={{ height: CONTROLS_H }}
      >
        <div className="flex items-center gap-2.5">
          <button onClick={togglePlay} className="hover:opacity-80">
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span ref={timeRef} className="text-[10px] font-mono text-gray-300" />
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