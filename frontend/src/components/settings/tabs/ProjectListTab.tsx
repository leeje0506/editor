import { useEffect, useState, useMemo, useCallback } from "react";
import { Monitor, Trash2 } from "lucide-react";
import { projectsApi } from "../../../api/projects";
import { authApi } from "../../../api/auth";
import type { Project, User } from "../../../types";
import { getStatusLabel, STATUS_LABEL_COLORS } from "../../../utils/statusLabel";

function fmtElapsed(s: number) {
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(
    Math.floor((s % 3600) / 60),
  ).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}. ${
    d.getHours() >= 12 ? "오후" : "오전"
  } ${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const FILTERS = ["전체", "진행중", "제출", "반려", "재작업", "완료"] as const;
type Filter = (typeof FILTERS)[number];

interface Props {
  dark?: boolean;
}

export function ProjectListTab({ dark = true }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<Filter>("전체");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [users, setUsers] = useState<User[]>([]);

  // 색상
  const dm = dark;
  const bd = dm ? "border-gray-800" : "border-gray-200";
  const card = dm ? "bg-gray-900" : "bg-white";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const divider = dm ? "divide-gray-800" : "divide-gray-200";
  const rowHover = dm ? "hover:bg-gray-800/50" : "hover:bg-gray-50";
  const barBgCls = dm ? "bg-gray-800" : "bg-gray-200";
  const selectCls = dm
    ? "bg-gray-800 border-gray-700 text-gray-100 hover:border-gray-600"
    : "bg-white border-gray-300 text-gray-900 hover:border-gray-400";

  // 사용자 목록 (담당자 드롭다운용)
  useEffect(() => {
    authApi.listUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  // 데이터 fetch (필터 변경 시 서버에 재조회)
  const refresh = useCallback(async () => {
    try {
      const list = await projectsApi.list(
        filter === "전체" ? undefined : { status: filter },
      );
      setProjects(list);
      setSelected((prev) => {
        // 화면에서 사라진 행은 선택 해제
        const ids = new Set(list.map((p) => p.id));
        const next = new Set<number>();
        prev.forEach((id) => {
          if (ids.has(id)) next.add(id);
        });
        return next;
      });
    } catch {
      setProjects([]);
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 담당자로 지정 가능한 사용자 (활성 상태만)
  const assignableUsers = useMemo(
    () => users.filter((u) => u.is_active !== false),
    [users],
  );

  // 액션
  const handleApprove = async (id: number) => {
    await projectsApi.approve(id);
    refresh();
  };
  const handleReject = async (id: number) => {
    await projectsApi.reject(id);
    refresh();
  };
  const handleDelete = async (id: number) => {
    if (!confirm("이 프로젝트를 삭제하시겠습니까?")) return;
    await projectsApi.delete(id);
    refresh();
  };
  const handleDeleteMany = async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}개 프로젝트를 삭제하시겠습니까?`)) return;
    await projectsApi.deleteMany(Array.from(selected));
    setSelected(new Set());
    refresh();
  };
  const handleAssignChange = async (projectId: number, newAssignedTo: number | null) => {
    try {
      await projectsApi.update(projectId, { assigned_to: newAssignedTo });
      refresh();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "담당자 변경 실패");
    }
  };

  // 체크박스
  const allChecked = projects.length > 0 && selected.size === projects.length;
  const someChecked = selected.size > 0 && !allChecked;

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(projects.map((p) => p.id)));
    }
  };
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 진척률 계산 헬퍼 (101% 같은 게 안 나오게 cap)
  const progressOf = (p: Project): number | null => {
    if (!p.video_duration_ms || p.video_duration_ms <= 0) return null;
    return Math.min(
      100,
      Math.round(((p.progress_ms ?? 0) / p.video_duration_ms) * 100),
    );
  };

  // 필터 버튼 색상 (활성/비활성)
  const filterBtnCls = (active: boolean) =>
    active
      ? "bg-blue-600 text-white"
      : `border ${bd} ${ts} hover:${dm ? "text-white" : "text-black"}`;

  return (
    <div className={tp}>
      <div className="flex items-center gap-2 mb-6">
        <Monitor size={20} className="text-blue-400" />
        <h2 className="text-lg font-bold">프로젝트 및 담당자 관리</h2>
      </div>

      <div className={`${card} border ${bd} rounded-xl overflow-hidden`}>
        {/* 필터 + 일괄 액션 */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${bd} flex-wrap gap-2`}>
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${filterBtnCls(filter === f)}`}
              >
                {f}
              </button>
            ))}
          </div>
          {selected.size > 0 && (
            <button
              onClick={handleDeleteMany}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium"
            >
              <Trash2 size={12} />
              선택 {selected.size}개 삭제
            </button>
          )}
        </div>

        {/* 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${bd} text-xs ${ts}`}>
                <th className="py-2.5 px-3 text-left w-8">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={toggleAll}
                  />
                </th>
                <th className="py-2.5 px-3 text-left">작업자</th>
                <th className="py-2.5 px-3 text-left">프로젝트명</th>
                <th className="py-2.5 px-3 text-left">워크스페이스 경로</th>
                <th className="py-2.5 px-3 text-left">방송사</th>
                <th className="py-2.5 px-3 text-left">방송 정보</th>
                <th className="py-2.5 px-3 text-left">작업 시간</th>
                <th className="py-2.5 px-3 text-left">진척률</th>
                <th className="py-2.5 px-3 text-left">수정일</th>
                <th className="py-2.5 px-3 text-left">상태</th>
                <th className="py-2.5 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody className={`divide-y ${divider}`}>
              {projects.map((p) => {
                const label = getStatusLabel(p.status, p.reject_count ?? 0);
                const badgeCls = STATUS_LABEL_COLORS[label] ?? "bg-gray-500 text-white";
                const isChecked = selected.has(p.id);
                const pct = progressOf(p);
                return (
                  <tr key={p.id} className={rowHover}>
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={isChecked}
                        onChange={() => toggleOne(p.id)}
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        // 명시적으로 assigned_to가 있으면 그 값, 없으면 created_by(생성자=기본 담당자)
                        value={p.assigned_to ?? p.created_by ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          const newId = v === "" ? null : Number(v);
                          // 생성자 그대로면 굳이 PATCH 안 보냄 (assigned_to는 null로 둠)
                          if (newId === p.created_by && p.assigned_to == null) return;
                          handleAssignChange(p.id, newId);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`text-xs px-2 py-1 rounded border outline-none ${selectCls} focus:border-blue-500`}
                      >
                        {/* assignableUsers에 생성자가 빠져있을 가능성 대비해 fallback option 보장 */}
                        {p.created_by != null &&
                          !assignableUsers.some((u) => u.id === p.created_by) && (
                            <option value={p.created_by}>
                              {p.created_by_name || "—"}
                            </option>
                          )}
                        {assignableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.display_name || u.username}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3 font-bold">{p.name}</td>
                    <td className={`py-2.5 px-3 text-xs ${ts}`}>
                      {p.workspace_path && p.workspace_path.length > 0
                        ? p.workspace_path.join(" / ")
                        : "—"}
                    </td>
                    <td className="py-2.5 px-3">{p.broadcaster}</td>
                    <td className={`py-2.5 px-3 ${ts}`}>{p.description || "—"}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">
                      {fmtElapsed(p.elapsed_seconds || 0)}
                    </td>
                    <td className="py-2.5 px-3">
                      {pct === null ? (
                        <span className={`text-xs ${ts}`}>—</span>
                      ) : (
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${barBgCls}`}>
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-[10px] ${ts} shrink-0 w-8 text-right`}>{pct}%</span>
                        </div>
                      )}
                    </td>
                    <td className={`py-2.5 px-3 text-xs ${ts}`}>{fmtDate(p.created_at)}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${badgeCls}`}>
                          {label}
                        </span>
                        {p.status === "submitted" && (
                          <>
                            <button
                              onClick={() => handleApprove(p.id)}
                              className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                            >
                              ✓ 승인
                            </button>
                            <button
                              onClick={() => handleReject(p.id)}
                              className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                            >
                              ✕ 반려
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-gray-600 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {projects.length === 0 && (
          <div className={`py-12 text-center ${ts}`}>프로젝트가 없습니다</div>
        )}
      </div>
    </div>
  );
}