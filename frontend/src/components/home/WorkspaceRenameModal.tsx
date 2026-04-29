import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { workspacesApi } from "../../api/workspaces";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: number;
  currentName: string;
  /** 변경 성공 시 호출 (서버가 자동 번호 부여한 최종 이름이 인자로 들어옴) */
  onRenamed?: (newName: string) => void;
  dark?: boolean;
}

export function WorkspaceRenameModal({
  isOpen,
  onClose,
  workspaceId,
  currentName,
  onRenamed,
  dark = false,
}: Props) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setError(null);
      setBusy(false);
    }
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== currentName && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await workspacesApi.rename(workspaceId, trimmed);
      onRenamed?.(res.name);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "이름 변경 실패");
    } finally {
      setBusy(false);
    }
  };

  // ── 다크/라이트 색상 헬퍼 ──
  const cardCls = dark ? "bg-zinc-900 border-zinc-800 text-gray-100" : "bg-white border-gray-200 text-gray-900";
  const mutedCls = dark ? "text-gray-400" : "text-gray-600";
  const inputCls = dark
    ? "bg-zinc-800 border-zinc-700 text-gray-100"
    : "bg-white border-gray-300 text-gray-900";
  const cancelCls = dark ? "hover:bg-zinc-800 text-gray-300" : "hover:bg-gray-100 text-gray-700";
  const borderCls = dark ? "border-zinc-800" : "border-gray-200";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className={`${cardCls} border rounded-lg shadow-xl w-[400px] max-w-[90vw]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${borderCls}`}>
          <h2 className="text-sm font-medium">워크스페이스 이름 변경</h2>
          <button onClick={onClose} className="p-1 hover:opacity-70">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") onClose();
            }}
            autoFocus
            className={`w-full px-3 py-2 text-sm border rounded ${inputCls} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            placeholder="워크스페이스 이름"
          />
          <p className={`text-xs ${mutedCls}`}>
            같은 부모 아래 동일한 이름이 있으면 자동으로 _2, _3 …이 붙습니다.
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className={`flex justify-end gap-2 px-4 py-3 border-t ${borderCls}`}>
          <button onClick={onClose} className={`px-3 py-1.5 text-sm rounded ${cancelCls}`}>
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`px-3 py-1.5 text-sm rounded font-medium ${
              canSubmit
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {busy ? "변경 중..." : "변경"}
          </button>
        </div>
      </div>
    </div>
  );
}