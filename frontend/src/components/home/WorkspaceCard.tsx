import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import { workspacesApi } from "../../api/workspaces";
import { useAuthStore } from "../../store/useAuthStore";
import type { Workspace } from "../../types";

interface Stats {
  sub_workspace_count: number;
  project_count: number;
  completed_count: number;
  member_count: number;
  progress_ratio: number;
}

interface Props {
  ws: Workspace;
  onClick: (id: number) => void;
  dark?: boolean;
}

export function WorkspaceCard({ ws, onClick, dark = false }: Props) {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    workspacesApi
      .getStats(ws.id)
      .then((s) => {
        if (!cancelled) setStats(s as Stats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ws.id, isAdmin]);

  const cardCls = dark
    ? "bg-zinc-900 border-zinc-800 hover:border-zinc-600"
    : "bg-white border-gray-200 hover:border-gray-400";
  const titleCls = dark ? "text-gray-100" : "text-gray-900";
  const valueCls = dark ? "text-gray-100" : "text-gray-900";
  const labelCls = dark ? "text-gray-500" : "text-gray-500";
  const barBgCls = dark ? "bg-zinc-800" : "bg-gray-200";

  const progressPct = stats
    ? Math.min(100, Math.round(stats.progress_ratio * 100))
    : null;

  return (
    <button
      onClick={() => onClick(ws.id)}
      className={`text-left border rounded-lg p-4 transition-colors cursor-pointer w-full ${cardCls}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Folder size={16} className="text-emerald-500" fill="currentColor" fillOpacity={0.25} />
        <span className={`flex-1 text-sm font-semibold truncate ${titleCls}`}>
          {ws.name}
        </span>
      </div>

      {isAdmin && stats && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <div className={`text-[10px] ${labelCls} mb-0.5`}>하위</div>
              <div className={`text-sm font-medium ${valueCls}`}>
                {stats.sub_workspace_count}
              </div>
            </div>
            <div>
              <div className={`text-[10px] ${labelCls} mb-0.5`}>완료</div>
              <div className={`text-sm font-medium ${valueCls}`}>
                {stats.completed_count}/{stats.project_count}
              </div>
            </div>
            <div>
              <div className={`text-[10px] ${labelCls} mb-0.5`}>멤버</div>
              <div className={`text-sm font-medium ${valueCls}`}>
                {stats.member_count}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${labelCls} shrink-0 w-10`}>
              {progressPct}%
            </span>
            <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${barBgCls}`}>
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </>
      )}
    </button>
  );
}