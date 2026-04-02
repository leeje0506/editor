import { useState, useEffect } from "react";
import { FileText, Film, Upload } from "lucide-react";
import { useParams } from "react-router-dom";
import { projectsApi } from "../../api/projects";
import { useBroadcasterStore } from "../../store/useBroadcasterStore";
import type { Project } from "../../types";
import { useSubtitleStore } from "../../store/useSubtitleStore";

interface Props {
  dark: boolean;
  onClose: () => void;
  /** master/manager만 true. worker는 줄 수/글자 수 수정 불가 */
  isAdmin?: boolean;
}

export function ProjectSettingsModal({ dark, onClose, isAdmin }: Props) {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const initSubs = useSubtitleStore((s) => s.init);
  const bcStore = useBroadcasterStore();

  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [broadcaster, setBroadcaster] = useState("");
  const [maxLines, setMaxLines] = useState(2);
  const [maxChars, setMaxChars] = useState(18);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    bcStore.fetch();
  }, []);

  useEffect(() => {
    if (!pid) return;
    projectsApi.get(pid).then((p) => {
      setProject(p);
      setName(p.name);
      setBroadcaster(p.broadcaster);
      setMaxLines(p.max_lines);
      setMaxChars(p.max_chars_per_line);
    });
  }, [pid]);

  const handleBroadcasterChange = (bc: string) => {
    setBroadcaster(bc);
    const rules = bcStore.rules[bc];
    if (rules) {
      setMaxLines(rules.max_lines);
      setMaxChars(rules.max_chars_per_line);
    }
  };

  const handleSave = async () => {
    if (!pid) return;
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = { name, broadcaster };
      // admin만 줄 수/글자 수 변경 가능
      if (isAdmin) {
        updateData.max_lines = maxLines;
        updateData.max_chars_per_line = maxChars;
      }
      await projectsApi.update(pid, updateData);
      // 검수 기준 변경되었으므로 자막 다시 로드
      await initSubs(pid);
      setMsg("저장 완료!");
      setTimeout(() => onClose(), 500);
    } catch {
      setMsg("저장 실패");
    }
    setSaving(false);
  };

  const handleSubtitleUpload = async (file: File) => {
    if (!pid) return;
    try {
      await projectsApi.uploadSubtitle(pid, file);
      await initSubs(pid);
      const p = await projectsApi.get(pid);
      setProject(p);
      setMsg(`${file.name} 로드 완료`);
    } catch {
      setMsg("자막 업로드 실패");
    }
  };

  const handleVideoUpload = async (file: File) => {
    if (!pid) return;
    try {
      await projectsApi.uploadVideo(pid, file);
      const p = await projectsApi.get(pid);
      setProject(p);
      setMsg("영상 업로드 완료");
    } catch {
      setMsg("영상 업로드 실패");
    }
  };

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const inp = dm ? "bg-gray-700 text-gray-100 border-gray-600" : "bg-white text-gray-800 border-gray-300";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className={`${card} rounded-lg shadow-xl p-5 w-[440px] ${tp}`} onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-sm mb-4">프로젝트 설정</h3>

        <div className="space-y-3 text-xs">
          {/* 프로젝트 이름 */}
          <div>
            <label className={`block ${ts} mb-1`}>프로젝트 이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`w-full border rounded px-2.5 py-2 ${inp}`} />
          </div>

          {/* 방송사 — DB 연동 */}
          <div>
            <label className={`block ${ts} mb-1`}>방송사</label>
            <select value={broadcaster} onChange={(e) => handleBroadcasterChange(e.target.value)} className={`w-full border rounded px-2.5 py-2 ${inp}`}>
              {bcStore.names.map((bc) => {
                const r = bcStore.rules[bc];
                return (
                  <option key={bc} value={bc}>
                    {bc} — {r?.max_lines}줄 / {r?.max_chars_per_line}자
                  </option>
                );
              })}
            </select>
          </div>

          {/* 자막 기준 — admin만 표시 */}
          {isAdmin && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={`block ${ts} mb-1`}>최대 줄 수</label>
                <input type="number" value={maxLines} onChange={(e) => setMaxLines(Number(e.target.value))} className={`w-full border rounded px-2.5 py-2 ${inp}`} />
              </div>
              <div className="flex-1">
                <label className={`block ${ts} mb-1`}>줄당 최대 글자</label>
                <input type="number" value={maxChars} onChange={(e) => setMaxChars(Number(e.target.value))} className={`w-full border rounded px-2.5 py-2 ${inp}`} />
              </div>
            </div>
          )}

          {/* 자막 파일 */}
          <div>
            <label className={`block ${ts} mb-1 flex items-center gap-1`}><FileText size={12} /> 자막 파일</label>
            <div className={`flex items-center border rounded ${inp}`}>
              <span className={`flex-1 px-2.5 py-2 ${ts} truncate`}>{project?.subtitle_file || "없음"}</span>
              <label className={`px-3 py-2 border-l ${bd} ${ts} hover:opacity-80 flex items-center gap-1 cursor-pointer`}>
                <Upload size={12} /> 변경
                <input type="file" accept=".srt,.vtt,.txt" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSubtitleUpload(f);
                }} />
              </label>
            </div>
          </div>

          {/* 영상 파일 */}
          <div>
            <label className={`block ${ts} mb-1 flex items-center gap-1`}><Film size={12} /> 영상 파일</label>
            <div className={`flex items-center border rounded ${inp}`}>
              <span className={`flex-1 px-2.5 py-2 ${ts} truncate`}>{project?.video_file?.split("/").pop() || "없음"}</span>
              <label className={`px-3 py-2 border-l ${bd} ${ts} hover:opacity-80 flex items-center gap-1 cursor-pointer`}>
                <Upload size={12} /> 변경
                <input type="file" accept="video/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleVideoUpload(f);
                }} />
              </label>
            </div>
          </div>

          {msg && <div className={`text-xs px-2 py-1.5 rounded ${msg.includes("실패") ? "text-red-500 bg-red-500/10" : "text-emerald-500 bg-emerald-500/10"}`}>{msg}</div>}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className={`flex-1 border ${bd} py-2 rounded text-xs hover:opacity-80`}>취소</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 text-white py-2 rounded text-xs hover:bg-blue-700 disabled:opacity-50">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}