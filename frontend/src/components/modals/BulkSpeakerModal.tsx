import { useState, useMemo } from "react";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { nfcTrim } from "../../utils/normalize";

interface Props {
  dark: boolean;
  onClose: () => void;
}

export function BulkSpeakerModal({ dark, onClose }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { subtitles, bulkSpeaker } = useSubtitleStore();
  const speakers = useMemo(() => [...new Set(subtitles.map((s) => s.speaker).filter(Boolean))], [subtitles]);

  const dm = dark;
  const card = dm ? "bg-gray-800" : "bg-white";
  const tp = dm ? "text-gray-100" : "text-gray-800";
  const ts = dm ? "text-gray-400" : "text-gray-500";
  const bd = dm ? "border-gray-700" : "border-gray-200";
  const inp = dm ? "bg-gray-700 text-gray-100 border-gray-600" : "bg-white text-gray-800 border-gray-300";

  const handleSubmit = async () => {
    if (!from) return;
    await bulkSpeaker(nfcTrim(from), nfcTrim(to));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className={`${card} rounded-lg shadow-xl p-5 w-72 ${tp}`} onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-sm mb-3">화자 일괄변경</h3>
        <div className="space-y-2.5 text-xs">
          <div>
            <label className={`block ${ts} mb-1`}>변경 전</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className={`w-full border rounded px-2 py-1.5 ${inp}`}>
              <option value="">선택</option>
              {speakers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={`block ${ts} mb-1`}>변경 후</label>
            <input value={to} onChange={(e) => setTo(e.target.value)} className={`w-full border rounded px-2 py-1.5 ${inp}`} placeholder="새 화자명" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className={`flex-1 border ${bd} py-1.5 rounded text-xs hover:opacity-80`}>취소</button>
          <button onClick={handleSubmit} className="flex-1 bg-purple-600 text-white py-1.5 rounded text-xs hover:bg-purple-700">변경</button>
        </div>
      </div>
    </div>
  );
}