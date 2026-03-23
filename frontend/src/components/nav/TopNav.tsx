import { useState } from "react";
import { Home, Moon, Sun, Save, Send, Undo, Redo, Settings, Clock } from "lucide-react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { ProjectSettingsModal } from "../modals/ProjectSettingsModal";
import type { Project } from "../../types";

interface Props {
  dark: boolean;
  setDark: (v: boolean) => void;
  savedMsg: string;
  onSave: () => void;
  onHome: () => void;
  project: Project | null;
  elapsed: number;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TopNav({ dark, setDark, savedMsg, onSave, onHome, project, elapsed }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const undo = useSubtitleStore((s) => s.undo);

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";

  return (
    <>
      <div className={`h-11 shrink-0 ${card} border-b ${bd} flex items-center justify-between px-4 z-30`}>
        <div className="flex items-center gap-3">
          <button onClick={onHome} className={`w-7 h-7 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80`} title="홈으로">
            <Home size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-blue-500 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px]">tv</span>
              <h1 className={`text-sm font-bold ${tp}`}>{project?.name || "로딩 중..."}</h1>
              <button onClick={() => setShowSettings(true)} className={`${ts} hover:opacity-60`}>
                <Settings size={13} />
              </button>
            </div>
            <div className={`text-[10px] ${ts} flex gap-2 items-center`}>
              <span>방송사: <strong className="text-blue-500">{project?.broadcaster || "-"}</strong></span>
              <span>(최대 {project?.max_lines || 2}줄, {project?.max_chars_per_line || 15}자)</span>
              <span className={`flex items-center gap-0.5 ${dm ? "text-yellow-400" : "text-yellow-600"}`}>
                <Clock size={10} /> 소요 시간: {formatElapsed(elapsed)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {savedMsg && <span className="text-emerald-500 text-xs font-medium mr-1">{savedMsg}</span>}
          <button onClick={() => undo()} className={`w-7 h-7 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80`} title="Ctrl+Z">
            <Undo size={14} />
          </button>
          <button className={`w-7 h-7 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80 opacity-30`} title="Ctrl+Y">
            <Redo size={14} />
          </button>
          <button onClick={() => setDark(!dm)} className={`w-7 h-7 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80`}>
            {dm ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button onClick={onSave} className={`flex items-center gap-1 border ${bd} ${card} ${tp} px-2.5 py-1 rounded text-xs font-medium hover:opacity-80`}>
            <Save size={13} /> 임시저장
          </button>
          <button className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-blue-700">
            <Send size={13} /> 제출 (완료)
          </button>
        </div>
      </div>

      {showSettings && <ProjectSettingsModal dark={dm} onClose={() => setShowSettings(false)} />}
    </>
  );
}