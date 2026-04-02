import { useState, useEffect } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { countTextChars } from "../../utils/validation";
import { msToTimecode, timecodeToMs } from "../../utils/time";

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

  // 시작/종료 시간 — 로컬 문자열 state (hooks는 early return 전에 선언)
  const [startTc, setStartTc] = useState("00:00:00,000");
  const [endTc, setEndTc] = useState("00:00:00,000");

  // 선택된 자막이 바뀌면 로컬 state 동기화
  useEffect(() => {
    if (sel) {
      setStartTc(msToTimecode(sel.start_ms));
      setEndTc(msToTimecode(sel.end_ms));
    }
  }, [sel?.id, sel?.start_ms, sel?.end_ms]);

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

  const upd = (data: Record<string, unknown>) => {
    if (readOnly) return;
    if (selectedId) {
      updateLocal(selectedId, data);
    }
  };

  /** blur 시 타임코드 → ms 변환하여 저장 */
  const commitTime = (field: "start_ms" | "end_ms", value: string) => {
    const ms = timecodeToMs(value);
    if (ms > 0 || value.trim() === "00:00:00,000") {
      upd({ [field]: ms });
    } else {
      // 파싱 실패 → 원래 값으로 롤백
      if (field === "start_ms") setStartTc(msToTimecode(sel.start_ms));
      else setEndTc(msToTimecode(sel.end_ms));
    }
  };

  const hasSpeaker = !!sel.speaker;
  const totalChars = countTextChars(sel.text);
  const speakerReserved = hasSpeaker ? sel.speaker.length + 3 : 0;
  const usedWithSpeaker = totalChars + speakerReserved;
  const lineCount = Math.max(1, sel.text.split("\n").length);
  const limit = maxChars * lineCount;
  const isOver = usedWithSpeaker > limit;

  const posBtn = (
    label: string,
    field: "speaker_pos" | "text_pos",
    values: { v: string; l: string }[],
    currentVal: string,
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
              upd({ [field]: v });
            }}
            className={`px-2.5 py-0.5 text-[10px] border-r last:border-r-0 ${bd} ${
              currentVal === v
                ? v === "deleted" ? "bg-red-500 text-white font-medium" : "bg-blue-500 text-white font-medium"
                : `${card} ${ts} hover:opacity-80`
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
            { v: "default", l: "유지" }, { v: "top", l: "상단" }, { v: "deleted", l: "삭제" },
          ], sel.speaker_pos)}
          {posBtn("대사 위치", "text_pos", [
            { v: "default", l: "유지" }, { v: "top", l: "상단" }, { v: "deleted", l: "삭제" },
          ], sel.text_pos)}
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 p-3 gap-3 min-h-0">
        {/* 왼쪽 컬럼: 시작/종료 + 유형/화자 */}
        <div className="w-72 flex flex-col gap-2 shrink-0">
          {/* 시작 시간 + 유형 */}
          <div className="flex gap-2">
            <div className="w-36 shrink-0">
              <label className={`block text-[11px] ${ts} mb-0.5`}>시작</label>
              <input
                value={startTc}
                readOnly={readOnly}
                onChange={(e) => setStartTc(e.target.value)}
                onBlur={() => commitTime("start_ms", startTc)}
                onKeyDown={(e) => { if (e.key === "Enter") commitTime("start_ms", startTc); }}
                className={`w-full text-xs font-mono border rounded px-2 py-1.5 outline-none focus:border-blue-500 ${inp} ${disabledCls}`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className={`block text-[11px] ${ts} mb-0.5`}>유형</label>
              <select
                value={sel.type}
                disabled={readOnly}
                onChange={(e) => upd({ type: e.target.value })}
                className={`w-full text-xs border rounded px-2 py-1.5 outline-none focus:border-blue-500 ${inp} ${disabledCls}`}
              >
                <option value="dialogue">대사</option>
                <option value="effect">효과</option>
              </select>
            </div>
          </div>
          {/* 종료 시간 + 화자 명칭 */}
          <div className="flex gap-2">
            <div className="w-36 shrink-0">
              <label className={`block text-[11px] ${ts} mb-0.5`}>종료</label>
              <input
                value={endTc}
                readOnly={readOnly}
                onChange={(e) => setEndTc(e.target.value)}
                onBlur={() => commitTime("end_ms", endTc)}
                onKeyDown={(e) => { if (e.key === "Enter") commitTime("end_ms", endTc); }}
                className={`w-full text-xs font-mono border rounded px-2 py-1.5 outline-none focus:border-blue-500 ${inp} ${disabledCls}`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className={`block text-[11px] ${ts} mb-0.5`}>화자</label>
              <input
                value={sel.speaker}
                readOnly={readOnly}
                onChange={(e) => upd({ speaker: e.target.value })}
                className={`w-full text-xs border rounded px-2 py-1.5 outline-none focus:border-blue-500 ${inp} ${disabledCls}`}
                placeholder="화자명"
              />
            </div>
          </div>
        </div>

        {/* 오른쪽: 텍스트 입력 */}
        <div className="flex-1 flex flex-col min-h-0">
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