import { create } from "zustand";
import { authApi } from "../api/auth";

/* ══════════════════════════════════════
 * 단축키 정의
 * ══════════════════════════════════════ */

export interface ShortcutAction {
  id: string;
  label: string;
  description: string;
  category: "fixed" | "custom"; // fixed = 기본(변경불가), custom = 커스텀(변경가능)
}

/** 기본 단축키 (변경 불가) */
export const FIXED_SHORTCUTS: ShortcutAction[] = [
  { id: "undo", label: "실행 취소", description: "서버 스냅샷 복원", category: "fixed" },
  { id: "redo", label: "다시 실행", description: "Redo", category: "fixed" },
  { id: "save", label: "임시저장", description: "서버에 저장 (화면 유지)", category: "fixed" },
  { id: "search", label: "검색", description: "텍스트 검색", category: "fixed" },
  { id: "replace", label: "찾아 바꾸기", description: "텍스트 검색 및 치환", category: "fixed" },
  { id: "goto_line", label: "자막 번호로 이동", description: "특정 번호의 자막으로 이동", category: "fixed" },
  { id: "delete", label: "삭제", description: "선택된 자막 삭제", category: "fixed" },
];

/** 커스텀 단축키 (변경 가능) */
export const CUSTOM_SHORTCUTS: ShortcutAction[] = [
  { id: "play_pause", label: "재생/일시정지", description: "영상 재생 토글", category: "custom" },
  { id: "set_start", label: "시작 시간 설정", description: "선택 싱크 시작점을 현재시간으로", category: "custom" },
  { id: "set_end", label: "종료 시간 설정", description: "선택 싱크 종료점을 현재시간으로", category: "custom" },
  { id: "cycle_speed", label: "재생 배속 전환", description: "150%→200%→100%→150%→…", category: "custom" },
  { id: "auto_wrap", label: "자동 줄바꿈", description: "방송사 기준에 따라 자동 줄바꿈", category: "custom" },
  { id: "remove_wrap", label: "줄바꿈 제거", description: "줄바꿈 제거하여 한 줄로", category: "custom" },
  { id: "merge_prev", label: "이전과 병합", description: "이전 자막과 병합", category: "custom" },
  { id: "merge_next", label: "다음과 병합", description: "다음 자막과 병합", category: "custom" },
  { id: "split_at_cursor", label: "줄 분할", description: "텍스트 커서/비디오 위치에서 분할", category: "custom" },
  { id: "insert_after", label: "뒤에 빈 줄 삽입", description: "선택 자막 뒤에 빈 자막 삽입", category: "custom" },
  { id: "insert_at_playhead", label: "재생 위치에 삽입", description: "현재 재생 위치에 새 자막 삽입", category: "custom" },
  { id: "next_error", label: "다음 오류로 이동", description: "다음 오류 자막으로 이동", category: "custom" },
  { id: "prev", label: "이전 싱크로 이동", description: "이전 자막으로 이동", category: "custom" },
  { id: "next", label: "다음 싱크로 이동", description: "다음 자막으로 이동", category: "custom" },
  { id: "focus_text", label: "텍스트 입력 포커스", description: "텍스트 입력창 포커스", category: "custom" },
];

export const ALL_SHORTCUTS: ShortcutAction[] = [...FIXED_SHORTCUTS, ...CUSTOM_SHORTCUTS];

/** 기본 키 바인딩 */
export const DEFAULT_SHORTCUTS: Record<string, string> = {
  // 기본 (변경 불가)
  undo: "Ctrl+Z",
  redo: "Ctrl+Shift+Z",
  save: "Ctrl+S",
  search: "Ctrl+F",
  replace: "Ctrl+H",
  goto_line: "Ctrl+G",
  delete: "Delete",
  // 커스텀 (변경 가능)
  play_pause: "Space",
  set_start: "F1",
  set_end: "F2",
  cycle_speed: "Alt+Space",
  auto_wrap: "Ctrl+R",
  remove_wrap: "Ctrl+Shift+R",
  merge_prev: "F5",
  merge_next: "F6",
  split_at_cursor: "F7",
  insert_after: "F8",
  insert_at_playhead: "Insert",
  next_error: "F4",
  prev: "ArrowUp",
  next: "ArrowDown",
  focus_text: "Enter",
};

const FIXED_SHORTCUT_ID_SET = new Set(FIXED_SHORTCUTS.map((a) => a.id));
const CUSTOM_SHORTCUT_ID_SET = new Set(CUSTOM_SHORTCUTS.map((a) => a.id));

function normalizeShortcutKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * 서버에서 내려온 단축키를 안전하게 정리
 * - fixed 단축키는 항상 기본값 유지
 * - custom 단축키만 반영
 * - 중복 키는 허용하지 않음
 */
function buildSafeShortcuts(raw?: unknown): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const action of FIXED_SHORTCUTS) {
    safe[action.id] = DEFAULT_SHORTCUTS[action.id];
  }

  const usedKeys = new Set<string>(Object.values(safe));
  const rawRecord = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  for (const action of CUSTOM_SHORTCUTS) {
    const rawKey = normalizeShortcutKey(rawRecord[action.id]);

    if (rawKey && !usedKeys.has(rawKey)) {
      safe[action.id] = rawKey;
      usedKeys.add(rawKey);
      continue;
    }

    const defaultKey = DEFAULT_SHORTCUTS[action.id];
    if (defaultKey && !usedKeys.has(defaultKey)) {
      safe[action.id] = defaultKey;
      usedKeys.add(defaultKey);
      continue;
    }

    safe[action.id] = "";
  }

  return safe;
}

