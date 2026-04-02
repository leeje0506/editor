import { useEffect } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubtitleStore } from "../store/useSubtitleStore";
import { useSettingsStore } from "../store/useSettingsStore";

/**
 * 키 이벤트를 단축키 문자열로 변환.
 * 예: Ctrl+S, Ctrl+Shift+Z, Space, ArrowUp, F9, Alt+I
 */
export function eventToKeyString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  let key = e.key;
  if (key === " ") key = "Space";
  // modifier 키 자체는 무시
  if (["Control", "Meta", "Shift", "Alt"].includes(key)) return "";
  // 알파벳은 대문자로
  if (key.length === 1 && key >= "a" && key <= "z") key = key.toUpperCase();

  parts.push(key);
  return parts.join("+");
}

/**
 * 입력 필드(textarea, input) 포커스 중일 때 무시해야 하는 액션들.
 * 이 목록에 없는 액션(undo, save 등)은 입력 중에도 동작함.
 */
const BLOCK_IN_INPUT: Set<string> = new Set([
  "play_pause",   // Space — 텍스트/화자 입력 중에는 공백 입력
  "prev",         // ArrowUp — textarea 커서 이동
  "next",         // ArrowDown — textarea 커서 이동
  "delete",       // Delete — 텍스트 삭제
  "focus_text",   // Enter — textarea에서는 줄바꿈
]);

/** 전역 키보드 단축키 (커스텀 단축키 지원, 모든 상황에서 동작) */
export function useKeyboardShortcuts(onSave: () => void) {
  const shortcuts = useSettingsStore((s) => s.shortcuts);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const keyStr = eventToKeyString(e);
      if (!keyStr) return;

      // 키 조합으로 액션 찾기
      const actionId = Object.entries(shortcuts).find(([, k]) => k === keyStr)?.[0];
      if (!actionId) return;

      const tag = (e.target as HTMLElement).tagName;
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);

      // 입력 필드 포커스 중이면 특정 단축키 차단
      if (isInput && BLOCK_IN_INPUT.has(actionId)) return;

      e.preventDefault();

      const playerState = usePlayerStore.getState();
      const subtitleState = useSubtitleStore.getState();

      switch (actionId) {
        case "play_pause":
          playerState.togglePlay();
          break;

        case "set_start": {
          const selId = subtitleState.selectedId;
          if (selId) {
            subtitleState.updateOne(selId, { start_ms: playerState.currentMs });
          }
          break;
        }

        case "set_end": {
          const selId = subtitleState.selectedId;
          if (selId) {
            subtitleState.updateOne(selId, { end_ms: playerState.currentMs });
          }
          break;
        }

        case "add_sync": {
          subtitleState.addAfter();
          break;
        }

        case "snap_prev": {
          const selId = subtitleState.selectedId;
          if (!selId) break;
          const subs = subtitleState.subtitles;
          const idx = subs.findIndex((s) => s.id === selId);
          if (idx > 0) {
            subtitleState.updateOne(selId, { start_ms: subs[idx - 1].end_ms });
          }
          break;
        }

        case "snap_next": {
          const selId = subtitleState.selectedId;
          if (!selId) break;
          const subs = subtitleState.subtitles;
          const idx = subs.findIndex((s) => s.id === selId);
          if (idx >= 0 && idx < subs.length - 1) {
            subtitleState.updateOne(selId, { end_ms: subs[idx + 1].start_ms });
          }
          break;
        }

        case "split":
          subtitleState.splitSelected();
          break;

        case "undo":
          subtitleState.undo();
          break;

        case "redo":
          // TODO: Redo 미구현 — 예약
          break;

        case "search":
          {
            // 먼저 검색창이 열려있는지 확인
            let searchInput = document.querySelector<HTMLInputElement>("[data-grid-search]");
            if (!searchInput) {
              // 검색 버튼 클릭하여 검색창 열기
              const searchBtn = document.querySelector<HTMLButtonElement>("[data-grid-search-toggle]");
              if (searchBtn) searchBtn.click();
              // DOM 업데이트 후 포커스
              requestAnimationFrame(() => {
                searchInput = document.querySelector<HTMLInputElement>("[data-grid-search]");
                if (searchInput) searchInput.focus();
              });
            } else {
              searchInput.focus();
            }
          }
          break;

        case "replace":
          // TODO: 찾아서 바꾸기 UI 미구현, 나중에 하기!
          break;

        case "prev": {
          const sub = subtitleState.navigatePrev();
          if (sub) {
            subtitleState.selectSingle(sub.id);
            playerState.setVideoPreviewMs(sub.start_ms);
          }
          break;
        }

        case "next": {
          const sub = subtitleState.navigateNext();
          if (sub) {
            subtitleState.selectSingle(sub.id);
            playerState.setVideoPreviewMs(sub.start_ms);
          }
          break;
        }

        case "focus_text": {
          const textarea = document.querySelector<HTMLTextAreaElement>("[data-quick-editor-textarea]");
          if (textarea) textarea.focus();
          break;
        }

        case "save":
          onSave();
          break;

        case "delete":
          subtitleState.deleteSelected();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts, onSave]);
}