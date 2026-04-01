import { AlertTriangle, Lock } from "lucide-react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { countTextChars } from "../../utils/validation";

interface Props {
  dark: boolean;
  maxChars?: number;
  maxLines?: number;
  readOnly?: boolean;
}

export function QuickEditor({ dark, maxChars = 18, maxLines = 2, readOnly }: Props) {
  const { subtitles, selectedId, updateLocal, navigateNext, navigatePrev } = useSubtitleStore();
  const setCurrentMs = usePlayerStore((s) => s.setCurrentMs);
  const sel = subtitles.find((s) => s.id === selectedId);

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const bdl = dm ? "border-gray-700" : "border-gray-100";
  const inp = dm ? "bg-gray-700 text-gray-100 border-gray-600" : "bg-white text-gray-800 border-gray-300";
  const disabledCls = readOnly ? "opacity-60 cursor-not-allowed" : "";

  if (!sel) {
    return (
      <div className={`h-full ${card} border-t ${bd} flex items-center justify-center ${ts}`}>
        자막을 선택하세요
      </div>
    );
  }

  /**
   * 자막 필드 업데이트.
   * NFC 정규화를 하지 않음 — 입력 중 조합 중인 한글(자소)을 깨뜨리지 않기 위해.
   * NFC 정규화는 서버 저장(saveAll/updateOne API) 시점에서 처리.
   */
  const upd = (data: Record<string, unknown>) => {
    if (readOnly) return;
    if (selectedId) {
      updateLocal(selectedId, data);
    }
  };

  const hasSpeaker = !!sel.speaker;

  // 글자 수 카운트 — 공백 및 특수기호 포함 (NFC 정규화 후 카운트)
  const totalChars = countTextChars(sel.text);
  // 화자 예약 글자수 = 화자명 글자수 + 3 (괄호+공백 등)
  const speakerReserved = hasSpeaker ? sel.speaker.length + 3 : 0;
  const usedWithSpeaker = totalChars + speakerReserved;
  // 기준값 = 실제 줄 수(줄바꿈 기준) × 줄당 글자수. 최소 1줄.
  const lineCount = Math.max(1, sel.text.split("\n").length);
  const limit = maxChars * lineCount;
  const isOver = usedWithSpeaker > limit;

  const posBtn = (
    label: string,
    field: "speaker_pos" | "text_pos",
    values: { v: string; l: string }[],
    currentVal: string,
    onDelete?: () => void,
  ) => (
    <div className="flex items-center gap-1.5">
      <span className={ts}>{label}:</span>
      <div className={`flex rounded border ${bd} overflow-hidden`}>
        {values.map(({ v, l }) => (
          <button
            key={v}
            disabled={readOnly}
            onClick={() => {
              if (readOnly) return;
              if (v === "삭제" && onDelete) onDelete();
              else upd({ [field]: v });
            }}
            className={`px-2.5 py-0.5 text-[10px] border-r last:border-r-0 ${bd} ${
              currentVal === v ? "bg-blue-500 text-white font-medium" : `${card} ${ts} hover:opacity-80`
            } ${disabledCls}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`h-full ${card} border-t ${bd} flex flex-col`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-1.5 border-b ${bdl} shrink-0 ${dm ? "bg-gray-800" : "bg-gray-50/60"}`}>
        <div className="flex items-center gap-2">
          <span className="text-blue-500 font-bold text-base font-serif">T</span>
          <span className={`text-xs font-bold ${tp}`}>Quick Editor</span>
          <span className={`text-[11px] ${ts}`}>선택됨: {sel.seq}</span>
          {readOnly && (
            <span className="text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded text-[9px] border border-yellow-500/30 flex items-center gap-0.5">
              <Lock size={9} /> 읽기전용
            </span>
          )}
          {sel.error && (
            <span className="text-red-500 bg-red-50 px-1 py-0.5 rounded text-[9px] border border-red-100 flex items-center gap-0.5">
              <AlertTriangle size={9} /> {sel.error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          {posBtn("화자 위치", "speaker_pos", [
            { v: "default", l: "유지" }, { v: "top", l: "상단" }, { v: "삭제", l: "삭제" },
          ], sel.speaker_pos, () => upd({ speaker_pos: "default", speaker: "" }))}
          {posBtn("대사 위치", "text_pos", [
            { v: "default", l: "유지" }, { v: "top", l: "상단" }, { v: "삭제", l: "삭제" },
          ], sel.text_pos, () => upd({ text_pos: "default", text: "" }))}
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 p-3 gap-5 min-h-0">
        <div className="w-52 flex flex-col gap-2 shrink-0">
          <div>
            <label className={`block text-[11px] ${ts} mb-0.5`}>유형</label>
            <select
              value={sel.type}
              disabled={readOnly}
              onChange={(e) => upd({ type: e.target.value })}
              className={`w-full text-sm border rounded px-2.5 py-1.5 outline-none focus:border-blue-500 ${inp} ${disabledCls}`}
            >
              <option value="dialogue">대사 (Dialogue)</option>
              <option value="effect">효과 (Effect)</option>
            </select>
          </div>
          <div>
            <label className={`block text-[11px] ${ts} mb-0.5`}>화자 명칭 (라인별)</label>
            <div className={`flex items-center border rounded overflow-hidden focus-within:border-blue-500 ${inp}`}>
              <div className={`${dm ? "bg-gray-600 border-gray-600" : "bg-gray-50 border-gray-300"} px-2 py-1.5 border-r text-[11px] ${ts} shrink-0`}>L1</div>
              <input
                value={sel.speaker}
                readOnly={readOnly}
                onChange={(e) => upd({ speaker: e.target.value })}
                className={`flex-1 px-2.5 py-1.5 text-sm outline-none bg-transparent ${tp} ${disabledCls}`}
                placeholder="화자명"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {/* 텍스트 입력 라벨 + 글자수 (textarea 오른쪽 위) */}
          <div className="flex items-center justify-between mb-1 shrink-0">
            <span className={`text-[11px] ${ts} font-medium`}>텍스트 입력</span>
            <div className={`text-[11px] ${ts}`}>
              현재 글자 수 :{" "}
              <span className={`font-bold ${isOver ? "text-red-500" : "text-blue-600"}`}>
                {totalChars}
              </span>
              {hasSpeaker && (
                <span className={isOver ? "text-red-500" : ""}>
                  {" "}({usedWithSpeaker})
                </span>
              )}
              {" / 기준 : "}
              <span className={isOver ? "text-red-500" : ""}>{limit}</span>
            </div>
          </div>
          <textarea
            data-quick-editor-textarea
            value={sel.text}
            readOnly={readOnly}
            onChange={(e) => upd({ text: e.target.value })}
            onWheel={(e) => {
              if (!e.shiftKey) return;
              e.preventDefault();
              const sub = e.deltaY > 0 ? navigateNext() : navigatePrev();
              if (sub) setCurrentMs(sub.start_ms);
            }}
            className={`flex-1 border rounded p-3 text-base outline-none focus:border-blue-500 resize-none leading-relaxed ${inp} ${disabledCls}`}
            placeholder="자막 텍스트를 입력하세요..."
          />
        </div>
      </div>
    </div>
  );
}