import { useState, useEffect, useMemo } from "react";
import { User, Lock, AlertTriangle, Shield, Folder } from "lucide-react";
import { useAuthStore } from "../../../store/useAuthStore";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import { authApi } from "../../../api/auth";
import { permissionsApi, type WorkspacePermission } from "../../../api/permissions";
import type { Workspace } from "../../../types";

interface Props {
  dark?: boolean;
}

/**
 * 직접 부여 받은 워크스페이스 ID 집합 + 전체 트리 byId를 받아서
 * 표시할 노드들을 만든다.
 *
 * 표시 규칙:
 * - 직접 부여 노드 = 본인 + 모든 후손 (상속 효과)
 * - 그 노드들로 가는 조상 경로도 골격으로 표시 (회색 텍스트)
 */
function buildPermissionTree(
  grantedIds: Set<number>,
  byId: Map<number, Workspace>,
  tree: Workspace[],
): Array<{ ws: Workspace; depth: number; granted: boolean; inherited: boolean }> {
  // 1) 표시 대상 ID 모으기
  const visibleIds = new Set<number>();
  // granted 노드 + 그 후손 + 조상 경로
  const addWithDescendants = (id: number) => {
    if (visibleIds.has(id)) return;
    visibleIds.add(id);
    for (const w of tree) {
      if (w.parent_id === id) addWithDescendants(w.id);
    }
  };
  const addAncestors = (id: number) => {
    let cur = byId.get(id);
    while (cur && cur.parent_id !== null) {
      visibleIds.add(cur.parent_id);
      cur = byId.get(cur.parent_id);
    }
  };
  for (const id of grantedIds) {
    addWithDescendants(id);
    addAncestors(id);
  }

  // 2) tree 순서(평탄 정렬)대로 visible 노드 골라내고 depth 계산
  //    상속 여부: 조상 중에 granted가 있으면 inherited
  const isAncestorGranted = (id: number): boolean => {
    let cur = byId.get(id);
    while (cur && cur.parent_id !== null) {
      if (grantedIds.has(cur.parent_id)) return true;
      cur = byId.get(cur.parent_id);
    }
    return false;
  };
  const computeDepth = (id: number): number => {
    let depth = 1;
    let cur = byId.get(id);
    while (cur && cur.parent_id !== null) {
      depth++;
      cur = byId.get(cur.parent_id);
    }
    return depth;
  };

  return tree
    .filter((w) => visibleIds.has(w.id))
    .map((w) => ({
      ws: w,
      depth: computeDepth(w.id),
      granted: grantedIds.has(w.id),
      inherited: !grantedIds.has(w.id) && isAncestorGranted(w.id),
    }));
}

