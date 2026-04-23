// import { useEffect, useState } from "react";
// import { BarChart3 } from "lucide-react";
// import { authApi } from "../../../api/auth";
// import { projectsApi } from "../../../api/projects";
// import type { User, Project } from "../../../types";

// function fmtElapsed(s: number) {
//   return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
// }

// export function WorkerStatsTab() {
//   const [users, setUsers] = useState<User[]>([]);
//   const [projects, setProjects] = useState<Project[]>([]);

//   useEffect(() => {
//     authApi.listUsers().then(setUsers).catch(() => {});
//     projectsApi.list().then(setProjects).catch(() => {});
//   }, []);

//   const bd = "border-gray-800";
//   const card = "bg-gray-900";
//   const ts = "text-gray-400";

//   const stats = users.map(u => {
//     const userProjects = projects.filter(p => p.assigned_to === u.id || p.created_by === u.id);
//     const totalSeconds = userProjects.reduce((s, p) => s + (p.elapsed_seconds || 0), 0);
//     const submitted = userProjects.filter(p => p.status === "submitted" || p.status === "approved").length;
//     const inProgress = userProjects.filter(p => p.status === "draft").length;
//     return { ...u, totalSeconds, submitted, inProgress };
//   });

//   return (
//     <div>
//       <div className="flex items-center gap-2 mb-6">
//         <BarChart3 size={20} className="text-purple-400" />
//         <h2 className="text-lg font-bold">작업자별 통계</h2>
//       </div>

//       <div className={`${card} border ${bd} rounded-xl overflow-hidden`}>
//         <table className="w-full text-sm">
//           <thead>
//             <tr className={`border-b ${bd} text-xs ${ts}`}>
//               <th className="py-3 px-5 text-left">작업자</th>
//               <th className="py-3 px-5 text-left">총 작업 시간</th>
//               <th className="py-3 px-5 text-center">제출 횟수</th>
//               <th className="py-3 px-5 text-center">진행 중</th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-gray-800">
//             {stats.map(s => (
//               <tr key={s.id} className="hover:bg-gray-800/50">
//                 <td className="py-3 px-5 font-bold">{s.display_name || s.username}</td>
//                 <td className="py-3 px-5 font-mono">{fmtElapsed(s.totalSeconds)}</td>
//                 <td className="py-3 px-5 text-center">
//                   <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">{s.submitted}건</span>
//                 </td>
//                 <td className="py-3 px-5 text-center">
//                   <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${s.inProgress > 0 ? "bg-blue-500/20 text-blue-400" : "bg-gray-700 text-gray-500"}`}>{s.inProgress}건</span>
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//     </div>
//   );
// }