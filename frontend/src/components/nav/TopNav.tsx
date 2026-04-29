import { useState } from "react";
import { Home, Moon, Sun, Save, Send, Settings, Clock, Download, Lock, LogOut, FileJson, FileText, Users } from "lucide-react";
import { ProjectSettingsModal } from "../modals/ProjectSettingsModal";
import { BulkSpeakerModal } from "../modals/BulkSpeakerModal";
import { useBroadcasterStore } from "../../store/useBroadcasterStore";
import type { Project } from "../../types";
type EditorMode = "srt" | "json";

interface Props {
  dark: boolean;
  setDark: (v: boolean) => void;
  savedMsg: string;
  onSave: () => void;
  onSaveAndExit: () => void;
  onSubmit: () => void;
  onDownload: () => void;
  onDownloadJson?: () => void;
  onHome: () => void;
  onSettingsClosed?: () => void;
  onToggleSubtitlePanel?: () => void;
  project: Project | null;
  elapsed: number;
  readOnly: boolean;
  isAdmin?: boolean;
  editorMode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TopNav({
  dark, setDark, savedMsg, onSave, onSaveAndExit, onSubmit,
  onDownload, onDownloadJson, onHome, onSettingsClosed, onToggleSubtitlePanel,
  project, elapsed, readOnly, isAdmin, editorMode, onModeChange,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [showDlMenu, setShowDlMenu] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  // broadcaster store에서 최신 룰 가져옴 (project 자체 값보다 우선)
  const bcRules = useBroadcasterStore((s) => s.rules);
  const liveRule = project?.broadcaster ? bcRules[project.broadcaster] : null;
  const displayMaxLines = liveRule?.max_lines ?? project?.max_lines ?? 2;
  const displayMaxChars = liveRule?.max_chars_per_line ?? project?.max_chars_per_line ?? 15;

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";

  // status 라벨 + 색상 (readOnly 상태에서만 배지로 표시)
  const statusLabel =
    project?.status === "submitted" ? "제출"
    : project?.status === "completed" ? "완료"
    : project?.status === "rejected" ? "반려"
    : "";
  const statusColor =
    project?.status === "submitted" ? "text-yellow-500 bg-yellow-500/10"
    : project?.status === "completed" ? "text-green-500 bg-green-500/10"
    : project?.status === "rejected" ? "text-red-500 bg-red-500/10"
    : "";

  // 진척률 (progress_ms / video_duration_ms)
  const hasProgressInfo = !!(project?.video_duration_ms && project.video_duration_ms > 0);
  const progressPct = hasProgressInfo
    ? Math.min(100, Math.round(((project!.progress_ms || 0) / project!.video_duration_ms!) * 100))
    : 0;

  // 워크스페이스 경로 (브레드크럼)
  const workspacePath = project?.workspace_path ?? [];

  return (
    <>
      <div className={`h-11 shrink-0 ${card} border-b ${bd} flex items-center justify-between px-4 z-30`}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onHome} className={`shrink-0 w-7 h-7 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80`} title="홈으로">
            <Home size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-blue-500 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                {project?.broadcaster || "tv"}
              </span>
              <h1 className={`text-sm font-bold ${tp} truncate`}>{project?.name || "로딩 중..."}</h1>
              {/* 워크스페이스 경로 미니 브레드크럼 */}
              {workspacePath.length > 0 && (
                <span className={`text-[10px] ${ts} truncate shrink min-w-0`}>
                  {workspacePath.join(" › ")}
                </span>
              )}
              {readOnly && statusLabel && (
                <span className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${statusColor}`}>
                  <Lock size={10} /> {statusLabel} (읽기전용)
                </span>
              )}
              {!readOnly && (
                <button onClick={() => setShowSettings(true)} className={`shrink-0 ${ts} hover:opacity-60`}>
                  <Settings size={13} />
                </button>
              )}
            </div>
            <div className={`text-[10px] ${ts} flex gap-2 items-center`}>
              <span>방송사: <strong className="text-blue-500">{project?.broadcaster || "-"}</strong></span>
              <span>(최대 {displayMaxLines}줄, {displayMaxChars}자)</span>
              <span className={`flex items-center gap-0.5 ${dm ? "text-yellow-400" : "text-yellow-600"}`}>
                <Clock size={10} /> 소요 시간: {formatElapsed(elapsed)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* 진척률 미니 인디케이터 (영상 길이 있을 때만)
          {hasProgressInfo && (
            <>
              <div className="flex items-center gap-1.5 px-2">
                <span className={`text-[10px] ${ts}`}>진척</span>
                <div className={`relative h-1.5 w-[54px] rounded ${dm ? "bg-gray-700" : "bg-gray-200"} overflow-hidden`}>
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-emerald-500 rounded transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className={`text-[10px] font-mono ${ts} tabular-nums`}>{progressPct}%</span>
              </div>
              <div className={`h-4 w-px ${dm ? "bg-gray-700" : "bg-gray-200"} mx-1`} />
            </>
          )} */}

          {savedMsg && (
            <span className={`text-xs font-medium mr-1 ${
              savedMsg.includes("실패") || savedMsg.includes("불가") ? "text-red-500" : "text-emerald-500"
            }`}>
              {savedMsg}
            </span>
          )}

          {readOnly ? (
            <>
              {/* 다운로드 드롭다운 */}
              <div className="relative">
                <button
                  onClick={() => setShowDlMenu(!showDlMenu)}
                  className={`flex items-center gap-1 border ${bd} ${card} ${ts} px-2.5 py-1 rounded text-xs font-medium hover:opacity-80`}
                  title="다운로드"
                >
                  <Download size={13} /> 다운로드
                </button>
                {showDlMenu && (
                  <div className={`absolute right-0 top-full mt-1 ${card} border ${bd} rounded shadow-lg z-50 min-w-[140px]`}>
                    <button
                      onClick={() => { onDownload(); setShowDlMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${tp} hover:bg-blue-500/10`}
                    >
                      <FileText size={12} /> SRT 다운로드
                    </button>
                    <button
                      onClick={() => { onDownloadJson?.(); setShowDlMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${tp} hover:bg-purple-500/10`}
                    >
                      <FileJson size={12} /> JSON 다운로드
                    </button>
                  </div>
                )}
              </div>
              <span className={`text-[10px] ${ts} px-2`}>검수 모드 — 수정 불가</span>
            </>
          ) : (
            <>
              <button onClick={() => setShowBulk(true)} className="flex items-center gap-0.5 text-purple-600 border border-purple-200 bg-purple-50 px-2 py-1 rounded text-[10px] font-medium hover:bg-purple-100">
                <Users size={12} /> 화자 일괄변경
              </button>

              <button onClick={() => setDark(!dm)} className={`w-7 h-7 flex items-center justify-center border ${bd} rounded ${ts} hover:opacity-80`}>
                {dm ? <Sun size={14} /> : <Moon size={14} />}
              </button>

              {/* 다운로드 드롭다운 */}
              <div className="relative">
                <button
                  onClick={() => setShowDlMenu(!showDlMenu)}
                  className={`flex items-center gap-1 border ${bd} ${card} ${ts} px-2.5 py-1 rounded text-xs font-medium hover:opacity-80`}
                  title="다운로드"
                >
                  <Download size={13} /> 다운로드
                </button>
                {showDlMenu && (
                  <div className={`absolute right-0 top-full mt-1 ${card} border ${bd} rounded shadow-lg z-50 min-w-[140px]`}>
                    <button
                      onClick={() => { onDownload(); setShowDlMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${tp} hover:bg-blue-500/10`}
                    >
                      <FileText size={12} /> SRT 다운로드
                    </button>
                    <button
                      onClick={() => { onDownloadJson?.(); setShowDlMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${tp} hover:bg-purple-500/10`}
                    >
                      <FileJson size={12} /> JSON 다운로드
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={onSave}
                className={`flex items-center gap-1 border ${bd} ${card} ${tp} px-2.5 py-1 rounded text-xs font-medium hover:opacity-80`}
                title="Ctrl+S"
              >
                <Save size={13} /> 저장
              </button>

              <button
                onClick={onSaveAndExit}
                className={`flex items-center gap-1 border ${bd} ${card} ${tp} px-2.5 py-1 rounded text-xs font-medium hover:opacity-80`}
                title="저장 후 홈으로"
              >
                <LogOut size={13} /> 저장하고 나가기
              </button>

              <button onClick={onSubmit} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-blue-700">
                <Send size={13} /> 제출
              </button>
            </>
          )}
        </div>
      </div>

      {showSettings && !readOnly && <ProjectSettingsModal dark={dm} onClose={() => { setShowSettings(false); onSettingsClosed?.(); }} isAdmin={isAdmin} />}
      {showBulk && !readOnly && <BulkSpeakerModal dark={dm} onClose={() => setShowBulk(false)} />}
    </>
  );
}