import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";
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

const DEFAULT_VIDEO_W = 420;
const DEFAULT_EDITOR_H = 160;
const DEFAULT_TL_H = 220;
const TOPNAV_H = 40;
const HANDLE_H = 6;

/** 제출됨/승인됨이면 읽기전용. 반려됨(rejected)은 작업자에겐 편집 가능, 관리자에겐 읽기전용 */
function isReadOnly(project: Project | null, isWorker: boolean): boolean {
  if (!project) return false;
  if (project.status === "approved") return true;
  if (project.status === "submitted") return true;
  if (project.status === "rejected" && !isWorker) return true;
  return false;
}

/** 공용 수평 리사이즈 핸들 */
function HResizeHandle({ dark, onMouseDown }: { dark: boolean; onMouseDown: (e: React.MouseEvent) => void }) {
  const dm = dark;
  return (
    <div
      className={`shrink-0 h-1.5 cursor-ns-resize relative z-20 group
        ${dm ? "bg-gray-800 hover:bg-blue-600/40" : "bg-gray-200 hover:bg-blue-400/40"}
        active:bg-blue-500/50 transition-colors`}
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-1">
        <div className={`w-6 h-0.5 rounded ${dm ? "bg-gray-600 group-hover:bg-blue-400" : "bg-gray-400 group-hover:bg-blue-500"} transition-colors`} />
        <div className={`w-6 h-0.5 rounded ${dm ? "bg-gray-600 group-hover:bg-blue-400" : "bg-gray-400 group-hover:bg-blue-500"} transition-colors`} />
      </div>
    </div>
  );
}

