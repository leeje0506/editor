import { AlertTriangle } from "lucide-react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { countTextChars, getEffectiveMaxChars } from "../../utils/validation";

interface Props {
  dark: boolean;
  maxChars?: number;
  maxLines?: number;
  bracketChars?: number;
}

export function QuickEditor({ dark, maxChars = 18, maxLines = 2, bracketChars = 5 }: Props) {
  const { subtitles, selectedId, updateOne, navigateNext, navigatePrev } = useSubtitleStore();
  const setCurrentMs = usePlayerStore((s) => s.setCurrentMs);
  const sel = subtitles.find((s) => s.id === selectedId);

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const bdl = dm ? "border-gray-700" : "border-gray-100";
  const inp = dm ? "bg-gray-700 text-gray-100 border-gray-600" : "bg-white text-gray-800 border-gray-300";

  if (!sel) return <div className={`shrink-0 ${card} border-t ${bd} h-[185px] flex items-center justify-center ${ts}`}>자막을 선택하세요</div>;

  const upd = (data: Record<string, unknown>) => {
    if (selectedId) updateOne(selectedId, data);
  };

  const hasSpeaker = !!sel.speaker;
  const effectiveMax = getEffectiveMaxChars(maxChars, bracketChars, hasSpeaker);

  // 각 줄 글자수
  const lines = sel.text.split("\n");
  const firstLineChars = countTextChars(lines[0] || "");
  const totalChars = countTextChars(sel.text);

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
            onClick={() => {
              if (v === "삭제" && onDelete) onDelete();
              else upd({ [field]: v });
            }}
            className={`px-2.5 py-0.5 text-[10px] border-r last:border-r-0 ${bd} ${
              currentVal === v ? "bg-blue-500 text-white font-medium" : `${card} ${ts} hover:opacity-80`
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`shrink-0 ${card} border-t ${bd}`} style={{ height: "185px" }}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-1.5 border-b ${bdl} ${dm ? "bg-gray-800" : "bg-gray-50/60"}`}>
        <div className="flex items-center gap-2">
          <span className="text-blue-500 font-bold text-base font-serif">T</span>
          <span className={`text-xs font-bold ${tp}`}>Quick Editor</span>
          <span className={`text-[11px] ${ts}`}>선택됨: {sel.seq}</span>
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
      <div className="flex flex-1 p-3 gap-5" style={{ height: "calc(100% - 34px)" }}>
        <div className="w-52 flex flex-col gap-2 shrink-0">
          <div>
            <label className={`block text-[11px] ${ts} mb-0.5`}>유형</label>
            <select value={sel.type} onChange={(e) => upd({ type: e.target.value })} className={`w-full text-sm border rounded px-2.5 py-1.5 outline-none focus:border-blue-500 ${inp}`}>
              <option value="dialogue">대사 (Dialogue)</option>
              <option value="effect">효과 (Effect)</option>
            </select>
          </div>
          <div>
            <label className={`block text-[11px] ${ts} mb-0.5`}>화자 명칭 (라인별)</label>
            <div className={`flex items-center border rounded overflow-hidden focus-within:border-blue-500 ${inp}`}>
              <div className={`${dm ? "bg-gray-600 border-gray-600" : "bg-gray-50 border-gray-300"} px-2 py-1.5 border-r text-[11px] ${ts} shrink-0`}>L1</div>
              <input value={sel.speaker} onChange={(e) => upd({ speaker: e.target.value })} className={`flex-1 px-2.5 py-1.5 text-sm outline-none bg-transparent ${tp}`} placeholder="화자명" />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1 shrink-0">
            <div className="flex items-center gap-3">
              <span className={`text-[11px] ${ts} font-medium`}>텍스트 입력</span>
              {hasSpeaker && (
                <span className={`text-[10px] ${ts}`}>
                  화자 예약: {bracketChars}자
                </span>
              )}
            </div>
            <div className={`text-[11px] ${ts}`}>
              현재 줄:{" "}
              <span className={`font-bold ${firstLineChars > effectiveMax ? "text-red-500" : "text-blue-600"}`}>
                {firstLineChars}자
              </span>
              {" / "}
              <span className={firstLineChars > effectiveMax ? "text-red-500" : ""}>{effectiveMax}자</span>
              {" | 전체: "}{totalChars}자
            </div>
          </div>
          <textarea
            value={sel.text}
            onChange={(e) => upd({ text: e.target.value })}
            onWheel={(e) => {
              if (!e.shiftKey) return;
              e.preventDefault();
              const sub = e.deltaY > 0 ? navigateNext() : navigatePrev();
              if (sub) setCurrentMs(sub.start_ms);
            }}
            className={`flex-1 border rounded p-3 text-sm outline-none focus:border-blue-500 resize-none leading-relaxed ${inp}`}
            placeholder="자막 텍스트를 입력하세요..."
          />
        </div>
      </div>
    </div>
  );
}