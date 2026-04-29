import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useTimelineStore } from "../../store/useTimelineStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { msToTimecode } from "../../utils/time";
import { GridToolbar } from "./GridToolbar";
import { GridFilters, type Filters } from "./GridFilters";
import { FileText, Loader2, AlertTriangle } from "lucide-react";
import { projectsApi } from "../../api/projects";
import {
  validateSubtitleLocal,
  calcSpeakerReserved,
  countTextChars,
} from "../../utils/validation";
import { nfc } from "../../utils/normalize";
import type { Subtitle } from "../../types";

interface Props {
  dark: boolean;
  readOnly?: boolean;
  editorMode?: "srt" | "json";
  projectId?: number;
  onSubtitleUploaded?: () => void;
  maxChars?: number;
  maxLines?: number;
  minDurationMs?: number;
  speakerMode?: string;
}

function msToDuration(ms: number): string {
  return (ms / 1000).toFixed(3);
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
  onCellClick: () => void;
  onRequestEdit?: () => void;
}

function DropCell({
  value, label, options, dark, disabled, colorCls, fontSize,
  onSelect, onCellClick, onRequestEdit,
}: DropCellProps) {
  const [open, setOpen] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        cellRef.current && !cellRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  useEffect(() => {
    if (open && cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom, left: rect.left, width: rect.width });
    }
  }, [open]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCellClick();
    if (disabled) return;
    if (e.detail >= 2) { setOpen(false); return; }
    setOpen((prev) => !prev);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (onRequestEdit) {
      setOpen(false);
      onRequestEdit();
    }
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
        onDoubleClick={handleDoubleClick}
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
              onClick={(e) => { e.stopPropagation(); onSelect(opt.v); setOpen(false); }}
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

/* ── 인라인 단일행 텍스트 입력 (화자명) ──
   - 타이핑 중: 부모(store)에 raw 값을 흘려보냄 — IME composition 중엔 차단
   - composition 끝: 직전 입력 한 번 더 흘려보냄
   - commit (blur / Enter / Shift+Enter): NFC 정규화 후 onCommit
   - cancel (Esc): onCancel만 호출, 부모에 raw 흘렸던 값 복원은 부모가 처리
*/
interface InlineTextInputProps {
  value: string;                        // 시작 시 텍스트 (이후엔 동기화 안 됨)
  dark: boolean;
  fontSize: number;
  onLiveChange?: (raw: string) => void; // 타이핑 중 raw 값 (IME 안전)
  onCommit: (v: string) => void;        // 종료 + 저장 (NFC 적용됨)
  onCancel: () => void;                 // 취소 (Esc / 같은 값)
}

function InlineTextInput({
  value, dark, fontSize, onLiveChange, onCommit, onCancel,
}: InlineTextInputProps) {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  const inp = dark
    ? "bg-gray-700 text-gray-100 border-gray-600"
    : "bg-white text-gray-800 border-gray-300";

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        // IME composition 중이 아닐 때만 부모에 흘려보냄 (자소 분리 방지)
        if (!composingRef.current) onLiveChange?.(v);
      }}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        // 조합 끝난 직후 한 번 흘려보냄
        onLiveChange?.((e.target as HTMLInputElement).value);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => {
        const cleaned = nfc(draft);
        if (cleaned !== value) onCommit(cleaned);
        else onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          const cleaned = nfc(draft);
          if (cleaned !== value) onCommit(cleaned);
          else onCancel();
          return;
        }
        if (e.key === "Enter") {
          // 화자는 한 줄 입력 — Enter도 종료로 처리
          e.preventDefault();
          e.stopPropagation();
          const cleaned = nfc(draft);
          if (cleaned !== value) onCommit(cleaned);
          else onCancel();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
          return;
        }
        e.stopPropagation();
      }}
      style={{ fontSize: `${fontSize}px` }}
      className={`w-full border rounded px-1 py-0.5 outline-none focus:border-blue-500 text-center ${inp}`}
    />
  );
}

