import { useState, useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";
import { workspacesApi } from "../../api/workspaces";

export interface WorkspaceCounts {
  workspace_count: number;
  project_count: number;
  subtitle_count: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: number;
  workspaceName: string;
  /** 비어있지 않은 워크스페이스의 카운트 정보 (호출자가 force 없이 DELETE 시도해서 받은 409 응답에서 추출) */
  counts: WorkspaceCounts;
  /** 영구 삭제 성공 시 호출 */
  onDeleted?: () => void;
  dark?: boolean;
}

/**
 * 비어있지 않은 워크스페이스의 강제 삭제 모달.
 * 1단계: 카운트 안내 + 강제 삭제 버튼
 * 2단계: 빨강 위험 박스 + 이름 타이핑 확인 + 영구 삭제
 *
 * 비어있는 워크스페이스는 모달 없이 호출자 측에서 confirm() 처리.
 */
export function WorkspaceDeleteModal({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
  counts,
  onDeleted,
  dark = false,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setConfirmText("");
      setError(null);
      setBusy(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleForceDelete = async () => {
    if (confirmText !== workspaceName || busy) return;
    setBusy(true);
    setError(null);
    try {
      await workspacesApi.remove(workspaceId, true);
      onDeleted?.();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "삭제 실패");
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
  const codeCls = dark ? "bg-zinc-800 text-gray-200" : "bg-gray-200 text-gray-800";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className={`${cardCls} border rounded-lg shadow-xl w-[480px] max-w-[90vw]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${borderCls}`}>
          <h2 className="text-sm font-medium">
            {step === 1 ? "워크스페이스 삭제" : "위험 — 영구 삭제 확인"}
          </h2>
          <button onClick={onClose} className="p-1 hover:opacity-70">
            <X size={16} />
          </button>
        </div>

        {step === 1 ? (
          <>
            <div className="px-4 py-4 space-y-3">
              <p className="text-sm">
                <strong>{workspaceName}</strong> 안에 다음 항목이 있습니다:
              </p>
              <ul className={`text-sm space-y-1 ml-4 ${mutedCls}`}>
                <li>• 하위 워크스페이스 <strong>{counts.workspace_count}</strong>개</li>
                <li>• 프로젝트 <strong>{counts.project_count}</strong>개</li>
                <li>• 총 자막 <strong>{counts.subtitle_count.toLocaleString()}</strong>개</li>
              </ul>
              <p className={`text-xs ${mutedCls} leading-relaxed`}>
                먼저 안의 항목을 정리하거나 옮기는 것을 권장합니다.
                그래도 모두 삭제하려면 강제 삭제를 진행하세요.
              </p>
            </div>
            <div className={`flex justify-end gap-2 px-4 py-3 border-t ${borderCls}`}>
              <button onClick={onClose} className={`px-3 py-1.5 text-sm rounded ${cancelCls}`}>
                취소
              </button>
              <button
                onClick={() => setStep(2)}
                className="px-3 py-1.5 text-sm rounded bg-yellow-500 hover:bg-yellow-400 text-black font-medium"
              >
                강제 삭제
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-4 space-y-3">
              <div className="flex gap-2 p-3 rounded border border-red-500/40 bg-red-500/10">
                <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300 leading-relaxed">
                  하위 워크스페이스 <strong>{counts.workspace_count}</strong>개,
                  프로젝트 <strong>{counts.project_count}</strong>개,
                  자막 <strong>{counts.subtitle_count.toLocaleString()}</strong>개와
                  영상 파일·파형이 모두 영구 삭제됩니다.
                  이 작업은 되돌릴 수 없습니다.
                </p>
              </div>
              <p className={`text-xs ${mutedCls}`}>
                아래에 <code className={`px-1 py-0.5 rounded font-mono ${codeCls}`}>{workspaceName}</code>을(를) 입력하면 활성화됩니다.
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleForceDelete();
                  if (e.key === "Escape") onClose();
                }}
                autoFocus
                className={`w-full px-3 py-2 text-sm border rounded ${inputCls} focus:outline-none focus:ring-2 focus:ring-red-500`}
                placeholder={workspaceName}
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
            <div className={`flex justify-end gap-2 px-4 py-3 border-t ${borderCls}`}>
              <button
                onClick={onClose}
                disabled={busy}
                className={`px-3 py-1.5 text-sm rounded ${cancelCls}`}
              >
                취소
              </button>
              <button
                onClick={handleForceDelete}
                disabled={confirmText !== workspaceName || busy}
                className={`px-3 py-1.5 text-sm rounded font-medium ${
                  confirmText === workspaceName && !busy
                    ? "bg-red-600 hover:bg-red-500 text-white"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                {busy ? "삭제 중..." : "영구 삭제"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}