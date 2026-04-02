import { X } from "lucide-react";
import { useSettingsStore, DEFAULT_SUBTITLE_DISPLAY } from "../../store/useSettingsStore";

interface Props {
  dark: boolean;
  onClose: () => void;
}

export function SubtitleDisplayPanel({ dark, onClose }: Props) {
  const { subtitleDisplay, updateSubtitleDisplay, saveAll } = useSettingsStore();
  const { fontSize, defaultY, topY } = subtitleDisplay;

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";

  const handleReset = () => {
    updateSubtitleDisplay({ ...DEFAULT_SUBTITLE_DISPLAY });
  };

  const handleSave = async () => {
    await saveAll();
    onClose();
  };

  return (
    <div className={`absolute top-0 right-0 z-40 ${card} border ${bd} rounded-lg shadow-2xl p-4 w-64`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-bold ${tp}`}>자막 표시 설정</span>
        <button onClick={onClose} className={`${ts} hover:opacity-60`}><X size={14} /></button>
      </div>

      <div className="space-y-4 text-xs">
        {/* 글자 크기 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={ts}>글자 크기</label>
            <span className={`font-mono ${tp}`}>{fontSize}px</span>
          </div>
          <input
            type="range" min={10} max={36} step={1} value={fontSize}
            onChange={(e) => updateSubtitleDisplay({ fontSize: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
        </div>

        {/* 기본 위치 (유지) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={ts}>기본 위치 (유지)</label>
            <span className={`font-mono ${tp}`}>{defaultY}%</span>
          </div>
          <input
            type="range" min={50} max={98} step={1} value={defaultY}
            onChange={(e) => updateSubtitleDisplay({ defaultY: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
        </div>

        {/* 상단 위치 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={ts}>상단 위치 (상단이동)</label>
            <span className={`font-mono ${tp}`}>{topY}%</span>
          </div>
          <input
            type="range" min={2} max={40} step={1} value={topY}
            onChange={(e) => updateSubtitleDisplay({ topY: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={handleReset} className={`flex-1 text-xs border ${bd} py-1.5 rounded hover:opacity-80 ${ts}`}>
          초기화
        </button>
        <button onClick={handleSave} className="flex-1 text-xs bg-blue-600 text-white py-1.5 rounded hover:bg-blue-700">
          저장
        </button>
      </div>
    </div>
  );
}