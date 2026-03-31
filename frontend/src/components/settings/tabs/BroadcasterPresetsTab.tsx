import { useState, useEffect } from "react";
import { FileText, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { projectsApi } from "../../../api/projects";
import { useBroadcasterStore } from "../../../store/useBroadcasterStore";

interface Rule {
  name: string;
  max_lines: number;
  max_chars_per_line: number;
  bracket_chars: number;
}

export function BroadcasterPresetsTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [newName, setNewName] = useState("");
  const [newLines, setNewLines] = useState(2);
  const [newChars, setNewChars] = useState(18);
  const [newBracket, setNewBracket] = useState(5);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const bd = "border-gray-800";
  const card = "bg-gray-900";
  const inp = "bg-gray-800 text-gray-100 border-gray-700";
  const ts = "text-gray-400";

  // 서버에서 로드
  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const data = await projectsApi.getBroadcasterRules();
      const list: Rule[] = Object.entries(data).map(([name, r]: [string, any]) => ({
        name,
        max_lines: r.max_lines,
        max_chars_per_line: r.max_chars_per_line,
        bracket_chars: r.bracket_chars ?? 5,
      }));
      setRules(list);
    } catch {}
  };

  // 서버에 저장
  const saveToServer = async (updatedRules: Rule[]) => {
    setSaving(true);
    try {
      const payload: Record<string, { max_lines: number; max_chars_per_line: number; bracket_chars: number }> = {};
      for (const r of updatedRules) {
        payload[r.name] = { max_lines: r.max_lines, max_chars_per_line: r.max_chars_per_line, bracket_chars: r.bracket_chars };
      }
      await projectsApi.saveBroadcasterRules(payload);
      // 전역 스토어 갱신
      await useBroadcasterStore.getState().fetch();
      setMsg("저장 완료!");
      setTimeout(() => setMsg(""), 2000);
    } catch {
      setMsg("저장 실패");
      setTimeout(() => setMsg(""), 2000);
    }
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    if (rules.some(r => r.name === newName.trim())) {
      setMsg("이미 존재하는 방송사입니다");
      setTimeout(() => setMsg(""), 2000);
      return;
    }
    const updated = [...rules, { name: newName.trim(), max_lines: newLines, max_chars_per_line: newChars, bracket_chars: newBracket }];
    setRules(updated);
    await saveToServer(updated);
    setNewName("");
  };

  const handleDelete = async (idx: number) => {
    if (!confirm(`"${rules[idx].name}" 방송사 기준을 삭제하시겠습니까?`)) return;
    const updated = rules.filter((_, i) => i !== idx);
    setRules(updated);
    await saveToServer(updated);
  };

  const startEdit = (idx: number) => {
    setEditIdx(idx);
    setEditRule({ ...rules[idx] });
  };

  const cancelEdit = () => {
    setEditIdx(null);
    setEditRule(null);
  };

  const confirmEdit = async () => {
    if (editIdx === null || !editRule) return;
    const updated = rules.map((r, i) => i === editIdx ? editRule : r);
    setRules(updated);
    await saveToServer(updated);
    setEditIdx(null);
    setEditRule(null);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-blue-400" />
          <h2 className="text-lg font-bold">방송사별 자막 기준</h2>
        </div>
        {msg && (
          <span className={`text-xs font-medium ${msg.includes("실패") ? "text-red-400" : "text-emerald-400"}`}>{msg}</span>
        )}
      </div>

      {/* 추가 폼 */}
      <div className={`${card} border ${bd} rounded-xl p-5 mb-6`}>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className={`block text-xs ${ts} mb-1`}>명칭</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="예: NETFLIX"
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
          </div>
          <div className="w-24">
            <label className={`block text-xs ${ts} mb-1`}>최대 줄</label>
            <input type="number" value={newLines} onChange={e => setNewLines(+e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none text-center ${inp}`} />
          </div>
          <div className="w-24">
            <label className={`block text-xs ${ts} mb-1`}>글자 수</label>
            <input type="number" value={newChars} onChange={e => setNewChars(+e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none text-center ${inp}`} />
          </div>
          <div className="w-24">
            <label className={`block text-xs ${ts} mb-1`}>화자 예약</label>
            <input type="number" value={newBracket} onChange={e => setNewBracket(+e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none text-center ${inp}`} />
          </div>
          <button onClick={handleAdd} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2.5 rounded-lg">
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* 규칙 리스트 */}
      <div className={`${card} border ${bd} rounded-xl divide-y divide-gray-800`}>
        {/* 헤더 */}
        <div className={`flex items-center px-5 py-2.5 text-[11px] ${ts} font-medium`}>
          <span className="flex-1">방송사</span>
          <span className="w-20 text-center">최대 줄</span>
          <span className="w-20 text-center">글자 수</span>
          <span className="w-20 text-center">화자 예약</span>
          <span className="w-20 text-center">작업</span>
        </div>
        {rules.map((r, i) => (
          <div key={i} className="flex items-center px-5 py-3">
            {editIdx === i && editRule ? (
              <>
                <input value={editRule.name} onChange={e => setEditRule({ ...editRule, name: e.target.value })}
                  className={`flex-1 border rounded px-2 py-1 text-sm outline-none ${inp} focus:border-blue-500`} />
                <input type="number" value={editRule.max_lines} onChange={e => setEditRule({ ...editRule, max_lines: +e.target.value })}
                  className={`w-20 border rounded px-2 py-1 text-sm text-center outline-none ${inp}`} />
                <input type="number" value={editRule.max_chars_per_line} onChange={e => setEditRule({ ...editRule, max_chars_per_line: +e.target.value })}
                  className={`w-20 border rounded px-2 py-1 text-sm text-center outline-none ${inp}`} />
                <input type="number" value={editRule.bracket_chars} onChange={e => setEditRule({ ...editRule, bracket_chars: +e.target.value })}
                  className={`w-20 border rounded px-2 py-1 text-sm text-center outline-none ${inp}`} />
                <div className="w-20 flex items-center justify-center gap-1">
                  <button onClick={confirmEdit} className="text-emerald-400 hover:text-emerald-300"><Check size={16} /></button>
                  <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
                </div>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium text-sm">{r.name}</span>
                <span className={`w-20 text-center text-sm ${ts}`}>{r.max_lines}줄</span>
                <span className={`w-20 text-center text-sm ${ts}`}>{r.max_chars_per_line}자</span>
                <span className={`w-20 text-center text-sm ${ts}`}>{r.bracket_chars}자</span>
                <div className="w-20 flex items-center justify-center gap-2">
                  <button onClick={() => startEdit(i)} className="text-blue-400 hover:text-blue-300"><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(i)} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {rules.length === 0 && (
          <div className={`px-5 py-8 text-center text-sm ${ts}`}>등록된 방송사 기준이 없습니다.</div>
        )}
      </div>
    </div>
  );
}