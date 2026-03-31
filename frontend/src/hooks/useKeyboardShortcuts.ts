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

      e.preventDefault();

      const playerState = usePlayerStore.getState();
      const subtitleState = useSubtitleStore.getState();

      switch (actionId) {
        case "play_pause":
          playerState.togglePlay();
          break;

        case "set_start": {
          // 선택 싱크 시작점을 현재 재생 시간으로
          const selId = subtitleState.selectedId;
          if (selId) {
            subtitleState.updateOne(selId, { start_ms: playerState.currentMs });
          }
          break;
        }

        case "set_end": {
          // 선택 싱크 종료점을 현재 재생 시간으로
          const selId = subtitleState.selectedId;
          if (selId) {
            subtitleState.updateOne(selId, { end_ms: playerState.currentMs });
          }
          break;
        }

        case "add_sync": {
          // 현재 선택된 자막 뒤에 새 싱크 추가
          subtitleState.addAfter();
          break;
        }

        case "snap_prev": {
          // 앞 싱크 end_ms에 현재 싱크 start_ms를 맞춤
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
          // 뒤 싱크 start_ms에 현재 싱크 end_ms를 맞춤
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
          // TODO: 검색 모달/패널 열기
          break;

        case "replace":
          // TODO: 검색·치환 모달/패널 열기
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
          // QuickEditor의 textarea에 포커스
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