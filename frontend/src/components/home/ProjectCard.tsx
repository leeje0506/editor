import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { projectsApi } from "../../api/projects";
import { useAuthStore } from "../../store/useAuthStore";
import { nfcTrim } from "../../utils/normalize";
import type { Project } from "../../types";
import { getStatusLabel, STATUS_LABEL_COLORS } from "../../utils/statusLabel";

interface Props {
  project: Project;
  onClick: (id: number) => void;
  isWorker?: boolean;
  onRenamed?: () => void;
  onDeleted?: () => void;
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

export function ProjectCard({
  project,
  onClick,
  isWorker = false,
  onRenamed,
  onDeleted,
  dark = false,
}: Props) {
  const isAdmin = useAuthStore((s) => s.isAdmin());

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canShowMenu = isAdmin && !isWorker;

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

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
  const inputCls = dark
    ? "bg-zinc-800 border-zinc-700 text-gray-100"
    : "bg-white border-gray-300 text-gray-900";
  const menuCardCls = dark
    ? "bg-zinc-900 border-zinc-700 text-gray-100"
    : "bg-white border-gray-200 text-gray-900";
  const menuItemCls = dark ? "hover:bg-zinc-800" : "hover:bg-gray-100";

  const handleCardClick = () => {
    if (editing || menuOpen || confirmDelete) return;
    onClick(project.id);
  };

  const handleMenuOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ x: rect.right - 120, y: rect.bottom + 4 });
    setMenuOpen(true);
  };

  const handleStartEdit = () => {
    setEditVal(project.name);
    setEditing(true);
    setMenuOpen(false);
  };

  const handleSubmitEdit = async () => {
    const cleaned = nfcTrim(editVal);
    if (!cleaned || cleaned === project.name) {
      setEditing(false);
      setEditVal(project.name);
      return;
    }
    try {
      await projectsApi.update(project.id, { name: cleaned });
      setEditing(false);
      onRenamed?.();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "이름 변경 실패");
      setEditVal(project.name);
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await projectsApi.delete(project.id);
      setConfirmDelete(false);
      onDeleted?.();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setDeleteError(typeof detail === "string" ? detail : "삭제 실패");
    }
  };

  return (
    <>
      <div
        onClick={handleCardClick}
        className={`relative text-left border rounded-lg p-4 transition-colors cursor-pointer w-full ${cardCls}`}
      >
        {canShowMenu && (
          <button
            ref={menuBtnRef}
            onClick={handleMenuOpen}
            className={`absolute top-2 right-2 p-1 rounded ${labelCls} hover:${
              dark ? "bg-zinc-800 text-gray-200" : "bg-gray-100 text-gray-700"
            } transition-colors`}
            aria-label="메뉴"
          >
            <MoreVertical size={14} />
          </button>
        )}

        <div className="flex items-center gap-2 mb-2 pr-6">
          <FileText
            size={16}
            className="text-blue-500 shrink-0"
            fill="currentColor"
            fillOpacity={0.2}
          />
          {editing ? (
            <input
              ref={inputRef}
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmitEdit();
                if (e.key === "Escape") {
                  setEditing(false);
                  setEditVal(project.name);
                }
              }}
              onBlur={handleSubmitEdit}
              className={`flex-1 text-sm font-semibold px-1.5 py-0.5 rounded border outline-none ${inputCls}`}
            />
          ) : (
            <span className={`flex-1 text-sm font-semibold truncate ${titleCls}`}>
              {project.name}
            </span>
          )}
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
            담당:{" "}
            <span className="font-medium">
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
      </div>

      {menuOpen &&
        createPortal(
          <div
            className={`fixed z-50 min-w-[140px] py-1 border rounded shadow-lg ${menuCardCls}`}
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleStartEdit}
              className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 ${menuItemCls}`}
            >
              <Pencil size={12} /> 이름 변경
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setDeleteError(null);
                setConfirmDelete(true);
              }}
              className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 text-red-400 ${menuItemCls}`}
            >
              <Trash2 size={12} /> 삭제
            </button>
          </div>,
          document.body,
        )}

      {confirmDelete &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
            onClick={() => setConfirmDelete(false)}
          >
            <div
              className={`${menuCardCls} border rounded-xl p-5 w-96`}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold mb-3">프로젝트 삭제</h3>
              <p className={`text-xs ${labelCls} mb-4`}>
                <span className="font-medium">{project.name}</span> 프로젝트를 삭제하시겠습니까?
                <br />
                자막 데이터와 영상/파형 파일이 모두 삭제됩니다.
              </p>
              {deleteError && (
                <div className="mb-3 px-3 py-2 rounded bg-red-500/10 text-red-400 text-xs">
                  {deleteError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className={`px-3 py-1.5 text-xs ${labelCls}`}
                >
                  취소
                </button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-xs rounded bg-red-600 hover:bg-red-500 text-white font-medium"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}