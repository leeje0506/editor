import { useEffect } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubtitleStore } from "../store/useSubtitleStore";

/** 전역 키보드 단축키 */
export function useKeyboardShortcuts(onSave: () => void) {
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const setCurrentMs = usePlayerStore((s) => s.setCurrentMs);
  const navigateNext = useSubtitleStore((s) => s.navigateNext);
  const navigatePrev = useSubtitleStore((s) => s.navigatePrev);
  const deleteSelected = useSubtitleStore((s) => s.deleteSelected);
  const undo = useSubtitleStore((s) => s.undo);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);

      // Ctrl+Z는 항상 동작 (입력 중이어도)
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+S도 항상 동작
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSave();
        return;
      }

      // 나머지 단축키는 입력 중이면 무시
      if (isInput) return;

      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const sub = navigatePrev();
        if (sub) setCurrentMs(sub.start_ms);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const sub = navigateNext();
        if (sub) setCurrentMs(sub.start_ms);
      }
      if (e.key === "Delete") { e.preventDefault(); deleteSelected(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, navigateNext, navigatePrev, deleteSelected, undo, onSave, setCurrentMs]);
}