export function MyPageTab({ dark = true }: Props) {
  const dm = dark;
  const bd = dm ? "border-gray-800" : "border-gray-200";
  const card = dm ? "bg-gray-900" : "bg-white";
  const inp = dm
    ? "bg-gray-800 text-gray-100 border-gray-700"
    : "bg-white text-gray-800 border-gray-300";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const subtle = dm ? "text-gray-500" : "text-gray-400";

  const { user, loadUser } = useAuthStore();
  const tree = useWorkspaceStore((s) => s.tree);
  const byId = useWorkspaceStore((s) => s.byId);
  const fetchTree = useWorkspaceStore((s) => s.fetch);

  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  // ── 권한 ──
  const [myPerms, setMyPerms] = useState<WorkspacePermission[]>([]);

  useEffect(() => {
    fetchMyPerms();
    fetchTree();
  }, [fetchTree]);

  const fetchMyPerms = async () => {
    try {
      setMyPerms(await permissionsApi.getMyPermissions());
    } catch {
      setMyPerms([]);
    }
  };

  // 직접 부여받은 워크스페이스 ID 집합
  const grantedIds = useMemo(() => {
    const s = new Set<number>();
    for (const p of myPerms) {
      if (p.workspace?.id != null) s.add(p.workspace.id);
    }
    return s;
  }, [myPerms]);

  // 표시할 트리
  const permRows = useMemo(
    () => buildPermissionTree(grantedIds, byId, tree),
    [grantedIds, byId, tree],
  );

  const roleBadge = (role: string) => {
    const c: Record<string, string> = {
      master: "bg-red-500/20 text-red-400",
      manager: "bg-purple-500/20 text-purple-400",
      worker: "bg-blue-500/20 text-blue-400",
    };
    const l: Record<string, string> = { master: "마스터", manager: "관리자", worker: "작업자" };
    return (
      <span
        className={`text-[10px] px-2 py-0.5 rounded font-medium ${c[role || "worker"]}`}
      >
        {l[role || "worker"]}
      </span>
    );
  };

  const handleSaveProfile = async () => {
    try {
      await authApi.updateMe({ display_name: displayName });
      await loadUser();
      setProfileMsg("저장 완료!");
      setTimeout(() => setProfileMsg(""), 2000);
    } catch {
      setProfileMsg("저장 실패");
    }
  };

  const handleChangePw = async () => {
    if (newPw.length < 4) {
      setPwMsg("4자 이상 입력하세요");
      return;
    }
    try {
      await authApi.updateMe({ current_password: curPw, new_password: newPw });
      setCurPw("");
      setNewPw("");
      setPwMsg("비밀번호가 변경되었습니다");
      setTimeout(() => setPwMsg(""), 2000);
    } catch (e: any) {
      setPwMsg(e?.response?.data?.detail || "변경 실패");
    }
  };

  const initial = (user?.display_name || user?.username || "U")[0].toUpperCase();

  return (
    <div className={`max-w-3xl ${tp}`}>
      <div className="flex items-center gap-2 mb-6">
        <User size={20} className="text-blue-400" />
        <h2 className="text-lg font-bold">마이페이지</h2>
      </div>

      <div className="flex gap-6">
        {/* 좌측: 프로필 + 비밀번호 */}
        <div className="flex-1">
          <div className={`${card} border ${bd} rounded-xl p-6`}>
            {!displayName && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3 mb-6 flex items-center gap-2 text-sm text-yellow-400">
                <AlertTriangle size={16} />
                이름(표시명)을 입력해 주세요.
              </div>
            )}

            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center text-2xl font-bold text-white">
                {initial}
              </div>
              <div>
                <div className="font-bold text-lg">
                  {user?.display_name || user?.username}
                </div>
                <div className={`text-sm ${ts}`}>@{user?.username}</div>
                {user && roleBadge(user.role)}
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <h3 className="font-bold text-sm">프로필 정보</h3>
              <div>
                <label className={`block text-xs ${ts} mb-1`}>이름 (표시명)</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="홍길동"
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveProfile}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold"
                >
                  저장
                </button>
                {profileMsg && (
                  <span
                    className={`text-xs ${
                      profileMsg.includes("실패") ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {profileMsg}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Lock size={16} className={ts} />
                <h3 className="font-bold text-sm">비밀번호 변경</h3>
              </div>
              <div>
                <label className={`block text-xs ${ts} mb-1`}>현재 비밀번호</label>
                <input
                  type="password"
                  value={curPw}
                  onChange={(e) => setCurPw(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`}
                />
              </div>
              <div>
                <label className={`block text-xs ${ts} mb-1`}>새 비밀번호</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="4자 이상"
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleChangePw}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold"
                >
                  변경
                </button>
                {pwMsg && (
                  <span
                    className={`text-xs ${
                      pwMsg.includes("실패") || pwMsg.includes("4자")
                        ? "text-red-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {pwMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 워크스페이스 권한 트리 */}
        <div className="w-[320px] shrink-0">
          <div className={`${card} border ${bd} rounded-xl p-5`}>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} className="text-green-400" />
              <h3 className="font-bold text-sm">내 워크스페이스 권한</h3>
            </div>

            {grantedIds.size === 0 ? (
              <div className={`text-xs ${ts} py-2 leading-relaxed`}>
                부여된 권한이 없습니다.<br />
                관리자에게 권한을 요청해주세요.
              </div>
            ) : (
              <>
                <div className={`text-[11px] ${subtle} mb-3 leading-relaxed`}>
                  <span className="text-green-400">●</span> 직접 부여 ·{" "}
                  <span className={subtle}>○</span> 상속(상위에 권한 있음)
                </div>
                <ul className="space-y-0.5">
                  {permRows.map(({ ws, depth, granted, inherited }) => (
                    <li
                      key={ws.id}
                      className="flex items-center gap-1.5 py-1 text-xs"
                      style={{ paddingLeft: `${(depth - 1) * 14}px` }}
                    >
                      <Folder
                        size={12}
                        className={
                          granted
                            ? "text-green-400"
                            : inherited
                              ? "text-green-400/40"
                              : subtle
                        }
                      />
                      <span
                        className={
                          granted
                            ? "text-green-400 font-medium"
                            : inherited
                              ? "text-green-400/60"
                              : subtle
                        }
                      >
                        {ws.name}
                      </span>
                      {granted && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 ml-auto">
                          직접
                        </span>
                      )}
                      {inherited && (
                        <span className={`text-[9px] ${subtle} ml-auto`}>상속</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}