import { useState, useEffect } from "react";
import { FileText, Film, Upload, Settings, Type, Keyboard, RotateCcw, X } from "lucide-react";
import { useParams } from "react-router-dom";
import { projectsApi } from "../../api/projects";
import { useBroadcasterStore } from "../../store/useBroadcasterStore";
import {
  useSettingsStore,
  FIXED_SHORTCUTS,
  CUSTOM_SHORTCUTS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SUBTITLE_DISPLAY,
  eventToKeyString,
} from "../../store/useSettingsStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import type { Project } from "../../types";

type Tab = "project" | "subtitle" | "shortcuts";

interface Props {
  dark: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

export function ProjectSettingsModal({ dark, onClose, isAdmin }: Props) {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const initSubs = useSubtitleStore((s) => s.init);
  const bcStore = useBroadcasterStore();

  const [tab, setTab] = useState<Tab>("project");
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [broadcaster, setBroadcaster] = useState("");
  const [maxLines, setMaxLines] = useState(2);
  const [maxChars, setMaxChars] = useState(18);
  const [minDuration, setMinDuration] = useState(0.5);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // 자막 설정
  const { subtitleDisplay, updateSubtitleDisplay, shortcuts, updateShortcut, saveAll: saveSettings, resetToDefaults } = useSettingsStore();
  const [listFontSize, setListFontSize] = useState(subtitleDisplay.listFontSize);
  const [waveFontSize, setWaveFontSize] = useState(subtitleDisplay.waveFontSize);
  const [editorFontSize, setEditorFontSize] = useState(subtitleDisplay.editorFontSize);
  const [playerFontSize, setPlayerFontSize] = useState(subtitleDisplay.fontSize);
  const [defaultY, setDefaultY] = useState(subtitleDisplay.defaultY);
  const [topY, setTopY] = useState(subtitleDisplay.topY);

  // 단축키
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState("");

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const inp = dm ? "bg-gray-700 text-gray-100 border-gray-600" : "bg-white text-gray-800 border-gray-300";
  const tabActive = "border-blue-500 text-blue-500";
  const tabInactive = `border-transparent ${ts}`;

  useEffect(() => { bcStore.fetch(); }, []);

  useEffect(() => {
    if (!pid) return;
    projectsApi.get(pid).then((p) => {
      setProject(p);
      setName(p.name);
      setBroadcaster(p.broadcaster);
      setMaxLines(p.max_lines);
      setMaxChars(p.max_chars_per_line);
      setMinDuration(((p as any).min_duration_ms || 500) / 1000);
    });
  }, [pid]);

  useEffect(() => {
    setPlayerFontSize(subtitleDisplay.fontSize);
    setListFontSize(subtitleDisplay.listFontSize);
    setWaveFontSize(subtitleDisplay.waveFontSize);
    setEditorFontSize(subtitleDisplay.editorFontSize);
    setDefaultY(subtitleDisplay.defaultY);
    setTopY(subtitleDisplay.topY);
  }, [subtitleDisplay]);

  const handleBroadcasterChange = (bc: string) => {
    setBroadcaster(bc);
    const rules = bcStore.rules[bc];
    if (rules) {
      setMaxLines(rules.max_lines);
      setMaxChars(rules.max_chars_per_line);
      if (rules.min_duration_ms) setMinDuration(rules.min_duration_ms / 1000);
    }
  };

  const handleProjectSave = async () => {
    if (!pid) return;
    setSaving(true);
    try {
      await projectsApi.update(pid, { name, broadcaster });
      await initSubs(pid);
      onClose();  // 변경 성공 시 바로 닫기
    } catch {
      setMsg("변경 실패");
      setTimeout(() => setMsg(""), 2000);
    }
    setSaving(false);
  };

  const handleSubtitleSave = async () => {
    setSaving(true);
    updateSubtitleDisplay({ fontSize: playerFontSize, listFontSize, waveFontSize, editorFontSize, defaultY, topY });
    await saveSettings();
    setMsg("저장 완료!");
    setTimeout(() => setMsg(""), 2000);
    setSaving(false);
  };

  const handleShortcutsSave = async () => {
    setSaving(true);
    await saveSettings();
    setMsg("저장 완료!");
    setTimeout(() => setMsg(""), 2000);
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
      setTimeout(() => setMsg(""), 2000);
    } catch {
      setMsg("자막 업로드 실패");
      setTimeout(() => setMsg(""), 2000);
    }
  };

