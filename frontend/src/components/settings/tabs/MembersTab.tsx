import { useEffect, useState } from "react";
import { Users, Plus, Trash2, Lock, ChevronDown, ChevronRight, Pencil, Check, X, KeyRound } from "lucide-react";
import { authApi } from "../../../api/auth";
import { useAuthStore } from "../../../store/useAuthStore";
import type { User } from "../../../types";

export function MembersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("worker");
  const [subTab, setSubTab] = useState<"admin" | "worker">("admin");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [msg, setMsg] = useState("");
  const currentUser = useAuthStore((s) => s.user);

  const bd = "border-gray-800";
  const card = "bg-gray-900";
  const inp = "bg-gray-800 text-gray-100 border-gray-700";
  const ts = "text-gray-400";

  const fetchUsers = async () => {
    try { setUsers(await authApi.listUsers()); } catch {}
  };
  useEffect(() => { fetchUsers(); }, []);

  const showMsg = (text: string) => { setMsg(text); setTimeout(() => setMsg(""), 2000); };

  // 생성
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

  // 삭제
  const handleDelete = async (id: number) => {
    if (id === currentUser?.id) { showMsg("자기 자신은 삭제할 수 없습니다"); return; }
    if (!confirm("정말 삭제(비활성화)하시겠습니까?")) return;
    try {
      await authApi.deleteUser(id);
      showMsg("삭제 완료");
      fetchUsers();
    } catch { showMsg("삭제 실패"); }
  };

  // 수정 시작
  const startEdit = (u: User) => {
    setEditId(u.id);
    setEditName(u.display_name || u.username);
    setEditRole(u.role);
  };

  // 수정 저장
  const saveEdit = async () => {
    if (!editId) return;
    try {
      await authApi.updateUser(editId, {
        display_name: editName.trim(),
        role: editRole,
      });
      setEditId(null);
      showMsg("수정 완료");
      fetchUsers();
    } catch (e: any) {
      showMsg(e?.response?.data?.detail || "수정 실패");
    }
  };

  // 비밀번호 초기화
  const handleResetPw = async (id: number) => {
    if (!confirm("비밀번호를 초기화하시겠습니까? (아이디와 동일하게 설정됩니다)")) return;
    try {
      await authApi.resetPassword(id);
      showMsg("비밀번호 초기화 완료");
    } catch { showMsg("초기화 실패"); }
  };

  const masters = users.filter(u => u.role === "master");
  const managers = users.filter(u => u.role === "manager");
  const workers = users.filter(u => u.role !== "master" && u.role !== "manager");

  const roleBadge = (role: string) => {
    const c: Record<string, string> = { master: "bg-red-500/20 text-red-400", manager: "bg-purple-500/20 text-purple-400" };
    const l: Record<string, string> = { master: "마스터", manager: "관리자", worker: "작업자" };
    return <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${c[role] || "bg-blue-500/20 text-blue-400"}`}>{l[role] || role}</span>;
  };

  const toggleCollapse = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  const UserRow = ({ u }: { u: User }) => {
    const isEditing = editId === u.id;
    const isSelf = u.id === currentUser?.id;

    return (
      <div className={`flex items-center justify-between px-5 py-3 ${card}`}>
        {isEditing ? (
          <>
            <div className="flex items-center gap-2 flex-1">
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }}
                className={`border rounded px-2 py-1 text-sm outline-none ${inp} focus:border-blue-500 w-40`}
                autoFocus
              />
              <span className={`text-xs ${ts}`}>({u.username})</span>
              <select
                value={editRole}
                onChange={e => setEditRole(e.target.value)}
                className={`border rounded px-2 py-1 text-xs outline-none ${inp}`}
              >
                <option value="worker">작업자</option>
                {currentUser?.role === "master" && <option value="manager">관리자</option>}
                {currentUser?.role === "master" && <option value="master">마스터</option>}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={saveEdit} className="text-emerald-400 hover:text-emerald-300"><Check size={16} /></button>
              <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{u.display_name || u.username}</span>
              {u.username !== (u.display_name || u.username) && <span className={`text-xs ${ts}`}>({u.username})</span>}
              {roleBadge(u.role)}
              {u.is_active === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">비활성</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => startEdit(u)} className="text-blue-400 hover:text-blue-300" title="수정">
                <Pencil size={14} />
              </button>
              <button onClick={() => handleResetPw(u.id)} className="text-yellow-400 hover:text-yellow-300" title="비밀번호 초기화">
                <KeyRound size={14} />
              </button>
              <button
                onClick={() => handleDelete(u.id)}
                className={`${isSelf ? "text-gray-700 cursor-not-allowed" : "text-red-400 hover:text-red-300"}`}
                disabled={isSelf}
                title={isSelf ? "자기 자신은 삭제 불가" : "삭제"}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const GroupSection = ({ title, items, color, sectionKey }: { title: string; items: User[]; color: string; sectionKey: string }) => {
    const open = !collapsed[sectionKey];
    return (
      <div className="mb-2">
        <button onClick={() => toggleCollapse(sectionKey)} className={`w-full flex items-center gap-2 px-5 py-2.5 ${color} rounded-t-lg text-sm font-medium`}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {title} <span className="opacity-60">({items.length}명)</span>
        </button>
        {open && (
          <div className={`border border-t-0 ${bd} rounded-b-lg divide-y divide-gray-800`}>
            {items.map(u => <UserRow key={u.id} u={u} />)}
            {items.length === 0 && <div className={`px-5 py-4 text-sm ${ts}`}>멤버가 없습니다</div>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-green-400" />
          <h2 className="text-lg font-bold">조직원 관리</h2>
        </div>
        {msg && <span className={`text-xs font-medium ${msg.includes("실패") || msg.includes("불가") ? "text-red-400" : "text-emerald-400"}`}>{msg}</span>}
      </div>

      {/* 생성 폼 */}
      <div className={`${card} border ${bd} rounded-xl p-5 mb-6`}>
        <div className="text-xs text-gray-500 mb-3">새 계정 생성 (초기 비밀번호 = 아이디)</div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className={`block text-xs ${ts} mb-1`}>아이디</label>
            <input
              value={newId}
              onChange={e => setNewId(e.target.value)}
              placeholder="예: worker01"
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`}
            />
          </div>
          <div className="flex-1">
            <label className={`block text-xs ${ts} mb-1`}>이름 (표시명)</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="예: 홍길동"
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`}
            />
          </div>
          <div className="w-32">
            <label className={`block text-xs ${ts} mb-1`}>권한</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp}`}>
              <option value="worker">작업자</option>
              {currentUser?.role === "master" && <option value="manager">관리자</option>}
              {currentUser?.role === "master" && <option value="master">마스터</option>}
            </select>
          </div>
          <button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-lg" title="계정 생성">
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* 서브 탭 */}
      <div className="flex gap-4 mb-4 border-b border-gray-800 pb-0">
        <button onClick={() => setSubTab("admin")} className={`pb-2 text-sm border-b-2 ${subTab === "admin" ? "border-pink-400 text-pink-400" : "border-transparent text-gray-500"}`}>
          마스터 · 관리자
        </button>
        <button onClick={() => setSubTab("worker")} className={`pb-2 text-sm border-b-2 ${subTab === "worker" ? "border-blue-400 text-blue-400" : "border-transparent text-gray-500"}`}>
          작업자
        </button>
      </div>

      {subTab === "admin" ? (
        <>
          <GroupSection title="마스터" items={masters} color="bg-red-500/10 text-red-400" sectionKey="masters" />
          <GroupSection title="관리자" items={managers} color="bg-purple-500/10 text-purple-400" sectionKey="managers" />
        </>
      ) : (
        <GroupSection title="작업자" items={workers} color="bg-blue-500/10 text-blue-400" sectionKey="workers" />
      )}
    </div>
  );
}