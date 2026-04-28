import { useEffect, useState, useMemo } from "react";
import { Users, Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check, X, KeyRound, Search, Shield, Bell } from "lucide-react";
import { authApi } from "../../../api/auth";
import { permissionsApi } from "../../../api/permissions";
import { useBroadcasterStore } from "../../../store/useBroadcasterStore";
import { useAuthStore } from "../../../store/useAuthStore";
import type { User } from "../../../types";
import type { PermissionRequest, UserPermissionSummary } from "../../../api/permissions";

interface Props { dark?: boolean; }

export function MembersTab({ dark = true }: Props) {
  const dm = dark;
  const bd = dm ? "border-gray-800" : "border-gray-200";
  const card = dm ? "bg-gray-900" : "bg-white";
  const inp = dm ? "bg-gray-800 text-gray-100 border-gray-700" : "bg-white text-gray-800 border-gray-300";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const [users, setUsers] = useState<User[]>([]);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("worker");
  const [subTab, setSubTab] = useState<"admin" | "worker">("worker");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [msg, setMsg] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  // 권한 관련
  const [allPerms, setAllPerms] = useState<UserPermissionSummary[]>([]);
  const [permRequests, setPermRequests] = useState<PermissionRequest[]>([]);
  const [editPermUserId, setEditPermUserId] = useState<number | null>(null);
  const [editPermBroadcasters, setEditPermBroadcasters] = useState<Set<string>>(new Set());

  const currentUser = useAuthStore((s) => s.user);
  const bcStore = useBroadcasterStore();

  const fetchUsers = async () => {
    try { setUsers(await authApi.listUsers()); } catch {}
  };
  const fetchPerms = async () => {
    try { setAllPerms(await permissionsApi.getAllPermissions()); } catch {}
  };
  const fetchRequests = async () => {
    try { setPermRequests(await permissionsApi.listRequests("pending")); } catch {}
  };

  useEffect(() => {
    fetchUsers();
    fetchPerms();
    fetchRequests();
    bcStore.fetch();
  }, []);

  const showMsg = (text: string) => { setMsg(text); setTimeout(() => setMsg(""), 2000); };

  // ── 계정 CRUD ──

  const handleCreate = async () => {
    if (!newId.trim()) return;
    try {
      await authApi.createUser({
        username: newId.trim(),
        password: newId.trim(),
        display_name: newName.trim() || newId.trim(),
        role: newRole,
      });
      setNewId(""); setNewName("");
      showMsg("계정 생성 완료");
      fetchUsers();
    } catch (e: any) {
      showMsg(e?.response?.data?.detail || "생성 실패");
    }
  };

  const handleDelete = async (id: number) => {
    if (id === currentUser?.id) { showMsg("자기 자신은 삭제할 수 없습니다"); return; }
    if (!confirm("정말 삭제(비활성화)하시겠습니까?")) return;
    try {
      await authApi.deleteUser(id);
      showMsg("삭제 완료");
      fetchUsers();
    } catch { showMsg("삭제 실패"); }
  };

  const startEdit = (u: User) => {
    setEditId(u.id); setEditName(u.display_name || u.username); setEditRole(u.role);
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

  const handleResetPw = async (id: number) => {
    if (!confirm("비밀번호를 초기화하시겠습니까?")) return;
    try { await authApi.resetPassword(id); showMsg("비밀번호 초기화 완료"); }
    catch { showMsg("초기화 실패"); }
  };

  // ── 권한 편집 ──

  const getUserPerms = (userId: number): string[] => {
    const found = allPerms.find(p => p.user_id === userId);
    return found?.broadcasters || [];
  };

  const startPermEdit = (userId: number) => {
    setEditPermUserId(userId);
    setEditPermBroadcasters(new Set(getUserPerms(userId)));
  };

  const togglePermBroadcaster = (bc: string) => {
    setEditPermBroadcasters(prev => {
      const next = new Set(prev);
      next.has(bc) ? next.delete(bc) : next.add(bc);
      return next;
    });
  };

  const savePermEdit = async () => {
    if (editPermUserId === null) return;
    try {
      await permissionsApi.bulkGrant(editPermUserId, Array.from(editPermBroadcasters));
      setEditPermUserId(null);
      showMsg("권한 저장 완료");
      fetchPerms();
    } catch (e: any) {
      showMsg(e?.response?.data?.detail || "권한 저장 실패");
    }
  };

  // ── 권한 요청 처리 ──

  const handleReviewRequest = async (reqId: number, status: "approved" | "rejected") => {
    try {
      await permissionsApi.reviewRequest(reqId, status);
      showMsg(status === "approved" ? "승인 완료" : "거절 완료");
      fetchRequests();
      fetchPerms();
    } catch (e: any) {
      showMsg(e?.response?.data?.detail || "처리 실패");
    }
  };

  // ── 필터 ──

  const searchLower = memberSearch.trim().toLowerCase();
  const filterUser = (u: User) => {
    if (!searchLower) return true;
    return (u.display_name || "").toLowerCase().includes(searchLower) || u.username.toLowerCase().includes(searchLower);
  };

  const masters = users.filter(u => u.role === "master" && filterUser(u));
  const managers = users.filter(u => u.role === "manager" && filterUser(u));
  const workers = users.filter(u => u.role !== "master" && u.role !== "manager" && filterUser(u));

  // ── UI 헬퍼 ──

  const roleBadge = (role: string) => {
    const c: Record<string, string> = { master: "bg-red-500/20 text-red-400", manager: "bg-purple-500/20 text-purple-400" };
    const l: Record<string, string> = { master: "마스터", manager: "관리자", worker: "작업자" };
    return <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${c[role] || "bg-blue-500/20 text-blue-400"}`}>{l[role] || role}</span>;
  };
  const toggleCollapse = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  // ── UserRow ──

  const UserRow = ({ u }: { u: User }) => {
    const isEditing = editId === u.id;
    const isSelf = u.id === currentUser?.id;
    const perms = getUserPerms(u.id);
    const isEditingPerm = editPermUserId === u.id;

    return (
      <div className={`px-4 py-2.5 ${card}`}>
        <div className="flex items-center justify-between">
          {isEditing ? (
            <>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }}
                  className={`border rounded px-2 py-1 text-xs outline-none ${inp} focus:border-blue-500 w-28`} autoFocus />
                <select value={editRole} onChange={e => setEditRole(e.target.value)} className={`border rounded px-1.5 py-1 text-[11px] outline-none ${inp}`}>
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
                <button onClick={() => startPermEdit(u.id)} className="text-green-400 hover:text-green-300" title="방송사 권한"><Shield size={13} /></button>
                <button onClick={() => startEdit(u)} className="text-blue-400 hover:text-blue-300" title="수정"><Pencil size={13} /></button>
                <button onClick={() => handleResetPw(u.id)} className="text-yellow-400 hover:text-yellow-300" title="비밀번호 초기화"><KeyRound size={13} /></button>
                <button onClick={() => handleDelete(u.id)} className={`${isSelf ? "text-gray-700 cursor-not-allowed" : "text-red-400 hover:text-red-300"}`} disabled={isSelf} title={isSelf ? "자기 자신은 삭제 불가" : "삭제"}>
                  <Trash2 size={13} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* 방송사 권한 태그 */}
        {!isEditing && !isEditingPerm && perms.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5 ml-0.5">
            {perms.map(bc => (
              <span key={bc} className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">{bc}</span>
            ))}
          </div>
        )}

        {/* 권한 편집 모드 */}
        {isEditingPerm && (
          <div className="mt-2 p-2.5 bg-gray-800 rounded-lg">
            <div className="text-[10px] text-gray-500 mb-2">방송사 권한 선택 (체크된 방송사에 작업 가능)</div>
            <div className="flex flex-wrap gap-2 mb-2.5">
              {bcStore.names.map(bc => (
                <label key={bc} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPermBroadcasters.has(bc)}
                    onChange={() => togglePermBroadcaster(bc)}
                    className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700"
                  />
                  <span className="text-[11px] text-gray-300">{bc}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={savePermEdit} className="text-[10px] px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white font-medium">저장</button>
              <button onClick={() => setEditPermUserId(null)} className={`text-[10px] px-3 py-1 rounded ${ts}`}>취소</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── GroupSection ──

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
            {items.map(u => <UserRow key={u.id} u={u} />)}
            {items.length === 0 && <div className={`px-4 py-3 text-xs ${ts}`}>{searchLower ? "검색 결과 없음" : "멤버가 없습니다"}</div>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex gap-6 h-full">

      {/* ──────── 좌측: 작업자 관리 ──────── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-green-400" />
            <h2 className="text-base font-bold">작업자 관리</h2>
          </div>
          {msg && <span className={`text-[11px] font-medium ${msg.includes("실패") || msg.includes("불가") ? "text-red-400" : "text-emerald-400"}`}>{msg}</span>}
        </div>

        {/* 생성 폼 */}
        <div className={`${card} border ${bd} rounded-xl p-4 mb-4 shrink-0`}>
          <div className="text-[11px] text-gray-500 mb-2">새 계정 생성 (초기 비밀번호 = 아이디)</div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={`block text-[11px] ${ts} mb-1`}>아이디</label>
              <input value={newId} onChange={e => setNewId(e.target.value)} placeholder="예: worker01"
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
                className={`w-full border rounded-lg px-2.5 py-2 text-xs outline-none ${inp} focus:border-blue-500`} />
            </div>
            <div className="flex-1">
              <label className={`block text-[11px] ${ts} mb-1`}>이름</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="예: 홍길동"
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
                className={`w-full border rounded-lg px-2.5 py-2 text-xs outline-none ${inp} focus:border-blue-500`} />
            </div>
            <div className="w-24">
              <label className={`block text-[11px] ${ts} mb-1`}>역할</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)} className={`w-full border rounded-lg px-2 py-2 text-xs outline-none ${inp}`}>
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
            <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="이름 / 아이디 검색"
              className={`border rounded-lg pl-7 pr-2.5 py-1.5 text-[11px] outline-none ${inp} focus:border-blue-500 w-44`} />
          </div>
        </div>

        {/* 멤버 리스트 */}
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

      {/* ──────── 우측: 권한 요청 ──────── */}
      <div className="w-[360px] shrink-0 flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <Bell size={18} className="text-yellow-400" />
          <h2 className="text-base font-bold">권한 요청</h2>
          {permRequests.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-medium">{permRequests.length}건</span>
          )}
        </div>

        <div className={`flex-1 overflow-y-auto min-h-0 ${card} border ${bd} rounded-xl`}>
          {permRequests.length === 0 ? (
            <div className={`py-12 text-center text-sm ${ts}`}>대기 중인 요청이 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {permRequests.map(req => (
                <div key={req.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{req.user_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">{req.broadcaster}</span>
                    </div>
                    <span className={`text-[9px] ${ts}`}>{req.created_at ? new Date(req.created_at).toLocaleDateString("ko") : ""}</span>
                  </div>
                  {req.reason && (
                    <div className={`text-[11px] ${ts} mb-2 bg-gray-800 rounded px-2.5 py-1.5`}>{req.reason}</div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReviewRequest(req.id, "approved")}
                      className="text-[10px] px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    >승인</button>
                    <button
                      onClick={() => handleReviewRequest(req.id, "rejected")}
                      className="text-[10px] px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium"
                    >거절</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}