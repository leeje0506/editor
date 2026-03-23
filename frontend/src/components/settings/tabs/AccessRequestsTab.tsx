import { useState } from "react";
import { Bell } from "lucide-react";

interface AccessRequest {
  id: number;
  username: string;
  broadcaster: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
}

const MOCK: AccessRequest[] = [
  { id: 1, username: "worker01", broadcaster: "KBS", requested_at: "03. 18. 오전 09:50", status: "rejected" },
];

export function AccessRequestsTab() {
  const [requests] = useState(MOCK);
  const bd = "border-gray-800";
  const card = "bg-gray-900";
  const ts = "text-gray-400";

  const statusBadge = (s: string) => {
    if (s === "approved") return <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">승인됨</span>;
    if (s === "rejected") return <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">거절됨</span>;
    return <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-medium">대기중</span>;
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <Bell size={20} className="text-yellow-400" />
        <h2 className="text-lg font-bold">방송사 접근 요청</h2>
      </div>

      <div className={`${card} border ${bd} rounded-xl overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b ${bd} text-xs ${ts}`}>
              <th className="py-3 px-5 text-left">작업자</th>
              <th className="py-3 px-5 text-left">방송사</th>
              <th className="py-3 px-5 text-left">요청일</th>
              <th className="py-3 px-5 text-left">상태</th>
              <th className="py-3 px-5 text-left">처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {requests.map(r => (
              <tr key={r.id}>
                <td className="py-3 px-5 font-medium">{r.username}</td>
                <td className="py-3 px-5">{r.broadcaster}</td>
                <td className="py-3 px-5 text-gray-400">{r.requested_at}</td>
                <td className="py-3 px-5">{statusBadge(r.status)}</td>
                <td className="py-3 px-5">
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <button className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">승인</button>
                      <button className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400">거절</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {requests.length === 0 && <div className={`py-12 text-center ${ts}`}>접근 요청이 없습니다</div>}
      </div>
    </div>
  );
}