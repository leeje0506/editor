import { useEffect, useState, useMemo } from "react";
import {
  Users, Plus, Trash2, ChevronDown, ChevronRight, Pencil, Check, X,
  KeyRound, Search, Shield, Folder,
} from "lucide-react";
import { authApi } from "../../../api/auth";
import { permissionsApi } from "../../../api/permissions";
import { useAuthStore } from "../../../store/useAuthStore";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import type { User, Workspace } from "../../../types";

interface Props {
  dark?: boolean;
}

export function MembersTab({ dark = true }: Props) {
  const dm = dark;
  const bd = dm ? "border-gray-800" : "border-gray-200";
  const card = dm ? "bg-gray-900" : "bg-white";
  const inp = dm
    ? "bg-gray-800 text-gray-100 border-gray-700"
    : "bg-white text-gray-800 border-gray-300";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const subtle = dm ? "text-gray-500" : "text-gray-400";
  const innerBg = dm ? "bg-gray-800" : "bg-gray-100";

  // ── 계정 ──
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

  // ── 권한 패널 ──
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [grantedIds, setGrantedIds] = useState<Set<number>>(new Set());
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  const currentUser = useAuthStore((s) => s.user);

  // 워크스페이스 트리 (전체)
  const tree = useWorkspaceStore((s) => s.tree);
  const byId = useWorkspaceStore((s) => s.byId);
  const fetchTree = useWorkspaceStore((s) => s.fetch);

  const fetchUsers = async () => {
    try {
      setUsers(await authApi.listUsers());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchTree();
  }, [fetchTree]);

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 2000);
  };

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
      setNewId("");
      setNewName("");
      showMsg("계정 생성 완료");
      fetchUsers();
    } catch (e: any) {
      showMsg(e?.response?.data?.detail || "생성 실패");
    }
  };

  const handleDelete = async (id: number) => {
    if (id === currentUser?.id) {
      showMsg("자기 자신은 삭제할 수 없습니다");
      return;
    }
    if (!confirm("정말 삭제(비활성화)하시겠습니까?")) return;
    try {
      await authApi.deleteUser(id);
      showMsg("삭제 완료");
      // 권한 패널에서 보고 있던 사용자면 닫기
      if (selectedUser?.id === id) setSelectedUser(null);
      fetchUsers();
    } catch {
      showMsg("삭제 실패");
    }
  };

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

  const handleResetPw = async (id: number) => {
    if (!confirm("비밀번호를 초기화하시겠습니까?")) return;
    try {
      await authApi.resetPassword(id);
      showMsg("비밀번호 초기화 완료");
    } catch {
      showMsg("초기화 실패");
    }
  };

  // ── 권한 패널 ──

  const selectUserForPermissions = async (u: User) => {
    setSelectedUser(u);
    setLoadingPerms(true);
    try {
      const perms = await permissionsApi.getUserPermissions(u.id);
      const ids = new Set<number>();
      for (const p of perms) {
        if (p.workspace?.id != null) ids.add(p.workspace.id);
      }
      setGrantedIds(ids);
    } catch {
      setGrantedIds(new Set());
    } finally {
      setLoadingPerms(false);
    }
  };

  // 어떤 노드의 조상 중에 granted된 게 있는지
  const hasGrantedAncestor = (id: number, granted: Set<number>): boolean => {
    let cur = byId.get(id);
    while (cur && cur.parent_id !== null) {
      if (granted.has(cur.parent_id)) return true;
      cur = byId.get(cur.parent_id);
    }
    return false;
  };

  const toggleGranted = (id: number) => {
    setGrantedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const savePermissions = async () => {
    if (!selectedUser) return;
    setSavingPerms(true);
    try {
      await permissionsApi.bulkGrant(selectedUser.id, Array.from(grantedIds));
      showMsg("권한 저장 완료");
    } catch (e: any) {
      showMsg(e?.response?.data?.detail || "권한 저장 실패");
    } finally {
      setSavingPerms(false);
    }
  };

  // ── 필터 ──

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
  const workers = users.filter(
    (u) => u.role !== "master" && u.role !== "manager" && filterUser(u),
  );

  // ── UI 헬퍼 ──

  const roleBadge = (role: string) => {
    const c: Record<string, string> = {
      master: "bg-red-500/20 text-red-400",
      manager: "bg-purple-500/20 text-purple-400",
    };
    const l: Record<string, string> = { master: "마스터", manager: "관리자", worker: "작업자" };
    return (
      <span
        className={`text-[10px] px-2 py-0.5 rounded font-medium ${
          c[role] || "bg-blue-500/20 text-blue-400"
        }`}
      >
        {l[role] || role}
      </span>
    );
  };
  const toggleCollapse = (key: string) =>
    setCollapsed((p) => ({ ...p, [key]: !p[key] }));

  // ── 권한 트리 행 ──

  const renderPermissionTree = () => {
    // tree는 평탄 정렬, 각 노드 depth 계산하면서 렌더
    const depthOf = (id: number): number => {
      let depth = 1;
      let cur = byId.get(id);
      while (cur && cur.parent_id !== null) {
        depth++;
        cur = byId.get(cur.parent_id);
      }
      return depth;
    };

    if (tree.length === 0) {
      return (
        <div className={`text-xs ${ts} py-4 text-center`}>
          워크스페이스가 없습니다.
        </div>
      );
    }

    return (
      <ul className="space-y-0.5">
        {tree.map((ws) => {
          const depth = depthOf(ws.id);
          const isGranted = grantedIds.has(ws.id);
          const ancestorGranted = hasGrantedAncestor(ws.id, grantedIds);
          // 상위에 권한이 있으면 자식 직접 부여는 의미 없음 → disabled
          const disabled = ancestorGranted;
          return (
            <li
              key={ws.id}
              className="flex items-center gap-2 py-1 text-xs"
              style={{ paddingLeft: `${(depth - 1) * 14}px` }}
            >
              <input
                type="checkbox"
                checked={isGranted}
                disabled={disabled}
                onChange={() => toggleGranted(ws.id)}
                className="w-3.5 h-3.5 rounded border-gray-600 disabled:opacity-40"
              />
              <Folder
                size={12}
                className={
                  isGranted
                    ? "text-green-400"
                    : ancestorGranted
                      ? "text-green-400/40"
                      : subtle
                }
              />
              <span
                className={
                  isGranted
                    ? "text-green-400 font-medium"
                    : ancestorGranted
                      ? `${subtle} line-through`
                      : tp
                }
              >
                {ws.name}
              </span>
              {ancestorGranted && (
                <span className={`text-[9px] ${subtle} ml-auto`}>상위 포함</span>
              )}
              {isGranted && !ancestorGranted && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 ml-auto">
                  직접
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  // ── UserRow ──

  const UserRow = ({ u }: { u: User }) => {
    const isEditing = editId === u.id;
    const isSelf = u.id === currentUser?.id;
    const isSelected = selectedUser?.id === u.id;

    return (
      <div
        className={`px-4 py-2.5 ${card} ${isSelected ? "ring-1 ring-blue-500" : ""}`}
      >
        <div className="flex items-center justify-between">
          {isEditing ? (
            <>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") setEditId(null);
                  }}
                  className={`border rounded px-2 py-1 text-xs outline-none ${inp} focus:border-blue-500 w-28`}
                  autoFocus
                />
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className={`border rounded px-1.5 py-1 text-[11px] outline-none ${inp}`}
                >
                  <option value="worker">작업자</option>
                  {currentUser?.role === "master" && (
                    <option value="manager">관리자</option>
                  )}
                  {currentUser?.role === "master" && (
                    <option value="master">마스터</option>
                  )}
                </select>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={saveEdit} className="text-emerald-400 hover:text-emerald-300">
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setEditId(null)}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <X size={14} />
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => selectUserForPermissions(u)}
                className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
              >
                <span className="font-medium text-xs truncate">
                  {u.display_name || u.username}
                </span>
                {u.username !== (u.display_name || u.username) && (
                  <span className={`text-[10px] ${ts} shrink-0`}>({u.username})</span>
                )}
                {roleBadge(u.role)}
                {u.is_active === false && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-gray-700 text-gray-400 shrink-0">
                    비활성
                  </span>
                )}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => startEdit(u)}
                  className="text-blue-400 hover:text-blue-300"
                  title="수정"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleResetPw(u.id)}
                  className="text-yellow-400 hover:text-yellow-300"
                  title="비밀번호 초기화"
                >
                  <KeyRound size={13} />
                </button>
                <button
                  onClick={() => handleDelete(u.id)}
                  className={
                    isSelf
                      ? "text-gray-700 cursor-not-allowed"
                      : "text-red-400 hover:text-red-300"
                  }
                  disabled={isSelf}
                  title={isSelf ? "자기 자신은 삭제 불가" : "삭제"}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── GroupSection ──

  const GroupSection = ({
    title,
    items,
    color,
    sectionKey,
  }: {
    title: string;
    items: User[];
    color: string;
    sectionKey: string;
  }) => {
    const open = !collapsed[sectionKey];
    return (
      <div className="mb-2">
        <button
          onClick={() => toggleCollapse(sectionKey)}
          className={`w-full flex items-center gap-2 px-4 py-2 ${color} rounded-t-lg text-xs font-medium`}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {title} <span className="opacity-60">({items.length}명)</span>
        </button>
        {open && (
          <div
            className={`border border-t-0 ${bd} rounded-b-lg ${
              dm ? "divide-gray-800" : "divide-gray-200"
            } divide-y`}
          >
            {items.map((u) => (
              <UserRow key={u.id} u={u} />
            ))}
            {items.length === 0 && (
              <div className={`px-4 py-3 text-xs ${ts}`}>
                {searchLower ? "검색 결과 없음" : "멤버가 없습니다"}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex gap-6 h-full ${tp}`}>
      {/* ──────── 좌측: 작업자 관리 ──────── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-green-400" />
            <h2 className="text-base font-bold">작업자 관리</h2>
          </div>
          {msg && (
            <span
              className={`text-[11px] font-medium ${
                msg.includes("실패") || msg.includes("불가")
                  ? "text-red-400"
                  : "text-emerald-400"
              }`}
            >
              {msg}
            </span>
          )}
        </div>

        {/* 생성 폼 */}
        <div className={`${card} border ${bd} rounded-xl p-4 mb-4 shrink-0`}>
          <div className={`text-[11px] ${ts} mb-2`}>
            새 계정 생성 (초기 비밀번호 = 아이디)
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={`block text-[11px] ${ts} mb-1`}>아이디</label>
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="예: worker01"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                className={`w-full border rounded-lg px-2.5 py-2 text-xs outline-none ${inp} focus:border-blue-500`}
              />
            </div>
            <div className="flex-1">
              <label className={`block text-[11px] ${ts} mb-1`}>이름</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="예: 홍길동"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                className={`w-full border rounded-lg px-2.5 py-2 text-xs outline-none ${inp} focus:border-blue-500`}
              />
            </div>
            <div className="w-24">
              <label className={`block text-[11px] ${ts} mb-1`}>역할</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className={`w-full border rounded-lg px-2 py-2 text-xs outline-none ${inp}`}
              >
                <option value="worker">작업자</option>
                {currentUser?.role === "master" && (
                  <option value="manager">관리자</option>
                )}
                {currentUser?.role === "master" && <option value="master">마스터</option>}
              </select>
            </div>
            <button
              onClick={handleCreate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg shrink-0"
              title="계정 생성"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* 검색 + 서브 탭 */}
        <div
          className={`flex items-center justify-between mb-3 border-b ${bd} pb-0 shrink-0`}
        >
          <div className="flex gap-3">
            <button
              onClick={() => setSubTab("admin")}
              className={`pb-2 text-xs border-b-2 ${
                subTab === "admin"
                  ? "border-pink-400 text-pink-400"
                  : `border-transparent ${ts}`
              }`}
            >
              마스터 · 관리자
            </button>
            <button
              onClick={() => setSubTab("worker")}
              className={`pb-2 text-xs border-b-2 ${
                subTab === "worker"
                  ? "border-blue-400 text-blue-400"
                  : `border-transparent ${ts}`
              }`}
            >
              작업자
            </button>
          </div>
          <div className="relative mb-1">
            <Search
              size={12}
              className={`absolute left-2 top-1/2 -translate-y-1/2 ${ts}`}
            />
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="이름 / 아이디 검색"
              className={`border rounded-lg pl-7 pr-2.5 py-1.5 text-[11px] outline-none ${inp} focus:border-blue-500 w-44`}
            />
          </div>
        </div>

        {/* 멤버 리스트 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {subTab === "admin" ? (
            <>
              <GroupSection
                title="마스터"
                items={masters}
                color="bg-red-500/10 text-red-400"
                sectionKey="masters"
              />
              <GroupSection
                title="관리자"
                items={managers}
                color="bg-purple-500/10 text-purple-400"
                sectionKey="managers"
              />
            </>
          ) : (
            <GroupSection
              title="작업자"
              items={workers}
              color="bg-blue-500/10 text-blue-400"
              sectionKey="workers"
            />
          )}
        </div>
      </div>

      {/* ──────── 우측: 워크스페이스 권한 편집 ──────── */}
      <div className="w-[360px] shrink-0 flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <Shield size={18} className="text-green-400" />
          <h2 className="text-base font-bold">워크스페이스 권한</h2>
        </div>

        <div className={`flex-1 ${card} border ${bd} rounded-xl flex flex-col min-h-0`}>
          {!selectedUser ? (
            <div className={`flex-1 flex items-center justify-center text-xs ${ts} text-center px-6`}>
              왼쪽에서 사용자를 선택하면<br />
              워크스페이스 권한을 편집할 수 있습니다.
            </div>
          ) : (
            <>
              {/* 헤더 */}
              <div className={`px-4 py-3 border-b ${bd} shrink-0`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate">
                      {selectedUser.display_name || selectedUser.username}
                    </span>
                    {roleBadge(selectedUser.role)}
                  </div>
                  <button
                    onClick={() => setSelectedUser(null)}
                    className={`shrink-0 ${ts} hover:opacity-70`}
                    title="닫기"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* 안내 박스 */}
              <div className={`mx-4 mt-3 p-2.5 rounded ${innerBg} text-[10px] ${ts} leading-relaxed shrink-0`}>
                상위 워크스페이스 권한은 모든 하위에 자동 적용됩니다.
                상위에 권한이 있으면 자식은 별도 부여 불필요(체크 비활성).
              </div>

              {/* 트리 */}
              <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
                {loadingPerms ? (
                  <div className={`text-xs ${ts} py-8 text-center`}>로딩 중...</div>
                ) : (
                  renderPermissionTree()
                )}
              </div>

              {/* 저장 */}
              <div className={`px-4 py-3 border-t ${bd} flex items-center justify-end gap-2 shrink-0`}>
                <button
                  onClick={() => selectUserForPermissions(selectedUser)}
                  disabled={savingPerms || loadingPerms}
                  className={`text-xs px-3 py-1.5 rounded ${ts} hover:opacity-80`}
                >
                  되돌리기
                </button>
                <button
                  onClick={savePermissions}
                  disabled={savingPerms || loadingPerms}
                  className="text-xs px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium"
                >
                  {savingPerms ? "저장 중..." : "저장"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}