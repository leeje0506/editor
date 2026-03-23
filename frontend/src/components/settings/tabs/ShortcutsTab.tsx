import { useState } from "react";
import { Keyboard } from "lucide-react";

interface Shortcut {
  action: string;
  label: string;
  key: string;
}

const CUSTOM_SHORTCUTS: Shortcut[] = [
  { action: "play_pause", label: "재생 / 일시정지", key: "Space" },
  { action: "set_start", label: "선택 싱크 시작점을 현재시간으로", key: "F9" },
  { action: "set_end", label: "선택 싱크 종료점을 현재시간으로", key: "F10" },
  { action: "add_sync", label: "현재 위치에 새 싱크 추가", key: "Alt+I" },
  { action: "snap_prev", label: "앞 싱크 시간에 맞춰 붙이기", key: "Alt+[" },
  { action: "snap_next", label: "뒤 싱크 시간에 맞춰 붙이기", key: "Alt+]" },
  { action: "split", label: "현재 싱크 분할", key: "Ctrl+Enter" },
];

const FIXED_SHORTCUTS = [
  { label: "Ctrl+Z 실행 취소 (Undo)" },
  { label: "Ctrl+Shift+Z 다시 실행 (Redo)" },
  { label: "Ctrl+F 텍스트 검색" },
  { label: "Ctrl+H 텍스트 검색·치환" },
  { label: "↑ / ↓ 이전/다음 싱크로 이동" },
  { label: "Enter 텍스트 입력창 포커스" },
];

export function ShortcutsTab() {
  const [shortcuts, setShortcuts] = useState(CUSTOM_SHORTCUTS);
  const [capturing, setCapturing] = useState<string | null>(null);

  const bd = "border-gray-800";
  const card = "bg-gray-900";
  const ts = "text-gray-400";

  const handleKeyCapture = (action: string) => {
    setCapturing(action);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Cmd");
      const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) parts.push(key);
      const combo = parts.join("+");
      setShortcuts(prev => prev.map(s => s.action === action ? { ...s, key: combo } : s));
      setCapturing(null);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("keydown", handler);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-2">
        <Keyboard size={20} className="text-blue-400" />
        <h2 className="text-lg font-bold">커스텀 단축키 설정</h2>
      </div>
      <p className={`text-xs ${ts} mb-6`}>버튼을 클릭한 뒤 원하는 키 조합을 누르면 등록됩니다.</p>

      {/* Custom shortcuts grid */}
      <div className={`${card} border ${bd} rounded-xl p-6 mb-8`}>
        <div className="grid grid-cols-3 gap-3">
          {shortcuts.map(s => (
            <div key={s.action} className={`border ${bd} rounded-lg px-4 py-3.5 flex items-center justify-between`}>
              <span className="text-sm">{s.label}</span>
              <button
                onClick={() => handleKeyCapture(s.action)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold min-w-[80px] text-center ${
                  capturing === s.action
                    ? "bg-blue-600 text-white animate-pulse"
                    : "bg-gray-800 border border-gray-700 text-gray-200 hover:border-gray-500"
                }`}
              >
                {capturing === s.action ? "입력 대기..." : s.key}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Fixed shortcuts */}
      <div>
        <h3 className={`text-xs ${ts} mb-3`}>고정 단축키 (변경 불가)</h3>
        <div className="flex flex-wrap gap-2">
          {FIXED_SHORTCUTS.map(s => (
            <div key={s.label} className={`border ${bd} rounded-lg px-4 py-2 text-xs ${ts}`}>
              {s.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}