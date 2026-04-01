import { useRef, useEffect, useMemo, useState } from "react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useTimelineStore } from "../../store/useTimelineStore";
import { msToTimecode } from "../../utils/time";
import { GridToolbar } from "./GridToolbar";
import { GridFilters, type Filters } from "./GridFilters";

interface Props {
  dark: boolean;
  readOnly?: boolean;
}

export function SubtitleGrid({ dark, readOnly }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<Filters>({ type: "전체", textPos: "전체", error: "전체", search: "" });

  const subtitles = useSubtitleStore((s) => s.subtitles);
  const selectedId = useSubtitleStore((s) => s.selectedId);
  const multiSelect = useSubtitleStore((s) => s.multiSelect);
  const selectSingle = useSubtitleStore((s) => s.selectSingle);
  const toggleMulti = useSubtitleStore((s) => s.toggleMulti);
  const selectRange = useSubtitleStore((s) => s.selectRange);

  const playing = usePlayerStore((s) => s.playing);
  const setVideoPreviewMs = usePlayerStore((s) => s.setVideoPreviewMs);

  const ensureVisible = useTimelineStore((s) => s.ensureVisible);

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const bdl = dm ? "border-gray-700" : "border-gray-100";
  const hr = dm ? "hover:bg-gray-700/50" : "hover:bg-gray-50";
  const sr = dm ? "bg-blue-900/40" : "bg-blue-50/70";
  const mr = dm ? "bg-blue-900/20" : "bg-blue-50/30";

  const filtered = useMemo(() => {
    return subtitles.filter((s) => {
      if (filters.type !== "전체" && s.type !== filters.type) return false;
      if (filters.textPos !== "전체" && s.text_pos !== filters.textPos) return false;
      if (filters.error === "오류만" && !s.error) return false;
      if (filters.error === "정상만" && s.error) return false;
      if (filters.search && !s.text.includes(filters.search) && !s.speaker.includes(filters.search)) return false;
      return true;
    });
  }, [subtitles, filters]);

  // 선택 행 자동 스크롤
  useEffect(() => {
    const row = document.getElementById(`row-${selectedId}`);
    if (row && scrollRef.current) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  /**
   * 싱글클릭:
   * - 재생 중: 무효
   * - 정지 중: 자막 선택 + 영상만 프리뷰 (재생바 안 움직임)
   */
  const handleClick = (id: number) => {
    if (playing) return;
    selectSingle(id);
    const sub = subtitles.find((s) => s.id === id);
    if (sub) {
      setVideoPreviewMs(sub.start_ms);
    }
  };

  /**
   * 더블클릭:
   * - 재생 중: 무효
   * - 정지 중: 자막 선택 + 재생바 이동 + 재생 시작 + 파형 뷰 이동
   */
  const handleDblClick = (id: number, e: React.MouseEvent) => {
    if (playing) return;

    if (e.shiftKey) selectRange(id);
    else if (e.ctrlKey || e.metaKey) toggleMulti(id);
    else selectSingle(id);

    const sub = subtitles.find((s) => s.id === id);
    if (sub) {
      usePlayerStore.getState().setCurrentMs(sub.start_ms);
      usePlayerStore.getState().setVideoPreviewMs(null);
      ensureVisible(sub.start_ms);
      const { playing: isPlaying, togglePlay } = usePlayerStore.getState();
      if (!isPlaying) togglePlay();
    }
  };

  const posLabel = (v: string) => (v === "top" ? "상단이동" : "-");

  /* ── 컬럼 너비 상수 ── */
  const colW = {
    seq: "w-10", start: "w-28", end: "w-28", type: "w-12",
    spkPos: "w-14", txtPos: "w-14", spk: "w-14", err: "w-16",
  };

  /* ── 테이블 헤더 (고정) ── */
  const headerRow = (
    <tr>
      <th className={`py-2 font-medium ${colW.seq} border-r ${bdl}`}>#</th>
      <th className={`py-2 font-medium ${colW.start} border-r ${bdl}`}>시작</th>
      <th className={`py-2 font-medium ${colW.end} border-r ${bdl}`}>종료</th>
      <th className={`py-2 font-medium ${colW.type} border-r ${bdl}`}>유형</th>
      <th className={`py-2 font-medium ${colW.spkPos} border-r ${bdl}`}>화자 위치</th>
      <th className={`py-2 font-medium ${colW.txtPos} border-r ${bdl}`}>대사 위치</th>
      <th className={`py-2 font-medium ${colW.spk} border-r ${bdl}`}>화자</th>
      <th className={`py-2 font-medium text-left px-3 border-r ${bdl}`}>대사</th>
      <th className={`py-2 font-medium ${colW.err}`}>검수</th>
    </tr>
  );

  return (
    <div className={`h-full flex flex-col overflow-hidden border-b ${bd}`}>
      {/* ── 고정 영역: 툴바 + 필터 + 컬럼 헤더 ── */}
      <div className={`shrink-0 ${card}`}>
        <GridToolbar dark={dm} filteredCount={filtered.length} totalCount={subtitles.length} readOnly={readOnly} />
        <GridFilters dark={dm} filters={filters} onChange={setFilters} />
        {/* 컬럼 헤더 — 스크롤 밖에서 고정 */}
        <table className={`w-full text-center text-[11px] ${ts}`}>
          <thead className={`border-b ${bd}`}>{headerRow}</thead>
        </table>
      </div>

      {/* ── 스크롤 영역: 자막 행만 ── */}
      <div ref={scrollRef} className={`flex-1 overflow-y-auto overflow-x-hidden ${card} min-h-0`}>
        <table className={`w-full text-center text-[11px] ${ts}`}>
          <tbody className={`divide-y ${dm ? "divide-gray-700/40" : "divide-gray-100"}`}>
            {filtered.map((sub) => {
              const isSel = selectedId === sub.id;
              const isMulti = multiSelect.has(sub.id) && !isSel;
              return (
                <tr
                  key={sub.id}
                  id={`row-${sub.id}`}
                  onClick={() => handleClick(sub.id)}
                  onDoubleClick={(e) => handleDblClick(sub.id, e)}
                  className={`cursor-pointer transition-colors ${isSel ? sr : isMulti ? mr : hr}`}
                >
                  <td className={`py-2 ${colW.seq} relative`}>
                    {isSel && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500" />}
                    {sub.seq}
                  </td>
                  <td className={`py-2 ${colW.start} font-mono text-[10px] ${tp}`}>{msToTimecode(sub.start_ms)}</td>
                  <td className={`py-2 ${colW.end} font-mono text-[10px] ${tp}`}>{msToTimecode(sub.end_ms)}</td>
                  <td className={`py-2 ${colW.type}`}>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] ${
                        sub.type === "effect"
                          ? "bg-purple-100 text-purple-600 border border-purple-200"
                          : dm
                            ? "bg-gray-700 text-gray-300 border border-gray-600"
                            : "bg-gray-100 text-gray-600 border border-gray-200"
                      }`}
                    >
                      {sub.type === "effect" ? "효과" : "대사"}
                    </span>
                  </td>
                  <td className={`py-2 ${colW.spkPos} ${sub.speaker_pos === "top" ? "text-blue-500" : ts}`}>{posLabel(sub.speaker_pos)}</td>
                  <td className={`py-2 ${colW.txtPos} ${sub.text_pos === "top" ? "text-blue-500" : ts}`}>{posLabel(sub.text_pos)}</td>
                  <td className={`py-2 ${colW.spk} ${tp} font-bold`}>{sub.speaker || ""}</td>
                  <td className={`py-2 text-left px-3 ${tp} max-w-[250px]`} title={sub.text}>
                    <div className="text-[12px] leading-snug whitespace-pre-wrap break-all line-clamp-3">
                      {sub.text}
                    </div>
                  </td>
                  <td className={`py-2 ${colW.err}`}>
                    {sub.error ? (
                      <span className="text-red-500 bg-red-50 px-1.5 py-0.5 rounded text-[9px] border border-red-100 font-medium">
                        {sub.error}
                      </span>
                    ) : (
                      <span className={ts}>-</span>
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