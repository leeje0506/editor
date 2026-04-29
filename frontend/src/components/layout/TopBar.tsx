import { useNavigate, useLocation } from "react-router-dom";
import { Settings, LogOut, Sun, Moon, BarChart2, FolderOpen, Monitor } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";

interface Props {
  dark: boolean;
  onToggleDark: () => void;
}

export function TopBar({ dark, onToggleDark }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuthStore();

  const isDashboard = location.pathname.startsWith("/dashboard");
  const isProjects = location.pathname.startsWith("/projects");

  const dm = dark;
  const card = dm ? "bg-gray-900" : "bg-white";
  const cb = dm ? "border-gray-800" : "border-gray-200";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const ts2 = dm ? "text-gray-600" : "text-gray-400";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const hoverText = dm ? "hover:text-white" : "hover:text-black";

  const tabBtnCls = (active: boolean) =>
    active
      ? "bg-blue-500/20 text-blue-400"
      : `${ts} hover:${dm ? "bg-gray-800" : "bg-gray-100"} ${hoverText}`;

  return (
    <header className={`h-12 ${card} border-b ${cb} flex items-center justify-between px-5 shrink-0 z-20 ${tp}`}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Monitor size={20} className="text-blue-500" />
          <span className="font-bold">SubEditor Pro</span>
          <span className={`text-[10px] ${ts2}`}>(v2.0.0)</span>
        </div>

        {isAdmin() && (
          <nav className="flex items-center gap-1">
            <button
              onClick={() => navigate("/dashboard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tabBtnCls(isDashboard)}`}
            >
              <BarChart2 size={14} />
              <span>통계</span>
            </button>
            <button
              onClick={() => navigate("/projects")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tabBtnCls(isProjects)}`}
            >
              <FolderOpen size={14} />
              <span>작업 공간</span>
            </button>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{user?.display_name ?? user?.username}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            user?.role === "master"
              ? "bg-red-500/20 text-red-400"
              : user?.role === "manager"
                ? "bg-purple-500/20 text-purple-400"
                : "bg-blue-500/20 text-blue-400"
          }`}
        >
          {user?.role?.toUpperCase()}
        </span>
        <button
          onClick={() => navigate("/settings")}
          className={`p-1.5 ${ts} ${hoverText}`}
          title="설정"
        >
          <Settings size={16} />
        </button>
        <button
          onClick={onToggleDark}
          className={`p-1.5 ${ts} ${hoverText}`}
          title="다크모드 토글"
        >
          {dm ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className={`flex items-center gap-1 text-xs border ${cb} px-3 py-1.5 rounded-lg ${ts} hover:${dm ? "text-white" : "text-red-500"}`}
        >
          <LogOut size={12} />
          <span>로그아웃</span>
        </button>
      </div>
    </header>
  );
}