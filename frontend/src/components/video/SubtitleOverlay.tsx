import type { Subtitle } from "../../types";
import { useSettingsStore } from "../../store/useSettingsStore";

interface Props {
  subtitles: Subtitle[];
}

export function SubtitleOverlay({ subtitles }: Props) {
  const { fontSize, defaultY, topY } = useSettingsStore((s) => s.subtitleDisplay);

  const topSubs = subtitles.filter((s) => s.text_pos === "top");
  const deletedSubs = subtitles.filter((s) => s.text_pos === "deleted");
  const btmSubs = subtitles.filter((s) => s.text_pos === "default" || (s.text_pos !== "top" && s.text_pos !== "deleted"));

  const textStyle = { fontSize: `${fontSize}px` };

  const renderSub = (s: Subtitle) => {
    const isTextDeleted = s.text_pos === "deleted";
    const isSpeakerDeleted = s.speaker_pos === "deleted";

    return (
      <div key={s.id} className="text-center">
        {s.speaker && (
          <span
            className={`font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] ${
              isSpeakerDeleted ? "text-red-500 line-through" : "text-blue-400"
            }`}
            style={textStyle}
          >
            ({s.speaker}){" "}
          </span>
        )}
        <span
          className={`font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] whitespace-pre-wrap ${
            isTextDeleted
              ? "text-red-500 line-through"
              : s.type === "effect"
                ? "text-yellow-300 italic"
                : "text-white"
          }`}
          style={textStyle}
        >
          {s.text}
        </span>
      </div>
    );
  };

  return (
    <>
      {/* 상단 자막 {\an8} */}
      <div
        className="absolute inset-x-0 flex flex-col items-center gap-0.5 z-10 px-6"
        style={{ top: `${topY}%` }}
      >
        {topSubs.map(renderSub)}
      </div>
      {topSubs.length > 0 && (
        <div className="absolute top-1 right-2 z-20">
          <span className="text-[8px] bg-blue-500/30 text-blue-300 px-1 py-0.5 rounded font-mono">
            {"\\an8"}
          </span>
        </div>
      )}

      {/* 하단 자막 (기본 위치) */}
      <div
        className="absolute inset-x-0 flex flex-col items-center gap-0.5 z-10 px-6"
        style={{ top: `${defaultY}%`, transform: "translateY(-100%)" }}
      >
        {btmSubs.map(renderSub)}
      </div>

      {/* 삭제 마킹된 자막 — 기본 위치에 빨간 텍스트로 표시 */}
      <div
        className="absolute inset-x-0 flex flex-col items-center gap-0.5 z-10 px-6"
        style={{ top: `${defaultY}%`, transform: "translateY(-100%)" }}
      >
        {deletedSubs.map(renderSub)}
      </div>
    </>
  );
}