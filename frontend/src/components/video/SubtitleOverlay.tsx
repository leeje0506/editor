import { useRef, useEffect } from "react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { Subtitle } from "../../types";

export function SubtitleOverlay() {
  const topRef = useRef<HTMLDivElement>(null);
  const btmRef = useRef<HTMLDivElement>(null);
  const delRef = useRef<HTMLDivElement>(null);
  const lastActiveIdsRef = useRef("");
  const rafRef = useRef<number>(0);

  const { fontSize, defaultY, topY } = useSettingsStore((s) => s.subtitleDisplay);

  const renderSub = (s: Subtitle): string => {
    // 삭제 판별: bool 필드 (위치와 독립)
    const isSpeakerDeleted = !!s.speaker_deleted;
    const isTextDeleted = !!s.text_deleted;

    let html = "";
    if (s.speaker) {
      const spClass = isSpeakerDeleted
        ? "font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] text-red-500 line-through"
        : "font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] text-blue-400";
      html += `<span class="${spClass}" style="font-size:${fontSize}px">(${s.speaker}) </span>`;
    }
    const txtClass = isTextDeleted
      ? "font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] whitespace-pre-wrap text-red-500 line-through"
      : s.type === "effect"
        ? "font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] whitespace-pre-wrap text-yellow-300 italic"
        : "font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] whitespace-pre-wrap text-white";
    html += `<span class="${txtClass}" style="font-size:${fontSize}px">${s.text}</span>`;
    return `<div class="text-center">${html}</div>`;
  };

  useEffect(() => {
    const update = () => {
      const ms = usePlayerStore.getState().getVisualMs();
      const subs = useSubtitleStore.getState().subtitles;
      const active = subs.filter((s) => ms >= s.start_ms && ms < s.end_ms);

      // active 자막 id가 안 바뀌었으면 DOM 안 건드림
      const idKey = active.map((s) => s.id).join(",");
      if (idKey === lastActiveIdsRef.current) return;
      lastActiveIdsRef.current = idKey;

      // 위치 분류: text_pos 기준 (삭제 여부와 독립)
      const topSubs = active.filter((s) => s.text_pos === "top");
      const btmSubs = active.filter((s) => s.text_pos !== "top");

      // 삭제된 자막은 해당 위치에서 빨간+취소선으로 렌더 (renderSub 내부에서 처리)
      // 별도 delRef 영역은 더 이상 불필요하지만 하위 호환을 위해 빈 상태로 유지
      const topHtml = topSubs.map(renderSub).join("");
      const btmHtml = btmSubs.map(renderSub).join("");

      if (topRef.current) topRef.current.innerHTML = topHtml;
      if (btmRef.current) btmRef.current.innerHTML = btmHtml;
      if (delRef.current) delRef.current.innerHTML = "";
    };

    let isPlaying = usePlayerStore.getState().playing;

    const startRaf = () => {
      const tick = () => {
        update();
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };
    const stopRaf = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    if (isPlaying) startRaf();

    const unsubPlayer = usePlayerStore.subscribe((state, prev) => {
      if (state.playing !== prev.playing) {
        isPlaying = state.playing;
        if (isPlaying) startRaf();
        else { stopRaf(); update(); }
      }
      if (!isPlaying && state.currentMs !== prev.currentMs) {
        update();
      }
    });
    const unsubSubs = useSubtitleStore.subscribe((state, prev) => {
      if (state.subtitles !== prev.subtitles) {
        lastActiveIdsRef.current = ""; // 강제 갱신
        update();
      }
    });

    lastActiveIdsRef.current = ""; 
    update();
    return () => { stopRaf(); unsubPlayer(); unsubSubs(); };
  }, [fontSize, defaultY, topY]);

  return (
    <>
      <div ref={topRef} className="absolute inset-x-0 flex flex-col items-center gap-0.5 z-10 px-6"
        style={{ top: `${topY}%` }} />
      <div ref={btmRef} className="absolute inset-x-0 flex flex-col items-center gap-0.5 z-10 px-6"
        style={{ top: `${defaultY}%`, transform: "translateY(-100%)" }} />
      <div ref={delRef} className="absolute inset-x-0 flex flex-col items-center gap-0.5 z-10 px-6"
        style={{ top: `${defaultY}%`, transform: "translateY(-100%)" }} />
    </>
  );
}