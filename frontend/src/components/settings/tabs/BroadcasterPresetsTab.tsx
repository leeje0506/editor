import { useState, useEffect } from "react";
import { FileText, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { projectsApi } from "../../../api/projects";
import { useBroadcasterStore } from "../../../store/useBroadcasterStore";

interface Rule {
  name: string;
  max_lines: number;
  max_chars_per_line: number;
  allow_overlap: boolean;
  min_duration_ms: number;
  speaker_mode: string;
}

export function BroadcasterPresetsTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [newName, setNewName] = useState("");
  const [newLines, setNewLines] = useState(2);
  const [newChars, setNewChars] = useState(18);
  const [newOverlap, setNewOverlap] = useState(false);
  const [newMinDur, setNewMinDur] = useState(500);
  const [newSpeakerMode, setNewSpeakerMode] = useState("name");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const bd = "border-gray-800";
  const card = "bg-gray-900";
  const inp = "bg-gray-800 text-gray-100 border-gray-700";
  const ts = "text-gray-400";

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
        allow_overlap: r.allow_overlap ?? false,
        min_duration_ms: r.min_duration_ms ?? 500,
        speaker_mode: r.speaker_mode ?? "name",
      }));
      setRules(list);
    } catch {}
  };

  const saveToServer = async (updatedRules: Rule[]) => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const r of updatedRules) {
        payload[r.name] = {
          max_lines: r.max_lines,
          max_chars_per_line: r.max_chars_per_line,
          allow_overlap: r.allow_overlap,
          min_duration_ms: r.min_duration_ms,
          speaker_mode: r.speaker_mode,
        };
      }
      await projectsApi.saveBroadcasterRules(payload);
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
    const updated = [...rules, {
      name: newName.trim(),
      max_lines: newLines,
      max_chars_per_line: newChars,
      allow_overlap: newOverlap,
      min_duration_ms: newMinDur,
      speaker_mode: newSpeakerMode,
    }];
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

  const msToSec = (ms: number) => (ms / 1000).toFixed(1);

  const speakerModeLabel = (mode: string) => {
    if (mode === "hyphen") return "하이픈(-)";
    if (mode === "hyphen_space") return "하이픈공백(- )";
    return "이름표기";
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-blue-400" />
          <h2 className="text-lg font-bold">방송사별 자막 기준</h2>
        </div>
        {msg && (
          <span className={`text-xs font-medium ${msg.includes("실패") || msg.includes("이미") ? "text-red-400" : "text-emerald-400"}`}>{msg}</span>
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
          <div className="w-20">
            <label className={`block text-xs ${ts} mb-1`}>최대 줄</label>
            <input type="number" value={newLines} onChange={e => setNewLines(+e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none text-center ${inp}`} />
          </div>
          <div className="w-20">
            <label className={`block text-xs ${ts} mb-1`}>글자 수</label>
            <input type="number" value={newChars} onChange={e => setNewChars(+e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none text-center ${inp}`} />
          </div>
          <div className="w-24">
            <label className={`block text-xs ${ts} mb-1`}>최소길이(초)</label>
            <input type="number" step="0.1" value={newMinDur / 1000} onChange={e => setNewMinDur(Math.round(parseFloat(e.target.value || "0") * 1000))}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none text-center ${inp}`} />
          </div>
          <div className="w-20">
            <label className={`block text-xs ${ts} mb-1`}>오버랩</label>
            <button
              onClick={() => setNewOverlap(!newOverlap)}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm text-center ${newOverlap ? "bg-emerald-600 border-emerald-500 text-white" : `${inp}`}`}
            >
              {newOverlap ? "허용" : "미허용"}
            </button>
          </div>
          <div className="w-28">
            <label className={`block text-xs ${ts} mb-1`}>화자모드</label>
            <select value={newSpeakerMode} onChange={e => setNewSpeakerMode(e.target.value)}
              className={`w-full border rounded-lg px-2 py-2.5 text-sm outline-none ${inp}`}>
              <option value="name">이름</option>
              <option value="hyphen">하이픈</option>
              <option value="hyphen_space">하이픈공백</option>
            </select>
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
          <span className="w-20 text-center">최소길이</span>
          <span className="w-20 text-center">오버랩</span>
          <span className="w-24 text-center">화자모드</span>
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
                <input type="number" step="0.1" value={editRule.min_duration_ms / 1000}
                  onChange={e => setEditRule({ ...editRule, min_duration_ms: Math.round(parseFloat(e.target.value || "0") * 1000) })}
                  className={`w-20 border rounded px-2 py-1 text-sm text-center outline-none ${inp}`} />
                <div className="w-20 flex items-center justify-center">
                  <button
                    onClick={() => setEditRule({ ...editRule, allow_overlap: !editRule.allow_overlap })}
                    className={`px-2 py-1 rounded text-xs ${editRule.allow_overlap ? "bg-emerald-600 text-white" : "bg-gray-700 text-gray-400"}`}
                  >
                    {editRule.allow_overlap ? "허용" : "미허용"}
                  </button>
                </div>
                <div className="w-24 flex items-center justify-center">
                  <select value={editRule.speaker_mode} onChange={e => setEditRule({ ...editRule, speaker_mode: e.target.value })}
                    className={`px-1 py-1 rounded text-xs border outline-none ${inp}`}>
                    <option value="name">이름</option>
                    <option value="hyphen">하이픈</option>
                    <option value="hyphen_space">하이픈공백</option>
                  </select>
                </div>
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
                <span className={`w-20 text-center text-sm ${ts}`}>{msToSec(r.min_duration_ms)}초</span>
                <span className={`w-20 text-center text-xs ${r.allow_overlap ? "text-emerald-400" : "text-red-400"}`}>
                  {r.allow_overlap ? "허용" : "미허용"}
                </span>
                <span className={`w-24 text-center text-xs ${ts}`}>
                  {speakerModeLabel(r.speaker_mode)}
                </span>
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