import { useEffect, useState } from "react";
import { Users, Plus, Trash2, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { authApi } from "../../../api/auth";
import { useAuthStore } from "../../../store/useAuthStore";
import type { User } from "../../../types";

export function MembersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [newId, setNewId] = useState("");
  const [newRole, setNewRole] = useState("worker");
  const [subTab, setSubTab] = useState<"admin" | "worker">("admin");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const currentUser = useAuthStore((s) => s.user);

  const fetchUsers = async () => {
    try { setUsers(await authApi.listUsers()); } catch {}
  };
  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async () => {
    if (!newId.trim()) return;
    try {
      await authApi.createUser({ username: newId.trim(), password: newId.trim(), display_name: newId.trim(), role: newRole });
      setNewId("");
      fetchUsers();
    } catch (e: any) { alert(e?.response?.data?.detail || "생성 실패"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제(비활성화)하시겠습니까?")) return;
    await authApi.deleteUser(id);
    fetchUsers();
  };

  const bd = "border-gray-800";
  const card = "bg-gray-900";
  const inp = "bg-gray-800 text-gray-100 border-gray-700";
  const ts = "text-gray-400";

  const masters = users.filter(u => u.role === "master");
  const managers = users.filter(u => u.role === "manager");
  const workers = users.filter(u => u.role === "worker");

  const roleBadge = (role: string) => {
    const c: Record<string, string> = { master: "bg-red-500/20 text-red-400", manager: "bg-purple-500/20 text-purple-400", worker: "bg-blue-500/20 text-blue-400" };
    const l: Record<string, string> = { master: "마스터", manager: "관리자", worker: "작업자" };
    return <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${c[role]}`}>{l[role]}</span>;
  };

  const toggleCollapse = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  const UserRow = ({ u }: { u: User }) => (
    <div className={`flex items-center justify-between px-5 py-3 ${card}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{u.display_name || u.username}</span>
        {u.username !== u.display_name && <span className={`text-xs ${ts}`}>({u.username})</span>}
        <Lock size={12} className={ts} />
      </div>
      <div className="flex items-center gap-2">
        {/* PW변경필요 mock */}
        {roleBadge(u.role)}
        <button onClick={() => handleDelete(u.id)} className="text-gray-600 hover:text-red-400" disabled={u.id === currentUser?.id}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );

  const GroupSection = ({ title, items, color, sectionKey }: { title: string; items: User[]; color: string; sectionKey: string }) => {
    const open = !collapsed[sectionKey];
    return (
      <div className="mb-2">
        <button onClick={() => toggleCollapse(sectionKey)} className={`w-full flex items-center gap-2 px-5 py-2.5 ${color} rounded-t-lg text-sm font-medium`}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {title} <Lock size={12} className="opacity-50" /> <span className="opacity-60">({items.length}명)</span>
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
      <div className="flex items-center gap-2 mb-6">
        <Users size={20} className="text-green-400" />
        <h2 className="text-lg font-bold">조직원 관리</h2>
      </div>

      {/* Create form */}
      <div className={`${card} border ${bd} rounded-xl p-5 mb-6`}>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className={`block text-xs ${ts} mb-1`}>아이디</label>
            <input value={newId} onChange={e => setNewId(e.target.value)} placeholder="예: worker01" className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
          </div>
          <div className="w-32">
            <label className={`block text-xs ${ts} mb-1`}>권한</label>
            <select value={newRole} onChange={e => setNewRole(e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp}`}>
              <option value="worker">작업자</option>
              {currentUser?.role === "master" && <option value="manager">관리자</option>}
              {currentUser?.role === "master" && <option value="master">마스터</option>}
            </select>
          </div>
          <button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-lg"><Users size={20} /></button>
        </div>
      </div>

      {/* Sub tabs */}
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
          <GroupSection title="마스터" items={masters} color="bg-red-500/10" sectionKey="master" />
          <GroupSection title="관리자" items={managers} color="bg-purple-500/10" sectionKey="manager" />
        </>
      ) : (
        <div className={`border ${bd} rounded-lg divide-y divide-gray-800`}>
          {workers.map(u => <UserRow key={u.id} u={u} />)}
          {workers.length === 0 && <div className={`px-5 py-8 text-center ${ts}`}>작업자가 없습니다</div>}
        </div>
      )}
    </div>
  );
}