import { useState } from "react";
import { Plus, Users, Scissors, Trash2, Merge, Keyboard } from "lucide-react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { BulkSpeakerModal } from "../modals/BulkSpeakerModal";
import { ShortcutsModal } from "../modals/ShortcutsModal";

interface Props {
  dark: boolean;
  filteredCount: number;
  totalCount: number;
  readOnly?: boolean;
}

export function GridToolbar({ dark, filteredCount, totalCount, readOnly }: Props) {
  const [showBulk, setShowBulk] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const { selectedId, multiSelect, subtitles, addAfter, deleteSelected, splitSelected, mergeSelected } =
    useSubtitleStore();

  const dm = dark;
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const bdl = dm ? "border-gray-700" : "border-gray-100";

  return (
    <>
      <div className={`h-9 px-3 flex items-center justify-between border-b ${bdl}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${tp}`}>
            자막 리스트{" "}
            <span className={`${ts} font-normal`}>
              (Total: {filteredCount} / {totalCount})
            </span>
          </span>
          <button
            onClick={() => setShowKeys(true)}
            className={`flex items-center gap-0.5 border ${bd} ${dm ? "bg-gray-700" : "bg-gray-50"} ${ts} px-1.5 py-0.5 rounded text-[9px]`}
          >
            <Keyboard size={10} /> 단축키 안내
          </button>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1">
            <button onClick={() => addAfter()} className="flex items-center gap-0.5 text-emerald-600 border border-emerald-200 bg-emerald-50 px-2 py-1 rounded text-[10px] font-medium hover:bg-emerald-100">
              <Plus size={12} /> 싱크 추가
            </button>
            <button onClick={() => setShowBulk(true)} className="flex items-center gap-0.5 text-purple-600 border border-purple-200 bg-purple-50 px-2 py-1 rounded text-[10px] font-medium hover:bg-purple-100">
              <Users size={12} /> 화자 일괄변경
            </button>
            <button onClick={() => splitSelected()} className={`flex items-center gap-0.5 border ${bd} ${dm ? "bg-gray-800" : "bg-white"} ${ts} px-2 py-1 rounded text-[10px] font-medium hover:opacity-80`}>
              <Scissors size={12} /> 분할
            </button>
            {multiSelect.size >= 2 && (
              <button onClick={() => mergeSelected()} className="flex items-center gap-0.5 text-orange-600 border border-orange-200 bg-orange-50 px-2 py-1 rounded text-[10px] font-medium hover:bg-orange-100">
                <Merge size={12} /> 병합
              </button>
            )}
            <button onClick={() => deleteSelected()} className="flex items-center gap-0.5 text-red-600 border border-red-200 bg-red-50 px-2 py-1 rounded text-[10px] font-medium hover:bg-red-100">
              <Trash2 size={12} /> 삭제
            </button>
          </div>
        )}

        {readOnly && (
          <span className={`text-[10px] ${ts}`}>검수 모드 — 편집 불가</span>
        )}
      </div>

      {showBulk && !readOnly && <BulkSpeakerModal dark={dm} onClose={() => setShowBulk(false)} />}
      {showKeys && <ShortcutsModal dark={dm} onClose={() => setShowKeys(false)} />}
    </>
  );
}