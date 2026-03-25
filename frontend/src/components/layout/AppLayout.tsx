import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useAuthStore } from "../../store/useAuthStore";
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

/** 제출됨/승인됨 상태면 읽기전용 */
function isReadOnly(project: Project | null): boolean {
  return project?.status === "submitted" || project?.status === "approved";
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
  const [dragging, setDragging] = useState(false);

  const timerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const init = useSubtitleStore((s) => s.init);
  const saveAll = useSubtitleStore((s) => s.saveAll);
  const setTotalMs = usePlayerStore((s) => s.setTotalMs);

  const pid = Number(projectId);
  const user = useAuthStore((s) => s.user);
  const isWorker = !user?.role || !["master", "manager"].includes(user.role);

  const handleVideoWidthChange = useCallback((w: number) => setVideoWidth(w), []);

  // QuickEditor / Timeline 경계 드래그 헬퍼
  const makeDragHandler = useCallback(
    (setter: (h: number) => void, startH: number, direction: 1 | -1, min: number, max: number) =>
      (e: React.MouseEvent) => {
        e.preventDefault();
        setDragging(true);
        const startY = e.clientY;
        const onMove = (ev: MouseEvent) => {
          const dy = (ev.clientY - startY) * direction;
          setter(Math.max(min, Math.min(max, startH + dy)));
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
    [],
  );

  // 그리드↔에디터 경계: 아래로 드래그 → 에디터 줄어듦 (그리드 커짐)
  const handleEditorTopDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      const startY = e.clientY;
      const startEH = editorHeight;
      const onMove = (ev: MouseEvent) => {
        const dy = ev.clientY - startY;
        // 아래로 = 에디터 줄어듦
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

  // 에디터↔타임라인 경계: 아래로 드래그 → 타임라인 줄어듦 (에디터 커짐은 위 핸들에서)
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

  // 프로젝트 로드
  useEffect(() => {
    if (!pid) return;
    projectsApi.get(pid).then((p) => {
      setProject(p);
      setElapsed(p.elapsed_seconds || 0);
      setTotalMs(p.total_duration_ms);
    }).catch(() => navigate("/"));
    init(pid).catch(() => {});
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

  const handleSave = async () => {
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
    // 검수 오류 확인
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
    // 기본 파일명: {자막파일명}_{작업자이름}_{subfix}.srt
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
        onSubmit={handleSubmit}
        onDownload={handleDownload}
        onHome={handleGoHome}
        project={project}
        elapsed={elapsed}
        readOnly={isReadOnly(project)}
      />

      {/* 2) 상단: Grid | Video — 나머지 공간 전부 */}
      <div className="flex-1 flex min-h-0">
        <div className={`flex-1 flex flex-col ${card} border-r ${bd} min-h-0`}>
          <SubtitleGrid dark={dm} readOnly={isReadOnly(project)} />
        </div>
        <div
          className="shrink-0 bg-black flex items-center justify-center overflow-visible relative"
          style={{ width: videoWidth }}
        >
          <VideoPlayer
            dark={dm}
            projectId={pid}
            videoWidth={videoWidth}
            onWidthChange={handleVideoWidthChange}
          />
        </div>
      </div>

      {/* 3) 리사이즈 핸들: 상단 ↔ QuickEditor */}
      <HResizeHandle dark={dm} onMouseDown={handleEditorTopDrag} />

      {/* 4) QuickEditor — 고정 높이, 독립 조절 */}
      <div className="shrink-0" style={{ height: editorHeight }}>
        <QuickEditor
          dark={dm}
          maxChars={project?.max_chars_per_line ?? 18}
          maxLines={project?.max_lines ?? 2}
          bracketChars={project?.bracket_chars ?? 5}
          readOnly={isReadOnly(project)}
          hideCharCount={isWorker}
        />
      </div>

      {/* 5) 리사이즈 핸들: QuickEditor ↔ Timeline */}
      <HResizeHandle dark={dm} onMouseDown={handleTimelineTopDrag} />

      {/* 6) Timeline — 고정 높이, 독립 조절 */}
      <div className="shrink-0" style={{ height: timelineHeight }}>
        <Timeline dark={dm} />
      </div>
    </div>
  );
}