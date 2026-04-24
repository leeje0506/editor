import { useState } from "react";
import { Users } from "lucide-react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { BulkSpeakerModal } from "../modals/BulkSpeakerModal";

interface Props {
  dark: boolean;
  filteredCount: number;
  totalCount: number;
  readOnly?: boolean;
}

export function GridToolbar({ dark, filteredCount, totalCount, readOnly }: Props) {
  const [showBulk, setShowBulk] = useState(false);

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
          {/* {!readOnly && (
            <button onClick={() => setShowBulk(true)} className="flex items-center gap-0.5 text-purple-600 border border-purple-200 bg-purple-50 px-2 py-1 rounded text-[10px] font-medium hover:bg-purple-100">
              <Users size={12} /> 화자 일괄변경
            </button>
          )} */}
        </div>

        {/* 기존 버튼들 → 우클릭 메뉴로 이동 */}
        {/* {!readOnly && (
          <div className="flex items-center gap-1">
            <button onClick={() => addAfter()} className="..."><Plus size={12} /> 싱크 추가</button>
            <button onClick={() => splitSelected()} className="..."><Scissors size={12} /> 분할</button>
            {multiSelect.size >= 2 && (
              <button onClick={() => mergeSelected()} className="..."><Merge size={12} /> 병합</button>
            )}
            <button onClick={() => deleteSelected()} className="..."><Trash2 size={12} /> 삭제</button>
          </div>
        )} */}

        {readOnly && (
          <span className={`text-[10px] ${ts}`}>검수 모드 — 편집 불가</span>
        )}
      </div>

      {showBulk && !readOnly && <BulkSpeakerModal dark={dm} onClose={() => setShowBulk(false)} />}
    </>
  );
}