  const handleVideoUpload = async (file: File) => {
    if (!pid) return;
    try {
      await projectsApi.uploadVideo(pid, file);
      const p = await projectsApi.get(pid);
      setProject(p);
      setMsg("영상 업로드 완료");
      setTimeout(() => setMsg(""), 2000);
    } catch {
      setMsg("영상 업로드 실패");
      setTimeout(() => setMsg(""), 2000);
    }
  };

  // 단축키 녹음 핸들러
  useEffect(() => {
    if (!editingAction) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const keyStr = eventToKeyString(e);
      if (!keyStr) return;
      if (keyStr === "Escape") {
        setEditingAction(null);
        setConflictMsg("");
        return;
      }
      const conflict = updateShortcut(editingAction, keyStr);
      if (conflict) {
        const allActions = [...FIXED_SHORTCUTS, ...CUSTOM_SHORTCUTS];
        const conflictLabel = allActions.find(a => a.id === conflict)?.label || conflict;
        setConflictMsg(`"${conflictLabel}"에서 이미 사용 중입니다`);
        setTimeout(() => setConflictMsg(""), 2000);
      } else {
        setEditingAction(null);
        setConflictMsg("");
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [editingAction, updateShortcut]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className={`${card} rounded-lg shadow-xl w-[560px] max-h-[80vh] flex flex-col ${tp}`} onClick={(e) => e.stopPropagation()}>

        {/* 탭 헤더 */}
        <div className={`flex items-center border-b ${bd} px-5 shrink-0`}>
          {([
            { key: "project" as Tab, label: "작업 설정", icon: Settings },
            { key: "subtitle" as Tab, label: "자막 설정", icon: Type },
            { key: "shortcuts" as Tab, label: "단축키 설정", icon: Keyboard },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${tab === t.key ? tabActive : tabInactive}`}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={onClose} className={`${ts} hover:opacity-60 p-1`} title="닫기">
            <X size={22} />
          </button>
        </div>

        {/* 탭 내용 */}
        <div className="flex-1 overflow-y-auto p-5">
          {msg && (
            <div className={`text-xs px-2 py-1.5 rounded mb-3 ${msg.includes("실패") ? "text-red-500 bg-red-500/10" : "text-emerald-500 bg-emerald-500/10"}`}>
              {msg}
            </div>
          )}

          {/* ═══ 프로젝트 설정 탭 ═══ */}
          {tab === "project" && (
            <div className="space-y-3 text-xs">
              <div>
                <label className={`block ${ts} mb-1`}>작업 이름</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={`w-full border rounded px-2.5 py-2 ${inp}`} />
              </div>

              <div>
                <label className={`block ${ts} mb-1`}>방송사</label>
                <select value={broadcaster} onChange={(e) => handleBroadcasterChange(e.target.value)} className={`w-full border rounded px-2.5 py-2 ${inp}`}>
                  {bcStore.names.map((bc) => {
                    const r = bcStore.rules[bc];
                    return <option key={bc} value={bc}>{bc} 
                    {/* — {r?.max_lines}줄 / {r?.max_chars_per_line}자 */}
                    </option>;
                  })}
                </select>
              </div>

              <div className={`flex gap-4 ${ts}`}>
                <span>줄 수: {maxLines}</span>
                <span>글자 수: {maxChars}</span>
                <span>최소 길이: {minDuration}초</span>
                <span>오버랩: {bcStore.rules[broadcaster]?.allow_overlap ? "허용" : "미허용"}</span>
                <span>화자: {
                  bcStore.rules[broadcaster]?.speaker_mode === "hyphen" ? "하이픈(-)" :
                  bcStore.rules[broadcaster]?.speaker_mode === "hyphen_space" ? "하이픈공백(- )" :
                  "이름표기"
                }</span>
              </div>

              <div>
                <label className={`block ${ts} mb-1 flex items-center gap-1`}><Film size={12} /> 영상 파일</label>
                <div className={`flex items-center border rounded ${inp}`}>
                  <span className={`flex-1 px-2.5 py-2 ${ts} truncate`}>{project?.video_file?.split("/").pop() || "없음"}</span>
                  <label className={`px-3 py-2 border-l ${bd} ${ts} hover:opacity-80 flex items-center gap-1 cursor-pointer`}>
                    <Upload size={12} /> 업로드
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleVideoUpload(f);
                    }} />
                  </label>
                </div>
              </div>
              
              <div>
                <label className={`block ${ts} mb-1 flex items-center gap-1`}><FileText size={12} /> 자막 파일</label>
                <div className={`flex items-center border rounded ${inp}`}>
                  <span className={`flex-1 px-2.5 py-2 ${ts} truncate`}>{project?.subtitle_file || "없음"}</span>
                  <label className={`px-3 py-2 border-l ${bd} ${ts} hover:opacity-80 flex items-center gap-1 cursor-pointer`}>
                    <Upload size={12} /> 업로드
                    <input type="file" accept=".srt,.vtt,.txt,.json" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSubtitleUpload(f);
                    }} />
                  </label>
                </div>
              </div>

              

              <div className="flex gap-2 pt-2">
                <button onClick={onClose} className={`flex-1 border ${bd} py-2 rounded text-xs hover:opacity-80`}>취소</button>
                <button onClick={handleProjectSave} disabled={saving} className="flex-1 bg-blue-600 text-white py-2 rounded text-xs hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "저장 중..." : "변경"}
                </button>
              </div>
            </div>
          )}

          {/* ═══ 자막 설정 탭 ═══ */}
          {tab === "subtitle" && (
            <div className="space-y-5 text-xs">
              <div className={`font-medium ${tp} text-sm`}>글자 크기</div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={ts}>영상 플레이어 자막 크기</label>
                  <span className={`font-mono ${tp}`}>{playerFontSize}px</span>
                </div>
                <input
                  type="range" min={10} max={36} step={1} value={playerFontSize}
                  onChange={(e) => { const v = Number(e.target.value); setPlayerFontSize(v); updateSubtitleDisplay({ fontSize: v }); }}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={ts}>자막 리스트 글자 크기</label>
                  <span className={`font-mono ${tp}`}>{listFontSize}px</span>
                </div>
                <input
                  type="range" min={9} max={18} step={1} value={listFontSize}
                  onChange={(e) => { const v = Number(e.target.value); setListFontSize(v); updateSubtitleDisplay({ listFontSize: v }); }}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={ts}>퀵에디터 글자 크기</label>
                  <span className={`font-mono ${tp}`}>{editorFontSize}px</span>
                </div>
                <input
                  type="range" min={10} max={24} step={1} value={editorFontSize}
                  onChange={(e) => { const v = Number(e.target.value); setEditorFontSize(v); updateSubtitleDisplay({ editorFontSize: v }); }}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={ts}>파형 내 대사 글자 크기</label>
                  <span className={`font-mono ${tp}`}>{waveFontSize}px</span>
                </div>
                <input
                  type="range" min={7} max={14} step={1} value={waveFontSize}
                  onChange={(e) => { const v = Number(e.target.value); setWaveFontSize(v); updateSubtitleDisplay({ waveFontSize: v }); }}
                  className="w-full accent-blue-500"
                />
              </div>

              <div className={`border-t ${bd} pt-4`}>
                <div className={`font-medium ${tp} text-sm mb-3`}>자막 위치</div>

                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className={ts}>기본 위치 (유지)</label>
                    <span className={`font-mono ${tp}`}>{defaultY}%</span>
                  </div>
                  <input
                    type="range" min={50} max={98} step={1} value={defaultY}
                    onChange={(e) => { const v = Number(e.target.value); setDefaultY(v); updateSubtitleDisplay({ defaultY: v }); }}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={ts}>상단 위치 (상단이동)</label>
                    <span className={`font-mono ${tp}`}>{topY}%</span>
                  </div>
                  <input
                    type="range" min={2} max={40} step={1} value={topY}
                    onChange={(e) => { const v = Number(e.target.value); setTopY(v); updateSubtitleDisplay({ topY: v }); }}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setPlayerFontSize(DEFAULT_SUBTITLE_DISPLAY.fontSize);
                    setDefaultY(DEFAULT_SUBTITLE_DISPLAY.defaultY);
                    setTopY(DEFAULT_SUBTITLE_DISPLAY.topY);
                    setListFontSize(DEFAULT_SUBTITLE_DISPLAY.listFontSize);
                    setWaveFontSize(DEFAULT_SUBTITLE_DISPLAY.waveFontSize);
                    setEditorFontSize(DEFAULT_SUBTITLE_DISPLAY.editorFontSize);
                    updateSubtitleDisplay({ ...DEFAULT_SUBTITLE_DISPLAY });
                  }}
                  className={`flex-1 border ${bd} py-2 rounded text-xs hover:opacity-80 flex items-center justify-center gap-1 ${ts}`}
                >
                  <RotateCcw size={11} /> 초기화
                </button>
                <button onClick={handleSubtitleSave} disabled={saving} className="flex-1 bg-blue-600 text-white py-2 rounded text-xs hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          )}

          {/* ═══ 단축키 설정 탭 ═══ */}
          {tab === "shortcuts" && (
            <div className="space-y-4 text-xs">
              {conflictMsg && (
                <div className="text-xs px-2 py-1.5 rounded text-orange-500 bg-orange-500/10">{conflictMsg}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className={`text-sm font-medium ${tp} mb-2`}>기본 단축키</div>
                  <div className={`text-[10px] ${ts} mb-2`}>변경할 수 없습니다</div>
                  <div className={`border ${bd} rounded-lg divide-y ${dm ? "divide-gray-700/50" : "divide-gray-100"}`}>
                    {FIXED_SHORTCUTS.map((action) => {
                      const key = shortcuts[action.id] || DEFAULT_SHORTCUTS[action.id] || "";
                      return (
                        <div key={action.id} className="flex items-center justify-between px-3 py-2">
                          <div>
                            <div className={tp}>{action.label}</div>
                            <div className={`text-[10px] ${ts}`}>{action.description}</div>
                          </div>
                          <code className={`px-2 py-1 rounded text-[10px] ${dm ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                            {key}
                          </code>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className={`text-sm font-medium ${tp} mb-2`}>커스텀 단축키</div>
                  <div className={`text-[10px] ${ts} mb-2`}>클릭 후 키를 눌러 변경</div>
                  <div className={`border ${bd} rounded-lg divide-y ${dm ? "divide-gray-700/50" : "divide-gray-100"} max-h-[400px] overflow-y-auto`}>
                    {CUSTOM_SHORTCUTS.map((action) => {
                      const defaultKey = DEFAULT_SHORTCUTS[action.id] || "";
                      const currentKey = shortcuts[action.id] || defaultKey;
                      const isEditing = editingAction === action.id;
                      const isCustom = currentKey !== defaultKey;

                      return (
                        <div key={action.id} className="flex items-center justify-between px-3 py-2">
                          <div className="min-w-0 flex-1 mr-2">
                            <div className={tp}>{action.label}</div>
                            <div className={`text-[10px] ${ts}`}>{action.description}</div>
                          </div>
                          <button
                            onClick={() => setEditingAction(isEditing ? null : action.id)}
                            className={`px-2 py-1 rounded text-[10px] min-w-[70px] text-center border transition-colors shrink-0 ${
                              isEditing
                                ? "border-blue-500 bg-blue-500/20 text-blue-400 animate-pulse"
                                : isCustom
                                  ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
                                  : `${dm ? "border-gray-600 bg-gray-700 text-gray-400" : "border-gray-200 bg-gray-50 text-gray-500"}`
                            }`}
                          >
                            {isEditing ? "입력..." : currentKey || "—"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={async () => {
                    await resetToDefaults();
                    setMsg("기본값으로 초기화되었습니다");
                    setTimeout(() => setMsg(""), 2000);
                  }}
                  className={`flex-1 border ${bd} py-2 rounded text-xs hover:opacity-80 flex items-center justify-center gap-1 ${ts}`}
                >
                  <RotateCcw size={11} /> 기본값 복원
                </button>
                <button onClick={handleShortcutsSave} disabled={saving} className="flex-1 bg-blue-600 text-white py-2 rounded text-xs hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}