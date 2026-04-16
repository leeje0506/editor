import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronDown, ChevronUp, Replace } from "lucide-react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";

interface Props {
  dark: boolean;
  onClose: () => void;
}

export function FindReplaceModal({ dark, onClose }: Props) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const findRef = useRef<HTMLInputElement>(null);

  const subtitles = useSubtitleStore((s) => s.subtitles);
  const selectSingle = useSubtitleStore((s) => s.selectSingle);
  const updateLocal = useSubtitleStore((s) => s.updateLocal);
  const setVideoPreviewMs = usePlayerStore((s) => s.setVideoPreviewMs);

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const inp = dm ? "bg-gray-700 text-gray-100 border-gray-600" : "bg-white text-gray-800 border-gray-300";

  // 매칭되는 자막 목록
  const matches = findText
    ? subtitles.filter((s) => {
        const text = matchCase ? s.text : s.text.toLowerCase();
        const query = matchCase ? findText : findText.toLowerCase();
        return text.includes(query);
      })
    : [];

  // 자동 포커스
  useEffect(() => {
    findRef.current?.focus();
  }, []);

  // findText 변경 시 currentIdx 리셋
  useEffect(() => {
    setCurrentIdx(matches.length > 0 ? 0 : -1);
  }, [findText, matchCase]);

  // 현재 매치로 이동
  useEffect(() => {
    if (currentIdx >= 0 && currentIdx < matches.length) {
      const sub = matches[currentIdx];
      selectSingle(sub.id);
      setVideoPreviewMs(sub.start_ms);
    }
  }, [currentIdx]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIdx((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIdx((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const replaceCurrent = useCallback(() => {
    if (currentIdx < 0 || currentIdx >= matches.length) return;
    const sub = matches[currentIdx];
    const query = matchCase ? findText : findText.toLowerCase();
    const srcText = sub.text;
    // 대소문자 무시 시에도 원본 텍스트에서 위치 찾기
    const idx = matchCase ? srcText.indexOf(findText) : srcText.toLowerCase().indexOf(query);
    if (idx === -1) return;
    const newText = srcText.substring(0, idx) + replaceText + srcText.substring(idx + findText.length);
    updateLocal(sub.id, { text: newText });
  }, [currentIdx, matches, findText, replaceText, matchCase, updateLocal]);

  const replaceAll = useCallback(() => {
    if (!findText) return;
    let count = 0;
    for (const sub of subtitles) {
      const query = matchCase ? findText : findText.toLowerCase();
      const srcText = matchCase ? sub.text : sub.text.toLowerCase();
      if (!srcText.includes(query)) continue;

      // 모든 매치 치환
      let newText = sub.text;
      if (matchCase) {
        newText = newText.split(findText).join(replaceText);
      } else {
        // 대소문자 무시 치환
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        newText = newText.replace(regex, replaceText);
      }
      if (newText !== sub.text) {
        updateLocal(sub.id, { text: newText });
        count++;
      }
    }
    alert(`${count}건 치환 완료`);
  }, [findText, replaceText, matchCase, subtitles, updateLocal]);

  // 키보드 핸들링
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      if (e.shiftKey) {
        goPrev();
      } else {
        goNext();
      }
    } else if (e.key === "F3") {
      e.preventDefault();
      if (e.shiftKey) goPrev();
      else goNext();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div
        className={`${card} border ${bd} rounded-lg shadow-2xl p-4 w-[420px] ${tp}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold">찾아 바꾸기</span>
          <button onClick={onClose} className={`${ts} hover:opacity-60`}><X size={16} /></button>
        </div>

        {/* 찾기 */}
        <div className="flex items-center gap-2 mb-2">
          <input
            ref={findRef}
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="찾을 텍스트"
            className={`flex-1 text-xs border rounded px-2.5 py-2 outline-none focus:border-blue-500 ${inp}`}
          />
          <button onClick={goPrev} className={`p-1.5 border ${bd} rounded ${ts} hover:opacity-80`} title="이전 (Shift+Enter)">
            <ChevronUp size={14} />
          </button>
          <button onClick={goNext} className={`p-1.5 border ${bd} rounded ${ts} hover:opacity-80`} title="다음 (Enter)">
            <ChevronDown size={14} />
          </button>
        </div>

        {/* 바꾸기 */}
        <div className="flex items-center gap-2 mb-3">
          <input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="바꿀 텍스트"
            className={`flex-1 text-xs border rounded px-2.5 py-2 outline-none focus:border-blue-500 ${inp}`}
          />
          <button
            onClick={replaceCurrent}
            disabled={currentIdx < 0}
            className={`px-2.5 py-1.5 text-xs border ${bd} rounded ${ts} hover:opacity-80 disabled:opacity-30`}
            title="현재 항목 치환"
          >
            치환
          </button>
          <button
            onClick={replaceAll}
            disabled={matches.length === 0}
            className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-30"
            title="전체 치환"
          >
            전체
          </button>
        </div>

        {/* 옵션 + 결과 */}
        <div className="flex items-center justify-between">
          <label className={`flex items-center gap-1.5 text-[11px] ${ts} cursor-pointer`}>
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              className="rounded"
            />
            대소문자 구분
          </label>
          <span className={`text-[11px] ${ts}`}>
            {findText ? `${matches.length}건 중 ${currentIdx >= 0 ? currentIdx + 1 : 0}번째` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}