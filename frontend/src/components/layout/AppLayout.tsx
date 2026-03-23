import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { usePlayback } from "../../hooks/usePlayback";
import { projectsApi } from "../../api/projects";
import type { Project } from "../../types";
import { TopNav } from "../nav/TopNav";
import { VideoPlayer } from "../video/VideoPlayer";
import { SubtitleGrid } from "../grid/SubtitleGrid";
import { QuickEditor } from "../editor/QuickEditor";
import { Timeline } from "../timeline/Timeline";

export function AppLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const init = useSubtitleStore((s) => s.init);
  const saveAll = useSubtitleStore((s) => s.saveAll);
  const setTotalMs = usePlayerStore((s) => s.setTotalMs);

  const pid = Number(projectId);

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

  // 작업 시간 카운터 (1초마다)
  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // 30초마다 서버에 작업 시간 동기화
  useEffect(() => {
    saveTimerRef.current = window.setInterval(() => {
      if (pid) {
        projectsApi.updateTimer(pid, elapsed).catch(() => {});
      }
    }, 30000);
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [pid, elapsed]);

  // 페이지 떠날 때 시간 저장
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pid) {
        navigator.sendBeacon(
          `/api/projects/${pid}/timer`,
          JSON.stringify({ elapsed_seconds: elapsed }),
        );
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
      setTimeout(() => setSavedMsg(""), 2000);
    } catch {
      setSavedMsg("저장 실패");
      setTimeout(() => setSavedMsg(""), 2000);
    }
  };

  const handleGoHome = () => {
    // 홈으로 돌아가기 전 시간 저장
    if (pid) {
      projectsApi.updateTimer(pid, elapsed).catch(() => {});
    }
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
      <TopNav
        dark={dm}
        setDark={setDark}
        savedMsg={savedMsg}
        onSave={handleSave}
        onHome={handleGoHome}
        project={project}
        elapsed={elapsed}
      />

      <div className="flex-1 flex min-h-0">
        <div className="w-[42%] bg-black flex flex-col relative shrink-0">
          <VideoPlayer dark={dm} />
        </div>
        <div className={`flex-1 flex flex-col ${card} border-l ${bd} min-h-0`}>
          <SubtitleGrid dark={dm} />
          <QuickEditor
            dark={dm}
            maxChars={project?.max_chars_per_line ?? 18}
            maxLines={project?.max_lines ?? 2}
            bracketChars={project?.bracket_chars ?? 5}
          />
        </div>
      </div>

      <Timeline dark={dm} />
    </div>
  );
}