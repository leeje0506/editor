import { create } from "zustand";
import { authApi } from "../api/auth";

/** 단축키 액션 정의 */
export interface ShortcutAction {
  id: string;
  label: string;
  description: string;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: "play_pause", label: "재생 / 일시정지", description: "영상 재생 토글" },
  { id: "set_start", label: "시작점 → 현재시간", description: "선택 싱크 시작점을 현재시간으로" },
  { id: "set_end", label: "종료점 → 현재시간", description: "선택 싱크 종료점을 현재시간으로" },
  { id: "add_sync", label: "새 싱크 추가", description: "현재 위치에 새 싱크 추가" },
  { id: "snap_prev", label: "앞 싱크에 붙이기", description: "앞 싱크 시간에 맞춰 붙이기" },
  { id: "snap_next", label: "뒤 싱크에 붙이기", description: "뒤 싱크 시간에 맞춰 붙이기" },
  { id: "split", label: "싱크 분할", description: "현재 싱크 분할" },
  { id: "undo", label: "실행 취소 (Undo)", description: "서버 스냅샷 복원" },
  { id: "redo", label: "다시 실행 (Redo)", description: "Redo (미구현 — 예약)" },
  { id: "search", label: "텍스트 검색", description: "텍스트 검색" },
  { id: "replace", label: "텍스트 검색·치환", description: "텍스트 검색 및 치환" },
  { id: "prev", label: "이전 싱크로 이동", description: "이전 자막으로 이동" },
  { id: "next", label: "다음 싱크로 이동", description: "다음 자막으로 이동" },
  { id: "focus_text", label: "텍스트 입력 포커스", description: "텍스트 입력창 포커스" },
  { id: "save", label: "임시저장", description: "서버에 저장 (화면 유지)" },
  { id: "delete", label: "선택 삭제", description: "선택된 자막 삭제" },
];

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  play_pause: "Space",
  set_start: "F9",
  set_end: "F10",
  add_sync: "Alt+I",
  snap_prev: "Alt+[",
  snap_next: "Alt+]",
  split: "Ctrl+Enter",
  undo: "Ctrl+Z",
  redo: "Ctrl+Shift+Z",
  search: "Ctrl+F",
  replace: "Ctrl+H",
  prev: "ArrowUp",
  next: "ArrowDown",
  focus_text: "Enter",
  save: "Ctrl+S",
  delete: "Delete",
};

/** 자막 표시 설정 */
export interface SubtitleDisplay {
  fontSize: number;    // 글자 크기 (px)
  defaultY: number;    // "유지" 위치 (화면 하단에서 %, 예: 85 → 화면 85% 지점)
  topY: number;        // "상단이동" 위치 (화면 상단에서 %, 예: 8 → 화면 8% 지점)
}

export const DEFAULT_SUBTITLE_DISPLAY: SubtitleDisplay = {
  fontSize: 16,
  defaultY: 85,
  topY: 8,
};

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
  shortcuts: { ...DEFAULT_SHORTCUTS },
  subtitleDisplay: { ...DEFAULT_SUBTITLE_DISPLAY },
  loaded: false,

  load: async () => {
    try {
      const data = await authApi.getSettings();
      const shortcuts = data.shortcuts && typeof data.shortcuts === "object"
        ? { ...DEFAULT_SHORTCUTS, ...data.shortcuts }
        : { ...DEFAULT_SHORTCUTS };
      const subtitleDisplay = data.subtitle_display && typeof data.subtitle_display === "object"
        ? { ...DEFAULT_SUBTITLE_DISPLAY, ...data.subtitle_display }
        : { ...DEFAULT_SUBTITLE_DISPLAY };
      set({ shortcuts, subtitleDisplay, loaded: true });
    } catch {
      set({ shortcuts: { ...DEFAULT_SHORTCUTS }, subtitleDisplay: { ...DEFAULT_SUBTITLE_DISPLAY }, loaded: true });
    }
  },

  updateShortcut: (actionId, key) => {
    const { shortcuts } = get();
    const conflict = Object.entries(shortcuts).find(
      ([id, k]) => id !== actionId && k === key
    );
    if (conflict) return conflict[0];
    set({ shortcuts: { ...shortcuts, [actionId]: key } });
    return null;
  },

  updateSubtitleDisplay: (partial) => {
    set((s) => ({ subtitleDisplay: { ...s.subtitleDisplay, ...partial } }));
  },

  saveAll: async () => {
    const { shortcuts, subtitleDisplay } = get();
    try {
      await authApi.saveSettings({ shortcuts, subtitle_display: subtitleDisplay });
    } catch (e) {
      console.error("설정 저장 실패:", e);
    }
  },

  resetToDefaults: async () => {
    set({ shortcuts: { ...DEFAULT_SHORTCUTS }, subtitleDisplay: { ...DEFAULT_SUBTITLE_DISPLAY } });
    try {
      await authApi.saveSettings({ shortcuts: DEFAULT_SHORTCUTS, subtitle_display: DEFAULT_SUBTITLE_DISPLAY });
    } catch (e) {
      console.error("설정 초기화 실패:", e);
    }
  },

  getKeyForAction: (actionId) => {
    return get().shortcuts[actionId] || DEFAULT_SHORTCUTS[actionId] || "";
  },

  getActionForKey: (key) => {
    const entries = Object.entries(get().shortcuts);
    const found = entries.find(([, k]) => k === key);
    return found ? found[0] : null;
  },
}));