import { useState, useEffect } from "react";
import { RotateCcw, Keyboard } from "lucide-react";
import { useSettingsStore, SHORTCUT_ACTIONS, DEFAULT_SHORTCUTS } from "../../../store/useSettingsStore";
import { eventToKeyString } from "../../../hooks/useKeyboardShortcuts";

export function ShortcutsTab() {
  const card = "bg-gray-800";
  const tp = "text-gray-100";
  const ts = "text-gray-400";
  const bd = "border-gray-700";
  const inputBg = "bg-gray-700 text-gray-100";

  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const updateShortcut = useSettingsStore((s) => s.updateShortcut);
  const saveAll = useSettingsStore((s) => s.saveAll);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState("");
  const [conflictMsg, setConflictMsg] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  // 키 감지 리스너
  useEffect(() => {
    if (!editingId) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const keyStr = eventToKeyString(e);
      if (!keyStr) return;

      if (e.key === "Escape") {
        setEditingId(null);
        setPendingKey("");
        setConflictMsg("");
        return;
      }

      setPendingKey(keyStr);

      const conflict = updateShortcut(editingId, keyStr);
      if (conflict) {
        const conflictAction = SHORTCUT_ACTIONS.find((a) => a.id === conflict);
        setConflictMsg(`"${conflictAction?.label || conflict}"에서 이미 사용 중`);
        const prevKey = shortcuts[editingId] || DEFAULT_SHORTCUTS[editingId];
        updateShortcut(editingId, prevKey);
      } else {
        setConflictMsg("");
        setEditingId(null);
        setPendingKey("");
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [editingId, shortcuts, updateShortcut]);

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
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className={`text-lg font-bold ${tp}`}>단축키 설정</h2>
          <p className={`text-xs ${ts} mt-1`}>편집기에서 사용할 단축키를 개인별로 설정할 수 있습니다.</p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span className="text-xs text-emerald-500 font-medium">{saveMsg}</span>
          )}
          <button
            onClick={handleReset}
            className={`flex items-center gap-1 border ${bd} ${ts} px-2.5 py-1.5 rounded text-xs hover:opacity-80`}
          >
            <RotateCcw size={12} /> 기본값 초기화
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-700"
          >
            저장
          </button>
        </div>
      </div>

      <div className={`rounded-lg border ${bd} overflow-hidden`}>
        <table className={`w-full text-sm ${ts}`}>
          <thead>
            <tr className={`bg-gray-750 border-b ${bd}`}>
              <th className="text-left px-4 py-2.5 font-medium w-44">액션</th>
              <th className="text-left px-4 py-2.5 font-medium">설명</th>
              <th className="text-center px-4 py-2.5 font-medium w-48">단축키</th>
              <th className="text-center px-4 py-2.5 font-medium w-20">변경</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {SHORTCUT_ACTIONS.map((action) => {
              const currentKey = shortcuts[action.id] || DEFAULT_SHORTCUTS[action.id];
              const isEditing = editingId === action.id;
              const isDefault = currentKey === DEFAULT_SHORTCUTS[action.id];

              return (
                <tr key={action.id} className={`${card} ${isEditing ? "bg-blue-900/20" : ""}`}>
                  <td className={`px-4 py-3 font-medium ${tp}`}>{action.label}</td>
                  <td className={`px-4 py-3 text-xs ${ts}`}>{action.description}</td>
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border-2 border-blue-500 ${inputBg} text-xs font-mono animate-pulse`}>
                          <Keyboard size={12} />
                          {pendingKey || "키 입력 대기 중..."}
                        </div>
                        {conflictMsg && (
                          <span className="text-[10px] text-red-500 font-medium">{conflictMsg}</span>
                        )}
                        <span className="text-[10px] text-gray-500">Esc로 취소</span>
                      </div>
                    ) : (
                      <span className={`inline-block px-2.5 py-1 rounded text-xs font-mono ${
                        isDefault
                          ? "bg-gray-700 text-gray-300"
                          : "bg-blue-500/10 text-blue-500 font-bold"
                      }`}>
                        {formatKeyDisplay(currentKey)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <button
                        onClick={() => { setEditingId(null); setPendingKey(""); setConflictMsg(""); }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        취소
                      </button>
                    ) : (
                      <button
                        onClick={() => { setEditingId(action.id); setPendingKey(""); setConflictMsg(""); }}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        변경
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 단축키 표시용 포맷 */
function formatKeyDisplay(key: string): string {
  return key
    .replace("ArrowUp", "↑")
    .replace("ArrowDown", "↓")
    .replace("ArrowLeft", "←")
    .replace("ArrowRight", "→")
    .replace("Space", "스페이스")
    .replace("Delete", "Del")
    .replace("Escape", "Esc")
    .replace("Enter", "Enter");
}