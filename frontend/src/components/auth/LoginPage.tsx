import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError("아이디와 비밀번호를 입력하세요"); return; }
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      const user = useAuthStore.getState().user;
      if (user?.role === "master" || user?.role === "manager") {
        navigate("/dashboard");
      } else {
        navigate("/projects");
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "로그인에 실패했습니다");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-[380px] bg-gray-900 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Monitor size={28} className="text-blue-500" />
          <span className="text-xl font-bold text-white">SubEditor Pro</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">아이디</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              placeholder="아이디 입력"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              placeholder="비밀번호 입력"
            />
          </div>

          {error && (
            <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-bold mt-2"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className="text-center text-gray-600 text-xs mt-6">
          초기 계정: admin / admin
        </p>
      </div>
    </div>
  );
}