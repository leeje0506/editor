interface Props {
  dark: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  ["Space", "재생/정지"],
  ["↑/↓", "이전/다음 자막"],
  ["Ctrl+Z", "되돌리기"],
  ["Ctrl+S", "임시저장"],
  ["Ctrl+F", "검색"],
  ["Delete", "삭제"],
  ["더블클릭", "자막 선택"],
  ["Shift+더블클릭", "범위선택"],
  ["Ctrl+더블클릭", "다중선택"],
  ["Ctrl+마우스휠", "타임라인 확대/축소"],
  ["마우스휠", "타임라인 좌우이동"],
  ["Shift+마우스휠", "자막 이동 (텍스트)"],
];

export function ShortcutsModal({ dark, onClose }: Props) {
  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className={`${card} rounded-lg shadow-xl p-5 w-80 ${tp}`} onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-sm mb-3">단축키 안내</h3>
        <div className="space-y-1.5 text-xs">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <code className={`${dm ? "bg-gray-700" : "bg-gray-100"} px-1.5 py-0.5 rounded text-[10px] shrink-0`}>{k}</code>
              <span className={`${ts} text-right`}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-3 w-full bg-blue-600 text-white py-1.5 rounded text-xs hover:bg-blue-700">
          닫기
        </button>
      </div>
    </div>
  );
}