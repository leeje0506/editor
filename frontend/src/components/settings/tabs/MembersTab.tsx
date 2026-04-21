import { useEffect, useState, useMemo } from "react";
import { Users, Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check, X, KeyRound, Search, BarChart3 } from "lucide-react";
import { authApi } from "../../../api/auth";
import { projectsApi } from "../../../api/projects";
import { useAuthStore } from "../../../store/useAuthStore";
import type { User, Project } from "../../../types";

/* ── 유틸 ── */

function fmtElapsed(s: number) {
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/* ── 스타일 상수 ── */

const bd = "border-gray-800";
const card = "bg-gray-900";
const inp = "bg-gray-800 text-gray-100 border-gray-700";
const ts = "text-gray-400";

/* ── 메인 컴포넌트 ── */

export function MembersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("worker");
  const [subTab, setSubTab] = useState<"admin" | "worker">("admin");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [msg, setMsg] = useState("");

  /** 조직원 검색어 */
  const [memberSearch, setMemberSearch] = useState("");
  /** 통계 — 작업자 필터 */
  const [statsFilter, setStatsFilter] = useState<number | "all">("all");

  const currentUser = useAuthStore((s) => s.user);

  const fetchUsers = async () => {
    try { setUsers(await authApi.listUsers()); } catch {}
  };
  const fetchProjects = async () => {
    try { setProjects(await projectsApi.list()); } catch {}
  };

  useEffect(() => {
    fetchUsers();
    fetchProjects();
  }, []);

  const showMsg = (text: string) => { setMsg(text); setTimeout(() => setMsg(""), 2000); };

  /* ── 생성 ── */
  const handleCreate = async () => {
    if (!newId.trim()) return;
    try {
      await authApi.createUser({
        username: newId.trim(),
        password: newId.trim(),
        display_name: newName.trim() || newId.trim(),
        role: newRole,
      });
      setNewId("");
      setNewName("");
      showMsg("계정 생성 완료");
      fetchUsers();
    } catch (e: any) {
      showMsg(e?.response?.data?.detail || "생성 실패");
    }
  };

  /* ── 삭제 ── */
  const handleDelete = async (id: number) => {
    if (id === currentUser?.id) { showMsg("자기 자신은 삭제할 수 없습니다"); return; }
    if (!confirm("정말 삭제(비활성화)하시겠습니까?")) return;
    try {
      await authApi.deleteUser(id);
      showMsg("삭제 완료");
      fetchUsers();
    } catch { showMsg("삭제 실패"); }
  };

  /* ── 수정 ── */
  const startEdit = (u: User) => {
    setEditId(u.id);
    setEditName(u.display_name || u.username);
    setEditRole(u.role);
  };
  const saveEdit = async () => {
    if (!editId) return;
    try {
      await authApi.updateUser(editId, { display_name: editName.trim(), role: editRole });
      setEditId(null);
      showMsg("수정 완료");
      fetchUsers();
    } catch (e: any) {
      showMsg(e?.response?.data?.detail || "수정 실패");
    }
  };

  /* ── 비밀번호 초기화 ── */
  const handleResetPw = async (id: number) => {
    if (!confirm("비밀번호를 초기화하시겠습니까? (아이디와 동일하게 설정됩니다)")) return;
    try {
      await authApi.resetPassword(id);
      showMsg("비밀번호 초기화 완료");
    } catch { showMsg("초기화 실패"); }
  };

  /* ── 검색 필터 적용 ── */
  const searchLower = memberSearch.trim().toLowerCase();
  const filterUser = (u: User) => {
    if (!searchLower) return true;
    return (
      (u.display_name || "").toLowerCase().includes(searchLower) ||
      u.username.toLowerCase().includes(searchLower)
    );
  };

  const masters = users.filter((u) => u.role === "master" && filterUser(u));
  const managers = users.filter((u) => u.role === "manager" && filterUser(u));
  const workers = users.filter((u) => u.role !== "master" && u.role !== "manager" && filterUser(u));

  /* ── 통계 데이터 ── */
  const workerStats = useMemo(() => {
    return users.map((u) => {
      const userProjects = projects.filter((p) => p.assigned_to === u.id || p.created_by === u.id);
      const totalSeconds = userProjects.reduce((s, p) => s + (p.elapsed_seconds || 0), 0);
      const submitted = userProjects.filter((p) => p.status === "submitted" || p.status === "approved").length;
      const rejected = userProjects.filter((p) => p.status === "rejected").length;
      const inProgress = userProjects.filter((p) => p.status === "draft").length;
      return { ...u, totalSeconds, submitted, rejected, inProgress, projectCount: userProjects.length };
    });
  }, [users, projects]);

  const filteredStats = useMemo(() => {
    if (statsFilter === "all") return workerStats;
    return workerStats.filter((s) => s.id === statsFilter);
  }, [workerStats, statsFilter]);

  /* ── 뱃지/토글 ── */
  const roleBadge = (role: string) => {
    const c: Record<string, string> = { master: "bg-red-500/20 text-red-400", manager: "bg-purple-500/20 text-purple-400" };
    const l: Record<string, string> = { master: "마스터", manager: "관리자", worker: "작업자" };
    return <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${c[role] || "bg-blue-500/20 text-blue-400"}`}>{l[role] || role}</span>;
  };
  const toggleCollapse = (key: string) => setCollapsed((p) => ({ ...p, [key]: !p[key] }));

  /* ── UserRow ── */
  const UserRow = ({ u }: { u: User }) => {
    const isEditing = editId === u.id;
    const isSelf = u.id === currentUser?.id;

    return (
      <div className={`flex items-center justify-between px-4 py-2.5 ${card}`}>
        {isEditing ? (
          <>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }}
                className={`border rounded px-2 py-1 text-xs outline-none ${inp} focus:border-blue-500 w-28`}
                autoFocus
              />
              <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className={`border rounded px-1.5 py-1 text-[11px] outline-none ${inp}`}>
                <option value="worker">작업자</option>
                {currentUser?.role === "master" && <option value="manager">관리자</option>}
                {currentUser?.role === "master" && <option value="master">마스터</option>}
              </select>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={saveEdit} className="text-emerald-400 hover:text-emerald-300"><Check size={14} /></button>
              <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-gray-300"><X size={14} /></button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-medium text-xs truncate">{u.display_name || u.username}</span>
              {u.username !== (u.display_name || u.username) && <span className={`text-[10px] ${ts} shrink-0`}>({u.username})</span>}
              {roleBadge(u.role)}
              {u.is_active === false && <span className="text-[9px] px-1 py-0.5 rounded bg-gray-700 text-gray-400 shrink-0">비활성</span>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => startEdit(u)} className="text-blue-400 hover:text-blue-300" title="수정"><Pencil size={13} /></button>
              <button onClick={() => handleResetPw(u.id)} className="text-yellow-400 hover:text-yellow-300" title="비밀번호 초기화"><KeyRound size={13} /></button>
              <button onClick={() => handleDelete(u.id)} className={`${isSelf ? "text-gray-700 cursor-not-allowed" : "text-red-400 hover:text-red-300"}`} disabled={isSelf} title={isSelf ? "자기 자신은 삭제 불가" : "삭제"}>
                <Trash2 size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  /* ── GroupSection ── */
  const GroupSection = ({ title, items, color, sectionKey }: { title: string; items: User[]; color: string; sectionKey: string }) => {
    const open = !collapsed[sectionKey];
    return (
      <div className="mb-2">
        <button onClick={() => toggleCollapse(sectionKey)} className={`w-full flex items-center gap-2 px-4 py-2 ${color} rounded-t-lg text-xs font-medium`}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {title} <span className="opacity-60">({items.length}명)</span>
        </button>
        {open && (
          <div className={`border border-t-0 ${bd} rounded-b-lg divide-y divide-gray-800`}>
            {items.map((u) => <UserRow key={u.id} u={u} />)}
            {items.length === 0 && <div className={`px-4 py-3 text-xs ${ts}`}>{searchLower ? "검색 결과 없음" : "멤버가 없습니다"}</div>}
          </div>
        )}
      </div>
    );
  };

  /* ════════════════════════════════════════════
     렌더: 좌우 분할 (40% 조직원 | 60% 통계)
     ════════════════════════════════════════════ */
  return (
    <div className="flex gap-6 h-full">

      {/* ──────── 우측: 작업자별 통계 (60%) ──────── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* 헤더 + 필터 */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-purple-400" />
            <h2 className="text-base font-bold">작업자별 통계</h2>
          </div>
          <select
            value={statsFilter === "all" ? "all" : String(statsFilter)}
            onChange={(e) => setStatsFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className={`border rounded-lg px-2.5 py-1.5 text-xs outline-none ${inp} focus:border-blue-500 w-44`}
          >
            <option value="all">전체 작업자</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name || u.username}
              </option>
            ))}
          </select>
        </div>

        {/* 통계 테이블 (독립 스크롤) */}
        <div className={`flex-1 overflow-y-auto min-h-0 ${card} border ${bd} rounded-xl`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-900">
              <tr className={`border-b ${bd} text-xs ${ts}`}>
                <th className="py-3 px-4 text-left">작업자</th>
                <th className="py-3 px-3 text-left">역할</th>
                <th className="py-3 px-3 text-left">작업 시간</th>
                <th className="py-3 px-3 text-center">프로젝트</th>
                <th className="py-3 px-3 text-center">제출</th>
                <th className="py-3 px-3 text-center">반려</th>
                <th className="py-3 px-3 text-center">진행 중</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`py-12 text-center text-sm ${ts}`}>데이터가 없습니다</td>
                </tr>
              ) : (
                filteredStats.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-800/50">
                    <td className="py-2.5 px-4 font-bold text-xs">{s.display_name || s.username}</td>
                    <td className="py-2.5 px-3">{roleBadge(s.role)}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">{fmtElapsed(s.totalSeconds)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 font-medium">{s.projectCount}건</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">{s.submitted}건</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s.rejected > 0 ? "bg-red-500/20 text-red-400" : "bg-gray-700 text-gray-500"}`}>{s.rejected}건</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s.inProgress > 0 ? "bg-blue-500/20 text-blue-400" : "bg-gray-700 text-gray-500"}`}>{s.inProgress}건</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────── 좌측: 권한 관리 (40%) ──────── */}
      <div className="w-[40%] shrink-0 flex flex-col min-h-0">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-green-400" />
            <h2 className="text-base font-bold">권한 관리</h2>
          </div>
          {msg && <span className={`text-[11px] font-medium ${msg.includes("실패") || msg.includes("불가") ? "text-red-400" : "text-emerald-400"}`}>{msg}</span>}
        </div>

        {/* 생성 폼 */}
        <div className={`${card} border ${bd} rounded-xl p-4 mb-4 shrink-0`}>
          <div className="text-[11px] text-gray-500 mb-2">새 계정 생성 (초기 비밀번호 = 아이디)</div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={`block text-[11px] ${ts} mb-1`}>아이디</label>
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="예: worker01"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                className={`w-full border rounded-lg px-2.5 py-2 text-xs outline-none ${inp} focus:border-blue-500`}
              />
            </div>
            <div className="flex-1">
              <label className={`block text-[11px] ${ts} mb-1`}>이름</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="예: 홍길동"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                className={`w-full border rounded-lg px-2.5 py-2 text-xs outline-none ${inp} focus:border-blue-500`}
              />
            </div>
            <div className="w-24">
              <label className={`block text-[11px] ${ts} mb-1`}>권한</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className={`w-full border rounded-lg px-2 py-2 text-xs outline-none ${inp}`}>
                <option value="worker">작업자</option>
                {currentUser?.role === "master" && <option value="manager">관리자</option>}
                {currentUser?.role === "master" && <option value="master">마스터</option>}
              </select>
            </div>
            <button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg shrink-0" title="계정 생성">
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* 검색 + 서브 탭 */}
        <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-0 shrink-0">
          <div className="flex gap-3">
            <button onClick={() => setSubTab("admin")} className={`pb-2 text-xs border-b-2 ${subTab === "admin" ? "border-pink-400 text-pink-400" : "border-transparent text-gray-500"}`}>
              마스터 · 관리자
            </button>
            <button onClick={() => setSubTab("worker")} className={`pb-2 text-xs border-b-2 ${subTab === "worker" ? "border-blue-400 text-blue-400" : "border-transparent text-gray-500"}`}>
              작업자
            </button>
          </div>
          <div className="relative mb-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="이름 / 아이디 검색"
              className={`border rounded-lg pl-7 pr-2.5 py-1.5 text-[11px] outline-none ${inp} focus:border-blue-500 w-44`}
            />
          </div>
        </div>

        {/* 멤버 리스트 (독립 스크롤) */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {subTab === "admin" ? (
            <>
              <GroupSection title="마스터" items={masters} color="bg-red-500/10 text-red-400" sectionKey="masters" />
              <GroupSection title="관리자" items={managers} color="bg-purple-500/10 text-purple-400" sectionKey="managers" />
            </>
          ) : (
            <GroupSection title="작업자" items={workers} color="bg-blue-500/10 text-blue-400" sectionKey="workers" />
          )}
        </div>
      </div>


    </div>
  );
}