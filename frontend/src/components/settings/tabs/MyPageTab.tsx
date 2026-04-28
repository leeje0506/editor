import { useState, useEffect } from "react";
import { User, Lock, AlertTriangle, Shield, Clock, CheckCircle, XCircle } from "lucide-react";
import { useAuthStore } from "../../../store/useAuthStore";
import { authApi } from "../../../api/auth";
import { permissionsApi } from "../../../api/permissions";
import { useBroadcasterStore } from "../../../store/useBroadcasterStore";
import type { PermissionRequest } from "../../../api/permissions";

interface Props { dark?: boolean; }

export function MyPageTab({ dark = true }: Props) {
  const dm = dark;
  const bd = dm ? "border-gray-800" : "border-gray-200";
  const card = dm ? "bg-gray-900" : "bg-white";
  const inp = dm ? "bg-gray-800 text-gray-100 border-gray-700" : "bg-white text-gray-800 border-gray-300";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const { user, loadUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  // 권한 관련
  const [myPerms, setMyPerms] = useState<string[]>([]);
  const [myRequests, setMyRequests] = useState<PermissionRequest[]>([]);
  const [requestBc, setRequestBc] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestMsg, setRequestMsg] = useState("");

  const bcStore = useBroadcasterStore();

  useEffect(() => {
    fetchMyPerms();
    fetchMyRequests();
    bcStore.fetch();
  }, []);

  const fetchMyPerms = async () => {
    try { setMyPerms(await permissionsApi.getMyPermissions()); } catch {}
  };

  const fetchMyRequests = async () => {
    try { setMyRequests(await permissionsApi.listRequests()); } catch {}
  };

  const roleBadge = (role: string) => {
    const c: Record<string, string> = { master: "bg-red-500/20 text-red-400", manager: "bg-purple-500/20 text-purple-400", worker: "bg-blue-500/20 text-blue-400" };
    const l: Record<string, string> = { master: "마스터", manager: "관리자", worker: "작업자" };
    return <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${c[role || "worker"]}`}>{l[role || "worker"]}</span>;
  };

  const handleSaveProfile = async () => {
    try {
      await authApi.updateMe({ display_name: displayName });
      await loadUser();
      setProfileMsg("저장 완료!");
      setTimeout(() => setProfileMsg(""), 2000);
    } catch { setProfileMsg("저장 실패"); }
  };

  const handleChangePw = async () => {
    if (newPw.length < 4) { setPwMsg("4자 이상 입력하세요"); return; }
    try {
      await authApi.updateMe({ current_password: curPw, new_password: newPw });
      setCurPw(""); setNewPw("");
      setPwMsg("비밀번호가 변경되었습니다");
      setTimeout(() => setPwMsg(""), 2000);
    } catch (e: any) { setPwMsg(e?.response?.data?.detail || "변경 실패"); }
  };

  const handleRequestPerm = async () => {
    if (!requestBc) { setRequestMsg("방송사를 선택하세요"); return; }
    try {
      await permissionsApi.createRequest(requestBc, requestReason || undefined);
      setRequestBc(""); setRequestReason("");
      setRequestMsg("요청 완료! 관리자 승인을 기다려주세요.");
      setTimeout(() => setRequestMsg(""), 3000);
      fetchMyRequests();
    } catch (e: any) {
      setRequestMsg(e?.response?.data?.detail || "요청 실패");
      setTimeout(() => setRequestMsg(""), 3000);
    }
  };

  // 요청 가능한 방송사 = 전체 방송사 - 이미 권한 있는 것 - 이미 pending 요청 있는 것
  const pendingBroadcasters = new Set(myRequests.filter(r => r.status === "pending").map(r => r.broadcaster));
  const requestableBroadcasters = bcStore.names.filter(bc => !myPerms.includes(bc) && !pendingBroadcasters.has(bc));

  const initial = (user?.display_name || user?.username || "U")[0].toUpperCase();

  const statusBadge = (status: string) => {
    if (status === "pending") return <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 flex items-center gap-0.5"><Clock size={9} /> 대기</span>;
    if (status === "approved") return <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 flex items-center gap-0.5"><CheckCircle size={9} /> 승인</span>;
    return <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-0.5"><XCircle size={9} /> 거절</span>;
  };

  return (
    <div className="max-w-3xl">
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
                <div className="font-bold text-lg">{user?.display_name || user?.username}</div>
                <div className={`text-sm ${ts}`}>@{user?.username}</div>
                {user && roleBadge(user.role)}
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <h3 className="font-bold text-sm">프로필 정보</h3>
              <div>
                <label className={`block text-xs ${ts} mb-1`}>이름 (표시명)</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="홍길동"
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleSaveProfile} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold">저장</button>
                {profileMsg && <span className={`text-xs ${profileMsg.includes("실패") ? "text-red-400" : "text-emerald-400"}`}>{profileMsg}</span>}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Lock size={16} className={ts} />
                <h3 className="font-bold text-sm">비밀번호 변경</h3>
              </div>
              <div>
                <label className={`block text-xs ${ts} mb-1`}>현재 비밀번호</label>
                <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
              </div>
              <div>
                <label className={`block text-xs ${ts} mb-1`}>새 비밀번호</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="4자 이상"
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleChangePw} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold">변경</button>
                {pwMsg && <span className={`text-xs ${pwMsg.includes("실패") || pwMsg.includes("4자") ? "text-red-400" : "text-emerald-400"}`}>{pwMsg}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 방송사 권한 + 요청 */}
        <div className="w-[320px] shrink-0 flex flex-col gap-4">
          {/* 내 권한 */}
          <div className={`${card} border ${bd} rounded-xl p-5`}>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} className="text-green-400" />
              <h3 className="font-bold text-sm">내 방송사 권한</h3>
            </div>
            {myPerms.length === 0 ? (
              <div className={`text-xs ${ts} py-2`}>부여된 권한이 없습니다. 아래에서 요청할 수 있습니다.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {myPerms.map(bc => (
                  <span key={bc} className="text-[11px] px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 font-medium">{bc}</span>
                ))}
              </div>
            )}
          </div>

          {/* 권한 요청 */}
          <div className={`${card} border ${bd} rounded-xl p-5`}>
            <h3 className="font-bold text-sm mb-3">권한 요청</h3>
            {requestableBroadcasters.length === 0 ? (
              <div className={`text-xs ${ts} py-2`}>
                {bcStore.names.length === 0 ? "등록된 방송사가 없습니다" : "모든 방송사 권한을 보유하고 있거나 요청 중입니다"}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div>
                  <label className={`block text-[11px] ${ts} mb-1`}>방송사 선택</label>
                  <select value={requestBc} onChange={e => setRequestBc(e.target.value)}
                    className={`w-full border rounded-lg px-2.5 py-2 text-xs outline-none ${inp} focus:border-blue-500`}>
                    <option value="">선택...</option>
                    {requestableBroadcasters.map(bc => <option key={bc} value={bc}>{bc}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-[11px] ${ts} mb-1`}>사유 (선택)</label>
                  <input value={requestReason} onChange={e => setRequestReason(e.target.value)} placeholder="예: 신규 프로젝트 배정"
                    className={`w-full border rounded-lg px-2.5 py-2 text-xs outline-none ${inp} focus:border-blue-500`} />
                </div>
                <button onClick={handleRequestPerm} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-xs font-bold">
                  권한 요청
                </button>
                {requestMsg && <div className={`text-[11px] ${requestMsg.includes("실패") ? "text-red-400" : "text-emerald-400"}`}>{requestMsg}</div>}
              </div>
            )}
          </div>

          {/* 요청 이력 */}
          {myRequests.length > 0 && (
            <div className={`${card} border ${bd} rounded-xl p-5`}>
              <h3 className="font-bold text-sm mb-3">요청 이력</h3>
              <div className="space-y-2">
                {myRequests.map(req => (
                  <div key={req.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">{req.broadcaster}</span>
                      {statusBadge(req.status)}
                    </div>
                    <span className={`text-[9px] ${ts}`}>{req.created_at ? new Date(req.created_at).toLocaleDateString("ko") : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}