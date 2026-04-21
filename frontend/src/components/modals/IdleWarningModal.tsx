import { useEffect, useState, useRef } from "react";
import { AlertTriangle, Timer } from "lucide-react";
import { useActivityStore, MODAL_TIMEOUT_SEC } from "../../../src/store/useActivityStore";

interface Props {
  dark: boolean;
  onTimeout: () => void;
}

export function IdleWarningModal({ dark, onTimeout }: Props) {
  const [remaining, setRemaining] = useState(MODAL_TIMEOUT_SEC);
  const timerRef = useRef<number | null>(null);
  const resumeFromIdle = useActivityStore((s) => s.resumeFromIdle);

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onTimeout]);

  const handleContinue = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    resumeFromIdle();
  };

  const dm = dark;
  const progressPct = (remaining / MODAL_TIMEOUT_SEC) * 100;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={`relative w-[420px] rounded-2xl shadow-2xl overflow-hidden ${
          dm ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"
        }`}
      >
        {/* 상단 프로그레스 바 */}
        <div className={`h-1 ${dm ? "bg-gray-700" : "bg-gray-200"}`}>
          <div
            className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="px-8 pt-8 pb-6">
          {/* 아이콘 + 제목 */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
              dm ? "bg-amber-500/10" : "bg-amber-50"
            }`}>
              <AlertTriangle size={32} className="text-amber-500" />
            </div>
            <h2 className={`text-lg font-bold mb-1 ${dm ? "text-gray-100" : "text-gray-900"}`}>
              작업 중이신가요?
            </h2>
            <p className={`text-sm ${dm ? "text-gray-400" : "text-gray-500"}`}>
              일정 시간 동안 활동이 감지되지 않았습니다.
            </p>
          </div>

          {/* 카운트다운 */}
          <div className={`flex items-center justify-center gap-2 mb-6 py-3 rounded-xl ${
            dm ? "bg-gray-900/60" : "bg-gray-50"
          }`}>
            <Timer size={18} className={remaining <= 10 ? "text-red-500" : "text-amber-500"} />
            <span className={`text-2xl font-mono font-bold tabular-nums ${
              remaining <= 10
                ? "text-red-500"
                : dm ? "text-gray-100" : "text-gray-800"
            }`}>
              {remaining}
            </span>
            <span className={`text-sm ${dm ? "text-gray-500" : "text-gray-400"}`}>초</span>
          </div>

          <p className={`text-xs text-center mb-6 ${dm ? "text-gray-500" : "text-gray-400"}`}>
            응답하지 않으면 자동으로 저장 후 작업 목록으로 이동합니다.
          </p>

          {/* 버튼 */}
          <button
            onClick={handleContinue}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            autoFocus
          >
            계속 작업하기
          </button>
        </div>
      </div>
    </div>
  );
}