import { FileText } from "lucide-react";
import type { Project } from "../../types";
import { getStatusLabel, STATUS_LABEL_COLORS } from "../../utils/statusLabel";

interface Props {
  project: Project;
  onClick: (id: number) => void;
  isWorker?: boolean;
  dark?: boolean;
}

function formatDday(deadline?: string | null): { label: string; urgent: boolean } | null {
  if (!deadline) return null;
  const dl = new Date(deadline);
  if (isNaN(dl.getTime())) return null;
  const now = new Date();
  const diffMs = dl.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: `D+${-days}`, urgent: true };
  if (days === 0) return { label: "D-Day", urgent: true };
  return { label: `D-${days}`, urgent: days <= 3 };
}

export function ProjectCard({ project, onClick, isWorker = false, dark = false }: Props) {
  const label = getStatusLabel(project.status, project.reject_count ?? 0);
  const statusColor = STATUS_LABEL_COLORS[label] ?? "bg-gray-500 text-white";
  const dday = formatDday(project.deadline);
  const isRework = project.status === "in_progress" && (project.reject_count ?? 0) > 0;

  const progressPct =
    project.video_duration_ms && project.video_duration_ms > 0
      ? Math.min(
          100,
          Math.round(((project.progress_ms ?? 0) / project.video_duration_ms) * 100),
        )
      : null;

  const cardCls = dark
    ? "bg-zinc-900 border-zinc-800 hover:border-zinc-600"
    : "bg-white border-gray-200 hover:border-gray-400";
  const titleCls = dark ? "text-gray-100" : "text-gray-900";
  const labelCls = dark ? "text-gray-500" : "text-gray-500";
  const subtleCls = dark ? "text-gray-400" : "text-gray-600";
  const broadcasterCls = dark
    ? "bg-zinc-950 text-gray-200 border border-zinc-700"
    : "bg-gray-900 text-gray-100 border border-gray-700";
  const barBgCls = dark ? "bg-zinc-800" : "bg-gray-200";

  return (
    <button
      onClick={() => onClick(project.id)}
      className={`text-left border rounded-lg p-4 transition-colors cursor-pointer w-full ${cardCls}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <FileText size={16} className="text-blue-500" fill="currentColor" fillOpacity={0.2} />
        <span className={`flex-1 text-sm font-semibold truncate ${titleCls}`}>
          {project.name}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {project.broadcaster && (
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${broadcasterCls}`}>
            {project.broadcaster}
          </span>
        )}
        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${statusColor}`}>
          {label}
        </span>
        {isRework && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500 text-white font-medium">
            재작업
          </span>
        )}
        {dday && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-medium ${
              dday.urgent ? "bg-red-500 text-white" : `${barBgCls} ${subtleCls}`
            }`}
          >
            {dday.label}
          </span>
        )}
      </div>

      {(project.assigned_to_name || project.created_by_name) && (
        <div className={`text-[11px] ${subtleCls} mb-3 truncate`}>
          담당: <span className="font-medium">
            {project.assigned_to_name || project.created_by_name}
          </span>
        </div>
      )}

      {!isWorker && progressPct !== null && (
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
      )}
    </button>
  );
}