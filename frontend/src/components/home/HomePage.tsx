import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Monitor, Plus, Moon, Sun, Trash2, Download, Clock, Save, LogOut,
  Settings, LayoutDashboard, Columns3, Table2, BookOpen,
  Film, MoreVertical, Pencil, UserCog, Search, ChevronDown
} from "lucide-react";
import { projectsApi } from "../../api/projects";
import { authApi } from "../../api/auth";
import { useAuthStore } from "../../store/useAuthStore";
import { useBroadcasterStore } from "../../store/useBroadcasterStore";
import type { Project, User } from "../../types";
import { NewProjectModal } from "./NewProjectModal";

function fmtElapsed(s: number) {
  return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}
function fmtDate(iso: string|null) {
  if (!iso) return "미설정";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dDay(iso: string|null) {
  if (!iso) return null;
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { text: `D+${-diff}`, urgent: true };
  if (diff <= 7) return { text: `D-${diff}`, urgent: diff <= 3 };
  return null;
}

type Tab = "draft" | "submitted" | "approved";

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuthStore();

  // 다크모드 — localStorage 저장/복원 (전역 유지)
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("editor_darkMode");
    return saved !== null ? saved === "true" : true; // 기본값 다크
  });
  useEffect(() => { localStorage.setItem("editor_darkMode", String(dark)); }, [dark]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<Tab>("draft");
  const [searchQ, setSearchQ] = useState("");
  const [bcFilter, setBcFilter] = useState("전체");
  const [showNew, setShowNew] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number|null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [renameId, setRenameId] = useState<number|null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [workerChangeId, setWorkerChangeId] = useState<number|null>(null);
  const [workerChangeVal, setWorkerChangeVal] = useState("");
  const [showBcDrop, setShowBcDrop] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const bcStore = useBroadcasterStore();

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

  // ── 액션 핸들러 ──
  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try { await projectsApi.delete(id); } catch {}
    setMenuOpen(null);
    fetchProjects();
  };

  const handleRename = async (id: number) => {
    if (!renameVal.trim()) return;
    try { await projectsApi.update(id, { name: renameVal.trim() }); } catch {}
    setRenameId(null);
    setRenameVal("");
    setMenuOpen(null);
    fetchProjects();
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

  // ── 필터링 ──
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

  // ── 스타일 ──
  const dm = dark;
  const bg = dm ? "bg-gray-950" : "bg-gray-50";
  const card = dm ? "bg-gray-900" : "bg-white";
  const cb = dm ? "border-gray-800" : "border-gray-200";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const ts2 = dm ? "text-gray-600" : "text-gray-400";

  // ── Sidebar ──
  const Sidebar = () => (
    <aside className={`w-52 ${card} border-r ${cb} flex flex-col shrink-0`}>
      <nav className="flex-1 py-4 px-3 space-y-6 text-sm">
        <div>
          <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>작업</div>
          <button onClick={() => setShowNew(true)} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:${dm ? "text-white" : "text-black"} hover:${dm ? "bg-gray-800" : "bg-gray-100"}`}>
            <Plus size={16}/> 새 작업 시작하기
          </button>
        </div>
        {isAdmin() && (
          <div>
            <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>보기</div>
            <button onClick={() => navigate("/dashboard")} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${isDashboard ? "bg-blue-600/20 text-blue-400" : `${ts} hover:${dm?"text-white":"text-black"} hover:${dm?"bg-gray-800":"bg-gray-100"}`}`}>
              <LayoutDashboard size={16}/> 대시보드
            </button>
          </div>
        )}
        <div>
          <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>도구</div>
          <button className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:${dm?"text-white":"text-black"} hover:${dm?"bg-gray-800":"bg-gray-100"}`}>
            <Columns3 size={16}/> 자막 버전 비교
          </button>
          {isAdmin() && (
            <button className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:${dm?"text-white":"text-black"} hover:${dm?"bg-gray-800":"bg-gray-100"}`}>
              <Table2 size={16}/> 완성본 검수
            </button>
          )}
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>도움말</div>
          <button className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:${dm?"text-white":"text-black"} hover:${dm?"bg-gray-800":"bg-gray-100"}`}>
            <BookOpen size={16}/> 사용자 가이드
          </button>
        </div>
      </nav>
    </aside>
  );

  // ── Dashboard (admin) ──
  const Dashboard = () => (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "대기 중", value: 0, desc: "할당 전 또는 작업 전", color: dm ? "text-gray-400" : "text-gray-500" },
          { label: "진행 중", value: counts.draft, desc: "현재 작업 중인 프로젝트", color: "text-blue-400" },
          { label: "검토 대기", value: counts.submitted, desc: "제출 후 승인 대기", color: "text-yellow-400" },
          { label: "승인 완료", value: counts.approved, desc: "승인된 프로젝트", color: "text-emerald-400" },
        ].map(c => (
          <div key={c.label} className={`${card} border ${cb} rounded-xl p-5`}>
            <div className={`text-xs ${ts} mb-1`}>{c.label}</div>
            <div className={`text-3xl font-black ${c.color}`}>{c.value}</div>
            <div className={`text-[11px] ${ts2} mt-1`}>{c.desc}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className={`${card} border ${cb} rounded-xl p-5`}>
          <div className={`text-sm font-medium ${tp} mb-4`}>작업자별 진행 건수</div>
          <div className="h-32 flex items-end gap-6 justify-center">
            {Array.from(new Set(projects.filter(p=>p.status==="draft").map(p=>p.assigned_to_name||p.created_by_name||"미배정"))).map(name => {
              const cnt = projects.filter(p=>p.status==="draft"&&(p.assigned_to_name===name||p.created_by_name===name)).length;
              return (
                <div key={name} className="flex flex-col items-center gap-1">
                  <div className="bg-blue-500 rounded-t" style={{ width: 32, height: Math.max(8, cnt * 16) }}/>
                  <span className={`text-[10px] ${ts}`}>{name}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className={`${card} border ${cb} rounded-xl p-5`}>
          <div className={`text-sm font-medium ${tp} mb-4`}>방송사별 진행 현황</div>
          <div className="h-32 flex items-end gap-6 justify-center">
            {Array.from(new Set(projects.map(p=>p.broadcaster).filter(Boolean))).map(bc => {
              const cnt = projects.filter(p=>p.broadcaster===bc).length;
              return (
                <div key={bc} className="flex flex-col items-center gap-1">
                  <div className="bg-purple-500 rounded-t" style={{ width: 32, height: Math.max(8, cnt * 12) }}/>
                  <span className={`text-[10px] ${ts}`}>{bc}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {counts.submitted > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-yellow-400">검수 대기</span>
            <span className={`text-xs ${card} border ${cb} px-2 py-0.5 rounded-full`}>{counts.submitted}건</span>
          </div>
          <div className={`${card} border ${cb} rounded-xl divide-y ${dm ? "divide-gray-800" : "divide-gray-200"}`}>
            {projects.filter(p=>p.status==="submitted").map(p => (
              <ProjectRow key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── Project row ──
  const ProjectRow = ({ p }: { p: Project }) => {
    const dd = dDay(p.deadline);
    const isThisMenuOpen = menuOpen === p.id;
    return (
      <div className="px-5 py-4 flex items-center gap-4 group">
        <input type="checkbox" className={`w-4 h-4 rounded ${dm ? "border-gray-600 bg-gray-800" : "border-gray-300 bg-white"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              p.status==="submitted" ? "bg-yellow-500/20 text-yellow-400" :
              p.status==="approved" ? "bg-emerald-500/20 text-emerald-400" :
              p.status==="rejected" ? "bg-orange-500/20 text-orange-400" :
              "bg-blue-500/20 text-blue-400"
            }`}>{
              p.status==="draft" ? "진행 중" :
              p.status==="submitted" ? "제출됨" :
              p.status==="approved" ? "승인됨" :
              p.status==="rejected" ? "반려됨" : p.status
            }</span>
            {dd && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${dd.urgent?"bg-red-500/20 text-red-400":`${dm?"bg-gray-700 text-gray-300":"bg-gray-200 text-gray-600"}`}`}>{dd.text}</span>}
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
          <div className="flex items-center gap-2"><Film size={12}/> 영상 {fmtElapsed(Math.floor((p.total_duration_ms||0)/1000))}</div>
          <div className="flex items-center gap-2"><Clock size={12}/> 작업 {fmtElapsed(p.elapsed_seconds)}</div>
          <div className="flex items-center gap-2"><Save size={12}/> 용량 {p.file_size_mb ? `${p.file_size_mb}MB` : "—"}</div>
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
          <a href={projectsApi.downloadSubtitle(p.id)} target="_blank" className={`p-1.5 border ${cb} rounded-lg ${ts} hover:${dm?"text-white":"text-black"}`}>
            <Download size={14}/>
          </a>
          <div className="relative" ref={isThisMenuOpen ? menuRef : undefined}>
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(isThisMenuOpen ? null : p.id); }} className={`p-1.5 border ${cb} rounded-lg ${ts} hover:${dm?"text-white":"text-black"}`}>
              <MoreVertical size={14}/>
            </button>
            {isThisMenuOpen && (
              <div className={`fixed ${card} border ${cb} rounded-xl shadow-2xl py-1 w-40 z-[9999]`} style={{ marginTop: 4 }}>
                <button
                  onClick={() => { setRenameId(p.id); setRenameVal(p.name); setMenuOpen(null); }}
                  className={`flex items-center gap-2 w-full px-4 py-2 text-xs ${ts} hover:${dm?"bg-gray-800":"bg-gray-100"} hover:${dm?"text-white":"text-black"}`}
                >
                  <Pencil size={13}/> 이름 수정
                </button>
                {isAdmin() && (
                  <button
                    onClick={() => { setWorkerChangeId(p.id); setWorkerChangeVal(""); setMenuOpen(null); }}
                    className={`flex items-center gap-2 w-full px-4 py-2 text-xs ${ts} hover:${dm?"bg-gray-800":"bg-gray-100"} hover:${dm?"text-white":"text-black"}`}
                  >
                    <UserCog size={13}/> 작업자 변경
                  </button>
                )}
                <button onClick={() => handleDelete(p.id)} className={`flex items-center gap-2 w-full px-4 py-2 text-xs text-red-400 hover:${dm?"bg-gray-800":"bg-gray-100"}`}>
                  <Trash2 size={13}/> 삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`h-screen ${bg} ${tp} flex flex-col overflow-hidden`}>
      {/* Header */}
      <header className={`h-12 ${card} border-b ${cb} flex items-center justify-between px-5 shrink-0 z-20`}>
        <div className="flex items-center gap-2">
          <Monitor size={20} className="text-blue-500"/>
          <span className="font-bold">SubEditor Pro</span>
          <span className={`text-[10px] ${ts2}`}>(v2.0.0)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{user?.display_name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            user?.role==="master"?"bg-red-500/20 text-red-400":
            user?.role==="manager"?"bg-purple-500/20 text-purple-400":
            "bg-blue-500/20 text-blue-400"
          }`}>{user?.role?.toUpperCase()}</span>
          <button onClick={() => navigate("/settings")} className={`p-1.5 ${ts} hover:${dm?"text-white":"text-black"}`} title="설정"><Settings size={16}/></button>
          <button onClick={() => setDark(!dm)} className={`p-1.5 ${ts} hover:${dm?"text-white":"text-black"}`} title="다크모드 토글">
            {dm ? <Sun size={16}/> : <Moon size={16}/>}
          </button>
          <button onClick={() => { logout(); navigate("/login"); }} className={`text-xs border ${cb} px-3 py-1.5 rounded-lg ${ts} hover:${dm?"text-white":"text-red-500"}`}>로그아웃</button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="text-2xl font-black mb-1">안녕하세요, {user?.display_name}님!</h1>
          <p className={`text-sm ${ts} mb-6`}>좋은 하루입니다. 오늘도 활기차게 시작해봐요!</p>

          {isDashboard && isAdmin() && <Dashboard />}

          {/* Project list */}
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
                      tab === t.key ? "border-blue-500 text-blue-500" : `border-transparent ${ts} hover:${dm?"text-white":"text-black"}`
                    }`}>
                    {t.label} <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${tab===t.key?"bg-blue-500/20 text-blue-400":ts2}`}>{t.count}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 border ${cb} rounded-lg px-3 py-1.5`}>
                  <Search size={14} className={ts}/>
                  <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="프로젝트 검색..." className={`bg-transparent text-xs outline-none ${tp} w-40`}/>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowBcDrop(!showBcDrop)}
                    className={`flex items-center gap-1 border ${cb} rounded-lg px-3 py-1.5 text-xs ${ts} hover:${dm?"text-white":"text-black"}`}
                  >
                    {bcFilter === "전체" ? "전체 방송사" : bcFilter} <ChevronDown size={12}/>
                  </button>
                  {showBcDrop && (
                    <div className={`absolute right-0 top-full mt-1 ${card} border ${cb} rounded-lg shadow-2xl py-1 w-36 z-50`}>
                      {broadcasters.map(bc => (
                        <button
                          key={bc}
                          onClick={() => { setBcFilter(bc); setShowBcDrop(false); }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:${dm?"bg-gray-800":"bg-gray-100"} ${bcFilter === bc ? "text-blue-400 font-bold" : ts}`}
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
      </div>

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