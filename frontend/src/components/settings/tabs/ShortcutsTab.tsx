import { useState, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import {
  useSettingsStore,
  FIXED_SHORTCUTS,
  CUSTOM_SHORTCUTS,
  DEFAULT_SHORTCUTS,
} from "../../../store/useSettingsStore";
import { eventToKeyString } from "../../../hooks/useKeyboardShortcuts";

interface Props {
  dark?: boolean;
}

export function ShortcutsTab({ dark = true }: Props) {
  const dm = dark;
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const divider = dm ? "divide-gray-700/50" : "divide-gray-100";
  const keyBg = dm ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600";
  const keyCustom = "border-yellow-500/50 bg-yellow-500/10 text-yellow-400";
  const keyEditing = "border-blue-500 bg-blue-500/20 text-blue-400 animate-pulse";
  const keyDefault = dm ? "border-gray-600 bg-gray-700 text-gray-400" : "border-gray-200 bg-gray-50 text-gray-500";

  const { shortcuts, updateShortcut, saveAll, resetToDefaults } = useSettingsStore();

  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

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
      if (conflict === "__blocked__") {
        setConflictMsg("이 키는 사용할 수 없습니다");
        setTimeout(() => setConflictMsg(""), 2000);
      } else if (conflict) {
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

  const handleSave = async () => {
    await saveAll();
    setSaveMsg("저장 완료!");
    setTimeout(() => setSaveMsg(""), 2000);
  };

  const handleReset = async () => {
    if (!confirm("모든 단축키를 기본값으로 초기화하시겠습니까?")) return;
    await resetToDefaults();
    setSaveMsg("기본값으로 초기화됨");
    setTimeout(() => setSaveMsg(""), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className={`text-lg font-bold ${tp}`}>단축키 설정</h2>
          <p className={`text-xs ${ts} mt-1`}>편집기에서 사용할 단축키를 개인별로 설정할 수 있습니다.</p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && <span className="text-xs text-emerald-500 font-medium">{saveMsg}</span>}
          <button onClick={handleReset} className={`flex items-center gap-1 border ${bd} ${ts} px-2.5 py-1.5 rounded-lg text-xs hover:opacity-80`}>
            <RotateCcw size={12} /> 기본값 초기화
          </button>
          <button onClick={handleSave} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700">
            저장
          </button>
        </div>
      </div>

      {conflictMsg && (
        <div className="text-xs px-3 py-2 rounded-lg text-orange-500 bg-orange-500/10 mb-4">{conflictMsg}</div>
      )}

      <div className="grid grid-cols-2 gap-5">
        {/* 기본 단축키 */}
        <div>
          <div className={`text-sm font-bold ${tp} mb-1.5`}>기본 단축키</div>
          <div className={`text-[11px] ${ts} mb-3`}>변경할 수 없습니다</div>
          <div className={`border ${bd} rounded-xl divide-y ${divider}`}>
            {FIXED_SHORTCUTS.map(action => {
              const key = shortcuts[action.id] || DEFAULT_SHORTCUTS[action.id] || "";
              return (
                <div key={action.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className={`text-sm font-medium ${tp}`}>{action.label}</div>
                    <div className={`text-[11px] ${ts}`}>{action.description}</div>
                  </div>
                  <code className={`px-2.5 py-1 rounded text-xs font-mono ${keyBg}`}>{key}</code>
                </div>
              );
            })}
          </div>
        </div>

        {/* 커스텀 단축키 */}
        <div>
          <div className={`text-sm font-bold ${tp} mb-1.5`}>커스텀 단축키</div>
          <div className={`text-[11px] ${ts} mb-3`}>클릭 후 키를 눌러 변경</div>
          <div className={`border ${bd} rounded-xl divide-y ${divider} max-h-[480px] overflow-y-auto`}>
            {CUSTOM_SHORTCUTS.map(action => {
              const defaultKey = DEFAULT_SHORTCUTS[action.id] || "";
              const currentKey = shortcuts[action.id] || defaultKey;
              const isEditing = editingAction === action.id;
              const isCustom = currentKey !== defaultKey;

              return (
                <div key={action.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1 mr-3">
                    <div className={`text-sm font-medium ${tp}`}>{action.label}</div>
                    <div className={`text-[11px] ${ts}`}>{action.description}</div>
                  </div>
                  <button
                    onClick={() => setEditingAction(isEditing ? null : action.id)}
                    className={`px-2.5 py-1 rounded text-xs font-mono min-w-[80px] text-center border transition-colors shrink-0 ${
                      isEditing ? keyEditing : isCustom ? keyCustom : keyBg + " border-transparent"
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
    </div>
  );
}