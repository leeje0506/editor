import { useState, useRef, useEffect, useCallback } from "react";
import { X, Film, FileText, Monitor, Loader2, Shield, AlertTriangle } from "lucide-react";
import { projectsApi } from "../../api/projects";
import { permissionsApi } from "../../api/permissions";
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
  const [nameManual, setNameManual] = useState(false);
  const [broadcaster, setBroadcaster] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [videoDragOver, setVideoDragOver] = useState(false);
  const [subDragOver, setSubDragOver] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const videoRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);
  const bcStore = useBroadcasterStore();
  const user = useAuthStore((s) => s.user);

  // 권한 관련
  const [myPerms, setMyPerms] = useState<string[]>([]);
  const [permLoaded, setPermLoaded] = useState(false);
  const [requestingPerm, setRequestingPerm] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [requestMsg, setRequestMsg] = useState("");

  const isAdminUser = user?.role === "master" || user?.role === "manager";

  useEffect(() => {
    bcStore.fetch().then(() => {
      if (!broadcaster && bcStore.names.length > 0) {
        setBroadcaster(bcStore.names[0]);
      }
    });
    // 내 권한 로드
    permissionsApi.getMyPermissions().then(perms => {
      setMyPerms(perms);
      setPermLoaded(true);
    }).catch(() => setPermLoaded(true));
  }, []);

  const hasBroadcasterPerm = isAdminUser || myPerms.includes(broadcaster);

  const autoSetName = useCallback((fileName: string, mode: "video" | "subtitle") => {
    if (nameManual) return;
    const withoutExt = fileName.replace(/\.[^.]+$/, "");
    const displayName = user?.display_name || user?.username || "작업자";

    if (mode === "subtitle") {
      const lastUnderscore = withoutExt.lastIndexOf("_");
      const baseName = lastUnderscore > 0 ? withoutExt.slice(0, lastUnderscore) : withoutExt;
      setName(`${baseName}_${displayName}`);
    } else {
      setName(`${withoutExt}_${displayName}`);
    }
  }, [nameManual, user]);

  const handleVideoSelected = useCallback((file: File) => {
    setVideoFile(file);
    autoSetName(file.name, "video");
  }, [autoSetName]);

  const handleSubtitleSelected = useCallback((file: File) => {
    setSubtitleFile(file);
    if (!videoFile) {
      autoSetName(file.name, "subtitle");
    }
  }, [autoSetName, videoFile]);

  const rules = bcStore.rules[broadcaster];
  const dm = dark;
  const card = dm ? "bg-gray-900" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const inp = dm ? "bg-gray-800 text-gray-100 border-gray-700" : "bg-white text-gray-800 border-gray-300";
  const inpF = "focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
  const today = new Date().toISOString().split("T")[0];

  const getSubtitleImportType = (file: File): "srt" | "json" => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    return ext === "json" ? "json" : "srt";
  };

  const handleRequestPerm = async () => {
    if (!broadcaster) return;
    setRequestingPerm(true);
    try {
      await permissionsApi.createRequest(broadcaster, requestReason || undefined);
      setRequestMsg("권한 요청 완료! 관리자 승인을 기다려주세요.");
      setRequestReason("");
      setTimeout(() => setRequestMsg(""), 4000);
    } catch (e: any) {
      setRequestMsg(e?.response?.data?.detail || "요청 실패");
      setTimeout(() => setRequestMsg(""), 3000);
    } finally {
      setRequestingPerm(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError("프로젝트 명칭을 입력해주세요."); return; }
    if (!hasBroadcasterPerm) { setError(`'${broadcaster}' 방송사 작업 권한이 없습니다.`); return; }
    setCreating(true);
    setError("");

    const hasFiles = !!(videoFile || subtitleFile);
    if (hasFiles) setShowUploadModal(true);

    try {
      setProgress("프로젝트 생성 중...");
      const project = await projectsApi.create({
        name: name.trim(), broadcaster, description: description || undefined, deadline: deadline || undefined,
      });

      if (subtitleFile) {
        const importType = getSubtitleImportType(subtitleFile);
        if (importType === "json") {
          setProgress("JSON 파일 처리 중...");
          await projectsApi.uploadJson(project.id, subtitleFile);
        } else {
          setProgress("자막 파일 처리 중...");
          await projectsApi.uploadSubtitle(project.id, subtitleFile);
        }
      }

      if (videoFile) {
        setProgress("영상 업로드 중...");
        await projectsApi.uploadVideo(project.id, videoFile);
      }

      setProgress("워크스페이스 열기...");
      const updated = await projectsApi.get(project.id);

      setShowUploadModal(false);
      onCreate(updated);
    } catch (e: any) {
      setShowUploadModal(false);
      setError(e?.response?.data?.detail || "생성에 실패했습니다.");
    } finally {
      setCreating(false);
      setProgress("");
    }
  };

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
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const nameLC = file.type.toLowerCase();
      const accepted = accept.some((a) => {
        if (a === "video/*") return nameLC.startsWith("video/");
        return a.replace(".", "").toLowerCase() === ext;
      });
      if (accepted) onFile(file);
    },
  });

  const videoDropHandlers = makeDropHandlers(["video/*"], handleVideoSelected, setVideoDragOver);
  const subDropHandlers = makeDropHandlers([".srt", ".vtt", ".txt", ".json"], handleSubtitleSelected, setSubDragOver);

  const dropZoneBase = `w-full border-2 border-dashed rounded-lg py-4 flex flex-col items-center gap-1.5 transition-colors`;
  const dropZoneActive = "border-blue-500 bg-blue-500/10";
  const dropZoneIdle = `${bd} hover:border-blue-500/50`;

  const subFileLabel = subtitleFile
    ? `${subtitleFile.name}${getSubtitleImportType(subtitleFile) === "json" ? " (JSON 모드)" : ""}`
    : null;

  return (
    <>
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
              <select value={broadcaster} onChange={(e) => { setBroadcaster(e.target.value); setRequestMsg(""); }} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} ${inpF}`}>
                {bcStore.names.map((bc) => (
                  <option key={bc} value={bc}>
                    {bc}{!isAdminUser && myPerms.includes(bc) ? " ✓" : ""}
                  </option>
                ))}
              </select>
              {rules && (
                <div className={`mt-1.5 text-[11px] ${ts} ${dm ? "bg-gray-800" : "bg-gray-50"} rounded px-3 py-1.5`}>
                  자막 기준: 최대 {rules.max_lines}줄 / 줄당 {rules.max_chars_per_line}자
                  <span className={`ml-2 ${dm ? "text-gray-600" : "text-gray-400"}`}>(관리 페이지에서 수정)</span>
                </div>
              )}

              {/* 권한 없음 경고 + 요청 UI */}
              {permLoaded && !hasBroadcasterPerm && broadcaster && (
                <div className={`mt-2 rounded-lg p-3 ${dm ? "bg-orange-500/5 border border-orange-500/15" : "bg-orange-50 border border-orange-200"}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={13} className="text-orange-400" />
                    <span className="text-xs font-medium text-orange-400">'{broadcaster}' 방송사 작업 권한이 없습니다</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={requestReason}
                      onChange={(e) => setRequestReason(e.target.value)}
                      placeholder="사유 (선택)"
                      className={`flex-1 border rounded px-2 py-1.5 text-xs outline-none ${inp} focus:border-blue-500`}
                    />
                    <button
                      onClick={handleRequestPerm}
                      disabled={requestingPerm}
                      className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 shrink-0"
                    >
                      <Shield size={11} /> 권한 요청
                    </button>
                  </div>
                  {requestMsg && (
                    <div className={`mt-1.5 text-[11px] ${requestMsg.includes("실패") || requestMsg.includes("이미") ? "text-red-400" : "text-emerald-400"}`}>
                      {requestMsg}
                    </div>
                  )}
                </div>
              )}

              {/* 권한 있음 표시 */}
              {permLoaded && hasBroadcasterPerm && broadcaster && !isAdminUser && (
                <div className="mt-1.5 flex items-center gap-1">
                  <Shield size={11} className="text-green-400" />
                  <span className="text-[11px] text-green-400">권한 보유</span>
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

            {/* 영상 파일 (선택) */}
            <div>
              <label className={`block text-xs font-medium ${ts} mb-1.5`}>영상 파일 <span className={`text-xs font-normal ${ts}`}>(선택)</span></label>
              <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoSelected(f); }} />
              <button onClick={() => videoRef.current?.click()} className={`${dropZoneBase} ${videoDragOver ? dropZoneActive : dropZoneIdle}`} {...videoDropHandlers}>
                <Film size={20} className={videoDragOver ? "text-blue-500" : ts} />
                {videoFile
                  ? <span className="text-xs text-blue-500 font-medium">{videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)}MB)</span>
                  : <span className={`text-xs ${videoDragOver ? "text-blue-500" : ts}`}>클릭하거나 파일을 드래그하여 첨부</span>
                }
              </button>
            </div>

            {/* 자막 파일 (선택) */}
            <div>
              <label className={`block text-xs font-medium ${ts} mb-1.5`}>자막 파일 <span className={`text-xs font-normal ${ts}`}>(선택 — SRT / VTT / JSON)</span></label>
              <input ref={subRef} type="file" accept=".srt,.vtt,.txt,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSubtitleSelected(f); }} />
              <button onClick={() => subRef.current?.click()} className={`${dropZoneBase} ${subDragOver ? dropZoneActive : dropZoneIdle}`} {...subDropHandlers}>
                <FileText size={20} className={subDragOver ? "text-blue-500" : ts} />
                {subFileLabel
                  ? <span className="text-xs text-blue-500 font-medium">{subFileLabel}</span>
                  : <span className={`text-xs ${subDragOver ? "text-blue-500" : ts}`}>클릭하거나 파일을 드래그하여 첨부</span>
                }
              </button>
            </div>

            {error && <div className="text-red-500 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
            {progress && !showUploadModal && <div className="text-blue-500 text-xs bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 animate-pulse">{progress}</div>}
          </div>
          <div className={`px-6 py-4 border-t ${bd} flex items-center justify-end gap-3`}>
            <button onClick={onClose} className={`px-4 py-2 text-sm ${ts} hover:opacity-80`}>취소</button>
            <button
              onClick={handleCreate}
              disabled={creating || (!hasBroadcasterPerm && permLoaded)}
              className={`${!hasBroadcasterPerm && permLoaded ? "bg-gray-600 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2`}
            >
              <Monitor size={16} />{creating ? "생성 중..." : !hasBroadcasterPerm && permLoaded ? "권한 없음" : "워크스페이스 생성"}
            </button>
          </div>
        </div>
      </div>

      {/* 업로드 중 안내 모달 */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center">
          <div className={`${card} rounded-2xl shadow-2xl w-[360px] px-8 py-8 flex flex-col items-center gap-5 ${tp}`}>
            <Loader2 size={36} className="text-blue-500 animate-spin" />
            <div className="text-center">
              <h3 className="text-base font-bold mb-1">파일 업로드 중</h3>
              <p className={`text-xs ${ts}`}>잠시만 기다려주세요. 창을 닫지 마세요.</p>
            </div>
            <div className="text-blue-500 text-xs font-medium bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2 w-full text-center animate-pulse">
              {progress || "처리 중..."}
            </div>
          </div>
        </div>
      )}
    </>
  );
}