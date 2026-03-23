import type { Subtitle } from "../../types";

interface Props {
  subtitles: Subtitle[];
}

export function SubtitleOverlay({ subtitles }: Props) {
  const topSubs = subtitles.filter((s) => s.text_pos === "top");
  const btmSubs = subtitles.filter((s) => s.text_pos !== "top");

  return (
    <>
      {/* 상단 자막 {\an8} */}
      <div className="absolute top-4 inset-x-0 flex flex-col items-center gap-0.5 z-10 px-6">
        {topSubs.map((s) => (
          <div key={s.id} className="text-center">
            {s.speaker && (
              <span className="text-blue-400 font-bold text-base drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                ({s.speaker}){" "}
              </span>
            )}
            <span
              className={`font-bold text-base drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] ${
                s.type === "effect" ? "text-yellow-300 italic" : "text-white"
              }`}
            >
              {s.text}
            </span>
          </div>
        ))}
      </div>
      {topSubs.length > 0 && (
        <div className="absolute top-1 right-2 z-20">
          <span className="text-[8px] bg-blue-500/30 text-blue-300 px-1 py-0.5 rounded font-mono">
            {"\\an8"}
          </span>
        </div>
      )}

      {/* 하단 자막 */}
      <div className="absolute bottom-14 inset-x-0 flex flex-col items-center gap-0.5 z-10 px-6">
        {btmSubs.map((s) => (
          <div key={s.id} className="text-center">
            <span
              className={`font-bold text-base drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] ${
                s.type === "effect" ? "text-yellow-300 italic" : "text-white"
              }`}
            >
              {s.text}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}