import { useState } from "react";
import { Home, Moon, Sun, Save, Send, Undo, Settings, Clock, Download, Lock, LogOut } from "lucide-react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { ProjectSettingsModal } from "../modals/ProjectSettingsModal";
import type { Project } from "../../types";

interface Props {
  dark: boolean;
  setDark: (v: boolean) => void;
  savedMsg: string;
  onSave: () => void;
  onSaveAndExit: () => void;
  onSubmit: () => void;
  onDownload: () => void;
  onHome: () => void;
  onSettingsClosed?: () => void;
  project: Project | null;
  elapsed: number;
  readOnly: boolean;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TopNav({ dark, setDark, savedMsg, onSave, onSaveAndExit, onSubmit, onDownload, onHome, onSettingsClosed, project, elapsed, readOnly }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const undo = useSubtitleStore((s) => s.undo);

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";

  const statusLabel = project?.status === "submitted" ? "제출됨" : project?.status === "approved" ? "승인됨" : "";
  const statusColor = project?.status === "submitted" ? "text-yellow-500 bg-yellow-500/10" : project?.status === "approved" ? "text-green-500 bg-green-500/10" : "";

  return (
    <>
      <div className={`h-11 shrink-0 ${card} border-b ${bd} flex items-center justify-between px-4 z-30`}>
        <div className="flex items-center gap-3">
          <button onClick={onHome} className={`w-7 h-7 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80`} title="홈으로">
            <Home size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-blue-500 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px]">
                {project?.broadcaster || "tv"}
              </span>
              <h1 className={`text-sm font-bold ${tp}`}>{project?.name || "로딩 중..."}</h1>
              {readOnly && (
                <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${statusColor}`}>
                  <Lock size={10} /> {statusLabel} (읽기전용)
                </span>
              )}
              {!readOnly && (
                <button onClick={() => setShowSettings(true)} className={`${ts} hover:opacity-60`}>
                  <Settings size={13} />
                </button>
              )}
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
          {savedMsg && (
            <span className={`text-xs font-medium mr-1 ${
              savedMsg.includes("실패") || savedMsg.includes("불가") ? "text-red-500" : "text-emerald-500"
            }`}>
              {savedMsg}
            </span>
          )}

          {/* 다운로드 (항상 가능) */}
          <button
            onClick={onDownload}
            className={`flex items-center gap-1 border ${bd} ${card} ${ts} px-2.5 py-1 rounded text-xs font-medium hover:opacity-80`}
            title="SRT 다운로드"
          >
            <Download size={13} /> 다운로드
          </button>

          {readOnly ? (
            <span className={`text-[10px] ${ts} px-2`}>검수 모드 — 수정 불가</span>
          ) : (
            <>
              <button onClick={() => undo()} className={`w-7 h-7 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80`} title="Ctrl+Z">
                <Undo size={14} />
              </button>
              <button onClick={() => setDark(!dm)} className={`w-7 h-7 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80`}>
                {dm ? <Sun size={14} /> : <Moon size={14} />}
              </button>

              {/* 임시저장: 저장만 하고 화면 유지 */}
              <button
                onClick={onSave}
                className={`flex items-center gap-1 border ${bd} ${card} ${tp} px-2.5 py-1 rounded text-xs font-medium hover:opacity-80`}
                title="Ctrl+S"
              >
                <Save size={13} /> 임시저장
              </button>

              {/* 저장하고 나가기: 저장 후 홈으로 이동 */}
              <button
                onClick={onSaveAndExit}
                className={`flex items-center gap-1 border ${bd} ${card} ${tp} px-2.5 py-1 rounded text-xs font-medium hover:opacity-80`}
                title="저장 후 홈으로"
              >
                <LogOut size={13} /> 저장하고 나가기
              </button>

              {/* 제출 */}
              <button onClick={onSubmit} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-blue-700">
                <Send size={13} /> 제출
              </button>
            </>
          )}
        </div>
      </div>

      {showSettings && !readOnly && <ProjectSettingsModal dark={dm} onClose={() => { setShowSettings(false); onSettingsClosed?.(); }} />}
    </>
  );
}