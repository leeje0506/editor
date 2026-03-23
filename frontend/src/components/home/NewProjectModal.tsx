import { useState, useRef } from "react";
import { X, Film, FileText, Monitor } from "lucide-react";
import { projectsApi } from "../../api/projects";
import type { Project } from "../../types";

const BROADCASTER_RULES: Record<string, { max_lines: number; max_chars_per_line: number; bracket_chars: number }> = {
  "TVING":  { max_lines: 2, max_chars_per_line: 20, bracket_chars: 5 },
  "LGHV":   { max_lines: 2, max_chars_per_line: 18, bracket_chars: 5 },
  "SKBB":   { max_lines: 1, max_chars_per_line: 20, bracket_chars: 5 },
  "JTBC":   { max_lines: 2, max_chars_per_line: 18, bracket_chars: 5 },
  "KBS":    { max_lines: 2, max_chars_per_line: 18, bracket_chars: 5 },
  "자유작업": { max_lines: 99, max_chars_per_line: 999, bracket_chars: 0 },
};

const BROADCASTER_OPTIONS = Object.keys(BROADCASTER_RULES);

interface Props {
  dark: boolean;
  onClose: () => void;
  onCreate: (project: Project) => void;
}

export function NewProjectModal({ dark, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [broadcaster, setBroadcaster] = useState("TVING");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);

  const rules = BROADCASTER_RULES[broadcaster];
  const dm = dark;
  const card = dm ? "bg-gray-900" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const inp = dm ? "bg-gray-800 text-gray-100 border-gray-700" : "bg-white text-gray-800 border-gray-300";
  const inpF = "focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  const handleCreate = async () => {
    if (!name.trim()) { setError("프로젝트 명칭을 입력해주세요."); return; }
    if (!videoFile) { setError("영상 파일을 첨부해주세요."); return; }
    if (!subtitleFile) { setError("자막 파일을 첨부해주세요."); return; }
    setCreating(true);
    setError("");
    try {
      const project = await projectsApi.create({
        name: name.trim(), broadcaster, description: description || undefined, deadline: deadline || undefined,
      });
      await projectsApi.uploadVideo(project.id, videoFile);
      await projectsApi.uploadSubtitle(project.id, subtitleFile);
      const updated = await projectsApi.get(project.id);
      onCreate(updated);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "생성에 실패했습니다.");
    } finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className={`${card} rounded-2xl shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto ${tp}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h2 className="text-lg font-black">새 작업 생성</h2>
          <button onClick={onClose} className={`${ts} hover:opacity-60`}><X size={20} /></button>
        </div>
        <div className="px-6 py-4 space-y-5">
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>프로젝트 명칭 <span className="text-red-500">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 무한도전 1화 배리어프리" className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} ${inpF}`} />
          </div>
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>방송사 <span className="text-red-500">*</span></label>
            <select value={broadcaster} onChange={(e) => setBroadcaster(e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} ${inpF}`}>
              {BROADCASTER_OPTIONS.map((bc) => <option key={bc} value={bc}>{bc}</option>)}
            </select>
            {/* 방송사 기준 읽기 전용 표시 */}
            {rules && (
              <div className={`mt-1.5 text-[11px] ${ts} ${dm ? "bg-gray-800" : "bg-gray-50"} rounded px-3 py-1.5`}>
                자막 기준: 최대 {rules.max_lines}줄 / 줄당 {rules.max_chars_per_line}자 / 화자 예약 {rules.bracket_chars}자
                <span className={`ml-2 ${dm ? "text-gray-600" : "text-gray-400"}`}>(관리 페이지에서 수정)</span>
              </div>
            )}
          </div>
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>설명 / 부제</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 대탈출 더 스토리 / 8회" className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} ${inpF}`} />
          </div>
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>마감일 (선택)</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} ${inpF}`} />
          </div>
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>영상 파일 <span className="text-red-500">*</span></label>
            <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
            <button onClick={() => videoRef.current?.click()} className={`w-full border-2 border-dashed ${bd} rounded-lg py-4 flex flex-col items-center gap-1.5 hover:border-blue-500/50 transition-colors`}>
              <Film size={20} className={ts} />
              {videoFile ? <span className="text-xs text-blue-500 font-medium">{videoFile.name}</span> : <span className={`text-xs ${ts}`}>클릭하여 영상 첨부</span>}
            </button>
          </div>
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>자막 파일 <span className="text-red-500">*</span> (SRT / VTT)</label>
            <input ref={subRef} type="file" accept=".srt,.vtt,.txt" className="hidden" onChange={(e) => setSubtitleFile(e.target.files?.[0] || null)} />
            <button onClick={() => subRef.current?.click()} className={`w-full border-2 border-dashed ${bd} rounded-lg py-4 flex flex-col items-center gap-1.5 hover:border-blue-500/50 transition-colors`}>
              <FileText size={20} className={ts} />
              {subtitleFile ? <span className="text-xs text-blue-500 font-medium">{subtitleFile.name}</span> : <span className={`text-xs ${ts}`}>클릭하여 자막 첨부</span>}
            </button>
          </div>
          {error && <div className="text-red-500 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className={`px-6 py-4 border-t ${bd} flex items-center justify-end gap-3`}>
          <button onClick={onClose} className={`px-4 py-2 text-sm ${ts} hover:opacity-80`}>취소</button>
          <button onClick={handleCreate} disabled={creating} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
            <Monitor size={16} />{creating ? "생성 중..." : "워크스페이스 생성"}
          </button>
        </div>
      </div>
    </div>
  );
}