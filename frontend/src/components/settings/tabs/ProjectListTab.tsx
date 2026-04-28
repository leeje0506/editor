import { useEffect, useState } from "react";
import { Monitor, Trash2, ChevronDown } from "lucide-react";
import { projectsApi } from "../../../api/projects";
import type { Project } from "../../../types";

function fmtElapsed(s: number) {
  return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}
function fmtDate(iso: string|null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getMonth()+1).padStart(2,"0")}. ${String(d.getDate()).padStart(2,"0")}. ${d.getHours() >= 12 ? "오후" : "오전"} ${String(d.getHours()%12||12).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

type Filter = "all" | "draft" | "submitted" | "approved";

interface Props {
  dark?: boolean;
}

export function ProjectListTab({ dark = true }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => { projectsApi.list().then(setProjects).catch(() => {}); }, []);

  const filtered = filter === "all" ? projects : projects.filter(p => p.status === filter);

  const dm = dark;
  const bd = dm ? "border-gray-800" : "border-gray-200";
  const card = dm ? "bg-gray-900" : "bg-white";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const tp = dm ? "text-gray-100" : "text-gray-900";
  const divider = dm ? "divide-gray-800" : "divide-gray-200";
  const rowHover = dm ? "hover:bg-gray-800/50" : "hover:bg-gray-50";

  const statusBadge = (s: string) => {
    const m: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: "bg-blue-500/20", text: "text-blue-400", label: "진행 중" },
      submitted: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "제출됨" },
      approved: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "승인됨" },
    };
    const c = m[s] || m.draft;
    return <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
  };

  const handleApprove = async (id: number) => { await projectsApi.approve(id); setProjects(await projectsApi.list()); };
  const handleReject = async (id: number) => { await projectsApi.reject(id); setProjects(await projectsApi.list()); };
  const handleDelete = async (id: number) => { if (!confirm("삭제?")) return; await projectsApi.delete(id); setProjects(await projectsApi.list()); };

  const filterBtns: { key: Filter; label: string; color: string }[] = [
    { key: "all", label: "전체", color: "bg-blue-600" },
    { key: "draft", label: "진행 중", color: "bg-blue-500/20 text-blue-400" },
    { key: "submitted", label: "제출됨", color: "bg-yellow-500/20 text-yellow-400" },
    { key: "approved", label: "승인됨", color: "bg-emerald-500/20 text-emerald-400" },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Monitor size={20} className="text-blue-400" />
        <h2 className="text-lg font-bold">전체 프로젝트 목록</h2>
      </div>

      <div className={`${card} border ${bd} rounded-xl overflow-hidden`}>
        {/* Filters */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${bd}`}>
          <div className="flex gap-2">
            {filterBtns.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${filter === f.key ? "bg-blue-600 text-white" : `border ${bd} text-gray-400 hover:text-white`}`}>
                {f.label}
              </button>
            ))}
          </div>
          <button className={`flex items-center gap-1 text-xs border ${bd} px-3 py-1.5 rounded-lg ${ts}`}>
            전체 작업자 <ChevronDown size={12} />
          </button>
        </div>

        {/* Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b ${bd} text-xs ${ts}`}>
              <th className="py-2.5 px-3 text-left w-8"><input type="checkbox" className="rounded" /></th>
              <th className="py-2.5 px-3 text-left">작업자</th>
              <th className="py-2.5 px-3 text-left">프로젝트명</th>
              <th className="py-2.5 px-3 text-left">방송사</th>
              <th className="py-2.5 px-3 text-left">방송 정보</th>
              <th className="py-2.5 px-3 text-left">작업 시간</th>
              <th className="py-2.5 px-3 text-left">수정일</th>
              <th className="py-2.5 px-3 text-left">반려</th>
              <th className="py-2.5 px-3 text-left">상태</th>
              <th className="py-2.5 px-3 text-left">메모</th>
              <th className="py-2.5 px-3 w-10"></th>
            </tr>
          </thead>
          <tbody className={`divide-y ${divider}`}>
            {filtered.map(p => (
              <tr key={p.id} className={rowHover}>
                <td className="py-2.5 px-3"><input type="checkbox" className="rounded" /></td>
                <td className="py-2.5 px-3 font-medium">{p.assigned_to_name || p.created_by_name || "—"}</td>
                <td className="py-2.5 px-3 font-bold">{p.name}</td>
                <td className="py-2.5 px-3">{p.broadcaster}</td>
                <td className="py-2.5 px-3 text-gray-400">{p.description || "—"}</td>
                <td className="py-2.5 px-3 font-mono text-xs">{fmtElapsed(p.elapsed_seconds)}</td>
                <td className="py-2.5 px-3 text-xs text-gray-400">{fmtDate(p.created_at)}</td>
                <td className="py-2.5 px-3 text-gray-500">—</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    {statusBadge(p.status)}
                    {p.status === "submitted" && (
                      <>
                        <button onClick={() => handleApprove(p.id)} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">✓ 승인</button>
                        <button onClick={() => handleReject(p.id)} className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30">✕ 반려</button>
                      </>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-xs text-gray-500"></td>
                <td className="py-2.5 px-3">
                  <button onClick={() => handleDelete(p.id)} className="text-gray-600 hover:text-red-400"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className={`py-12 text-center ${ts}`}>프로젝트가 없습니다</div>}
      </div>
    </div>
  );
}