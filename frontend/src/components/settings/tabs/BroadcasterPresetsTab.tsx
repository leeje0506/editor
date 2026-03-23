import { useState } from "react";
import { FileText, Plus, Pencil, Trash2 } from "lucide-react";

interface Rule {
  name: string;
  max_lines: number;
  max_chars_per_line: number;
  bracket_chars: number;
}

const INITIAL: Rule[] = [
  { name: "TVING", max_lines: 2, max_chars_per_line: 20, bracket_chars: 5 },
  { name: "LGHV", max_lines: 2, max_chars_per_line: 18, bracket_chars: 5 },
  { name: "SKBB", max_lines: 1, max_chars_per_line: 20, bracket_chars: 5 },
  { name: "JTBC", max_lines: 2, max_chars_per_line: 18, bracket_chars: 5 },
  { name: "KBS", max_lines: 2, max_chars_per_line: 18, bracket_chars: 5 },
  { name: "자유작업 (제한없음)", max_lines: 99, max_chars_per_line: 999, bracket_chars: 0 },
];

export function BroadcasterPresetsTab() {
  const [rules, setRules] = useState<Rule[]>(INITIAL);
  const [newName, setNewName] = useState("");
  const [newLines, setNewLines] = useState(2);
  const [newChars, setNewChars] = useState(18);
  const [effectPresets, setEffectPresets] = useState("박수,웃음,음악,효과음");
  const [allowedSymbols, setAllowedSymbols] = useState(".,!?:;'\"–~…·%/()");
  const [overlapEnabled, setOverlapEnabled] = useState(false);
  const [maxOverlap, setMaxOverlap] = useState(4);

  const bd = "border-gray-800";
  const card = "bg-gray-900";
  const inp = "bg-gray-800 text-gray-100 border-gray-700";
  const ts = "text-gray-400";

  const handleAdd = () => {
    if (!newName.trim()) return;
    setRules([...rules, { name: newName.trim(), max_lines: newLines, max_chars_per_line: newChars, bracket_chars: 5 }]);
    setNewName("");
  };

  const handleDelete = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <FileText size={20} className="text-blue-400" />
        <h2 className="text-lg font-bold">방송사별 자막 기준</h2>
      </div>

      <div className={`${card} border ${bd} rounded-xl p-6 space-y-5 mb-6`}>
        {/* Add form */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className={`block text-xs ${ts} mb-1`}>명칭</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="예: NETFLIX" className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${inp} focus:border-blue-500`} />
          </div>
          <div className="w-28">
            <label className={`block text-xs ${ts} mb-1`}>최대 줄</label>
            <div className={`flex items-center border rounded-lg ${inp}`}>
              <input type="number" value={newLines} onChange={e => setNewLines(+e.target.value)} className="w-full bg-transparent px-3 py-2.5 text-sm outline-none text-center" />
            </div>
          </div>
          <div className="w-28">
            <label className={`block text-xs ${ts} mb-1`}>글자 수</label>
            <div className={`flex items-center border rounded-lg ${inp}`}>
              <input type="number" value={newChars} onChange={e => setNewChars(+e.target.value)} className="w-full bg-transparent px-3 py-2.5 text-sm outline-none text-center" />
            </div>
          </div>
          <button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-lg"><Plus size={20} /></button>
        </div>

        {/* Options */}
        <div className="flex items-center gap-4">
          <label className={`flex items-center gap-2 text-sm ${ts}`}>
            <input type="checkbox" checked={overlapEnabled} onChange={e => setOverlapEnabled(e.target.checked)} className="rounded" />
            오버랩 허용
          </label>
          {overlapEnabled && (
            <div className="flex items-center gap-1">
              <span className={`text-xs ${ts}`}>최대 오버랩 줄</span>
              <input type="number" value={maxOverlap} onChange={e => setMaxOverlap(+e.target.value)} className={`w-14 border rounded px-2 py-1 text-sm text-center ${inp}`} />
            </div>
          )}
        </div>

        <div>
          <label className={`block text-xs ${ts} mb-1`}>허용 기호 (나머지는 불용기호로 처리)</label>
          <input value={allowedSymbols} onChange={e => setAllowedSymbols(e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm ${inp} focus:border-blue-500 outline-none`} />
        </div>

        <div>
          <label className={`block text-xs ${ts} mb-1`}>효과음 프리셋 (쉼표 구분)</label>
          <input value={effectPresets} onChange={e => setEffectPresets(e.target.value)} className={`w-full border rounded-lg px-3 py-2.5 text-sm ${inp} focus:border-blue-500 outline-none`} />
        </div>
      </div>

      {/* Rules list */}
      <div className={`${card} border ${bd} rounded-xl divide-y divide-gray-800`}>
        {rules.map((r, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-3.5">
            <span className="font-medium text-sm">{r.name}</span>
            <div className="flex items-center gap-3">
              <span className={`text-sm ${ts}`}>{r.max_lines}줄 / {r.max_chars_per_line}자</span>
              <button className="text-blue-400 hover:text-blue-300"><Pencil size={15} /></button>
              <button onClick={() => handleDelete(i)} className="text-red-400 hover:text-red-300"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}