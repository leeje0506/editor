interface Props {
  pct: number;
}

export function Playhead({ pct }: Props) {
  if (pct < 0 || pct > 100) return null;

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
      style={{ left: `${pct}%` }}
    >
      <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-red-500 -ml-[4.5px] -mt-px" />
    </div>
  );
}