/* ── 인라인 텍스트 셀 (대사) ──
   - 타이핑 중: 부모(store)에 raw 값을 흘려보냄 — IME composition 중엔 차단
   - composition 끝: 직전 입력 한 번 더 흘려보냄
   - commit (blur / Shift+Enter): NFC 정규화 후 onChange
   - cancel (Esc): 원본 텍스트로 복원
*/
interface EditableTextCellProps {
  text: string;
  isEditing: boolean;
  dark: boolean;
  disabled?: boolean;
  fontSize: number;
  className?: string;
  onLiveChange?: (raw: string) => void; // 타이핑 중 raw 값 (IME 안전)
  onChange: (text: string) => void;      // 종료 + 저장 (NFC 적용됨)
  onCellClick: () => void;
  onRequestEdit: () => void;
  onExitEdit: () => void;
}

function EditableTextCell({
  text, isEditing, dark, disabled, fontSize, className,
  onLiveChange, onChange, onCellClick, onRequestEdit, onExitEdit,
}: EditableTextCellProps) {
  const [value, setValue] = useState(text);
  const composingRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // 편집 진입 시점의 원본 텍스트 (Esc 취소용)
  const originalRef = useRef<string>(text);

  useEffect(() => {
    if (!isEditing) setValue(text);
  }, [text, isEditing]);

  const resize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (isEditing && taRef.current) {
      const ta = taRef.current;
      setValue(text);
      originalRef.current = text;
      ta.focus();
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
      requestAnimationFrame(resize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  useEffect(() => {
    if (isEditing) resize();
  }, [value, isEditing, resize]);

  if (!isEditing) {
    const lines = text.length === 0 ? [""] : text.split("\n");
    return (
      <div
        className={className}
        onClick={(e) => { e.stopPropagation(); onCellClick(); }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          onRequestEdit();
        }}
        title={text}
      >
        <div className="flex flex-col leading-snug">
          {lines.map((line, i) => (
            <div
              key={i}
              className="overflow-hidden whitespace-nowrap text-ellipsis"
            >
              {line || "\u200B"}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const inp = dark
    ? "bg-gray-700 text-gray-100 border-gray-600"
    : "bg-white text-gray-800 border-gray-300";

  return (
    <div className={className} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          // IME composition 중이 아닐 때만 부모에 흘려보냄
          if (!composingRef.current) onLiveChange?.(v);
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          onLiveChange?.((e.target as HTMLTextAreaElement).value);
        }}
        onBlur={() => {
          const cleaned = nfc(value);
          if (cleaned !== originalRef.current) onChange(cleaned);
          onExitEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            const cleaned = nfc(value);
            if (cleaned !== originalRef.current) onChange(cleaned);
            onExitEdit();
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            // 원본으로 복원 + 부모에도 알림
            setValue(originalRef.current);
            onLiveChange?.(originalRef.current);
            onExitEdit();
            return;
          }
          e.stopPropagation();
        }}
        rows={1}
        style={{ fontSize: `${fontSize}px` }}
        className={`w-full border rounded px-1 py-0.5 outline-none focus:border-blue-500 resize-none leading-snug overflow-hidden ${inp}`}
      />
    </div>
  );
}

/* ── SubtitleGrid ── */
export function SubtitleGrid({
  dark,
  readOnly,
  editorMode = "srt",
  projectId,
  onSubtitleUploaded,
  maxChars = 18,
  maxLines = 2,
  minDurationMs = 500,
  speakerMode = "name",
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtitleDragDepthRef = useRef(0);

  const [filters, setFilters] = useState<Filters>({
    type: "전체", textPos: "전체", error: "전체", search: "",
  });
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSpeakerId, setEditingSpeakerId] = useState<number | null>(null);

  const subtitles = useSubtitleStore((s) => s.subtitles);
  const selectedId = useSubtitleStore((s) => s.selectedId);
  const multiSelect = useSubtitleStore((s) => s.multiSelect);
  const selectSingle = useSubtitleStore((s) => s.selectSingle);
  const toggleMulti = useSubtitleStore((s) => s.toggleMulti);
  const selectRange = useSubtitleStore((s) => s.selectRange);
  const updateLocal = useSubtitleStore((s) => s.updateLocal);
  const flushDirty = useSubtitleStore((s) => s.flushDirty);

  /** 타이핑 중 store만 갱신 (서버 저장 X). NFC도 안 함 — IME 안전. */
  const updateLocalRaw = useCallback(
    (id: number, data: Partial<Subtitle>) => {
      updateLocal(id, data);
    },
    [updateLocal],
  );

  /** 종료 시 NFC 적용 + 서버 저장. */
  const updateAndFlush = useCallback(
    (id: number, data: Partial<Subtitle>) => {
      const normalized: Partial<Subtitle> = { ...data };
      if (typeof normalized.text === "string") normalized.text = nfc(normalized.text);
      if (typeof normalized.speaker === "string") normalized.speaker = nfc(normalized.speaker);
      updateLocal(id, normalized);
      void flushDirty();
    },
    [updateLocal, flushDirty],
  );

  const playing = usePlayerStore((s) => s.playing);
  const setVideoPreviewMs = usePlayerStore((s) => s.setVideoPreviewMs);
  const ensureVisible = useTimelineStore((s) => s.ensureVisible);
  const listFontSize = useSettingsStore((s) => s.subtitleDisplay.listFontSize);
  const focusTextKey = useSettingsStore((s) => s.shortcuts.focus_text);

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const bdl = dm ? "border-gray-700" : "border-gray-100";
  const hr = dm ? "hover:bg-blue-900/25" : "hover:bg-blue-100";
  const sr = dm ? "bg-blue-900/25" : "bg-blue-100";
  const mr = dm ? "bg-blue-900/10" : "bg-blue-50";
  const errCellBg = dm ? "bg-orange-900/50" : "bg-orange-100";

  const speakerOptions = useMemo(() => {
    const names = [...new Set(subtitles.map((s) => s.speaker).filter(Boolean))].sort();
    return [{ v: "", label: "(없음)" }, ...names.map((n) => ({ v: n, label: n }))];
  }, [subtitles]);

  const filtered = useMemo(() => {
    return subtitles.filter((s) => {
      if (filters.type !== "전체" && s.type !== filters.type) return false;
      if (filters.textPos !== "전체" && s.text_pos !== filters.textPos) return false;
      if (filters.error === "오류만" && !s.error) return false;
      if (filters.error === "정상만" && s.error) return false;
      if (filters.search && !s.text.includes(filters.search) && !s.speaker.includes(filters.search))
        return false;
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

  const canMergeSelection = useMemo(() => {
    if (multiSelect.size < 2 || multiSelect.size > 3) return false;
    const selected = subtitles.filter((s) => multiSelect.has(s.id));
    if (selected.length !== multiSelect.size) return false;
    const seqs = selected.map((s) => s.seq).sort((a, b) => a - b);
    for (let i = 1; i < seqs.length; i++) {
      if (seqs[i] !== seqs[i - 1] + 1) return false;
    }
    return true;
  }, [multiSelect, subtitles]);

  useEffect(() => {
    const row = document.getElementById(`row-${selectedId}`);
    if (row && scrollRef.current) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId]);

  // ── 편집 진입 단축키 (focus_text) ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (readOnly) return;
      if (selectedId == null) return;
      if (editingId != null || editingSpeakerId != null) return;
      const target = e.target as HTMLElement;
      if (target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )) return;

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      let key = e.key;
      if (key === " ") key = "Space";
      if (["Control", "Meta", "Shift", "Alt"].includes(key)) return;
      if (key.length === 1 && key >= "a" && key <= "z") key = key.toUpperCase();
      parts.push(key);
      const combo = parts.join("+");

      if (combo === focusTextKey) {
        e.preventDefault();
        setEditingId(selectedId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, editingId, editingSpeakerId, readOnly, focusTextKey]);

  useEffect(() => {
    if (editingId != null && editingId !== selectedId) setEditingId(null);
    if (editingSpeakerId != null && editingSpeakerId !== selectedId) setEditingSpeakerId(null);
  }, [selectedId, editingId, editingSpeakerId]);

  const handleClick = (id: number, e: React.MouseEvent) => {
    if (playing) return;
    if (e.shiftKey) selectRange(id);
    else if (e.ctrlKey || e.metaKey) toggleMulti(id);
    else selectSingle(id);
    const sub = subtitles.find((s) => s.id === id);
    if (sub) setVideoPreviewMs(sub.start_ms);
  };

  const handleDblClick = (id: number) => {
    if (playing) return;
    selectSingle(id);
    const sub = subtitles.find((s) => s.id === id);
    if (sub) {
      usePlayerStore.getState().seekTo(sub.start_ms);
      ensureVisible(sub.start_ms);
      const { playing: isPlaying, togglePlay } = usePlayerStore.getState();
      if (!isPlaying) togglePlay();
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    if (!multiSelect.has(id)) selectSingle(id);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  const triggerSelect = useCallback(
    (subId: number) => {
      if (playing) return;
      if (selectedId !== subId) {
        selectSingle(subId);
        const sub = subtitles.find((s) => s.id === subId);
        if (sub) setVideoPreviewMs(sub.start_ms);
      }
    },
    [playing, selectedId, selectSingle, subtitles, setVideoPreviewMs],
  );

  const handleSubtitleFileUpload = useCallback(
    async (file: File) => {
      if (!projectId || uploading) return;
      setUploading(true);
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (ext === "json") await projectsApi.uploadJson(projectId, file);
        else await projectsApi.uploadSubtitle(projectId, file);
        onSubtitleUploaded?.();
      } catch {} finally {
        setUploading(false);
      }
    },
    [projectId, uploading, onSubtitleUploaded],
  );

  const isSubtitleUploadFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    return ["srt", "vtt", "txt", "json"].includes(ext);
  }, []);

  const resetSubtitleDragState = useCallback(() => {
    subtitleDragDepthRef.current = 0;
    setIsDragOver(false);
  }, []);

  const handleSubtitleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault(); e.stopPropagation();
      if (readOnly || uploading || !projectId) return;
      subtitleDragDepthRef.current += 1;
      setIsDragOver(true);
    },
    [readOnly, uploading, projectId],
  );

  const handleSubtitleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault(); e.stopPropagation();
      if (readOnly || uploading || !projectId) return;
      e.dataTransfer.dropEffect = "copy";
      if (!isDragOver) setIsDragOver(true);
    },
    [readOnly, uploading, projectId, isDragOver],
  );

  const handleSubtitleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault(); e.stopPropagation();
      if (readOnly || uploading || !projectId) return;
      subtitleDragDepthRef.current -= 1;
      if (subtitleDragDepthRef.current <= 0) resetSubtitleDragState();
    },
    [readOnly, uploading, projectId, resetSubtitleDragState],
  );

  const handleSubtitleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault(); e.stopPropagation();
      resetSubtitleDragState();
      if (readOnly || uploading || !projectId) return;
      const file = Array.from(e.dataTransfer.files ?? []).find(isSubtitleUploadFile);
      if (!file) return;
      await handleSubtitleFileUpload(file);
    },
    [readOnly, uploading, projectId, isSubtitleUploadFile, handleSubtitleFileUpload, resetSubtitleDragState],
  );

  const cw = {
    seq: "3%",
    start: "9%",
    end: "9%",
    dur: "5%",
    type: "5%",
    spk: "8%",
    spkDel: "5%",
    txtDel: "5%",
    pos: "5%",
  };
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

  const isEmpty = subtitles.length === 0;

  const selectedSub = useMemo(
    () => subtitles.find((s) => s.id === selectedId) || null,
    [subtitles, selectedId],
  );

  const footerInfo = useMemo(() => {
    if (!selectedSub) return null;
    const speakerReserved = calcSpeakerReserved(
      selectedSub.speaker,
      !!selectedSub.speaker_deleted,
      speakerMode,
    );
    const lines = selectedSub.text.split("\n");
    const lineChars = lines.map((line) => countTextChars(line));
    const totalChars = lineChars.reduce((a, b) => a + b, 0);
    const totalWithSpeaker = totalChars + speakerReserved;
    const lineCount = Math.max(1, lines.length);
    const limit = maxChars * lineCount;
    const isOver = totalWithSpeaker > limit;
    return {
      lineChars, speakerReserved, totalWithSpeaker, limit, isOver,
      maxChars, errors: selectedSub.error,
    };
  }, [selectedSub, speakerMode, maxChars]);

  return (
    <div className={`h-full flex flex-col overflow-hidden border-b ${bd}`}>
      <div className={`shrink-0 ${card}`}>
        <GridToolbar
          dark={dm}
          filteredCount={filtered.length}
          totalCount={subtitles.length}
          readOnly={readOnly}
        />
        {!isEmpty && <GridFilters dark={dm} filters={filters} onChange={setFilters} />}
      </div>

      {isEmpty ? (
        <div className={`flex-1 flex items-center justify-center ${card}`}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt,.vtt,.txt,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleSubtitleFileUpload(f);
              e.currentTarget.value = "";
            }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="text-blue-500 animate-spin" />
              <span className={`text-xs ${ts}`}>자막 파일 처리 중...</span>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragEnter={handleSubtitleDragEnter}
              onDragOver={handleSubtitleDragOver}
              onDragLeave={handleSubtitleDragLeave}
              onDrop={(e) => void handleSubtitleDrop(e)}
              role="button"
              tabIndex={0}
              className={`flex flex-col items-center gap-3 px-8 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors group ${
                isDragOver
                  ? dm ? "border-blue-500 bg-blue-500/10" : "border-blue-500 bg-blue-50"
                  : dm ? "border-gray-700 hover:border-blue-500/50 hover:bg-blue-500/5"
                       : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              <FileText
                size={28}
                className={`transition-colors ${
                  isDragOver
                    ? "text-blue-500"
                    : dm ? "text-gray-600 group-hover:text-blue-500"
                         : "text-gray-400 group-hover:text-blue-500"
                }`}
              />
              <span className={`text-sm font-medium transition-colors ${
                isDragOver ? "text-blue-500" : dm ? "text-gray-500 group-hover:text-blue-400" : "text-gray-400 group-hover:text-blue-400"
              }`}>
                자막 파일 추가
              </span>
              <span className={`text-[10px] ${dm ? "text-gray-700" : "text-gray-300"}`}>
                클릭하거나 SRT, VTT, TXT, JSON 파일을 드래그해 업로드하세요
              </span>
            </div>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className={`flex-1 overflow-y-auto overflow-x-hidden ${card} min-h-0`}>
            <table
              className={`w-full ${ts}`}
              style={{ fontSize: `${listFontSize}px`, tableLayout: "fixed" }}
            >
              {colGroup}
              <thead className={`border-b ${bd} ${card} sticky top-0 z-10`}>{headerRow}</thead>
              <tbody className={`divide-y ${dm ? "divide-gray-600" : "divide-gray-200"}`}>
                {filtered.map((sub) => {
                  const isSel = selectedId === sub.id;
                  const isMulti = multiSelect.has(sub.id) && !isSel;
                  const duration = sub.end_ms - sub.start_ms;

                  const localErrors = new Set(validateSubtitleLocal(
                    sub.text, sub.speaker, !!sub.speaker_deleted,
                    sub.start_ms, sub.end_ms,
                    maxChars, maxLines, minDurationMs, speakerMode,
                  ));
                  if (sub.error?.includes("오버랩")) localErrors.add("오버랩");

                  const overlap = overlapCellMap.get(sub.id);
                  const rowBg = isSel ? sr : isMulti ? mr : "";
                  const startCellBg = overlap?.startErr ? errCellBg : "";
                  const endCellBg = overlap?.endErr ? errCellBg : "";
                  const durCellBg = localErrors.has("최소길이") ? errCellBg : "";
                  const textCellBg = localErrors.has("글자초과") ? errCellBg : "";

                  const spkDeleted = !!sub.speaker_deleted;
                  const txtDeleted = !!sub.text_deleted;
                  const isTop = sub.speaker_pos === "top" || sub.text_pos === "top";

                  const isEditingThis = editingId === sub.id;
                  const isEditingSpeakerThis = editingSpeakerId === sub.id;

                  return (
                    <tr
                      key={sub.id}
                      id={`row-${sub.id}`}
                      onClick={(e) => handleClick(sub.id, e)}
                      onDoubleClick={() => handleDblClick(sub.id)}
                      onContextMenu={(e) => handleContextMenu(e, sub.id)}
                      className={`cursor-pointer transition-colors ${rowBg} ${hr}`}
                    >
                      <td className={`${cellCls} relative`} style={cellStyle}>
                        {isSel && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500" />}
                        {sub.seq}
                      </td>
                      <td className={`${cellCls} font-mono ${tp} ${startCellBg}`} style={cellStyle}>
                        {msToTimecode(sub.start_ms)}
                      </td>
                      <td className={`${cellCls} font-mono ${tp} ${endCellBg}`} style={cellStyle}>
                        {msToTimecode(sub.end_ms)}
                      </td>
                      <td className={`${cellCls} font-mono ${tp} ${durCellBg}`} style={cellStyle}>
                        {msToDuration(duration)}
                      </td>
                      <td className={`${cellCls}`} style={cellStyle}>
                        <DropCell
                          dark={dm} disabled={readOnly} fontSize={listFontSize}
                          value={sub.type}
                          label={sub.type === "effect" ? "효과" : "대사"}
                          options={[{ v: "dialogue", label: "대사" }, { v: "effect", label: "효과" }]}
                          onSelect={(v) => updateAndFlush(sub.id, { type: v as "dialogue" | "effect" })}
                          onCellClick={() => triggerSelect(sub.id)}
                        />
                      </td>
                      {/* 화자 */}
                      <td
                        className={`py-2 px-2 ${tp}`}
                        style={{ textAlign: "center", wordBreak: "break-word", whiteSpace: "normal" }}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        {isEditingSpeakerThis ? (
                          <InlineTextInput
                            value={sub.speaker}
                            dark={dm}
                            fontSize={listFontSize}
                            onLiveChange={(raw) => updateLocalRaw(sub.id, { speaker: raw })}
                            onCommit={(v) => {
                              updateAndFlush(sub.id, { speaker: v });
                              setEditingSpeakerId(null);
                            }}
                            onCancel={() => setEditingSpeakerId(null)}
                          />
                        ) : (
                          <DropCell
                            dark={dm} disabled={readOnly} fontSize={listFontSize}
                            value={sub.speaker}
                            label={sub.speaker || "(없음)"}
                            options={speakerOptions}
                            onSelect={(v) => updateAndFlush(sub.id, { speaker: v })}
                            onCellClick={() => triggerSelect(sub.id)}
                            onRequestEdit={() => {
                              if (readOnly) return;
                              triggerSelect(sub.id);
                              setEditingSpeakerId(sub.id);
                            }}
                          />
                        )}
                      </td>
                      <td className={`${cellCls}`} style={cellStyle}>
                        <DropCell
                          dark={dm} disabled={readOnly} fontSize={listFontSize}
                          value={spkDeleted ? "true" : "false"}
                          label={spkDeleted ? "삭제" : "유지"}
                          colorCls={spkDeleted ? "text-red-500" : ""}
                          options={[{ v: "false", label: "유지" }, { v: "true", label: "삭제" }]}
                          onSelect={(v) => updateAndFlush(sub.id, { speaker_deleted: v === "true" })}
                          onCellClick={() => triggerSelect(sub.id)}
                        />
                      </td>
                      {/* 대사 */}
                      <td
                        className={`py-2 px-3 ${tp} ${textCellBg}`}
                        style={{ textAlign: "left", verticalAlign: "top" }}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <EditableTextCell
                          text={sub.text}
                          isEditing={isEditingThis}
                          dark={dm}
                          disabled={readOnly}
                          fontSize={listFontSize}
                          className="leading-snug"
                          onLiveChange={(raw) => updateLocalRaw(sub.id, { text: raw })}
                          onChange={(v) => updateAndFlush(sub.id, { text: v })}
                          onCellClick={() => triggerSelect(sub.id)}
                          onRequestEdit={() => {
                            if (readOnly) return;
                            triggerSelect(sub.id);
                            setEditingId(sub.id);
                          }}
                          onExitEdit={() => setEditingId(null)}
                        />
                      </td>
                      <td className={`${cellCls}`} style={cellStyle}>
                        <DropCell
                          dark={dm} disabled={readOnly} fontSize={listFontSize}
                          value={txtDeleted ? "true" : "false"}
                          label={txtDeleted ? "삭제" : "유지"}
                          colorCls={txtDeleted ? "text-red-500" : ""}
                          options={[{ v: "false", label: "유지" }, { v: "true", label: "삭제" }]}
                          onSelect={(v) => updateAndFlush(sub.id, { text_deleted: v === "true" })}
                          onCellClick={() => triggerSelect(sub.id)}
                        />
                      </td>
                      <td className={`${cellCls}`} style={cellStyle}>
                        <DropCell
                          dark={dm} disabled={readOnly} fontSize={listFontSize}
                          value={isTop ? "top" : "default"}
                          label={isTop ? "상단" : "하단"}
                          colorCls={isTop ? "text-blue-500" : ""}
                          options={[{ v: "default", label: "하단" }, { v: "top", label: "상단" }]}
                          onSelect={(v) => {
                            const pos = v as "default" | "top";
                            updateAndFlush(sub.id, { speaker_pos: pos, text_pos: pos });
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

          {/* footer */}
          <div className={`shrink-0 border-t ${bd} ${card} px-3 py-1.5 flex items-center justify-between text-[11px]`}>
            {footerInfo ? (
              <>
                <div className={`${ts} flex items-center gap-3 flex-wrap`}>
                  {footerInfo.lineChars.map((cnt, i) => {
                    const withSpeaker = i === 0 ? cnt + footerInfo.speakerReserved : cnt;
                    const lineOver = withSpeaker > footerInfo.maxChars;
                    return (
                      <span key={i}>
                        {`${i + 1}줄 : `}
                        <span className={lineOver ? "text-red-500 font-medium" : tp}>{withSpeaker}</span>
                      </span>
                    );
                  })}
                  <span>
                    {"전체 : "}
                    <span className={footerInfo.isOver ? "text-red-500 font-medium" : "text-blue-500"}>
                      {footerInfo.totalWithSpeaker}
                    </span>
                  </span>
                  <span style={{ display: "inline-block", padding: "0 4px" }}>|</span>
                  <span>
                    {"기준 : "}
                    <span className={footerInfo.isOver ? "text-red-500" : tp}>
                      {footerInfo.maxChars}, {footerInfo.limit}
                    </span>
                  </span>
                </div>
                {footerInfo.errors && (
                  <span className="text-red-500 flex items-center gap-1">
                    <AlertTriangle size={11} />
                    {footerInfo.errors}
                  </span>
                )}
              </>
            ) : (
              <span className={ts}>자막을 선택하세요</span>
            )}
          </div>
        </>
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu && createPortal(
        <div
          className={`fixed z-[9999] rounded shadow-xl border py-1 min-w-[160px] ${
            dm ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"
          }`}
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            disabled={readOnly}
            onClick={() => { setContextMenu(null); useSubtitleStore.getState().addAfter(); }}
            className={`w-full text-left px-3 py-1.5 text-xs ${
              !readOnly ? `${dm ? "text-gray-200 hover:bg-gray-600" : "text-gray-700 hover:bg-blue-50"}`
                        : `${dm ? "text-gray-500" : "text-gray-400"} cursor-not-allowed`
            }`}
          >
            싱크 추가
          </button>
          <button
            disabled={readOnly || !selectedId}
            onClick={() => { setContextMenu(null); useSubtitleStore.getState().splitSelected(); }}
            className={`w-full text-left px-3 py-1.5 text-xs ${
              !readOnly && selectedId
                ? `${dm ? "text-gray-200 hover:bg-gray-600" : "text-gray-700 hover:bg-blue-50"}`
                : `${dm ? "text-gray-500" : "text-gray-400"} cursor-not-allowed`
            }`}
          >
            싱크 분할
          </button>
          <button
            disabled={readOnly || multiSelect.size === 0}
            onClick={() => { setContextMenu(null); useSubtitleStore.getState().deleteSelected(); }}
            className={`w-full text-left px-3 py-1.5 text-xs ${
              !readOnly && multiSelect.size > 0
                ? `${dm ? "text-gray-200 hover:bg-gray-600" : "text-gray-700 hover:bg-blue-50"}`
                : `${dm ? "text-gray-500" : "text-gray-400"} cursor-not-allowed`
            }`}
          >
            싱크 삭제 ({multiSelect.size}개)
          </button>
          <div className={`my-1 border-t ${dm ? "border-gray-600" : "border-gray-200"}`} />
          <button
            disabled={!canMergeSelection || readOnly}
            onClick={() => {
              setContextMenu(null);
              if (canMergeSelection) useSubtitleStore.getState().mergeSelected();
            }}
            className={`w-full text-left px-3 py-1.5 text-xs ${
              canMergeSelection && !readOnly
                ? `${dm ? "text-gray-200 hover:bg-gray-600" : "text-gray-700 hover:bg-blue-50"}`
                : `${dm ? "text-gray-500" : "text-gray-400"} cursor-not-allowed`
            }`}
          >
            선택 병합 ({multiSelect.size}개)
            {multiSelect.size < 2 && " — 2개 이상 선택 필요"}
            {multiSelect.size > 3 && " — 최대 3개"}
            {multiSelect.size >= 2 && multiSelect.size <= 3 && !canMergeSelection && " — 연속된 자막만"}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}