/* ══════════════════════════════════════
 * 자막 표시 설정
 * ══════════════════════════════════════ */

export interface SubtitleDisplay {
  fontSize: number;        // 영상 플레이어 자막 크기 (px)
  listFontSize: number;    // 자막 리스트 글자 크기 (px)
  waveFontSize: number;    // 파형 내 대사 글자 크기 (px)
  editorFontSize: number;  // 퀵에디터 글자 크기 (px)
  defaultY: number;        // "유지" 위치 (%)
  topY: number;            // "상단이동" 위치 (%)
}

export const DEFAULT_SUBTITLE_DISPLAY: SubtitleDisplay = {
  fontSize: 16,
  listFontSize: 12,
  waveFontSize: 9,
  editorFontSize: 14,
  defaultY: 85,
  topY: 8,
};

/* ══════════════════════════════════════
 * Store
 * ══════════════════════════════════════ */

interface SettingsState {
  shortcuts: Record<string, string>;
  subtitleDisplay: SubtitleDisplay;
  loaded: boolean;

  load: () => Promise<void>;
  updateShortcut: (actionId: string, key: string) => string | null;
  updateSubtitleDisplay: (partial: Partial<SubtitleDisplay>) => void;
  saveAll: () => Promise<void>;
  resetToDefaults: () => Promise<void>;
  getKeyForAction: (actionId: string) => string;
  getActionForKey: (key: string) => string | null;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  shortcuts: buildSafeShortcuts(),
  subtitleDisplay: { ...DEFAULT_SUBTITLE_DISPLAY },
  loaded: false,

  load: async () => {
    try {
      const data = await authApi.getSettings();

      const shortcuts = buildSafeShortcuts(data.shortcuts);
      const subtitleDisplay =
        data.subtitle_display && typeof data.subtitle_display === "object"
          ? { ...DEFAULT_SUBTITLE_DISPLAY, ...data.subtitle_display }
          : { ...DEFAULT_SUBTITLE_DISPLAY };

      set({ shortcuts, subtitleDisplay, loaded: true });
    } catch {
      set({
        shortcuts: buildSafeShortcuts(),
        subtitleDisplay: { ...DEFAULT_SUBTITLE_DISPLAY },
        loaded: true,
      });
    }
  },

  updateShortcut: (actionId, key) => {
    if (FIXED_SHORTCUT_ID_SET.has(actionId)) return null;
    if (!CUSTOM_SHORTCUT_ID_SET.has(actionId)) return null;

    const normalizedKey = normalizeShortcutKey(key);
    if (!normalizedKey) return null;

    const { shortcuts } = get();
    const conflict = Object.entries(shortcuts).find(
      ([id, k]) => id !== actionId && k === normalizedKey
    );

    if (conflict) return conflict[0];

    set({
      shortcuts: {
        ...shortcuts,
        [actionId]: normalizedKey,
      },
    });
    return null;
  },

  updateSubtitleDisplay: (partial) => {
    set((s) => ({
      subtitleDisplay: { ...s.subtitleDisplay, ...partial },
    }));
  },

  saveAll: async () => {
    const { shortcuts, subtitleDisplay } = get();
    const safeShortcuts = buildSafeShortcuts(shortcuts);

    set({ shortcuts: safeShortcuts });

    try {
      await authApi.saveSettings({
        shortcuts: safeShortcuts,
        subtitle_display: subtitleDisplay,
      });
    } catch (e) {
      console.error("설정 저장 실패:", e);
    }
  },

  resetToDefaults: async () => {
    const defaultShortcuts = buildSafeShortcuts();
    const defaultSubtitleDisplay = { ...DEFAULT_SUBTITLE_DISPLAY };

    set({
      shortcuts: defaultShortcuts,
      subtitleDisplay: defaultSubtitleDisplay,
    });

    try {
      await authApi.saveSettings({
        shortcuts: defaultShortcuts,
        subtitle_display: defaultSubtitleDisplay,
      });
    } catch (e) {
      console.error("설정 초기화 실패:", e);
    }
  },

  getKeyForAction: (actionId) => {
    return get().shortcuts[actionId] || DEFAULT_SHORTCUTS[actionId] || "";
  },

  getActionForKey: (key) => {
    const normalizedKey = normalizeShortcutKey(key);
    if (!normalizedKey) return null;

    const found = Object.entries(get().shortcuts).find(([, k]) => k === normalizedKey);
    return found ? found[0] : null;
  },
}));

/* ══════════════════════════════════════
 * 키 이벤트 → 문자열 변환 유틸
 * ══════════════════════════════════════ */

export function eventToKeyString(e: KeyboardEvent): string {
  const parts: string[] = [];

  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  let key = e.key;

  if (key === " ") key = "Space";
  if (["Control", "Meta", "Shift", "Alt"].includes(key)) return "";

  if (key.length === 1 && key >= "a" && key <= "z") {
    key = key.toUpperCase();
  }

  parts.push(key);
  return parts.join("+");
}