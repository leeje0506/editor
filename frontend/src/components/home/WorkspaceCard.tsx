import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Folder, MoreVertical, Pencil, Trash2 } from "lucide-react";
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
  onRenamed?: () => void;
  onDeleted?: () => void;
  dark?: boolean;
}

export function WorkspaceCard({ ws, onClick, onRenamed, onDeleted, dark = false }: Props) {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [stats, setStats] = useState<Stats | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(ws.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // 외부 클릭으로 메뉴 닫기
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

  // 편집 진입 시 input focus + select
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const cardCls = dark
    ? "bg-zinc-900 border-zinc-800 hover:border-zinc-600"
    : "bg-white border-gray-200 hover:border-gray-400";
  const titleCls = dark ? "text-gray-100" : "text-gray-900";
  const valueCls = dark ? "text-gray-100" : "text-gray-900";
  const labelCls = dark ? "text-gray-500" : "text-gray-500";
  const barBgCls = dark ? "bg-zinc-800" : "bg-gray-200";
  const inputCls = dark
    ? "bg-zinc-800 border-zinc-700 text-gray-100"
    : "bg-white border-gray-300 text-gray-900";
  const menuCardCls = dark
    ? "bg-zinc-900 border-zinc-700 text-gray-100"
    : "bg-white border-gray-200 text-gray-900";
  const menuItemCls = dark ? "hover:bg-zinc-800" : "hover:bg-gray-100";

  const progressPct = stats
    ? Math.min(100, Math.round(stats.progress_ratio * 100))
    : null;

  const handleCardClick = () => {
    if (editing || menuOpen || confirmDelete) return;
    onClick(ws.id);
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
    setEditVal(ws.name);
    setEditing(true);
    setMenuOpen(false);
  };

  const handleSubmitEdit = async () => {
    const trimmed = editVal.trim();
    if (!trimmed || trimmed === ws.name) {
      setEditing(false);
      setEditVal(ws.name);
      return;
    }
    try {
      await workspacesApi.rename(ws.id, trimmed);
      setEditing(false);
      onRenamed?.();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "이름 변경 실패");
      setEditVal(ws.name);
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await workspacesApi.remove(ws.id, false);
      setConfirmDelete(false);
      onDeleted?.();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail && typeof detail === "object") {
        if (detail.error === "last_root") {
          setDeleteError("워크스페이스가 최소 1개 필요합니다.");
        } else if (detail.error === "not_empty") {
          setDeleteError(
            `안에 항목이 있습니다 (워크스페이스 ${detail.workspace_count}, 프로젝트 ${detail.project_count}). 먼저 비워주세요.`,
          );
        } else {
          setDeleteError(detail.message || "삭제 실패");
        }
      } else {
        setDeleteError(typeof detail === "string" ? detail : "삭제 실패");
      }
    }
  };

  return (
    <>
      <div
        onClick={handleCardClick}
        className={`relative text-left border rounded-lg p-4 transition-colors cursor-pointer w-full ${cardCls}`}
      >
        {/* ⋮ 메뉴 버튼 (우측 상단) */}
        {isAdmin && (
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

        <div className="flex items-center gap-2 mb-3 pr-6">
          <Folder
            size={16}
            className="text-emerald-500 shrink-0"
            fill="currentColor"
            fillOpacity={0.25}
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
                  setEditVal(ws.name);
                }
              }}
              onBlur={handleSubmitEdit}
              className={`flex-1 text-sm font-semibold px-1.5 py-0.5 rounded border outline-none ${inputCls}`}
            />
          ) : (
            <span className={`flex-1 text-sm font-semibold truncate ${titleCls}`}>
              {ws.name}
            </span>
          )}
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
      </div>

      {/* 드롭다운 메뉴 */}
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

      {/* 삭제 confirm 모달 */}
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
              <h3 className="text-sm font-bold mb-3">워크스페이스 삭제</h3>
              <p className={`text-xs ${labelCls} mb-4`}>
                <span className="font-medium">{ws.name}</span> 워크스페이스를 삭제하시겠습니까?
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