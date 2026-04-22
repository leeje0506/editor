import { useRef, useEffect, useCallback, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Film, Loader2 } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useTimelineStore } from "../../store/useTimelineStore";
import { msToTimecode } from "../../utils/time";
import { SubtitleOverlay } from "./SubtitleOverlay";
import { projectsApi } from "../../api/projects";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

interface Props {
  dark: boolean;
  projectId?: number;
  videoWidth: number;
  onWidthChange: (w: number) => void;
  /** 영상 파일이 서버에 존재하는지 */
  hasVideo?: boolean;
  /** 영상 업로드 완료 후 프로젝트 새로고침 */
  onVideoUploaded?: () => void;
}

const CONTROLS_H = 36;
const PROGRESS_H = 6;
const MIN_W = 240;
const MAX_W = 2400;

export function VideoPlayer({
  dark,
  projectId,
  videoWidth,
  onWidthChange,
  hasVideo = true,
  onVideoUploaded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const seekingRef = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoDragDepthRef = useRef(0);

  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    usePlayerStore.getState().setVideoElement(node);
  }, []);

  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [resizing, setResizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const playing = usePlayerStore((s) => s.playing);
  const muted = usePlayerStore((s) => s.muted);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const totalMs = usePlayerStore((s) => s.totalMs);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setCurrentMs = usePlayerStore((s) => s.setCurrentMs);
  const setTotalMs = usePlayerStore((s) => s.setTotalMs);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setTimelineTotalMs = useTimelineStore((s) => s.setTotalMs);
  const setTimelineScrollMs = useTimelineStore((s) => s.setScrollMs);
  const timelineVisibleDuration = useTimelineStore((s) => s.visibleDuration);

  const videoSrc = hasVideo && projectId ? `${API_BASE}/projects/${projectId}/stream/video` : "";

  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);

  // video element를 store에 등록
  // useEffect(() => {
  //   const v = videoRef.current;
  //   usePlayerStore.getState().setVideoElement(v);
  //   return () => usePlayerStore.getState().setVideoElement(null);
  // }, []);

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
        else {
          stopRaf();
          updateDom();
        }
      }

      if (!isPlaying && (state.currentMs !== prev.currentMs || state.totalMs !== prev.totalMs)) {
        updateDom();
      }
    });

    updateDom();
    return () => {
      stopRaf();
      unsub();
    };
  }, []);

  const seekAndScrollTimeline = useCallback(
    (ms: number) => {
      usePlayerStore.getState().seekTo(ms);
      const visDur = timelineVisibleDuration();
      setTimelineScrollMs(Math.max(0, ms - visDur * 0.1));
    },
    [timelineVisibleDuration, setTimelineScrollMs],
  );

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

    if (v.videoWidth && v.videoHeight) {
      setVideoAspect(v.videoWidth / v.videoHeight);
    }

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

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.volume = volume;
  }, [volume]);

  const handleFullscreen = () => {
    const v = videoRef.current;
    if (v) {
      if (document.fullscreenElement) document.exitFullscreen();
      else v.requestFullscreen().catch(() => {});
    }
  };

  /* ── 영상 파일 업로드 핸들러 ── */
  const handleVideoFileUpload = useCallback(
    async (file: File) => {
      if (!projectId || uploading) return;

      setUploading(true);
      try {
        await projectsApi.uploadVideo(projectId, file);
        onVideoUploaded?.();
      } catch {
        // 실패 시 무시 (재시도 가능)
      } finally {
        setUploading(false);
      }
    },
    [projectId, uploading, onVideoUploaded],
  );

  const isVideoUploadFile = useCallback((file: File) => {
    if (file.type.startsWith("video/")) return true;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    return ["mp4", "mov", "avi", "mkv", "webm", "m4v"].includes(ext);
  }, []);

  const resetVideoDragState = useCallback(() => {
    videoDragDepthRef.current = 0;
    setIsDragOver(false);
  }, []);

  const handleVideoDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!projectId || uploading) return;

      videoDragDepthRef.current += 1;
      setIsDragOver(true);
    },
    [projectId, uploading],
  );

  const handleVideoDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!projectId || uploading) return;

      e.dataTransfer.dropEffect = "copy";
      if (!isDragOver) setIsDragOver(true);
    },
    [projectId, uploading, isDragOver],
  );

  const handleVideoDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!projectId || uploading) return;

      videoDragDepthRef.current -= 1;
      if (videoDragDepthRef.current <= 0) {
        resetVideoDragState();
      }
    },
    [projectId, uploading, resetVideoDragState],
  );

  const handleVideoDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      resetVideoDragState();

      if (!projectId || uploading) return;

      const file = Array.from(e.dataTransfer.files ?? []).find(isVideoUploadFile);
      if (!file) return;

      await handleVideoFileUpload(file);
    },
    [projectId, uploading, isVideoUploadFile, handleVideoFileUpload, resetVideoDragState],
  );

  const dm = dark;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col">
      {resizing && <div className="fixed inset-0 z-50" />}

      <div className="flex-1 bg-black overflow-hidden relative flex items-center justify-center min-h-0">
        {videoSrc ? (
          <video
            ref={setVideoRef}
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
          /* ── 영상 없음: 업로드 버튼 + 드래그 업로드 ── */
          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleVideoFileUpload(f);
                e.currentTarget.value = "";
              }}
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
                <span className="text-xs text-gray-400">영상 업로드 중...</span>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragEnter={handleVideoDragEnter}
                onDragOver={handleVideoDragOver}
                onDragLeave={handleVideoDragLeave}
                onDrop={(e) => void handleVideoDrop(e)}
                role="button"
                tabIndex={0}
                className={`flex flex-col items-center gap-3 px-8 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors group ${
                  isDragOver
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-zinc-700 hover:border-blue-500/50 hover:bg-blue-500/5"
                }`}
              >
                <Film
                  size={32}
                  className={`transition-colors ${
                    isDragOver ? "text-blue-500" : "text-zinc-600 group-hover:text-blue-500"
                  }`}
                />
                <span
                  className={`text-sm font-medium transition-colors ${
                    isDragOver ? "text-blue-400" : "text-zinc-500 group-hover:text-blue-400"
                  }`}
                >
                  영상 파일 추가
                </span>
                <span className="text-[10px] text-zinc-700">
                  클릭하거나 영상 파일을 드래그해 업로드하세요
                </span>
              </div>
            )}
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
            {muted ? (
              <VolumeX size={14} className="text-gray-400" />
            ) : (
              <Volume2 size={14} className="text-gray-300" />
            )}
          </button>
          {/* 음량 슬라이더 */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
            }}
            className="w-16 h-1 accent-white cursor-pointer"
            title={`음량 ${Math.round((muted ? 0 : volume) * 100)}%`}
          />
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