export function AppLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // 독립 크기 상태
  const [videoWidth, setVideoWidth] = useState(DEFAULT_VIDEO_W);
  const [editorHeight, setEditorHeight] = useState(DEFAULT_EDITOR_H);
  const [timelineHeight, setTimelineHeight] = useState(DEFAULT_TL_H);
  const [timelineKey, setTimelineKey] = useState(0);
  const [dragging, setDragging] = useState(false);

  const timerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const init = useSubtitleStore((s) => s.init);
  const saveAll = useSubtitleStore((s) => s.saveAll);
  const setTotalMs = usePlayerStore((s) => s.setTotalMs);

  const pid = Number(projectId);
  const user = useAuthStore((s) => s.user);
  const isWorker = !user?.role || !["master", "manager"].includes(user.role);
  const loadSettings = useSettingsStore((s) => s.load);

  /**
   * 상단 영역(Grid+Video)이 사용할 수 있는 최대 높이 계산.
   */
  const upperMaxH = typeof window !== "undefined"
    ? window.innerHeight - TOPNAV_H - HANDLE_H * 2 - editorHeight - timelineHeight
    : 600;

  const handleVideoWidthChange = useCallback((w: number) => {
    setVideoWidth(w);
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

  // 프로젝트 로드 + 개인 설정 로드
  useEffect(() => {
    if (!pid) return;
    projectsApi.get(pid).then((p) => {
      setProject(p);
      setElapsed(p.elapsed_seconds || 0);
      setTotalMs(p.total_duration_ms);
    }).catch(() => navigate("/"));
    init(pid).catch(() => {});
    loadSettings();
  }, [pid]);

  useEffect(() => {
    timerRef.current = window.setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    saveTimerRef.current = window.setInterval(() => {
      if (pid) projectsApi.updateTimer(pid, elapsed).catch(() => {});
    }, 30000);
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [pid, elapsed]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pid) {
        navigator.sendBeacon(`/api/projects/${pid}/timer`, JSON.stringify({ elapsed_seconds: elapsed }));
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pid, elapsed]);

  // 임시저장: 서버 저장만, 화면 유지
  const handleSave = async () => {
    try {
      await saveAll();
      if (pid) {
        await projectsApi.updateTimer(pid, elapsed);
        await projectsApi.markSaved(pid);
      }
      setSavedMsg("저장 완료!");
      setTimeout(() => setSavedMsg(""), 2000);
    } catch {
      setSavedMsg("저장 실패");
      setTimeout(() => setSavedMsg(""), 2000);
    }
  };

  // 저장하고 나가기: 서버 저장 후 홈으로 이동
  const handleSaveAndExit = async () => {
    try {
      await saveAll();
      if (pid) {
        await projectsApi.updateTimer(pid, elapsed);
        await projectsApi.markSaved(pid);
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
    const errorCount = useSubtitleStore.getState().subtitles.filter((s) => s.error).length;
    if (errorCount > 0) {
      setSavedMsg(`검수 오류 ${errorCount}건 — 제출 불가`);
      setTimeout(() => setSavedMsg(""), 3000);
      return;
    }
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

  const handleDownload = () => {
    if (!pid || !project) return;
    const baseName = project.subtitle_file?.replace(/\.[^.]+$/, "") || project.name;
    const worker = project.assigned_to_name || "worker";
    const suffix = "final";
    const filename = `${baseName}_${worker}_${suffix}.srt`;
    
    const url = projectsApi.downloadSubtitle(pid);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSettingsClosed = async () => {
    if (pid) {
      try {
        const p = await projectsApi.get(pid);
        setProject(p);
        setTotalMs(p.total_duration_ms);
        await init(pid);
      } catch {}
    }
  };

  const handleGoHome = () => {
    if (pid) projectsApi.updateTimer(pid, elapsed).catch(() => {});
    navigate("/");
  };

  useKeyboardShortcuts(handleSave);
  usePlayback();

  const dm = dark;
  const bg = dm ? "bg-gray-900" : "bg-gray-100";
  const card = dm ? "bg-gray-800" : "bg-white";
  const bd = dm ? "border-gray-700" : "border-gray-200";

  return (
    <div className={`h-screen w-full ${bg} flex flex-col font-sans overflow-hidden select-none`}>
      {/* 드래그 중 전역 오버레이 */}
      {dragging && <div className="fixed inset-0 z-50 cursor-ns-resize" />}

      {/* 1) TopNav */}
      <TopNav
        dark={dm}
        setDark={setDark}
        savedMsg={savedMsg}
        onSave={handleSave}
        onSaveAndExit={handleSaveAndExit}
        onSubmit={handleSubmit}
        onDownload={handleDownload}
        onHome={handleGoHome}
        onSettingsClosed={handleSettingsClosed}
        project={project}
        elapsed={elapsed}
        readOnly={isReadOnly(project, isWorker)}
      />

      {/* 2) 상단: Grid | Video */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className={`flex-1 flex flex-col ${card} border-r ${bd} min-h-0 overflow-hidden`}>
          <SubtitleGrid dark={dm} readOnly={isReadOnly(project, isWorker)} />
        </div>
        <div
          className="shrink-0 bg-black flex items-start justify-center overflow-hidden relative"
          style={{ width: videoWidth }}
        >
          <VideoPlayer
            dark={dm}
            projectId={pid}
            videoWidth={videoWidth}
            onWidthChange={handleVideoWidthChange}
            maxHeight={Math.max(200, upperMaxH)}
          />
        </div>
      </div>

      {/* 3) 리사이즈 핸들: 상단 ↔ QuickEditor */}
      <HResizeHandle dark={dm} onMouseDown={handleEditorTopDrag} />

      {/* 4) QuickEditor */}
      <div className="shrink-0 overflow-hidden" style={{ height: editorHeight }}>
        <QuickEditor
          dark={dm}
          maxChars={project?.max_chars_per_line ?? 18}
          maxLines={project?.max_lines ?? 2}
          bracketChars={project?.bracket_chars ?? 5}
          readOnly={isReadOnly(project, isWorker)}
          hideCharCount={isWorker}
        />
      </div>

      {/* 5) 리사이즈 핸들: QuickEditor ↔ Timeline */}
      <HResizeHandle dark={dm} onMouseDown={handleTimelineTopDrag} />

      {/* 6) Timeline */}
      <div className="shrink-0 overflow-hidden" style={{ height: timelineHeight }}>
        <Timeline dark={dm} />
      </div>
    </div>
  );
}