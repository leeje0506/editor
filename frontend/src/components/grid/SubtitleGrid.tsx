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

  // 글자 크기에 비례하는 스케일 (기본 12px 기준)
  const scale = listFontSize / 12;

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const bdl = dm ? "border-gray-700" : "border-gray-100";
  const hr = dm ? "hover:bg-gray-700/50" : "hover:bg-gray-50";
  const sr = dm ? "bg-blue-900/40" : "bg-blue-50/70";
  const mr = dm ? "bg-blue-900/20" : "bg-blue-50/30";

  // 오류 셀 배경색
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

  /**
   * 오버랩 자막의 시작/종료 시간 셀 표시를 위한 맵.
   * key: subtitle id, value: { startErr: boolean, endErr: boolean }
   *
   * 규칙:
   * - 2구간 오버랩: 이전 자막의 종료, 다음 자막의 시작
   * - 3구간+ 오버랩: 첫 자막의 종료, 중간 자막의 시작+종료, 끝 자막의 시작
   */
  const overlapCellMap = useMemo(() => {
    const map = new Map<number, { startErr: boolean; endErr: boolean }>();

    // 오버랩 태그가 달린 자막 id 수집 (seq 순서대로)
    const overlapSubs = subtitles.filter((s) => s.error && s.error.includes("오버랩"));

    // 연속된 오버랩 그룹으로 분리 (시간순으로 실제 겹치는 것끼리 묶기)
    const groups: typeof overlapSubs[] = [];
    let currentGroup: typeof overlapSubs = [];

    for (const sub of overlapSubs) {
      if (currentGroup.length === 0) {
        currentGroup.push(sub);
      } else {
        // 현재 그룹의 마지막 자막과 겹치는지 확인
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

    // 그룹별로 셀 표시 결정
    for (const group of groups) {
      if (group.length === 2) {
        // 2구간: 이전 자막 종료, 다음 자막 시작
        map.set(group[0].id, { startErr: false, endErr: true });
        map.set(group[1].id, { startErr: true, endErr: false });
      } else if (group.length >= 3) {
        // 3구간+: 첫→종료만, 중간→시작+종료, 끝→시작만
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

  const posLabel = (v: string) => v === "top" ? "상단이동" : v === "deleted" ? "삭제" : "-";

  /* ── 컬럼 너비 (글자 크기에 비례) ── */
  const cw = {
    seq: Math.round(40 * scale),
    start: Math.round(112 * scale),
    end: Math.round(112 * scale),
    dur: Math.round(56 * scale),
    type: Math.round(48 * scale),
    spkPos: Math.round(56 * scale),
    txtPos: Math.round(56 * scale),
    spk: Math.round(56 * scale),
    err: Math.round(64 * scale),
  };

  /* ── 테이블 헤더 (고정) ── */
  const headerRow = (
    <tr>
      <th className={`py-2 font-medium border-r ${bdl}`} style={{ width: cw.seq }}>#</th>
      <th className={`py-2 font-medium border-r ${bdl}`} style={{ width: cw.start }}>시작</th>
      <th className={`py-2 font-medium border-r ${bdl}`} style={{ width: cw.end }}>종료</th>
      <th className={`py-2 font-medium border-r ${bdl}`} style={{ width: cw.dur }}>길이</th>
      <th className={`py-2 font-medium border-r ${bdl}`} style={{ width: cw.type }}>유형</th>
      <th className={`py-2 font-medium border-r ${bdl}`} style={{ width: cw.spkPos }}>화자 위치</th>
      <th className={`py-2 font-medium border-r ${bdl}`} style={{ width: cw.txtPos }}>대사 위치</th>
      <th className={`py-2 font-medium border-r ${bdl}`} style={{ width: cw.spk }}>화자</th>
      <th className={`py-2 font-medium text-left px-3 border-r ${bdl}`}>대사</th>
      <th className={`py-2 font-medium`} style={{ width: cw.err }}>검수</th>
    </tr>
  );

  return (
    <div className={`h-full flex flex-col overflow-hidden border-b ${bd}`}>
      {/* ── 고정 영역: 툴바 + 필터 + 컬럼 헤더 ── */}
      <div className={`shrink-0 ${card}`}>
        <GridToolbar dark={dm} filteredCount={filtered.length} totalCount={subtitles.length} readOnly={readOnly} />
        <GridFilters dark={dm} filters={filters} onChange={setFilters} />
        <table className={`w-full text-center ${ts}`} style={{ fontSize: `${listFontSize}px` }}>
          <thead className={`border-b ${bd}`}>{headerRow}</thead>
        </table>
      </div>

      {/* ── 스크롤 영역: 자막 행만 ── */}
      <div ref={scrollRef} className={`flex-1 overflow-y-auto overflow-x-hidden ${card} min-h-0`}>
        <table className={`w-full text-center ${ts}`} style={{ fontSize: `${listFontSize}px` }}>
          <tbody className={`divide-y ${dm ? "divide-gray-700/40" : "divide-gray-100"}`}>
            {filtered.map((sub) => {
              const isSel = selectedId === sub.id;
              const isMulti = multiSelect.has(sub.id) && !isSel;
              const duration = sub.end_ms - sub.start_ms;
              const errors = parseErrors(sub.error);
              const hasError = errors.size > 0;
              const overlap = overlapCellMap.get(sub.id);

              // 행 배경: 선택 > 다중선택 > 기본 (오류는 셀 단위로 표시)
              const rowBg = isSel ? sr : isMulti ? mr : "";

              // 셀별 오류 배경
              const startCellBg = overlap?.startErr ? errCellBg : "";
              const endCellBg = overlap?.endErr ? errCellBg : "";
              const durCellBg = errors.has("최소길이") ? errCellBg : "";
              const textCellBg = errors.has("글자초과") ? errCellBg : "";

              return (
                <tr
                  key={sub.id}
                  id={`row-${sub.id}`}
                  onClick={() => handleClick(sub.id)}
                  onDoubleClick={(e) => handleDblClick(sub.id, e)}
                  className={`cursor-pointer transition-colors ${rowBg} ${hr}`}
                >
                  <td className={`py-2 relative`} style={{ width: cw.seq }}>
                    {isSel && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500" />}
                    {sub.seq}
                  </td>
                  <td className={`py-2 font-mono ${tp} ${startCellBg}`} style={{ width: cw.start }}>{msToTimecode(sub.start_ms)}</td>
                  <td className={`py-2 font-mono ${tp} ${endCellBg}`} style={{ width: cw.end }}>{msToTimecode(sub.end_ms)}</td>
                  <td className={`py-2 font-mono ${tp} ${durCellBg}`} style={{ width: cw.dur }}>{msToDuration(duration)}</td>
                  <td className={`py-2`} style={{ width: cw.type }}>
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
                  <td className={`py-2 ${sub.speaker_pos === "deleted" ? "text-red-500" : sub.speaker_pos === "top" ? "text-blue-500" : ts}`} style={{ width: cw.spkPos }}>{posLabel(sub.speaker_pos)}</td>
                  <td className={`py-2 ${sub.text_pos === "deleted" ? "text-red-500" : sub.text_pos === "top" ? "text-blue-500" : ts}`} style={{ width: cw.txtPos }}>{posLabel(sub.text_pos)}</td>
                  <td className={`py-2 ${tp} font-bold`} style={{ width: cw.spk }}>{sub.speaker || ""}</td>
                  <td className={`py-2 text-left px-3 ${tp} ${textCellBg}`} title={sub.text}>
                    <div className="leading-snug whitespace-pre-wrap break-all line-clamp-3">
                      {sub.text}
                    </div>
                  </td>
                  <td className={`py-2`} style={{ width: cw.err }}>
                    {hasError ? (
                      <div className="flex flex-col items-center gap-0.5">
                        {[...errors].map((e) => (
                          <span key={e} className="text-red-500 bg-red-50 px-1.5 py-0.5 rounded text-[9px] border border-red-100 font-medium">
                            {e}
                          </span>
                        ))}
                      </div>
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