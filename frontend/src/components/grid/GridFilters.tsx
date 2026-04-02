import { useState } from "react";
import { Filter, Search, ChevronDown, X } from "lucide-react";

export interface Filters {
  type: string;
  textPos: string;
  error: string;
  search: string;
}

interface Props {
  dark: boolean;
  filters: Filters;
  onChange: (f: Filters) => void;
}

const FILTER_DEFS = [
  { k: "type" as const, l: "유형", o: ["전체", "dialogue", "effect"] },
  { k: "textPos" as const, l: "대사 위치", o: ["전체", "top", "default"] },
  { k: "error" as const, l: "검수 상태", o: ["전체", "오류만", "정상만"] },
];

export function GridFilters({ dark, filters, onChange }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const dm = dark;
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const card = dm ? "bg-gray-800" : "bg-white";
  const hr = dm ? "hover:bg-gray-700/50" : "hover:bg-gray-50";

  const displayLabel = (k: string, v: string) => {
    if (k === "type") return v === "dialogue" ? "대사" : v === "effect" ? "효과" : v;
    if (k === "textPos") return v === "top" ? "상단이동" : v === "default" ? "-" : v;
    return v;
  };

  return (
    <div className={`h-8 px-3 flex items-center gap-2 text-[10px] ${ts} ${dm ? "bg-gray-800/30" : "bg-gray-50/50"}`}>
      <Filter size={11} className={ts} />
      {FILTER_DEFS.map((f) => (
        <div key={f.k} className="relative">
          <button
            onClick={() => setOpenKey(openKey === f.k ? null : f.k)}
            className={`flex items-center gap-0.5 border ${bd} ${card} px-2 py-0.5 rounded hover:opacity-80`}
          >
            {f.l} ({displayLabel(f.k, filters[f.k])}) <ChevronDown size={10} />
          </button>
          {openKey === f.k && (
            <div className={`absolute top-full left-0 mt-1 ${card} border ${bd} rounded shadow-lg z-40 min-w-[80px]`}>
              {f.o.map((o) => (
                <button
                  key={o}
                  onClick={() => { onChange({ ...filters, [f.k]: o }); setOpenKey(null); }}
                  className={`block w-full text-left px-3 py-1.5 text-[10px] ${hr} ${filters[f.k] === o ? "text-blue-500 font-medium" : tp}`}
                >
                  {displayLabel(f.k, o)}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="flex-1" />
      <button
        data-grid-search-toggle
        onClick={() => setShowSearch(!showSearch)}
        className={`flex items-center gap-0.5 border ${bd} ${card} px-1.5 py-0.5 rounded hover:opacity-80`}
      >
        <Search size={10} /> 검색
      </button>
      {showSearch && (
        <>
          <input
            data-grid-search
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="검색..."
            className={`text-xs outline-none bg-transparent ${tp} w-32 border-b ${bd} pb-0.5`}
            autoFocus
          />
          {filters.search && (
            <button onClick={() => onChange({ ...filters, search: "" })}>
              <X size={11} className={ts} />
            </button>
          )}
        </>
      )}
    </div>
  );
}