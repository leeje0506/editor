import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Monitor, Plus, Moon, Sun, Trash2, Download, Clock, Save, LogOut,
  Settings, LayoutDashboard, Columns3, Table2, BookOpen,
  Film, MoreVertical, Pencil, UserCog, Search, ChevronDown
} from "lucide-react";
import { projectsApi } from "../../api/projects";
import { useAuthStore } from "../../store/useAuthStore";
import type { Project } from "../../types";
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
  const [dark] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<Tab>("draft");
  const [searchQ, setSearchQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number|null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isDashboard = location.pathname === "/dashboard";

  const fetchProjects = async () => {
    try { setProjects(await projectsApi.list()); } catch {}
  };
  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await projectsApi.delete(id);
    setMenuOpen(null);
    fetchProjects();
  };

  const counts = { draft: projects.filter(p=>p.status==="draft").length, submitted: projects.filter(p=>p.status==="submitted").length, approved: projects.filter(p=>p.status==="approved").length };
  const filtered = projects.filter(p => {
    if (p.status !== tab) return false;
    if (searchQ && !p.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const dm = dark;
  const bg = "bg-gray-950", card = "bg-gray-900", cb = "border-gray-800", tp = "text-gray-100", ts = "text-gray-400", ts2 = "text-gray-600";

  // ── Sidebar ──
  const Sidebar = () => (
    <aside className={`w-52 ${card} border-r ${cb} flex flex-col shrink-0`}>
      <nav className="flex-1 py-4 px-3 space-y-6 text-sm">
        <div>
          <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>작업</div>
          <button onClick={() => setShowNew(true)} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:text-white hover:bg-gray-800`}>
            <Plus size={16}/> 새 작업 시작하기
          </button>
        </div>
        {isAdmin() && (
          <div>
            <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>보기</div>
            <button onClick={() => navigate("/dashboard")} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${isDashboard ? "bg-blue-600/20 text-blue-400" : `${ts} hover:text-white hover:bg-gray-800`}`}>
              <LayoutDashboard size={16}/> 대시보드
            </button>
          </div>
        )}
        <div>
          <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>검수 도구</div>
          <button className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:text-white hover:bg-gray-800`}>
            <Columns3 size={16}/> 자막 버전 비교
          </button>
          {isAdmin() && (
            <button className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:text-white hover:bg-gray-800`}>
              <Table2 size={16}/> 완성본 검수
            </button>
          )}
        </div>
        <div>
          <div className={`text-[10px] uppercase tracking-wider ${ts2} mb-2 px-2`}>도움말</div>
          <button className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg ${ts} hover:text-white hover:bg-gray-800`}>
            <BookOpen size={16}/> 사용자 가이드
          </button>
        </div>
      </nav>
    </aside>
  );

  // ── Dashboard summary (admin only) ──
  const Dashboard = () => (
    <div className="space-y-6 mb-8">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "대기 중", value: 0, desc: "할당 전 또는 작업 전", color: "text-gray-400" },
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
      {/* Charts placeholders */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`${card} border ${cb} rounded-xl p-5`}>
          <div className={`text-sm font-medium ${tp} mb-4`}>작업자별 진행 건수</div>
          <div className="h-32 flex items-end gap-6 justify-center">
            {/* Simple bar chart mock */}
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
      {/* Review queue */}
      {counts.submitted > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-yellow-400">검수 대기</span>
            <span className={`text-xs ${card} border ${cb} px-2 py-0.5 rounded-full`}>{counts.submitted}건</span>
          </div>
          <div className={`${card} border ${cb} rounded-xl divide-y divide-gray-800`}>
            {projects.filter(p=>p.status==="submitted").map(p => (
              <ProjectRow key={p.id} p={p} isSubmitted />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── Project row ──
  const ProjectRow = ({ p, isSubmitted }: { p: Project; isSubmitted?: boolean }) => {
    const dd = dDay(p.deadline);
    return (
      <div className="px-5 py-4 flex items-center gap-4 group">
        {/* Checkbox */}
        <input type="checkbox" className="w-4 h-4 rounded border-gray-600 bg-gray-800" />
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              p.status==="submitted" ? "bg-yellow-500/20 text-yellow-400" :
              p.status==="approved" ? "bg-emerald-500/20 text-emerald-400" :
              "bg-blue-500/20 text-blue-400"
            }`}>{p.status==="draft"?"진행 중":p.status==="submitted"?"제출됨":"승인됨"}</span>
            {dd && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${dd.urgent?"bg-red-500/20 text-red-400":"bg-gray-700 text-gray-300"}`}>{dd.text}</span>}
            <span className="font-bold text-sm truncate">{p.name}</span>
          </div>
          <div className={`text-xs ${ts} mt-0.5 flex items-center gap-1`}>
            <span>{p.broadcaster}</span>
            {p.description && <><span className={ts2}>·</span><span>{p.description}</span></>}
          </div>
        </div>
        {/* Stats */}
        <div className={`text-xs ${ts} space-y-0.5 w-40 shrink-0`}>
          <div className="flex items-center gap-2"><Film size={12}/> 영상 {fmtElapsed(Math.floor((p.total_duration_ms||0)/1000))}</div>
          <div className="flex items-center gap-2"><Clock size={12}/> 작업 {fmtElapsed(p.elapsed_seconds)}</div>
          <div className="flex items-center gap-2"><Save size={12}/> 용량 {p.file_size_mb ? `${p.file_size_mb}MB` : "—"}</div>
        </div>
        {/* Meta */}
        <div className={`text-xs ${ts} w-32 shrink-0`}>
          <div>담당: <span className={tp}>{p.assigned_to_name || p.created_by_name || "—"}</span></div>
          <div>마감: <span className={tp}>{fmtDate(p.deadline)}</span></div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => navigate(isSubmitted ? `/editor/${p.id}` : `/editor/${p.id}`)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold">
            {isSubmitted ? "검수 열기" : "작업 열기"}
          </button>
          <a href={projectsApi.downloadSubtitle(p.id)} target="_blank" className={`p-1.5 border ${cb} rounded-lg ${ts} hover:text-white`}>
            <Download size={14}/>
          </a>
          {/* ⋮ Menu */}
          <div className="relative" ref={menuOpen === p.id ? menuRef : undefined}>
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }} className={`p-1.5 border ${cb} rounded-lg ${ts} hover:text-white`}>
              <MoreVertical size={14}/>
            </button>
            {menuOpen === p.id && (
              <div className={`absolute right-0 top-full mt-1 ${card} border ${cb} rounded-xl shadow-2xl py-1 w-40 z-50`}>
                <button className={`flex items-center gap-2 w-full px-4 py-2 text-xs ${ts} hover:bg-gray-800 hover:text-white`}>
                  <Pencil size={13}/> 이름 수정
                </button>
                {isAdmin() && (
                  <button className={`flex items-center gap-2 w-full px-4 py-2 text-xs ${ts} hover:bg-gray-800 hover:text-white`}>
                    <UserCog size={13}/> 작업자 변경
                  </button>
                )}
                <button onClick={() => handleDelete(p.id)} className="flex items-center gap-2 w-full px-4 py-2 text-xs text-red-400 hover:bg-gray-800">
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
          <button className={`p-1.5 ${ts} hover:text-white`}><Settings size={16}/></button>
          <button className={`p-1.5 ${ts} hover:text-white`}><Sun size={16}/></button>
          <button onClick={() => { logout(); navigate("/login"); }} className={`text-xs border ${cb} px-3 py-1.5 rounded-lg ${ts} hover:text-white`}>로그아웃</button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="text-2xl font-black mb-1">안녕하세요, {user?.display_name}님!</h1>
          <p className={`text-sm ${ts} mb-6`}>좋은 하루입니다. 오늘도 활기차게 시작해봐요!</p>

          {/* Dashboard (admin only) */}
          {isDashboard && isAdmin() && <Dashboard />}

          {/* Project list with tabs */}
          <div className={`${card} border ${cb} rounded-xl overflow-hidden`}>
            {/* Tabs + search */}
            <div className={`flex items-center justify-between border-b ${cb} px-5`}>
              <div className="flex">
                {([
                  { key: "draft" as Tab, label: "진행 중", count: counts.draft },
                  { key: "submitted" as Tab, label: "제출됨", count: counts.submitted },
                  { key: "approved" as Tab, label: "승인됨", count: counts.approved },
                ]).map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      tab === t.key ? "border-blue-500 text-white" : `border-transparent ${ts} hover:text-white`
                    }`}>
                    {t.label} <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${tab===t.key?"bg-blue-500/20 text-blue-400":`${ts2}`}`}>{t.count}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 border ${cb} rounded-lg px-3 py-1.5`}>
                  <Search size={14} className={ts}/>
                  <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="프로젝트 검색..." className={`bg-transparent text-xs outline-none ${tp} w-40`}/>
                </div>
                <button className={`flex items-center gap-1 border ${cb} rounded-lg px-3 py-1.5 text-xs ${ts} hover:text-white`}>전체 방송사 <ChevronDown size={12}/></button>
              </div>
            </div>
            {/* List */}
            <div className={`divide-y divide-gray-800`}>
              {filtered.length === 0 && (
                <div className={`py-12 text-center ${ts}`}>프로젝트가 없습니다.</div>
              )}
              {filtered.map(p => <ProjectRow key={p.id} p={p} isSubmitted={p.status === "submitted"} />)}
            </div>
          </div>
        </main>
      </div>

      {showNew && <NewProjectModal dark={dm} onClose={() => setShowNew(false)} onCreate={async (project) => { setShowNew(false); await fetchProjects(); navigate(`/editor/${project.id}`); }} />}
    </div>
  );
}