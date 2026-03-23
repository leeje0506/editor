import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { msToTimecode } from "../../utils/time";
import { SubtitleOverlay } from "./SubtitleOverlay";

interface Props {
  dark: boolean;
}

export function VideoPlayer({ dark }: Props) {
  const { currentMs, playing, muted, totalMs, togglePlay, toggleMute } = usePlayerStore();
  const subtitles = useSubtitleStore((s) => s.subtitles);

  const activeNow = subtitles.filter(
    (s) => currentMs >= s.start_ms && currentMs < s.end_ms,
  );

  return (
    <>
      {/* Video area */}
      <div className="flex-1 relative bg-zinc-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-zinc-700 text-4xl font-bold opacity-[0.06] tracking-[0.3em]">VIDEO</div>
        </div>

        {/* TODO: 실제 영상 연결 시 <video> 태그 사용 */}
        {/* <video ref={videoRef} src={projectsApi.videoStreamUrl(projectId)} /> */}

        <SubtitleOverlay subtitles={activeNow} />
      </div>

      {/* Controls */}
      <div className="h-10 shrink-0 bg-black flex items-center justify-between px-4 text-white border-t border-zinc-800">
        <div className="flex items-center gap-3">
          <button onClick={togglePlay} className="hover:opacity-80">
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <span className="text-xs font-mono text-gray-300">
            {msToTimecode(currentMs)} / {msToTimecode(totalMs)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleMute}>
            {muted ? <VolumeX size={16} className="text-gray-400" /> : <Volume2 size={16} className="text-gray-300" />}
          </button>
          <button>
            <Maximize size={16} className="text-gray-300" />
          </button>
        </div>
      </div>
    </>
  );
}