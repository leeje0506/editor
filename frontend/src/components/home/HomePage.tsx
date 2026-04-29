import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Trash2, Pencil, MoreVertical, UserCog, Search, ChevronRight,
} from "lucide-react";
import { projectsApi } from "../../api/projects";
import { authApi } from "../../api/auth";
import { workspacesApi } from "../../api/workspaces";
import { useAuthStore } from "../../store/useAuthStore";
import type { Project, User, Workspace } from "../../types";
import { TopBar } from "../layout/TopBar";
import { getStatusLabel, STATUS_LABEL_COLORS } from "../../utils/statusLabel";

function fmtElapsed(s: number) {
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function dDay(iso: string | null) {
  if (!iso) return null;
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { text: `D+${-diff}`, urgent: true };
  if (diff <= 7) return { text: `D-${diff}`, urgent: diff <= 3 };
  return null;
}

function getWorkerUrgentBadge(workerProjects: Project[]) {
  let most: { text: string; urgent: boolean } | null = null;
  let mostDiff = Infinity;
  for (const p of workerProjects) {
    if (!p.deadline) continue;
    const diff = Math.ceil((new Date(p.deadline).getTime() - Date.now()) / 86400000);
    if (diff <= 7 && diff < mostDiff) {
      mostDiff = diff;
      most = diff < 0
        ? { text: `D+${-diff}`, urgent: true }
        : { text: `D-${diff}`, urgent: diff <= 3 };
    }
  }
  return most;
}

function hasRework(workerProjects: Project[]) {
  return workerProjects.some(p => p.status === "rejected" || ((p.reject_count || 0) > 0));
}

// 진척률 계산 (sum 기반, 0~100% cap)
function calcProgressPct(projects: Project[]): number | null {
  let sumProgress = 0;
  let sumVideo = 0;
  for (const p of projects) {
    if (p.video_duration_ms && p.video_duration_ms > 0) {
      sumVideo += p.video_duration_ms;
      sumProgress += p.progress_ms || 0;
    }
  }
  if (sumVideo <= 0) return null;
  return Math.min(100, Math.round((sumProgress / sumVideo) * 100));
}

// 단일 프로젝트 진척률
function projectProgressPct(p: Project): number | null {
  if (!p.video_duration_ms || p.video_duration_ms <= 0) return null;
  return Math.min(100, Math.round(((p.progress_ms || 0) / p.video_duration_ms) * 100));
}

interface WorkspaceStats {
  sub_workspace_count: number;
  project_count: number;
  completed_count: number;
  member_count: number;
  progress_ratio: number;
}

export function HomePage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuthStore();

  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("editor_darkMode");
    return saved !== null ? saved === "true" : true;
  });
  useEffect(() => { localStorage.setItem("editor_darkMode", String(dark)); }, [dark]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [wsStats, setWsStats] = useState<Map<number, WorkspaceStats>>(new Map());
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [workerChangeId, setWorkerChangeId] = useState<number | null>(null);
  const [workerChangeVal, setWorkerChangeVal] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set());
  const [workerSearch, setWorkerSearch] = useState("");
  const [dashboardFilter, setDashboardFilter] = useState<"all" | "draft" | "submitted" | "rejected">("all");

  const fetchProjects = async () => {
    try { setProjects(await projectsApi.list()); } catch {}
  };
  const fetchUsers = async () => {
    try { setAllUsers(await authApi.listUsers()); } catch {}
  };
  const fetchWorkspacesAndStats = async () => {
    try {
      const wsList = await workspacesApi.list();
      setWorkspaces(wsList);
      // 모든 워크스페이스에 대해 stats 병렬 fetch
      const pairs = await Promise.all(
        wsList.map(async (w) => {
          try {
            const s = await workspacesApi.getStats(w.id);
            return [w.id, s as WorkspaceStats] as const;
          } catch {
            return null;
          }
        }),
      );
      const m = new Map<number, WorkspaceStats>();
      for (const pair of pairs) {
        if (pair) m.set(pair[0], pair[1]);
      }
      setWsStats(m);
    } catch {
      setWorkspaces([]);
      setWsStats(new Map());
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchUsers();
    fetchWorkspacesAndStats();
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try { await projectsApi.delete(id); } catch {}
    setMenuOpen(null);
    fetchProjects();
    fetchWorkspacesAndStats();
  };

  const handleRename = async (id: number) => {
    if (!renameVal.trim()) return;
    try {
      await projectsApi.update(id, { name: renameVal.trim() });
      setRenameId(null);
      setRenameVal("");
      setMenuOpen(null);
      fetchProjects();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "이름 변경 실패";
      alert(msg);
    }
  };

  const handleWorkerChange = async (id: number) => {
    const val = Number(workerChangeVal);
    if (!val) return;
    try {
      await projectsApi.update(id, { assigned_to: val });
    } catch {}
    setWorkerChangeId(null);
    setWorkerChangeVal("");
    setMenuOpen(null);
    fetchProjects();
  };

  const toggleWorker = (name: string) => {
    setExpandedWorkers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllWorkers = (workerNames: string[]) => {
    if (expandedWorkers.size === workerNames.length) {
      setExpandedWorkers(new Set());
    } else {
      setExpandedWorkers(new Set(workerNames));
    }
  };

  const counts = {
    draft: projects.filter(p => p.status === "in_progress" || p.status === "rejected").length,
    submitted: projects.filter(p => p.status === "submitted").length,
    approved: projects.filter(p => p.status === "completed").length,
  };
  const totalCount = counts.draft + counts.approved;

  const dm = dark;
  const bg = dm ? "bg-gray-950" : "bg-gray-50";
  const card = dm ? "bg-gray-900" : "bg-white";
  const cb = dm ? "border-gray-800" : "border-gray-200";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const barBg = dm ? "bg-gray-800" : "bg-gray-200";

  const avatarColors = [
    { bg: "rgba(55,138,221,0.15)", text: "#378ADD" },
    { bg: "rgba(127,119,221,0.15)", text: "#7F77DD" },
    { bg: "rgba(29,158,117,0.15)", text: "#1D9E75" },
    { bg: "rgba(216,90,48,0.15)", text: "#D85A30" },
    { bg: "rgba(212,83,126,0.15)", text: "#D4537E" },
    { bg: "rgba(186,117,23,0.15)", text: "#BA7517" },
  ];
  const getAvatarColor = (index: number) => avatarColors[index % avatarColors.length];

  // 작업자 카드 헤더의 진척률 바 (인라인)
  const ProgressBar = ({ pct }: { pct: number | null }) => {
    if (pct === null) {
      return <span className={`text-[11px] ${ts} shrink-0`}>—</span>;
    }
    return (
      <div className="flex items-center gap-1.5 w-32 shrink-0">
        <span className={`text-[11px] font-bold ${tp} w-9 text-right shrink-0`}>{pct}%</span>
        <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${barBg}`}>
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  // ── 워크스페이스 진척률 트리 ──
  const renderWorkspaceProgressTree = () => {
    if (workspaces.length === 0) {
      return <div className={`text-[10px] ${ts}`}>데이터 없음</div>;
    }
    // 평탄 리스트 → tree 정렬은 이미 depth ASC, name ASC. 그대로 들여쓰기로 그림.
    return (
      <ul className="flex flex-col gap-1">
        {workspaces.map((w) => {
          const stats = wsStats.get(w.id);
          const pct = stats ? Math.min(100, Math.round(stats.progress_ratio * 100)) : null;
          const depth = w.depth ?? 1;
          return (
            <li
              key={w.id}
              className="flex items-center gap-1.5"
              style={{ paddingLeft: `${(depth - 1) * 12}px` }}
            >
              {depth > 1 && <span className={`${ts} text-[9px]`}>└</span>}
              <span className={`text-[10px] ${tp} flex-1 truncate`}>{w.name}</span>
              <div className={`w-16 h-1.5 rounded-full overflow-hidden ${dm ? "bg-gray-700" : "bg-gray-200"} shrink-0`}>
                {pct !== null && (
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
              <span className={`text-[9px] ${ts} w-8 text-right shrink-0`}>
                {pct !== null ? `${pct}%` : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    );
  };

  // ── 작업자 중심 대시보드 ──
  const workerDashboardContent = (() => {
    const workerMap = new Map<string, { user: User | null; projects: Project[] }>();
    for (const u of allUsers.filter(u => u.is_active !== false)) {
      const name = u.display_name || u.username;
      workerMap.set(name, { user: u, projects: [] });
    }
    for (const p of projects) {
      const name = p.assigned_to_name || p.created_by_name;
      if (!name) continue;
      if (!workerMap.has(name)) workerMap.set(name, { user: null, projects: [] });
      workerMap.get(name)!.projects.push(p);
    }

    let workerEntries = Array.from(workerMap.entries()).map(([name, data]) => ({
      name, user: data.user, projects: data.projects,
      draftCount: data.projects.filter(p => p.status === "in_progress" || p.status === "rejected").length,
      submittedCount: data.projects.filter(p => p.status === "submitted").length,
      approvedCount: data.projects.filter(p => p.status === "completed").length,
      totalSec: data.projects.reduce((sum, p) => sum + (p.elapsed_seconds || 0), 0),
      progressPct: calcProgressPct(data.projects),
    }));
    workerEntries.sort((a, b) => b.draftCount - a.draftCount || b.submittedCount - a.submittedCount || a.name.localeCompare(b.name));
    if (workerSearch) {
      const q = workerSearch.toLowerCase();
      workerEntries = workerEntries.filter(w => w.name.toLowerCase().includes(q));
    }

    if (dashboardFilter !== "all") {
      workerEntries = workerEntries.filter(w =>
        w.projects.some(p => {
          if (dashboardFilter === "draft") return p.status === "in_progress" || p.status === "rejected";
          if (dashboardFilter === "rejected") return p.status === "rejected";
          return p.status === dashboardFilter;
        })
      );
    }

    const workerNames = workerEntries.map(w => w.name);
    const allExpanded = expandedWorkers.size === workerNames.length && workerNames.length > 0;

    const submittedProjects = projects.filter(p => p.status === "submitted");

    return (
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${tp}`}>작업자 현황</span>
              <span className={`text-xs ${ts}`}>{workerEntries.length}명</span>
              <button
                onClick={() => navigate("/settings/members")}
                className={`text-[10px] px-2 py-0.5 rounded border ${cb} ${ts} hover:text-blue-400 hover:border-blue-400 transition-colors`}
              >
                <UserCog size={10} className="inline -mt-px mr-0.5" /> 작업자 관리
              </button>
              <div className={`flex rounded-lg border ${cb} overflow-hidden`}>
                {([
                  { key: "all" as const, label: "전체" },
                  { key: "draft" as const, label: "진행 중" },
                  { key: "submitted" as const, label: "제출됨" },
                  { key: "rejected" as const, label: "반려됨" },
                ] as const).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setDashboardFilter(f.key)}
                    className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                      dashboardFilter === f.key
                        ? "bg-blue-500/20 text-blue-400"
                        : `${ts} hover:${dm ? "text-white" : "text-black"} hover:${dm ? "bg-gray-800" : "bg-gray-100"}`
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 border ${cb} rounded-lg px-3 py-1.5`}>
                <Search size={13} className={ts} />
                <input value={workerSearch} onChange={e => setWorkerSearch(e.target.value)} placeholder="작업자 검색..." className={`bg-transparent text-xs outline-none ${tp} w-32`} />
              </div>
              <button onClick={() => toggleAllWorkers(workerNames)} className={`text-xs border ${cb} rounded-lg px-3 py-1.5 ${ts} hover:${dm ? "text-white" : "text-black"}`}>
                {allExpanded ? "전체 접기" : "전체 펼치기"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {workerEntries.map((w, idx) => {
              const isOpen = expandedWorkers.has(w.name);
              const avatar = getAvatarColor(idx);
              const initial = w.name.charAt(0);
              const urgentBadge = getWorkerUrgentBadge(w.projects.filter(p => p.status === "in_progress" || p.status === "rejected"));
              const hasReworkFlag = hasRework(w.projects);
              const activeProjects = w.projects.filter(p => {
                if (dashboardFilter === "all") return p.status === "in_progress" || p.status === "rejected" || p.status === "submitted";
                if (dashboardFilter === "draft") return p.status === "in_progress" || p.status === "rejected";
                if (dashboardFilter === "rejected") return p.status === "rejected";
                return p.status === dashboardFilter;
              });
              return (
                <div key={w.name} className={`${card} border ${cb} rounded-lg overflow-hidden`}>
                  <div className={`flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer hover:${dm ? "bg-gray-800/50" : "bg-gray-50"} transition-colors`} onClick={() => toggleWorker(w.name)}>
                    <ChevronRight size={14} className={`${ts} transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: avatar.bg, color: avatar.text }}>{initial}</div>
                    <span className={`text-xs font-bold ${tp} w-14 shrink-0 truncate`}>{w.name}</span>
                    <div className={`flex-1 flex items-center gap-3 text-[11px] ${ts}`}>
                      <span>진행 <span className="font-bold text-blue-400">{w.draftCount}</span></span>
                      <span>제출 <span className="font-bold text-yellow-400">{w.submittedCount}</span></span>
                      <span>완료 <span className="font-bold text-emerald-400">{w.approvedCount}</span></span>
                    </div>
                    <span className={`text-[11px] ${ts} shrink-0`}>총 {fmtElapsed(w.totalSec)}</span>
                    {urgentBadge && <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${urgentBadge.urgent ? "bg-red-500/20 text-red-400" : `${dm ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"}`}`}>{urgentBadge.text}</span>}
                    {hasReworkFlag && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-orange-500/20 text-orange-400 shrink-0">재작업</span>}
                    <ProgressBar pct={w.progressPct} />
                  </div>
                  {isOpen && activeProjects.length > 0 && (
                    <div className={`border-t ${cb} px-3.5 py-2 flex flex-col gap-1.5`} style={{ paddingLeft: 48 }}>
                      {activeProjects.map(p => {
                        const dd = dDay(p.deadline);
                        const isChangingWorker = workerChangeId === p.id;
                        const label = getStatusLabel(p.status, p.reject_count);
                        const colorCls = STATUS_LABEL_COLORS[label];
                        const pct = projectProgressPct(p);
                        return (
                          <div key={p.id} className={`flex items-center gap-2 px-3 py-2 rounded-md text-[11px] ${p.status === "submitted" ? dm ? "bg-yellow-500/5 border border-yellow-500/10" : "bg-yellow-50 border border-yellow-100" : dm ? "bg-gray-800/60" : "bg-gray-50"}`}>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${colorCls}`}>
                              {label}
                            </span>
                            <span className={`${tp} flex-1 truncate`}>{p.name}</span>
                            <span className={`${ts} shrink-0`}>{p.broadcaster}</span>
                            <span className={`${ts} shrink-0`}>{fmtElapsed(p.elapsed_seconds)}</span>
                            {pct !== null && (
                              <div className="flex items-center gap-1 w-24 shrink-0">
                                <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${barBg}`}>
                                  <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                                </div>
                                <span className={`text-[9px] ${ts} w-7 text-right shrink-0`}>{pct}%</span>
                              </div>
                            )}
                            {dd && <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${dd.urgent ? "bg-red-500/20 text-red-400" : `${dm ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"}`}`}>{dd.text}</span>}
                            {isChangingWorker ? (
                              <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                <select value={workerChangeVal} onChange={e => setWorkerChangeVal(e.target.value)} autoFocus className={`text-[10px] px-1.5 py-0.5 rounded border outline-none ${dm ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-300 text-black"}`}>
                                  <option value="">선택...</option>
                                  {allUsers.filter(u => u.is_active !== false).map(u => (<option key={u.id} value={u.id}>{u.display_name || u.username}</option>))}
                                </select>
                                <button onClick={() => handleWorkerChange(p.id)} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">확인</button>
                                <button onClick={() => { setWorkerChangeId(null); setWorkerChangeVal(""); }} className={`text-[9px] px-1.5 py-0.5 rounded ${ts}`}>취소</button>
                              </div>
                            ) : (
                              <button onClick={(e) => { e.stopPropagation(); setWorkerChangeId(p.id); setWorkerChangeVal(""); }} className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${dm ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`} title="담당자 변경">
                                <UserCog size={10} className="inline -mt-px" /> 변경
                              </button>
                            )}
                            {p.status === "submitted" && isAdmin() && (
                              <button onClick={(e) => { e.stopPropagation(); navigate(`/editor/${p.id}`); }} className="text-[9px] px-2 py-0.5 rounded font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 shrink-0">검수</button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (menuOpen === p.id) {
                                  setMenuOpen(null);
                                } else {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const spaceBelow = window.innerHeight - rect.bottom;
                                  const top = spaceBelow < 140 ? rect.top - 120 : rect.bottom + 4;
                                  const left = rect.right - 160;
                                  setMenuPos({ top, left: Math.max(8, left) });
                                  setMenuOpen(p.id);
                                }
                              }}
                              className={`p-1 rounded shrink-0 ${ts} hover:${dm ? "text-white" : "text-black"}`}
                            >
                              <MoreVertical size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isOpen && activeProjects.length === 0 && (
                    <div className={`border-t ${cb} px-3.5 py-3 ${ts} text-[11px]`} style={{ paddingLeft: 48 }}>진행 중인 작업이 없습니다</div>
                  )}
                </div>
              );
            })}
            {workerEntries.length === 0 && (
              <div className={`${card} border ${cb} rounded-lg py-8 text-center ${ts} text-sm`}>{workerSearch ? "검색 결과가 없습니다" : "등록된 작업자가 없습니다"}</div>
            )}
          </div>
        </div>

        {/* 우측 패널 */}
        <div className={`w-72 ${card} border-l ${cb} p-4 overflow-y-auto shrink-0 flex flex-col gap-3`}>
          <div className={`text-xs font-bold ${ts}`}>전체 현황</div>

          {/* 통계 카드 3종 (진행 / 완료 / 전체) */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "진행", value: counts.draft, color: "text-blue-400" },
              { label: "완료", value: counts.approved, color: "text-emerald-400" },
              { label: "전체", value: totalCount, color: tp },
            ].map(c => (
              <div key={c.label} className={`${dm ? "bg-gray-800" : "bg-gray-50"} rounded-lg p-2.5 text-center`}>
                <div className={`text-[10px] ${ts}`}>{c.label}</div>
                <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* 워크스페이스 진척률 트리 */}
          <div className={`${dm ? "bg-gray-800" : "bg-gray-50"} rounded-lg p-3`}>
            <div className={`text-[10px] font-medium ${ts} mb-2.5`}>워크스페이스 진척률</div>
            {renderWorkspaceProgressTree()}
          </div>

          {/* 검수 대기 */}
          {submittedProjects.length > 0 && (
            <div className={`rounded-lg p-3 ${dm ? "bg-yellow-500/5 border border-yellow-500/10" : "bg-yellow-50 border border-yellow-100"}`}>
              <div className="text-[10px] font-bold text-yellow-400 mb-2">검수 대기 {submittedProjects.length}건</div>
              <div className="flex flex-col gap-1.5">
                {submittedProjects.map(p => (
                  <div key={p.id} className="flex items-center justify-between cursor-pointer group" onClick={() => navigate(`/editor/${p.id}`)}>
                    <span className={`text-[10px] ${tp} truncate flex-1 group-hover:text-blue-400 transition-colors`}>{p.name}</span>
                    <span className={`text-[9px] ${ts} ml-2 shrink-0`}>{p.assigned_to_name || p.created_by_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  })();

  return (
    <div className={`h-screen ${bg} ${tp} flex flex-col overflow-hidden`}>
      <TopBar dark={dark} onToggleDark={() => setDark(!dark)} />

      <div className="flex-1 flex min-h-0">
        {workerDashboardContent}
      </div>

      {menuOpen !== null && createPortal(
        <div ref={menuRef} className={`fixed ${card} border ${cb} rounded-xl shadow-2xl py-1 w-40 z-[9999]`} style={{ top: menuPos.top, left: menuPos.left }}>
          <button onClick={() => { const p = projects.find(pr => pr.id === menuOpen); if (p) { setRenameId(p.id); setRenameVal(p.name); } setMenuOpen(null); }} className={`flex items-center gap-2 w-full px-4 py-2 text-xs ${ts} hover:${dm ? "bg-gray-800" : "bg-gray-100"} hover:${dm ? "text-white" : "text-black"}`}>
            <Pencil size={13} /> 이름 수정
          </button>
          {isAdmin() && (
            <button onClick={() => { setWorkerChangeId(menuOpen); setWorkerChangeVal(""); setMenuOpen(null); }} className={`flex items-center gap-2 w-full px-4 py-2 text-xs ${ts} hover:${dm ? "bg-gray-800" : "bg-gray-100"} hover:${dm ? "text-white" : "text-black"}`}>
              <UserCog size={13} /> 작업자 변경
            </button>
          )}
          <button onClick={() => { if (menuOpen) handleDelete(menuOpen); }} className={`flex items-center gap-2 w-full px-4 py-2 text-xs text-red-400 hover:${dm ? "bg-gray-800" : "bg-gray-100"}`}>
            <Trash2 size={13} /> 삭제
          </button>
        </div>,
        document.body
      )}

      {renameId !== null && createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/50`} onClick={() => setRenameId(null)}>
          <div className={`${card} border ${cb} rounded-xl p-4 w-80`} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">프로젝트 이름 수정</h3>
            <input
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleRename(renameId); if (e.key === "Escape") setRenameId(null); }}
              autoFocus
              className={`w-full px-3 py-2 text-sm rounded border outline-none ${dm ? "bg-gray-800 border-gray-600 text-white" : "bg-white border-gray-300 text-black"} focus:border-blue-500`}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRenameId(null)} className={`px-3 py-1.5 text-xs ${ts}`}>취소</button>
              <button onClick={() => handleRename(renameId)} className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium">저장</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}