import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
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

function msToDuration(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function parseErrors(err: string): Set<string> {
  if (!err) return new Set();
  return new Set(err.split(",").map((e) => e.trim()));
}

/* ── 엑셀 스타일 드롭다운 셀 ── */
interface DropCellProps {
  value: string;
  label: string;
  options: { v: string; label: string }[];
  dark: boolean;
  disabled?: boolean;
  colorCls?: string;
  fontSize: number;
  onSelect: (v: string) => void;
  onCellClick: () => void; // 행 선택 트리거
}

function DropCell({ value, label, options, dark, disabled, colorCls, fontSize, onSelect, onCellClick }: DropCellProps) {
  const [open, setOpen] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        cellRef.current && !cellRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // 드롭다운 위치 계산
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  useEffect(() => {
    if (open && cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom, left: rect.left, width: rect.width });
    }
  }, [open]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCellClick(); // 행 선택
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  const bg = dark ? "bg-gray-700" : "bg-white";
  const hoverBg = dark ? "hover:bg-gray-600" : "hover:bg-blue-50";
  const text = dark ? "text-gray-100" : "text-gray-800";
  const border = dark ? "border-gray-600" : "border-gray-300";
  const activeBg = dark ? "bg-blue-600/30" : "bg-blue-100";

  return (
    <>
      <div
        ref={cellRef}
        onClick={handleClick}
        className={`flex items-center justify-center gap-0.5 cursor-pointer ${colorCls || ""}`}
      >
        <span>{label}</span>
        <span className="text-[8px] opacity-40">▼</span>
      </div>
      {open && createPortal(
        <div
          ref={dropRef}
          className={`fixed z-[9999] ${bg} border ${border} rounded shadow-xl`}
          style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 64), fontSize: `${fontSize}px` }}
        >
          {options.map((opt) => (
            <div
              key={opt.v}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(opt.v);
                setOpen(false);
              }}
              className={`px-3 py-1.5 cursor-pointer text-center ${text} ${hoverBg} ${
                opt.v === value ? activeBg : ""
              } first:rounded-t last:rounded-b`}
            >
              {opt.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/* ── SubtitleGrid ── */
export function SubtitleGrid({ dark, readOnly, editorMode = "srt" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<Filters>({ type: "전체", textPos: "전체", error: "전체", search: "" });

  const subtitles = useSubtitleStore((s) => s.subtitles);
  const selectedId = useSubtitleStore((s) => s.selectedId);
  const multiSelect = useSubtitleStore((s) => s.multiSelect);
  const selectSingle = useSubtitleStore((s) => s.selectSingle);
  const toggleMulti = useSubtitleStore((s) => s.toggleMulti);
  const selectRange = useSubtitleStore((s) => s.selectRange);
  const updateLocal = useSubtitleStore((s) => s.updateLocal);

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

  /** 화자 목록 (중복 제거, 빈 화자 포함) */
  const speakerOptions = useMemo(() => {
    const names = [...new Set(subtitles.map((s) => s.speaker).filter(Boolean))].sort();
    return [
      { v: "", label: "-" },
      ...names.map((n) => ({ v: n, label: n })),
    ];
  }, [subtitles]);

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
        if (sub.start_ms < last.end_ms) currentGroup.push(sub);
        else { groups.push(currentGroup); currentGroup = [sub]; }
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);
    for (const group of groups) {
      if (group.length === 2) {
        map.set(group[0].id, { startErr: false, endErr: true });
        map.set(group[1].id, { startErr: true, endErr: false });
      } else if (group.length >= 3) {
        for (let i = 0; i < group.length; i++) {
          if (i === 0) map.set(group[i].id, { startErr: false, endErr: true });
          else if (i === group.length - 1) map.set(group[i].id, { startErr: true, endErr: false });
          else map.set(group[i].id, { startErr: true, endErr: true });
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
    if (sub) setVideoPreviewMs(sub.start_ms);
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

  /** 드롭다운 셀 클릭 시 행 선택 */
  const triggerSelect = useCallback((subId: number) => {
    if (playing) return;
    if (selectedId !== subId) {
      selectSingle(subId);
      const sub = subtitles.find((s) => s.id === subId);
      if (sub) setVideoPreviewMs(sub.start_ms);
    }
  }, [playing, selectedId, selectSingle, subtitles, setVideoPreviewMs]);

  const cw = { seq: "3%", start: "10%", end: "10%", dur: "5%", type: "5%", spk: "6%", spkDel: "6%", txtDel: "6%", pos: "5%" };
  const cellCls = "py-2 overflow-hidden text-ellipsis whitespace-nowrap";
  const cellStyle: React.CSSProperties = { textAlign: "center" };

  const colGroup = (
    <colgroup>
      <col style={{ width: cw.seq }} />
      <col style={{ width: cw.start }} />
      <col style={{ width: cw.end }} />
      <col style={{ width: cw.dur }} />
      <col style={{ width: cw.type }} />
      <col style={{ width: cw.spk }} />
      <col style={{ width: cw.spkDel }} />
      <col />
      <col style={{ width: cw.txtDel }} />
      <col style={{ width: cw.pos }} />
    </colgroup>
  );

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
      <div className={`shrink-0 ${card}`}>
        <GridToolbar dark={dm} filteredCount={filtered.length} totalCount={subtitles.length} readOnly={readOnly} />
        <GridFilters dark={dm} filters={filters} onChange={setFilters} />
      </div>
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
                  {/* 유형 */}
                  <td className={`${cellCls}`} style={cellStyle}>
                    <DropCell
                      dark={dm}
                      disabled={readOnly}
                      fontSize={listFontSize}
                      value={sub.type}
                      label={sub.type === "effect" ? "효과" : "대사"}
                      options={[{ v: "dialogue", label: "대사" }, { v: "effect", label: "효과" }]}
                      onSelect={(v) => updateLocal(sub.id, { type: v as "dialogue" | "effect" })}
                      onCellClick={() => triggerSelect(sub.id)}
                    />
                  </td>
                  {/* 화자 */}
                  <td className={`${cellCls} ${tp}`} style={cellStyle}>
                    <DropCell
                      dark={dm}
                      disabled={readOnly}
                      fontSize={listFontSize}
                      value={sub.speaker}
                      label={sub.speaker || "-"}
                      options={speakerOptions}
                      onSelect={(v) => updateLocal(sub.id, { speaker: v })}
                      onCellClick={() => triggerSelect(sub.id)}
                    />
                  </td>
                  {/* 화자삭제 */}
                  <td className={`${cellCls}`} style={cellStyle}>
                    <DropCell
                      dark={dm}
                      disabled={readOnly}
                      fontSize={listFontSize}
                      value={spkDeleted ? "deleted" : "default"}
                      label={spkDeleted ? "삭제" : "유지"}
                      colorCls={spkDeleted ? "text-red-500" : ""}
                      options={[{ v: "default", label: "유지" }, { v: "deleted", label: "삭제" }]}
                      onSelect={(v) => updateLocal(sub.id, { speaker_pos: v as "default" | "top" | "deleted" })}
                      onCellClick={() => triggerSelect(sub.id)}
                    />
                  </td>
                  {/* 대사 */}
                  <td className={`py-2 overflow-hidden ${tp} ${textCellBg} px-3`} style={{ textAlign: "left" }} title={sub.text}>
                    <div className="leading-snug whitespace-pre-wrap break-all line-clamp-2">{sub.text}</div>
                  </td>
                  {/* 대사삭제 */}
                  <td className={`${cellCls}`} style={cellStyle}>
                    <DropCell
                      dark={dm}
                      disabled={readOnly}
                      fontSize={listFontSize}
                      value={txtDeleted ? "deleted" : "default"}
                      label={txtDeleted ? "삭제" : "유지"}
                      colorCls={txtDeleted ? "text-red-500" : ""}
                      options={[{ v: "default", label: "유지" }, { v: "deleted", label: "삭제" }]}
                      onSelect={(v) => updateLocal(sub.id, { text_pos: v as "default" | "top" | "deleted" })}
                      onCellClick={() => triggerSelect(sub.id)}
                    />
                  </td>
                  {/* 위치 */}
                  <td className={`${cellCls}`} style={cellStyle}>
                    <DropCell
                      dark={dm}
                      disabled={readOnly}
                      fontSize={listFontSize}
                      value={isTop ? "top" : "default"}
                      label={isTop ? "상단" : "하단"}
                      colorCls={isTop ? "text-blue-500" : ""}
                      options={[{ v: "default", label: "하단" }, { v: "top", label: "상단" }]}
                      onSelect={(v) => {
                        const updates: Partial<{ speaker_pos: "default" | "top" | "deleted"; text_pos: "default" | "top" | "deleted" }> = {};
                        if (v === "top") {
                          if (sub.speaker_pos !== "deleted") updates.speaker_pos = "top";
                          if (sub.text_pos !== "deleted") updates.text_pos = "top";
                        } else {
                          if (sub.speaker_pos === "top") updates.speaker_pos = "default";
                          if (sub.text_pos === "top") updates.text_pos = "default";
                        }
                        updateLocal(sub.id, updates);
                      }}
                      onCellClick={() => triggerSelect(sub.id)}
                    />
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