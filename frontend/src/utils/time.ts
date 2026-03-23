/** "HH:MM:SS,mmm" → ms */
export function timecodeToMs(tc: string): number {
  const m = tc.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!m) return 0;
  return +m[1] * 3600000 + +m[2] * 60000 + +m[3] * 1000 + +m[4];
}

/** ms → "HH:MM:SS,mmm" */
export function msToTimecode(ms: number): string {
  if (ms < 0) ms = 0;
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const mil = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${mil}`;
}

/** 줌 레벨 라벨 */
export function formatDuration(ms: number): string {
  if (ms >= 60000) return `${Math.round(ms / 60000)}분`;
  return `${Math.round(ms / 1000)}초`;
}