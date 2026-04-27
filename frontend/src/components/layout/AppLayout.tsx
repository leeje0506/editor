import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useTimelineStore } from "../../store/useTimelineStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { usePlayback } from "../../hooks/usePlayback";
import { projectsApi } from "../../api/projects";
import type { Project } from "../../types";
import { TopNav } from "../nav/TopNav";
import { VideoPlayer } from "../video/VideoPlayer";
import { SubtitleGrid } from "../grid/SubtitleGrid";
import { QuickEditor } from "../editor/QuickEditor";
import { Timeline } from "../timeline/Timeline";
import { SubtitleDisplayPanel } from "../video/SubtitleDisplayPanel";
import { FindReplaceModal } from "../modals/FindReplaceModal";
import { DEFAULT_ZOOM_IDX } from "../../types";
import api from "../../api/client";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

type EditorMode = "srt" | "json";

const DEFAULT_VIDEO_W = 960;
const DEFAULT_EDITOR_H = 160;
const DEFAULT_TL_H = 220;

function isReadOnly(project: Project | null, isWorker: boolean): boolean {
  if (!project) return false;
  if (project.status === "approved") return true;
  if (project.status === "submitted") return true;
  if (project.status === "rejected" && !isWorker) return true;
  return false;
}

function HResizeHandle({
  dark,
  onMouseDown,
}: {
  dark: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const dm = dark;

  return (
    <div
      className={`shrink-0 h-1.5 cursor-ns-resize relative z-20 group
        ${dm ? "bg-gray-800 hover:bg-blue-600/40" : "bg-gray-200 hover:bg-blue-400/40"}
        active:bg-blue-500/50 transition-colors`}
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-1">
        <div
          className={`w-6 h-0.5 rounded ${
            dm ? "bg-gray-600 group-hover:bg-blue-400" : "bg-gray-400 group-hover:bg-blue-500"
          } transition-colors`}
        />
        <div
          className={`w-6 h-0.5 rounded ${
            dm ? "bg-gray-600 group-hover:bg-blue-400" : "bg-gray-400 group-hover:bg-blue-500"
          } transition-colors`}
        />
      </div>
    </div>
  );
}

export function AppLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [dark, setDark] = useState(() => localStorage.getItem("editor_darkMode") === "true");
  const [savedMsg, setSavedMsg] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showSubPanel, setShowSubPanel] = useState(false);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);

  const [editorMode, setEditorMode] = useState<EditorMode>("srt");

  const [videoWidth, setVideoWidth] = useState(() => {
    const saved = localStorage.getItem("editor_videoWidth");
    return saved ? Number(saved) : DEFAULT_VIDEO_W;
  });

  const [editorHeight, setEditorHeight] = useState(() => {
    const saved = localStorage.getItem("editor_editorHeight");
    return saved ? Number(saved) : DEFAULT_EDITOR_H;
  });

  const [timelineHeight, setTimelineHeight] = useState(() => {
    const saved = localStorage.getItem("editor_timelineHeight");
    return saved ? Number(saved) : DEFAULT_TL_H;
  });

  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem("editor_videoWidth", String(videoWidth));
  }, [videoWidth]);

  useEffect(() => {
    localStorage.setItem("editor_editorHeight", String(editorHeight));
  }, [editorHeight]);

  useEffect(() => {
    localStorage.setItem("editor_timelineHeight", String(timelineHeight));
  }, [timelineHeight]);

  useEffect(() => {
    localStorage.setItem("editor_darkMode", String(dark));
  }, [dark]);

  const timerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const init = useSubtitleStore((s) => s.init);
  const saveAll = useSubtitleStore((s) => s.saveAll);
  const setTotalMs = usePlayerStore((s) => s.setTotalMs);
  const setTimelineTotalMs = useTimelineStore((s) => s.setTotalMs);

  const pid = Number(projectId);
  const user = useAuthStore((s) => s.user);
  const isWorker = !user?.role || !["master", "manager"].includes(user.role);
  const loadSettings = useSettingsStore((s) => s.load);
  const [videoKey, setVideoKey] = useState(0);

  const readOnly = isReadOnly(project, isWorker);

  const handleVideoWidthChange = useCallback((w: number) => {
    const maxW = Math.floor(window.innerWidth * 0.7);
    setVideoWidth(Math.min(w, maxW));
  }, []);

  const handleEditorTopDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);

      const startY = e.clientY;
      const startEH = editorHeight;

      const onMove = (ev: MouseEvent) => {
        const dy = ev.clientY - startY;
        setEditorHeight(Math.max(80, Math.min(400, startEH - dy)));
      };

      const onUp = () => {
        setDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [editorHeight],
  );

  const handleTimelineTopDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);

      const startY = e.clientY;
      const startTH = timelineHeight;

      const onMove = (ev: MouseEvent) => {
        const dy = ev.clientY - startY;
        setTimelineHeight(Math.max(100, Math.min(500, startTH - dy)));
      };

      const onUp = () => {
        setDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [timelineHeight],
  );

  useEffect(() => {
    if (!pid) return;

    usePlayerStore.getState().setCurrentMs(0);
    usePlayerStore.getState().setVideoPreviewMs(null);
    useTimelineStore.setState({ zoomIdx: DEFAULT_ZOOM_IDX, scrollMs: 0 });

    projectsApi
      .get(pid)
      .then(async (p) => {
        setProject(p);
        setElapsed(p.elapsed_seconds || 0);
        setTotalMs(p.total_duration_ms);
        setTimelineTotalMs(p.total_duration_ms);

        if (p.import_type === "json") {
          setEditorMode("json");
        } else {
          setEditorMode("srt");
        }

        await init(pid);

        if (p.status !== "submitted" && p.status !== "approved") {
          const posMs = (p as any).last_position_ms || 0;
          const selId = (p as any).last_selected_id || null;

          if (posMs > 0) {
            usePlayerStore.getState().setCurrentMs(posMs);
            usePlayerStore.getState().setVideoPreviewMs(posMs);

            const visDur = useTimelineStore.getState().visibleDuration();
            useTimelineStore.getState().setScrollMs(Math.max(0, posMs - visDur * 0.1));
          }

          if (selId) {
            const subs = useSubtitleStore.getState().subtitles;
            const exists = subs.find((s) => s.id === selId);
            if (exists) {
              useSubtitleStore.getState().selectSingle(selId);
            }
          }
        }
      })
      .catch(() => navigate("/"));

    projectsApi
      .getWaveform(pid)
      .then((w) => setPeaks(w.peaks))
      .catch(() => setPeaks(null));

    loadSettings();
  }, [pid, init, loadSettings, navigate, setTimelineTotalMs, setTotalMs]);

  useEffect(() => {
    timerRef.current = window.setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    saveTimerRef.current = window.setInterval(async () => {
      if (pid) {
        try {
          await saveAll();
          await projectsApi.updateTimer(pid, elapsed);
          await savePosition();
        } catch {}
      }
    }, 30000);

    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    };
  }, [pid, elapsed, saveAll]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pid) {
        navigator.sendBeacon(
          `${API_BASE}/projects/${pid}/timer`,
          JSON.stringify({ elapsed_seconds: elapsed }),
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pid, elapsed]);

  const savePosition = async () => {
    if (!pid) return;

    const currentMs = usePlayerStore.getState().currentMs;
    const selectedId = useSubtitleStore.getState().selectedId;

    try {
      await projectsApi.markSaved(pid, currentMs, selectedId);
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      await saveAll();

      if (pid) {
        await projectsApi.updateTimer(pid, elapsed);
        await savePosition();
      }

      setSavedMsg("저장 완료!");
      setTimeout(() => setSavedMsg(""), 2000);
    } catch {
      setSavedMsg("저장 실패");
      setTimeout(() => setSavedMsg(""), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    try {
      await saveAll();

      if (pid) {
        await projectsApi.updateTimer(pid, elapsed);
        await savePosition();
      }

      setSavedMsg("저장 완료!");
      setTimeout(() => navigate("/"), 600);
    } catch {
      setSavedMsg("저장 실패");
      setTimeout(() => setSavedMsg(""), 2000);
    }
  };

  const handleSubmit = async () => {
    if (!pid) return;
    const subs = useSubtitleStore.getState().subtitles;
    const errorCount = subs.filter((s) => {
      if (!s.error) return false;
      const errors = s.error.split(",").map((e) => e.trim()).filter((e) => e !== "오버랩");
      return errors.length > 0;
    }).length;
    if (errorCount > 0) {
      setSavedMsg(`검수 오류 ${errorCount}건 — 제출 불가`);
      setTimeout(() => setSavedMsg(""), 3000);
      return;
    }

    // 제출 확인 모달
    const overlapCount = subs.filter((s) => s.error?.includes("오버랩")).length;
    const confirmMsg = overlapCount > 0
      ? `오버랩 ${overlapCount}건이 있지만 허용된 방송사입니다.\n제출하시겠습니까?`
      : "제출하시겠습니까?";
    if (!confirm(confirmMsg)) return;

    try {
      await saveAll();
      await projectsApi.updateTimer(pid, elapsed);
      await projectsApi.submit(pid);
      setSavedMsg("제출 완료!");
      setTimeout(() => navigate("/"), 600);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "제출 실패";
      setSavedMsg(msg);
      setTimeout(() => setSavedMsg(""), 3000);
    }
  };

  const handleDownload = async () => {
    if (!pid || !project) return;

    try {
      const response = await api.get(`/projects/${pid}/download/subtitle`, {
        responseType: "blob",
      });

      const baseName = project.subtitle_file?.replace(/\.[^.]+$/, "") || project.name;
      const worker = project.assigned_to_name || "worker";
      const filename = `${baseName}_${worker}_final.srt`;

      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setSavedMsg("다운로드 실패");
      setTimeout(() => setSavedMsg(""), 2000);
    }
  };

  const handleDownloadJson = async () => {
    if (!pid || !project) return;

    try {
      const response = await api.get(`/projects/${pid}/download/json`, {
        responseType: "blob",
      });

      const baseName = project.subtitle_file?.replace(/\.[^.]+$/, "") || project.name;
      const worker = project.assigned_to_name || "worker";
      const filename = `${baseName}_${worker}_export.json`;

      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setSavedMsg("JSON 다운로드 실패");
      setTimeout(() => setSavedMsg(""), 2000);
    }
  };

  const handleSettingsClosed = async () => {
    if (!pid) return;
    try {
      const p = await projectsApi.get(pid);
      setProject(p);
      setTotalMs(p.total_duration_ms);
      setTimelineTotalMs(p.total_duration_ms);
      setVideoKey((k) => k + 1);
      await init(pid);
    } catch {}
  };

  const handleSubtitleUploaded = async () => {
    if (!pid) return;

    try {
      const p = await projectsApi.get(pid);
      setProject(p);
      setTotalMs(p.total_duration_ms);
      setTimelineTotalMs(p.total_duration_ms);
      await init(pid);
    } catch {}
  };

  const handleVideoUploaded = async () => {
    if (!pid) return;
    try {
      const p = await projectsApi.get(pid);
      setProject(p);
      setTotalMs(p.total_duration_ms);
      setTimelineTotalMs(p.total_duration_ms);
      setVideoKey((k) => k + 1);
      try {
        const w = await projectsApi.getWaveform(pid);
        setPeaks(w.peaks);
      } catch {
        setPeaks(null);
      }
    } catch {}
  };

  const handleReload = async () => {
    if (!pid) return;
    try {
      const w = await projectsApi.getWaveform(pid);
      setPeaks(w.peaks);
    } catch {
      setPeaks(null);
    }
    setVideoKey((k) => k + 1);
  };

  const handleGoHome = async () => {
    try {
      await saveAll();
      await savePosition();
      if (pid) await projectsApi.updateTimer(pid, elapsed);
    } catch {}

    navigate("/");
  };

  useKeyboardShortcuts(
    handleSave,
    project?.max_chars_per_line ?? 18,
    () => setShowFindReplace(true),
  );
  usePlayback();

  const dm = dark;
  const bg = dm ? "bg-gray-900" : "bg-gray-100";
  const card = dm ? "bg-gray-800" : "bg-white";
  const bd = dm ? "border-gray-700" : "border-gray-200";

  return (
    <div className={`h-screen w-full ${bg} flex flex-col font-sans overflow-hidden select-none`}>
      {dragging && <div className="fixed inset-0 z-50 cursor-ns-resize" />}

      {saving && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
          <div
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl ${
              dm ? "bg-gray-800/90 text-gray-200" : "bg-white/90 text-gray-700"
            } border ${bd}`}
          >
            <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-xs font-medium">저장 중...</span>
          </div>
        </div>
      )}

      <TopNav
        dark={dm}
        setDark={setDark}
        savedMsg={savedMsg}
        onSave={handleSave}
        onSaveAndExit={handleSaveAndExit}
        onSubmit={handleSubmit}
        onDownload={handleDownload}
        onDownloadJson={handleDownloadJson}
        onHome={handleGoHome}
        onSettingsClosed={handleSettingsClosed}
        onToggleSubtitlePanel={() => setShowSubPanel(!showSubPanel)}
        project={project}
        elapsed={elapsed}
        readOnly={readOnly}
        isAdmin={!isWorker}
        editorMode={editorMode}
        onModeChange={setEditorMode}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className={`flex-1 flex flex-col ${card} border-r ${bd} min-h-0 overflow-hidden`}>
          <div className="flex-1 min-h-0 overflow-hidden">
            <SubtitleGrid
              dark={dm}
              readOnly={readOnly}
              editorMode={editorMode}
              projectId={pid}
              maxChars={project?.max_chars_per_line ?? 18}
              maxLines={project?.max_lines ?? 2}
              minDurationMs={(project as any)?.min_duration_ms ?? 500}
              onSubtitleUploaded={handleSubtitleUploaded}
              speakerMode={project?.speaker_mode ?? "name"}
            />
          </div>

          <HResizeHandle dark={dm} onMouseDown={handleEditorTopDrag} />

          <div className="shrink-0 overflow-hidden" style={{ height: editorHeight }}>
            <QuickEditor
              dark={dm}
              maxChars={project?.max_chars_per_line ?? 18}
              maxLines={project?.max_lines ?? 2}
              readOnly={readOnly}
              editorMode={editorMode}
              speakerMode={project?.speaker_mode ?? "name"}
            />
          </div>
        </div>

        <div
          className="shrink-0 bg-black flex items-center justify-center overflow-hidden relative"
          style={{ width: videoWidth }}
        >
          <VideoPlayer
            dark={dm}
            projectId={pid}
            videoWidth={videoWidth}
            onWidthChange={handleVideoWidthChange}
            hasVideo={!!project?.video_file}
            videoKey={videoKey}
            onVideoUploaded={handleVideoUploaded}
          />
          {showSubPanel && (
            <SubtitleDisplayPanel dark={dm} onClose={() => setShowSubPanel(false)} />
          )}
        </div>
      </div>

      <HResizeHandle dark={dm} onMouseDown={handleTimelineTopDrag} />

      <div className="shrink-0 overflow-hidden" style={{ height: timelineHeight }}>
        <Timeline dark={dark} peaks={peaks} onReload={handleReload} readOnly={readOnly} />
      </div>

      {showFindReplace && (
        <FindReplaceModal dark={dm} onClose={() => setShowFindReplace(false)} />
      )}
    </div>
  );
}