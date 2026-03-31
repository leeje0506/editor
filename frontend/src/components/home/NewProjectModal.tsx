import { useState, useRef, useEffect, useCallback } from "react";
import { X, Film, FileText, Monitor } from "lucide-react";
import { projectsApi } from "../../api/projects";
import { useBroadcasterStore } from "../../store/useBroadcasterStore";
import { useAuthStore } from "../../store/useAuthStore";
import type { Project } from "../../types";

interface Props {
  dark: boolean;
  onClose: () => void;
  onCreate: (project: Project) => void;
}

export function NewProjectModal({ dark, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [nameManual, setNameManual] = useState(false); // 사용자가 직접 입력했는지
  const [broadcaster, setBroadcaster] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [videoDragOver, setVideoDragOver] = useState(false);
  const [subDragOver, setSubDragOver] = useState(false);
  const videoRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);
  const bcStore = useBroadcasterStore();
  const user = useAuthStore((s) => s.user);

  // 마운트 시 최신 방송사 규칙 가져오기
  useEffect(() => {
    bcStore.fetch().then(() => {
      if (!broadcaster && bcStore.names.length > 0) {
        setBroadcaster(bcStore.names[0]);
      }
    });
  }, []);

  /** 영상 파일 선택 시 프로젝트명 자동 생성 */
  const handleVideoSelected = useCallback((file: File) => {
    setVideoFile(file);
    // 사용자가 직접 입력하지 않았으면 자동 생성
    if (!nameManual) {
      const baseName = file.name.replace(/\.[^.]+$/, ""); // 확장자 제거
      const displayName = user?.display_name || user?.username || "작업자";
      setName(`${baseName}_${displayName}`);
    }
  }, [nameManual, user]);

  const rules = bcStore.rules[broadcaster];
  const dm = dark;
  const card = dm ? "bg-gray-900" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const inp = dm ? "bg-gray-800 text-gray-100 border-gray-700" : "bg-white text-gray-800 border-gray-300";
  const inpF = "focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
  const today = new Date().toISOString().split("T")[0];

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

  /** 드래그 앤 드롭 핸들러 생성 */
  const makeDropHandlers = (
    accept: string[],
    onFile: (f: File) => void,
    setDrag: (v: boolean) => void,
  ) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDrag(true); },
    onDragLeave: () => setDrag(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      // 확장자 체크
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const nameLC = file.type.toLowerCase();
      const accepted = accept.some((a) => {
        if (a === "video/*") return nameLC.startsWith("video/");
        return a.replace(".", "").toLowerCase() === ext;
      });
      if (accepted) onFile(file);
    },
  });

  const videoDropHandlers = makeDropHandlers(
    ["video/*"],
    handleVideoSelected,
    setVideoDragOver,
  );

  const subDropHandlers = makeDropHandlers(
    [".srt", ".vtt", ".txt"],
    (f) => setSubtitleFile(f),
    setSubDragOver,
  );

  const dropZoneBase = `w-full border-2 border-dashed rounded-lg py-4 flex flex-col items-center gap-1.5 transition-colors`;
  const dropZoneActive = "border-blue-500 bg-blue-500/10";
  const dropZoneIdle = `${bd} hover:border-blue-500/50`;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className={`${card} rounded-2xl shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto ${tp}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h2 className="text-lg font-black">새 작업 생성</h2>
          <button onClick={onClose} className={`${ts} hover:opacity-60`}><X size={20} /></button>
        </div>
        <div className="px-6 py-4 space-y-5">
          {/* 프로젝트 명칭 */}
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>프로젝트 명칭 <span className="text-red-500">*</span></label>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameManual(true); }}
              placeholder="영상 파일 첨부 시 자동 생성됩니다"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} ${inpF}`}
            />
          </div>

          {/* 방송사 */}
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>방송사 <span className="text-red-500">*</span></label>
            <select value={broadcaster} onChange={(e) => setBroadcaster(e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} ${inpF}`}>
              {bcStore.names.map((bc) => <option key={bc} value={bc}>{bc}</option>)}
            </select>
            {rules && (
              <div className={`mt-1.5 text-[11px] ${ts} ${dm ? "bg-gray-800" : "bg-gray-50"} rounded px-3 py-1.5`}>
                자막 기준: 최대 {rules.max_lines}줄 / 줄당 {rules.max_chars_per_line}자 / 화자 예약 {rules.bracket_chars}자
                <span className={`ml-2 ${dm ? "text-gray-600" : "text-gray-400"}`}>(관리 페이지에서 수정)</span>
              </div>
            )}
          </div>

          {/* 설명 */}
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>설명 / 부제</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 대탈출 더 스토리 / 8회" className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} ${inpF}`} />
          </div>

          {/* 마감일 */}
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>마감일 (선택)</label>
            <input
              type="date"
              value={deadline}
              min={today}
              onChange={(e) => setDeadline(e.target.value)}
              onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
              style={{ colorScheme: dm ? "dark" : "light" }}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} ${inpF} cursor-pointer`}
            />
          </div>

          {/* 영상 파일 — 클릭 + 드래그 앤 드롭 */}
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>영상 파일 <span className="text-red-500">*</span></label>
            <input
              ref={videoRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoSelected(f); }}
            />
            <button
              onClick={() => videoRef.current?.click()}
              className={`${dropZoneBase} ${videoDragOver ? dropZoneActive : dropZoneIdle}`}
              {...videoDropHandlers}
            >
              <Film size={20} className={videoDragOver ? "text-blue-500" : ts} />
              {videoFile
                ? <span className="text-xs text-blue-500 font-medium">{videoFile.name}</span>
                : <span className={`text-xs ${videoDragOver ? "text-blue-500" : ts}`}>클릭하거나 파일을 드래그하여 첨부</span>
              }
            </button>
          </div>

          {/* 자막 파일 — 클릭 + 드래그 앤 드롭 */}
          <div>
            <label className={`block text-xs font-medium ${ts} mb-1.5`}>자막 파일 <span className="text-red-500">*</span> (SRT / VTT)</label>
            <input
              ref={subRef}
              type="file"
              accept=".srt,.vtt,.txt"
              className="hidden"
              onChange={(e) => setSubtitleFile(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => subRef.current?.click()}
              className={`${dropZoneBase} ${subDragOver ? dropZoneActive : dropZoneIdle}`}
              {...subDropHandlers}
            >
              <FileText size={20} className={subDragOver ? "text-blue-500" : ts} />
              {subtitleFile
                ? <span className="text-xs text-blue-500 font-medium">{subtitleFile.name}</span>
                : <span className={`text-xs ${subDragOver ? "text-blue-500" : ts}`}>클릭하거나 파일을 드래그하여 첨부</span>
              }
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