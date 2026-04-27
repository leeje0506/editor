import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Monitor, Plus, Moon, Sun, Trash2, Download, Clock, Save, LogOut,
  Settings, LayoutDashboard, Columns3, Table2, BookOpen,
  Film, MoreVertical, Pencil, UserCog, Search, ChevronDown, ChevronRight,
  FolderOpen
} from "lucide-react";
import { projectsApi } from "../../api/projects";
import { authApi } from "../../api/auth";
import { useAuthStore } from "../../store/useAuthStore";
import { useBroadcasterStore } from "../../store/useBroadcasterStore";
import type { Project, User } from "../../types";
import { NewProjectModal } from "./NewProjectModal";
import api from "../../api/client";

function fmtElapsed(s: number) {
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return "미설정";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dDay(iso: string | null) {
  if (!iso) return null;
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { text: `D+${-diff}`, urgent: true };
  if (diff <= 7) return { text: `D-${diff}`, urgent: diff <= 3 };
  return null;
}

type Tab = "draft" | "submitted" | "approved";

/** 작업자별 가장 긴급한 D-day 배지 계산 */
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

/** 작업자에게 재작업이 있는지 */
function hasRework(workerProjects: Project[]) {
  return workerProjects.some(p => p.status === "rejected" || ((p.reject_count || 0) > 0));
}

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuthStore();

  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("editor_darkMode");
    return saved !== null ? saved === "true" : true;
  });
  useEffect(() => { localStorage.setItem("editor_darkMode", String(dark)); }, [dark]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<Tab>("draft");
  const [searchQ, setSearchQ] = useState("");
  const [bcFilter, setBcFilter] = useState("전체");
  const [showNew, setShowNew] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [workerChangeId, setWorkerChangeId] = useState<number | null>(null);
  const [workerChangeVal, setWorkerChangeVal] = useState("");
  const [showBcDrop, setShowBcDrop] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const bcStore = useBroadcasterStore();

  // 대시보드 전용 state
  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set());
  const [workerSearch, setWorkerSearch] = useState("");

  const isDashboard = location.pathname === "/dashboard";

  const fetchProjects = async () => {
    try { setProjects(await projectsApi.list()); } catch {}
  };
  const fetchUsers = async () => {
    try { setAllUsers(await authApi.listUsers()); } catch {}
  };
  useEffect(() => {
    fetchProjects();
    fetchUsers();
    bcStore.fetch();
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
      next.has(name) ? next.delete(name) : next.add(name);
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

  const broadcasters = ["전체", ...bcStore.names];

  const counts = {
    draft: projects.filter(p => p.status === "draft" || p.status === "rejected").length,
    submitted: projects.filter(p => p.status === "submitted").length,
    approved: projects.filter(p => p.status === "approved").length,
  };

  const filtered = projects.filter(p => {
    if (tab === "draft" && p.status !== "draft" && p.status !== "rejected") return false;
    if (tab === "submitted" && p.status !== "submitted") return false;
    if (tab === "approved" && p.status !== "approved") return false;
    if (searchQ && !p.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
    if (bcFilter !== "전체" && p.broadcaster !== bcFilter) return false;
    return true;
  });

  const dm = dark;
  const bg = dm ? "bg-gray-950" : "bg-gray-50";
  const card = dm ? "bg-gray-900" : "bg-white";
  const cb = dm ? "border-gray-800" : "border-gray-200";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const ts2 = dm ? "text-gray-600" : "text-gray-400";

  // ── 아바타 색상 팔레트 ──
  const avatarColors = [
    { bg: "rgba(55,138,221,0.15)", text: "#378ADD" },
    { bg: "rgba(127,119,221,0.15)", text: "#7F77DD" },
    { bg: "rgba(29,158,117,0.15)", text: "#1D9E75" },
    { bg: "rgba(216,90,48,0.15)", text: "#D85A30" },
    { bg: "rgba(212,83,126,0.15)", text: "#D4537E" },
    { bg: "rgba(186,117,23,0.15)", text: "#BA7517" },
  ];
  const getAvatarColor = (index: number) => avatarColors[index % avatarColors.length];

  const Sidebar = () => (
    <aside className={`w-52 ${card} border-r ${cb} flex flex-col shrink-0`}>
      <nav className="flex-1 py-4 px-3 space-y-6 text-sm">
        <div>
          <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>작업</div>
          <button onClick={() => setShowNew(true)} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:${dm ? "text-white" : "text-black"} hover:${dm ? "bg-gray-800" : "bg-gray-100"}`}>
            <Plus size={16} /> 새 작업 시작하기
          </button>
        </div>
        {isAdmin() && (
          <div>
            <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>보기</div>
            <button onClick={() => navigate("/dashboard")} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${isDashboard ? "bg-blue-600/20 text-blue-400" : `${ts} hover:${dm ? "text-white" : "text-black"} hover:${dm ? "bg-gray-800" : "bg-gray-100"}`}`}>
              <LayoutDashboard size={16} /> 대시보드
            </button>
            <button onClick={() => navigate("/projects")} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg mt-1 ${!isDashboard ? "bg-blue-600/20 text-blue-400" : `${ts} hover:${dm ? "text-white" : "text-black"} hover:${dm ? "bg-gray-800" : "bg-gray-100"}`}`}>
              <FolderOpen size={16} /> 내 작업
            </button>
          </div>
        )}
        <div>
          <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>도구</div>
          <button className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:${dm ? "text-white" : "text-black"} hover:${dm ? "bg-gray-800" : "bg-gray-100"}`}>
            <Columns3 size={16} /> 자막 버전 비교
          </button>
          {isAdmin() && (
            <button className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:${dm ? "text-white" : "text-black"} hover:${dm ? "bg-gray-800" : "bg-gray-100"}`}>
              <Table2 size={16} /> 완성본 검수
            </button>
          )}
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>도움말</div>
          <button className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:${dm ? "text-white" : "text-black"} hover:${dm ? "bg-gray-800" : "bg-gray-100"}`}>
            <BookOpen size={16} /> 사용자 가이드
          </button>
        </div>
      </nav>
    </aside>
  );

  // ── 작업자 중심 대시보드 ──
  const workerDashboardContent = (() => {
    // 작업자별 프로젝트 그룹핑
    const workerMap = new Map<string, { user: User | null; projects: Project[] }>();

    // 활성 사용자 기반으로 초기화
    for (const u of allUsers.filter(u => u.is_active !== false)) {
      const name = u.display_name || u.username;
      workerMap.set(name, { user: u, projects: [] });
    }

    // 프로젝트를 작업자에게 매핑
    for (const p of projects) {
      const name = p.assigned_to_name || p.created_by_name;
      if (!name) continue;
      if (!workerMap.has(name)) {
        workerMap.set(name, { user: null, projects: [] });
      }
      workerMap.get(name)!.projects.push(p);
    }

    // 미배정 프로젝트
    const unassigned = projects.filter(p => !p.assigned_to_name && !p.created_by_name);

    // 작업자 목록 (진행 건수 내림차순 정렬)
    let workerEntries = Array.from(workerMap.entries()).map(([name, data]) => ({
      name,
      user: data.user,
      projects: data.projects,
      draftCount: data.projects.filter(p => p.status === "draft" || p.status === "rejected").length,
      submittedCount: data.projects.filter(p => p.status === "submitted").length,
      approvedCount: data.projects.filter(p => p.status === "approved").length,
      totalSec: data.projects.reduce((sum, p) => sum + (p.elapsed_seconds || 0), 0),
    }));

    // 진행 건수 > 제출 건수 > 이름 순 정렬
    workerEntries.sort((a, b) => b.draftCount - a.draftCount || b.submittedCount - a.submittedCount || a.name.localeCompare(b.name));

    // 작업자 검색 필터
    if (workerSearch) {
      const q = workerSearch.toLowerCase();
      workerEntries = workerEntries.filter(w => w.name.toLowerCase().includes(q));
    }

    const workerNames = workerEntries.map(w => w.name);
    const allExpanded = expandedWorkers.size === workerNames.length && workerNames.length > 0;

    // 방송사별 통계
    const bcEntries = Array.from(new Set(projects.map(p => p.broadcaster).filter(Boolean))).map(bc => ({
      bc: bc!,
      cnt: projects.filter(p => p.broadcaster === bc).length,
      totalSec: projects.filter(p => p.broadcaster === bc).reduce((sum, p) => sum + (p.elapsed_seconds || 0), 0),
    }));
    bcEntries.sort((a, b) => b.cnt - a.cnt);
    const maxBcSec = Math.max(1, ...bcEntries.map(e => e.totalSec));

    // 검수 대기 목록
    const submittedProjects = projects.filter(p => p.status === "submitted");

    return (
      <div className="flex flex-1 min-h-0">
        {/* 메인: 작업자 카드 리스트 */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${tp}`}>작업자 현황</span>
              <span className={`text-xs ${ts}`}>{workerEntries.length}명</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 border ${cb} rounded-lg px-3 py-1.5`}>
                <Search size={13} className={ts} />
                <input
                  value={workerSearch}
                  onChange={e => setWorkerSearch(e.target.value)}
                  placeholder="작업자 검색..."
                  className={`bg-transparent text-xs outline-none ${tp} w-32`}
                />
              </div>
              <button
                onClick={() => toggleAllWorkers(workerNames)}
                className={`text-xs border ${cb} rounded-lg px-3 py-1.5 ${ts} hover:${dm ? "text-white" : "text-black"}`}
              >
                {allExpanded ? "전체 접기" : "전체 펼치기"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {workerEntries.map((w, idx) => {
              const isOpen = expandedWorkers.has(w.name);
              const avatar = getAvatarColor(idx);
              const initial = w.name.charAt(0);
              const urgentBadge = getWorkerUrgentBadge(w.projects.filter(p => p.status === "draft" || p.status === "rejected"));
              const hasReworkFlag = hasRework(w.projects);
              // 진행 중 + 제출된 프로젝트만 펼쳐서 보여줌
              const activeProjects = w.projects.filter(p => p.status === "draft" || p.status === "rejected" || p.status === "submitted");

              return (
                <div key={w.name} className={`${card} border ${cb} rounded-lg overflow-hidden`}>
                  {/* 접힌 헤더 */}
                  <div
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer hover:${dm ? "bg-gray-800/50" : "bg-gray-50"} transition-colors`}
                    onClick={() => toggleWorker(w.name)}
                  >
                    <ChevronRight size={14} className={`${ts} transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ background: avatar.bg, color: avatar.text }}
                    >
                      {initial}
                    </div>
                    <span className={`text-xs font-bold ${tp} w-14 shrink-0 truncate`}>{w.name}</span>
                    <div className={`flex-1 flex items-center gap-3 text-[11px] ${ts}`}>
                      <span>진행 <span className="font-bold text-blue-400">{w.draftCount}</span></span>
                      <span>제출 <span className="font-bold text-yellow-400">{w.submittedCount}</span></span>
                      <span>승인 <span className="font-bold text-emerald-400">{w.approvedCount}</span></span>
                    </div>
                    <span className={`text-[11px] ${ts} shrink-0`}>총 {fmtElapsed(w.totalSec)}</span>
                    {urgentBadge && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${urgentBadge.urgent ? "bg-red-500/20 text-red-400" : `${dm ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"}`}`}>
                        {urgentBadge.text}
                      </span>
                    )}
                    {hasReworkFlag && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-orange-500/20 text-orange-400 shrink-0">재작업</span>
                    )}
                  </div>

                  {/* 펼친 프로젝트 목록 */}
                  {isOpen && activeProjects.length > 0 && (
                    <div className={`border-t ${cb} px-3.5 py-2 flex flex-col gap-1.5`} style={{ paddingLeft: 48 }}>
                      {activeProjects.map(p => {
                        const dd = dDay(p.deadline);
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-md text-[11px] group ${
                              p.status === "submitted"
                                ? dm ? "bg-yellow-500/5 border border-yellow-500/10" : "bg-yellow-50 border border-yellow-100"
                                : dm ? "bg-gray-800/60" : "bg-gray-50"
                            }`}
                          >
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                              p.status === "submitted" ? "bg-yellow-500/20 text-yellow-400" :
                              p.status === "rejected" ? "bg-orange-500/20 text-orange-400" :
                              "bg-blue-500/20 text-blue-400"
                            }`}>
                              {p.status === "draft" ? "진행" : p.status === "submitted" ? "제출" : p.status === "rejected" ? "반려" : p.status}
                            </span>
                            <span className={`${tp} flex-1 truncate`}>{p.name}</span>
                            <span className={`${ts} shrink-0`}>{p.broadcaster}</span>
                            <span className={`${ts} shrink-0`}>{fmtElapsed(p.elapsed_seconds)}</span>
                            {dd && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${dd.urgent ? "bg-red-500/20 text-red-400" : `${dm ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"}`}`}>
                                {dd.text}
                              </span>
                            )}
                            {(p.reject_count || 0) > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-orange-500/20 text-orange-400 shrink-0">
                                재작업{(p.reject_count || 0) > 1 ? ` ${p.reject_count}회` : ""}
                              </span>
                            )}
                            {p.status === "submitted" && isAdmin() && (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/editor/${p.id}`); }}
                                className="text-[9px] px-2 py-0.5 rounded font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 shrink-0"
                              >
                                검수
                              </button>
                            )}
                            {p.status !== "submitted" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/editor/${p.id}`); }}
                                className={`text-[9px] px-2 py-0.5 rounded font-medium shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${dm ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"}`}
                              >
                                열기
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {activeProjects.length === 0 && (
                        <div className={`text-[11px] ${ts} py-2`}>진행 중인 작업이 없습니다</div>
                      )}
                    </div>
                  )}
                  {isOpen && activeProjects.length === 0 && (
                    <div className={`border-t ${cb} px-3.5 py-3 ${ts} text-[11px]`} style={{ paddingLeft: 48 }}>
                      진행 중인 작업이 없습니다
                    </div>
                  )}
                </div>
              );
            })}

            {workerEntries.length === 0 && (
              <div className={`${card} border ${cb} rounded-lg py-8 text-center ${ts} text-sm`}>
                {workerSearch ? "검색 결과가 없습니다" : "등록된 작업자가 없습니다"}
              </div>
            )}
          </div>
        </div>

        {/* 사이드바: 전체 요약 */}
        <div className={`w-120 ${card} border-l ${cb} p-4 overflow-y-auto shrink-0 flex flex-col gap-3`}>
          <div className={`text-xs font-bold ${ts}`}>전체 현황</div>

          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "진행", value: counts.draft, color: "text-blue-400" },
              { label: "검토", value: counts.submitted, color: "text-yellow-400" },
              { label: "승인", value: counts.approved, color: "text-emerald-400" },
              { label: "작업자", value: allUsers.filter(u => u.is_active !== false && u.role === "worker").length, color: tp },
            ].map(c => (
              <div key={c.label} className={`${dm ? "bg-gray-800" : "bg-gray-50"} rounded-lg p-2.5 text-center`}>
                <div className={`text-[10px] ${ts}`}>{c.label}</div>
                <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* 방송사별 */}
          <div className={`${dm ? "bg-gray-800" : "bg-gray-50"} rounded-lg p-3`}>
            <div className={`text-[10px] font-medium ${ts} mb-2.5`}>방송사별</div>
            <div className="flex flex-col gap-2">
              {bcEntries.map(({ bc, cnt, totalSec }) => (
                <div key={bc} className="flex items-center gap-1.5">
                  <span className={`text-[10px] ${ts} w-10 text-right shrink-0 truncate`}>{bc}</span>
                  <div className={`flex-1 ${dm ? "bg-gray-700" : "bg-gray-200"} rounded h-2 overflow-hidden`}>
                    <div className="bg-purple-500 h-full rounded" style={{ width: `${Math.max(5, (totalSec / maxBcSec) * 100)}%` }} />
                  </div>
                  <span className={`text-[9px] ${ts} w-7 text-right shrink-0`}>{cnt}건</span>
                </div>
              ))}
              {bcEntries.length === 0 && <div className={`text-[10px] ${ts}`}>데이터 없음</div>}
            </div>
          </div>

          {/* 검수 대기 */}
          {submittedProjects.length > 0 && (
            <div className={`rounded-lg p-3 ${dm ? "bg-yellow-500/5 border border-yellow-500/10" : "bg-yellow-50 border border-yellow-100"}`}>
              <div className="text-[10px] font-bold text-yellow-400 mb-2">검수 대기 {submittedProjects.length}건</div>
              <div className="flex flex-col gap-1.5">
                {submittedProjects.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between cursor-pointer group"
                    onClick={() => navigate(`/editor/${p.id}`)}
                  >
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

  const ProjectRow = ({ p }: { p: Project }) => {
    const dd = dDay(p.deadline);
    return (
      <div className="px-5 py-4 flex items-center gap-4 group">
        <input type="checkbox" className={`w-4 h-4 rounded ${dm ? "border-gray-600 bg-gray-800" : "border-gray-300 bg-white"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              p.status === "submitted" ? "bg-yellow-500/20 text-yellow-400" :
              p.status === "approved" ? "bg-emerald-500/20 text-emerald-400" :
              p.status === "rejected" ? "bg-orange-500/20 text-orange-400" :
              "bg-blue-500/20 text-blue-400"
            }`}>{
              p.status === "draft" ? "진행 중" :
              p.status === "submitted" ? "제출됨" :
              p.status === "approved" ? "승인됨" :
              p.status === "rejected" ? "반려됨" : p.status
            }</span>
            {dd && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${dd.urgent ? "bg-red-500/20 text-red-400" : `${dm ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"}`}`}>{dd.text}</span>}
            {(p.status === "rejected" || (p.status === "draft" && (p.reject_count || 0) > 0)) && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-orange-500/20 text-orange-400">
                재작업{(p.reject_count || 0) > 1 ? ` (${p.reject_count}회)` : ""}
              </span>
            )}
            {renameId === p.id ? (
              <div className="flex items-center gap-1">
                <input
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleRename(p.id); if (e.key === "Escape") setRenameId(null); }}
                  className={`text-sm font-bold px-2 py-0.5 rounded border outline-none ${dm ? "bg-gray-800 border-gray-600 text-white" : "bg-white border-gray-300 text-black"}`}
                  autoFocus
                />
                <button onClick={() => handleRename(p.id)} className="text-xs text-blue-400 hover:text-blue-300">저장</button>
                <button onClick={() => setRenameId(null)} className={`text-xs ${ts}`}>취소</button>
              </div>
            ) : (
              <span className="font-bold text-sm truncate">{p.name}</span>
            )}
          </div>
          <div className={`text-xs ${ts} mt-0.5 flex items-center gap-1`}>
            <span>{p.broadcaster}</span>
            {p.description && <><span className={ts2}>·</span><span>{p.description}</span></>}
          </div>
        </div>
        <div className={`text-xs ${ts} space-y-0.5 w-40 shrink-0`}>
          <div className="flex items-center gap-2"><Film size={12} /> 영상 {fmtElapsed(Math.floor((p.total_duration_ms || 0) / 1000))}</div>
          <div className="flex items-center gap-2"><Clock size={12} /> 작업 {fmtElapsed(p.elapsed_seconds)}</div>
          <div className="flex items-center gap-2"><Save size={12} /> 용량 {p.file_size_mb ? `${p.file_size_mb}MB` : "—"}</div>
        </div>
        <div className={`text-xs ${ts} w-32 shrink-0`}>
          {workerChangeId === p.id ? (
            <div className="flex flex-col gap-1">
              <select
                value={workerChangeVal}
                onChange={e => setWorkerChangeVal(e.target.value)}
                className={`text-xs px-2 py-1 rounded border outline-none ${dm ? "bg-gray-800 border-gray-600 text-white" : "bg-white border-gray-300 text-black"}`}
                autoFocus
              >
                <option value="">선택...</option>
                {allUsers.filter(u => u.is_active !== false).map(u => (
                  <option key={u.id} value={u.id}>
                    {u.display_name || u.username} ({u.role})
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <button onClick={() => handleWorkerChange(p.id)} className="text-[10px] text-blue-400">변경</button>
                <button onClick={() => setWorkerChangeId(null)} className={`text-[10px] ${ts}`}>취소</button>
              </div>
            </div>
          ) : (
            <>
              <div>담당: <span className={tp}>{p.assigned_to_name || p.created_by_name || "—"}</span></div>
              <div>마감: <span className={tp}>{fmtDate(p.deadline)}</span></div>
              {(p.reject_count || 0) > 0 && (
                <>
                  <div className="text-orange-400">기존 완료: <span>{fmtDate(p.first_submitted_at)}</span></div>
                  <div className="text-orange-400">재작업: <span>{p.reject_count}회</span></div>
                </>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => navigate(`/editor/${p.id}`)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold">
            {p.status === "submitted" && isAdmin() ? "검수 열기" :
             p.status === "submitted" ? "확인" :
             p.status === "approved" ? "확인" :
             p.status === "rejected" ? "재작업" :
             "작업 열기"}
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const response = await api.get(`/projects/${p.id}/download/subtitle`, { responseType: "blob" });
                const filename = p.subtitle_file || `${p.name}.srt`;
                const url = URL.createObjectURL(response.data);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch {}
            }}
            className={`p-1.5 border ${cb} rounded-lg ${ts} hover:${dm ? "text-white" : "text-black"}`}
          >
            <Download size={14} />
          </button>
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
            className={`p-1.5 border ${cb} rounded-lg ${ts} hover:${dm ? "text-white" : "text-black"}`}
          >
            <MoreVertical size={14} />
          </button>
        </div>
      </div>
    );
  };

  // ── 프로젝트 리스트 뷰 (기존 + worker 공용) ──
  const ProjectListView = () => (
    <main className="flex-1 overflow-y-auto p-6">
      <h1 className="text-2xl font-black mb-1">안녕하세요, {user?.display_name}님!</h1>
      <p className={`text-sm ${ts} mb-6`}>좋은 하루입니다. 오늘도 활기차게 시작해봐요!</p>

      <div className={`${card} border ${cb} rounded-xl`}>
        <div className={`flex items-center justify-between border-b ${cb} px-5`}>
          <div className="flex">
            {([
              { key: "draft" as Tab, label: "진행 중", count: counts.draft },
              { key: "submitted" as Tab, label: "제출됨", count: counts.submitted },
              { key: "approved" as Tab, label: "승인됨", count: counts.approved },
            ]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key ? "border-blue-500 text-blue-500" : `border-transparent ${ts} hover:${dm ? "text-white" : "text-black"}`
                }`}>
                {t.label} <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-blue-500/20 text-blue-400" : ts2}`}>{t.count}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 border ${cb} rounded-lg px-3 py-1.5`}>
              <Search size={14} className={ts} />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="프로젝트 검색..." className={`bg-transparent text-xs outline-none ${tp} w-40`} />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowBcDrop(!showBcDrop)}
                className={`flex items-center gap-1 border ${cb} rounded-lg px-3 py-1.5 text-xs ${ts} hover:${dm ? "text-white" : "text-black"}`}
              >
                {bcFilter === "전체" ? "전체 방송사" : bcFilter} <ChevronDown size={12} />
              </button>
              {showBcDrop && (
                <div className={`absolute right-0 top-full mt-1 ${card} border ${cb} rounded-lg shadow-2xl py-1 w-36 z-50`}>
                  {broadcasters.map(bc => (
                    <button
                      key={bc}
                      onClick={() => { setBcFilter(bc); setShowBcDrop(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:${dm ? "bg-gray-800" : "bg-gray-100"} ${bcFilter === bc ? "text-blue-400 font-bold" : ts}`}
                    >
                      {bc}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={`divide-y ${dm ? "divide-gray-800" : "divide-gray-200"}`}>
          {filtered.length === 0 && (
            <div className={`py-12 text-center ${ts}`}>프로젝트가 없습니다.</div>
          )}
          {filtered.map(p => <ProjectRow key={p.id} p={p} />)}
        </div>
      </div>
    </main>
  );

  return (
    <div className={`h-screen ${bg} ${tp} flex flex-col overflow-hidden`}>
      {/* Header */}
      <header className={`h-12 ${card} border-b ${cb} flex items-center justify-between px-5 shrink-0 z-20`}>
        <div className="flex items-center gap-2">
          <Monitor size={20} className="text-blue-500" />
          <span className="font-bold">SubEditor Pro</span>
          <span className={`text-[10px] ${ts2}`}>(v2.0.0)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{user?.display_name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            user?.role === "master" ? "bg-red-500/20 text-red-400" :
            user?.role === "manager" ? "bg-purple-500/20 text-purple-400" :
            "bg-blue-500/20 text-blue-400"
          }`}>{user?.role?.toUpperCase()}</span>
          <button onClick={() => navigate("/settings")} className={`p-1.5 ${ts} hover:${dm ? "text-white" : "text-black"}`} title="설정"><Settings size={16} /></button>
          <button onClick={() => setDark(!dm)} className={`p-1.5 ${ts} hover:${dm ? "text-white" : "text-black"}`} title="다크모드 토글">
            {dm ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={() => { logout(); navigate("/login"); }} className={`text-xs border ${cb} px-3 py-1.5 rounded-lg ${ts} hover:${dm ? "text-white" : "text-red-500"}`}>로그아웃</button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <Sidebar />
        {/* 대시보드: 작업자 중심 뷰 (사이드바 포함) */}
        {isDashboard && isAdmin() ? (
          workerDashboardContent
        ) : (
          <ProjectListView />
        )}
      </div>

      {/* ── 포탈 드롭다운 메뉴 ── */}
      {menuOpen !== null && createPortal(
        <div
          ref={menuRef}
          className={`fixed ${card} border ${cb} rounded-xl shadow-2xl py-1 w-40 z-[9999]`}
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <button
            onClick={() => {
              const p = projects.find(pr => pr.id === menuOpen);
              if (p) { setRenameId(p.id); setRenameVal(p.name); }
              setMenuOpen(null);
            }}
            className={`flex items-center gap-2 w-full px-4 py-2 text-xs ${ts} hover:${dm ? "bg-gray-800" : "bg-gray-100"} hover:${dm ? "text-white" : "text-black"}`}
          >
            <Pencil size={13} /> 이름 수정
          </button>
          {isAdmin() && (
            <button
              onClick={() => {
                setWorkerChangeId(menuOpen);
                setWorkerChangeVal("");
                setMenuOpen(null);
              }}
              className={`flex items-center gap-2 w-full px-4 py-2 text-xs ${ts} hover:${dm ? "bg-gray-800" : "bg-gray-100"} hover:${dm ? "text-white" : "text-black"}`}
            >
              <UserCog size={13} /> 작업자 변경
            </button>
          )}
          <button
            onClick={() => { if (menuOpen) handleDelete(menuOpen); }}
            className={`flex items-center gap-2 w-full px-4 py-2 text-xs text-red-400 hover:${dm ? "bg-gray-800" : "bg-gray-100"}`}
          >
            <Trash2 size={13} /> 삭제
          </button>
        </div>,
        document.body
      )}

      {showNew && (
        <NewProjectModal
          dark={dm}
          onClose={() => setShowNew(false)}
          onCreate={async (project) => { setShowNew(false); await fetchProjects(); navigate(`/editor/${project.id}`); }}
        />
      )}
    </div>
  );
}