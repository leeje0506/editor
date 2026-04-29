import { useEffect } from "react";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSubtitleStore } from "../store/useSubtitleStore";
import { useSettingsStore, eventToKeyString } from "../store/useSettingsStore";
import { calcSpeakerReserved } from "../utils/validation";

/**
 * 입력 필드 포커스 중 차단할 액션들.
 */
const BLOCK_IN_INPUT: Set<string> = new Set([
  "play_pause",
  "play_pause_alt",
  "prev",
  "next",
  "delete",
  "focus_text",
  "insert_after",
  "insert_at_playhead",
  "merge_prev",
  "merge_next",
  // "split_at_cursor", // 분할 때문에 주석 처리
  "next_error",
  "undo",   // textarea에서는 브라우저 기본 Undo
  "redo",   // textarea에서는 브라우저 기본 Redo
]);

/** 배속 순환: 100% → 150% → 200% → 100% → ... */
const SPEED_CYCLE = [1.0, 1.5, 2.0];

export function useKeyboardShortcuts(
  onSave: () => void,
  maxCharsPerLine: number = 20,
  onReplace?: () => void,
  speakerMode: string = "name",
) {
  const shortcuts = useSettingsStore((s) => s.shortcuts);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const keyStr = eventToKeyString(e);
      if (!keyStr) return;

      const actionId = Object.entries(shortcuts).find(([, k]) => k === keyStr)?.[0];
      if (!actionId) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isInput =
        ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || Boolean(target?.isContentEditable);

      if (isInput && BLOCK_IN_INPUT.has(actionId)) return;

      e.preventDefault();

      const playerState = usePlayerStore.getState();
      const subtitleState = useSubtitleStore.getState();

      switch (actionId) {
        case "play_pause":
        case "play_pause_alt":
          playerState.togglePlay();
          break;

        case "set_start": {
          const selId = subtitleState.selectedId;
          if (selId) {
            void subtitleState.updateOne(selId, { start_ms: playerState.currentMs });
          }
          break;
        }

        case "set_end": {
          const selId = subtitleState.selectedId;
          if (selId) {
            void subtitleState.updateOne(selId, { end_ms: playerState.currentMs });
          }
          break;
        }

        case "cycle_speed": {
          const current = playerState.playbackRate;
          const idx = SPEED_CYCLE.indexOf(current);
          const next = idx === -1 ? 1.5 : SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
          playerState.setPlaybackRate(next);
          break;
        }

        case "auto_wrap": {
          const selId = subtitleState.selectedId;
          if (!selId) break;

          const sub = subtitleState.subtitles.find((s) => s.id === selId);
          if (!sub) break;

          const flat = sub.text.replace(/\n/g, " ").trim();
          const maxC = maxCharsPerLine;
          // 첫 줄에는 화자 예약 글자수만큼 빠진 공간만 사용 가능
          const speakerReserved = calcSpeakerReserved(
            sub.speaker,
            !!sub.speaker_deleted,
            speakerMode,
          );
          const firstLineCap = Math.max(1, maxC - speakerReserved);
          const words = flat.split(/\s+/).filter(Boolean);

          const lines: string[] = [];
          let line = "";

          for (const w of words) {
            // 현재 채우고 있는 줄의 한도 — 첫 줄(lines.length === 0)이면 firstLineCap, 그 외엔 maxC
            const cap = lines.length === 0 ? firstLineCap : maxC;
            if (line && (line + " " + w).length > cap) {
              lines.push(line);
              line = w;
            } else {
              line = line ? line + " " + w : w;
            }
          }

          if (line) lines.push(line);

          subtitleState.updateLocal(selId, {
            text: lines.length > 0 ? lines.join("\n") : "",
          });
          break;
        }

        case "remove_wrap": {
          const selId = subtitleState.selectedId;
          if (!selId) break;

          const sub = subtitleState.subtitles.find((s) => s.id === selId);
          if (!sub) break;

          subtitleState.updateLocal(selId, {
            text: sub.text.replace(/\n/g, " "),
          });
          break;
        }

        case "merge_prev": {
          const { subtitles, selectedId } = subtitleState;
          if (!selectedId) break;

          const idx = subtitles.findIndex((s) => s.id === selectedId);
          if (idx <= 0) break;

          const prevSub = subtitles[idx - 1];
          useSubtitleStore.setState({
            selectedId,
            multiSelect: new Set([prevSub.id, selectedId]),
          });
          void useSubtitleStore.getState().mergeSelected();
          break;
        }

        case "merge_next": {
          const { subtitles, selectedId } = subtitleState;
          if (!selectedId) break;

          const idx = subtitles.findIndex((s) => s.id === selectedId);
          if (idx < 0 || idx >= subtitles.length - 1) break;

          const nextSub = subtitles[idx + 1];
          useSubtitleStore.setState({
            selectedId,
            multiSelect: new Set([selectedId, nextSub.id]),
          });
          void useSubtitleStore.getState().mergeSelected();
          break;
        }

        case "split_at_cursor":
          void subtitleState.splitSelected();
          break;

        case "insert_after":
          void subtitleState.addAfter();
          break;

        case "insert_at_playhead": {
          const { currentMs } = playerState;
          const { subtitles } = subtitleState;

          const prev = [...subtitles].reverse().find((s) => s.start_ms <= currentMs) ?? null;
          const next = subtitles.find((s) => s.start_ms > currentMs) ?? null;

          let startMs = currentMs;
          if (prev && startMs <= prev.end_ms) {
            startMs = prev.end_ms + 1;
          }

          let endMs = startMs + 1000;
          if (next && endMs >= next.start_ms) {
            endMs = next.start_ms - 1;
          }

          if (endMs <= startMs) {
            endMs = startMs + 1;
          }

          void subtitleState.addAfter({
            afterId: prev?.id ?? null,
            startMs,
            endMs,
          });
          break;
        }

        case "next_error": {
          const { subtitles, selectedId } = subtitleState;
          const currentIdx = subtitles.findIndex((s) => s.id === selectedId);

          for (let i = currentIdx + 1; i < subtitles.length; i++) {
            if (subtitles[i].error) {
              subtitleState.selectSingle(subtitles[i].id);
              playerState.setVideoPreviewMs(subtitles[i].start_ms);
              return;
            }
          }

          for (let i = 0; i <= Math.max(currentIdx, 0); i++) {
            if (subtitles[i]?.error) {
              subtitleState.selectSingle(subtitles[i].id);
              playerState.setVideoPreviewMs(subtitles[i].start_ms);
              return;
            }
          }
          break;
        }

        case "undo":
          void subtitleState.undo();
          break;

        case "redo":
          void subtitleState.redo();
          break;

        case "search": {
          let searchInput = document.querySelector<HTMLInputElement>("[data-grid-search]");
          if (!searchInput) {
            const searchBtn = document.querySelector<HTMLButtonElement>("[data-grid-search-toggle]");
            if (searchBtn) {
              searchBtn.click();
              requestAnimationFrame(() => {
                const openedInput =
                  document.querySelector<HTMLInputElement>("[data-grid-search]");
                openedInput?.focus();
              });
            }
          } else {
            searchInput.focus();
          }
          break;
        }

        case "replace":
          if (onReplace) onReplace();
          break;

        case "goto_line": {
          const input = prompt("이동할 자막 번호를 입력하세요:");
          if (!input) break;

          const seq = parseInt(input, 10);
          if (Number.isNaN(seq)) break;

          const targetSub = subtitleState.subtitles.find((s) => s.seq === seq);
          if (targetSub) {
            subtitleState.selectSingle(targetSub.id);
            playerState.setVideoPreviewMs(targetSub.start_ms);
          }
          break;
        }

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

        // case "focus_text": {
        //   const textarea = document.querySelector<HTMLTextAreaElement>(
        //     "[data-quick-editor-textarea]"
        //   );
        //   textarea?.focus();
        //   break;
        // }

        case "save":
          onSave();
          break;

        case "delete":
          void subtitleState.deleteSelected();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts, onSave, maxCharsPerLine, onReplace, speakerMode]);
}

// re-export for other modules
export { eventToKeyString } from "../store/useSettingsStore";