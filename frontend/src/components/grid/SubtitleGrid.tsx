import { useRef, useEffect, useMemo, useState } from "react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useTimelineStore } from "../../store/useTimelineStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { msToTimecode } from "../../utils/time";
import { GridToolbar } from "./GridToolbar";
import { GridFilters, type Filters } from "./GridFilters";


interface Props {
  dark: boolean;
  readOnly?: boolean;
  editorMode?: "srt" | "json";
}

/** ms → "1.667" 형식 (초 단위, 소수 셋째 자리) */
function msToDuration(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/** 오류 문자열 파싱 → Set */
function parseErrors(err: string): Set<string> {
  if (!err) return new Set();
  return new Set(err.split(",").map((e) => e.trim()));
}

export function SubtitleGrid({ dark, readOnly, editorMode = "srt" }: Props) {
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

  const listFontSize = useSettingsStore((s) => s.subtitleDisplay.listFontSize);

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const bdl = dm ? "border-gray-700" : "border-gray-100";
  const hr = dm ? "hover:bg-gray-700/50" : "hover:bg-gray-50";
  const sr = dm ? "bg-blue-900/40" : "bg-blue-50/70";
  const mr = dm ? "bg-blue-900/20" : "bg-blue-50/30";

  const errCellBg = dm ? "bg-orange-900/50" : "bg-orange-100";

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

  const overlapCellMap = useMemo(() => {
    const map = new Map<number, { startErr: boolean; endErr: boolean }>();
    const overlapSubs = subtitles.filter((s) => s.error && s.error.includes("오버랩"));
    const groups: typeof overlapSubs[] = [];
    let currentGroup: typeof overlapSubs = [];

    for (const sub of overlapSubs) {
      if (currentGroup.length === 0) {
        currentGroup.push(sub);
      } else {
        const last = currentGroup[currentGroup.length - 1];
        if (sub.start_ms < last.end_ms) {
          currentGroup.push(sub);
        } else {
          groups.push(currentGroup);
          currentGroup = [sub];
        }
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    for (const group of groups) {
      if (group.length === 2) {
        map.set(group[0].id, { startErr: false, endErr: true });
        map.set(group[1].id, { startErr: true, endErr: false });
      } else if (group.length >= 3) {
        for (let i = 0; i < group.length; i++) {
          if (i === 0) {
            map.set(group[i].id, { startErr: false, endErr: true });
          } else if (i === group.length - 1) {
            map.set(group[i].id, { startErr: true, endErr: false });
          } else {
            map.set(group[i].id, { startErr: true, endErr: true });
          }
        }
      }
    }

    return map;
  }, [subtitles]);

  useEffect(() => {
    const row = document.getElementById(`row-${selectedId}`);
    if (row && scrollRef.current) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const handleClick = (id: number) => {
    if (playing) return;
    selectSingle(id);
    const sub = subtitles.find((s) => s.id === id);
    if (sub) {
      setVideoPreviewMs(sub.start_ms);
    }
  };

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

  /* ── 컬럼 너비 (퍼센트 기반 — 전체 합 100%) ── */
  const cw = {
    seq: "3%",
    start: "10%",
    end: "10%",
    dur: "5%",
    type: "4%",
    spk: "6%",
    spkDel: "6%",
    // 대사: 자동 (나머지)
    txtDel: "6%",
    pos: "5%",
  };
  // 대사 = 100 - 3 - 10 - 10 - 5 - 4 - 6 - 6 - 6 - 5 = 45%

  /* ── 공통 셀 스타일 ── */
  const cellCls = "py-2 overflow-hidden text-ellipsis whitespace-nowrap";
  const cellStyle: React.CSSProperties = { textAlign: "center" };

  /* ── colgroup (헤더/바디 테이블 공유) ── */
  const colGroup = (
    <colgroup>
      <col style={{ width: cw.seq }} />
      <col style={{ width: cw.start }} />
      <col style={{ width: cw.end }} />
      <col style={{ width: cw.dur }} />
      <col style={{ width: cw.type }} />
      <col style={{ width: cw.spk }} />
      <col style={{ width: cw.spkDel }} />
      <col /> {/* 대사: 나머지 공간 */}
      <col style={{ width: cw.txtDel }} />
      <col style={{ width: cw.pos }} />
    </colgroup>
  );

  /* ── 테이블 헤더 (고정) ── */
  const headerRow = (
    <tr>
      <th className={`${cellCls} font-medium border-r ${bdl}`} style={cellStyle}>#</th>
      <th className={`${cellCls} font-medium border-r ${bdl}`} style={cellStyle}>시작</th>
      <th className={`${cellCls} font-medium border-r ${bdl}`} style={cellStyle}>종료</th>
      <th className={`${cellCls} font-medium border-r ${bdl}`} style={cellStyle}>길이</th>
      <th className={`${cellCls} font-medium border-r ${bdl}`} style={cellStyle}>유형</th>
      <th className={`${cellCls} font-medium border-r ${bdl}`} style={cellStyle}>화자</th>
      <th className={`${cellCls} font-medium border-r ${bdl}`} style={cellStyle}>화자삭제</th>
      <th className={`${cellCls} font-medium border-r ${bdl}`} style={cellStyle}>대사</th>
      <th className={`${cellCls} font-medium border-r ${bdl}`} style={cellStyle}>대사삭제</th>
      <th className={`${cellCls} font-medium`} style={cellStyle}>위치</th>
    </tr>
  );

  return (
    <div className={`h-full flex flex-col overflow-hidden border-b ${bd}`}>
      {/* ── 고정 영역: 툴바 + 필터 ── */}
      <div className={`shrink-0 ${card}`}>
        <GridToolbar dark={dm} filteredCount={filtered.length} totalCount={subtitles.length} readOnly={readOnly} />
        <GridFilters dark={dm} filters={filters} onChange={setFilters} />
      </div>

      {/* ── 단일 테이블 (thead sticky + tbody 스크롤) ── */}
      <div ref={scrollRef} className={`flex-1 overflow-y-auto overflow-x-hidden ${card} min-h-0`}>
        <table className={`w-full ${ts}`} style={{ fontSize: `${listFontSize}px`, tableLayout: "fixed" }}>
          {colGroup}
          <thead className={`border-b ${bd} ${card} sticky top-0 z-10`}>{headerRow}</thead>
          <tbody className={`divide-y ${dm ? "divide-gray-700/40" : "divide-gray-100"}`}>
            {filtered.map((sub) => {
              const isSel = selectedId === sub.id;
              const isMulti = multiSelect.has(sub.id) && !isSel;
              const duration = sub.end_ms - sub.start_ms;
              const errors = parseErrors(sub.error);
              const overlap = overlapCellMap.get(sub.id);

              const rowBg = isSel ? sr : isMulti ? mr : "";

              const startCellBg = overlap?.startErr ? errCellBg : "";
              const endCellBg = overlap?.endErr ? errCellBg : "";
              const durCellBg = errors.has("최소길이") ? errCellBg : "";
              const textCellBg = errors.has("글자초과") ? errCellBg : "";

              const spkDeleted = sub.speaker_pos === "deleted";
              const txtDeleted = sub.text_pos === "deleted";
              const isTop = sub.speaker_pos === "top" || sub.text_pos === "top";

              return (
                <tr
                  key={sub.id}
                  id={`row-${sub.id}`}
                  onClick={() => handleClick(sub.id)}
                  onDoubleClick={(e) => handleDblClick(sub.id, e)}
                  className={`cursor-pointer transition-colors ${rowBg} ${hr}`}
                >
                  <td className={`${cellCls} relative`} style={cellStyle}>
                    {isSel && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500" />}
                    {sub.seq}
                  </td>
                  <td className={`${cellCls} font-mono ${tp} ${startCellBg}`} style={cellStyle}>{msToTimecode(sub.start_ms)}</td>
                  <td className={`${cellCls} font-mono ${tp} ${endCellBg}`} style={cellStyle}>{msToTimecode(sub.end_ms)}</td>
                  <td className={`${cellCls} font-mono ${tp} ${durCellBg}`} style={cellStyle}>{msToDuration(duration)}</td>
                  <td className={`${cellCls}`} style={cellStyle}>
                    {sub.type === "effect" ? "효과" : "대사"}
                  </td>
                  <td className={`${cellCls} ${tp}`} style={cellStyle}>
                    {sub.speaker || ""}
                  </td>
                  <td className={`${cellCls} ${spkDeleted ? "text-red-500" : ts}`} style={cellStyle}>
                    {spkDeleted ? "삭제" : "-"}
                  </td>
                  <td className={`py-2 overflow-hidden ${tp} ${textCellBg} px-3`} style={{ textAlign: "left" }} title={sub.text}>
                    <div className="leading-snug whitespace-pre-wrap break-all line-clamp-2">
                      {sub.text}
                    </div>
                  </td>
                  <td className={`${cellCls} ${txtDeleted ? "text-red-500" : ts}`} style={cellStyle}>
                    {txtDeleted ? "삭제" : "-"}
                  </td>
                  <td className={`${cellCls} ${isTop ? "text-blue-500 font-medium" : ts}`} style={cellStyle}>
                    {isTop ? "상단" : "-"}
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