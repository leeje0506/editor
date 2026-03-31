import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Home, Settings, Sun, FileText, Users, Monitor, BarChart3, Keyboard, Bell, User } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { BroadcasterPresetsTab } from "./tabs/BroadcasterPresetsTab";
import { MembersTab } from "./tabs/MembersTab";
import { ProjectListTab } from "./tabs/ProjectListTab";
import { WorkerStatsTab } from "./tabs/WorkerStatsTab";
import { ShortcutsTab } from "./tabs/ShortcutsTab";
import { AccessRequestsTab } from "./tabs/AccessRequestsTab";
import { MyPageTab } from "./tabs/MyPageTab";

const ALL_TABS = [
  { key: "broadcasters", label: "방송사 프리셋", icon: FileText, adminOnly: true },
  { key: "members", label: "조직원 관리", icon: Users, adminOnly: true },
  { key: "projects", label: "프로젝트 목록", icon: Monitor, adminOnly: true },
  { key: "workers", label: "작업자 통계", icon: BarChart3, adminOnly: true },
  { key: "shortcuts", label: "단축키 설정", icon: Keyboard, adminOnly: false },
  { key: "access", label: "접근 요청", icon: Bell, adminOnly: true },
  { key: "mypage", label: "마이페이지", icon: User, adminOnly: false },
];

export function SettingsPage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuthStore();
  const loadSettings = useSettingsStore((s) => s.load);
  const settingsLoaded = useSettingsStore((s) => s.loaded);

  const visibleTabs = ALL_TABS.filter(t => !t.adminOnly || isAdmin());
  const activeTab = tab || (isAdmin() ? "broadcasters" : "shortcuts");

  // 설정 페이지 진입 시 개인 설정 로드
  useEffect(() => {
    if (!settingsLoaded) {
      loadSettings();
    }
  }, [settingsLoaded, loadSettings]);

  const renderContent = () => {
    switch (activeTab) {
      case "broadcasters": return isAdmin() ? <BroadcasterPresetsTab /> : null;
      case "members": return isAdmin() ? <MembersTab /> : null;
      case "projects": return isAdmin() ? <ProjectListTab /> : null;
      case "workers": return isAdmin() ? <WorkerStatsTab /> : null;
      case "shortcuts": return <ShortcutsTab />;
      case "access": return isAdmin() ? <AccessRequestsTab /> : null;
      case "mypage": return <MyPageTab />;
      default: return null;
    }
  };

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-5 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(isAdmin() ? "/dashboard" : "/projects")} className="text-gray-400 hover:text-white">
            <Home size={18} />
          </button>
          <Settings size={18} className="text-purple-400" />
          <span className="font-bold text-sm">관리자 대시보드 및 설정</span>
        </div>
        <button className="text-gray-400 hover:text-white"><Sun size={18} /></button>
      </header>

      {/* Tab navigation */}
      <div className="border-b border-gray-800 px-5 flex gap-1 bg-gray-950">
        {visibleTabs.map(t => (
          <button
            key={t.key}
            onClick={() => navigate(`/settings/${t.key}`)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {renderContent()}
      </main>
    </div>
  );
}