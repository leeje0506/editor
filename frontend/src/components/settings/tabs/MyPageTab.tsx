import { useState } from "react";
import { User, Lock, AlertTriangle } from "lucide-react";
import { useAuthStore } from "../../../store/useAuthStore";
import { authApi } from "../../../api/auth";

export function MyPageTab() {
  const { user, loadUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  const bd = "border-gray-800";
  const card = "bg-gray-900";
  const inp = "bg-gray-800 text-gray-100 border-gray-700";
  const ts = "text-gray-400";

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

  const initial = (user?.display_name || user?.username || "U")[0].toUpperCase();

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <User size={20} className="text-blue-400" />
        <h2 className="text-lg font-bold">마이페이지</h2>
      </div>

      <div className={`${card} border ${bd} rounded-xl p-6`}>
        {/* Warning banner */}
        {!displayName && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3 mb-6 flex items-center gap-2 text-sm text-yellow-400">
            <AlertTriangle size={16} />
            이름(표시명) 등 프로필 정보가 입력되지 않았습니다. 아래에서 정보를 입력해 주세요.
          </div>
        )}

        {/* Avatar + info */}
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

        {/* Profile form */}
        <div className="space-y-4 mb-8">
          <h3 className="font-bold text-sm">프로필 정보</h3>
          <div>
            <label className={`block text-xs ${ts} mb-1`}>이름 (표시명)</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="홍길동" className={`w-80 border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
          </div>
          <div>
            <label className={`block text-xs ${ts} mb-1`}>이메일</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="example@company.com" className={`w-80 border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
          </div>
          <div>
            <label className={`block text-xs ${ts} mb-1`}>소속</label>
            <input value={team} onChange={e => setTeam(e.target.value)} placeholder="팀명 또는 부서명" className={`w-80 border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveProfile} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold">저장</button>
            {profileMsg && <span className={`text-xs ${profileMsg.includes("실패") ? "text-red-400" : "text-emerald-400"}`}>{profileMsg}</span>}
          </div>
        </div>

        {/* Password change */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Lock size={16} className={ts} />
            <h3 className="font-bold text-sm">비밀번호 변경</h3>
          </div>
          <div>
            <label className={`block text-xs ${ts} mb-1`}>현재 비밀번호</label>
            <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} className={`w-80 border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
          </div>
          <div>
            <label className={`block text-xs ${ts} mb-1`}>새 비밀번호</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="4자 이상" className={`w-80 border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleChangePw} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold">변경</button>
            {pwMsg && <span className={`text-xs ${pwMsg.includes("실패") || pwMsg.includes("4자") ? "text-red-400" : "text-emerald-400"}`}>{pwMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}