import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useSubtitleStore } from "../../store/useSubtitleStore";
import { projectsApi } from "../../api/projects";
import { AlertTriangle, Timer } from "lucide-react";

/* ── 상수 ── */
const IDLE_TIMEOUT_MS = 30 * 1000;       // 30초
const MODAL_TIMEOUT_SEC = 60;                 // 60초
const PLAYBACK_GRACE_MS = 3 * 60 * 1000;     // 3분
const TAB_AWAY_THRESHOLD_MS = 3 * 60 * 1000; // 3분
const PRESENCE_THROTTLE_MS = 1000;            // 1초

/* ── module-level 변수 (React 렌더 사이클과 완전 무관) ── */
let lastMeaningfulAt = 0;
let lastPresenceAt = 0;
let lastUserIntentAt = 0;
let isForeground = true;
let hiddenSince: number | null = null;
let lastPresenceThrottle = 0;

function resetTimestamps() {
  const now = Date.now();
  lastMeaningfulAt = now;
  lastPresenceAt = now;
  lastUserIntentAt = now;
  isForeground = !document.hidden;
  hiddenSince = null;
}

function shouldCountTime(isPlaying: boolean): boolean {
  if (!isForeground) return false;
  const now = Date.now();
  const meaningfulRecent = now - lastMeaningfulAt < IDLE_TIMEOUT_MS;
  const playbackGrace = isPlaying && now - lastUserIntentAt < PLAYBACK_GRACE_MS;
  return meaningfulRecent || playbackGrace;
}

/**
 * 완전 독립 활동 감지 컨트롤러.
 * - AppLayout과 React 트리/state/store 구독으로 연결되지 않음
 * - /editor/:projectId 경로에서만 동작
 * - 모달은 createPortal로 document.body에 렌더
 */
export function ActivityController() {
  const location = useLocation();
  const navigate = useNavigate();

  // /editor/:projectId 경로에서만 동작
  const match = location.pathname.match(/^\/editor\/(\d+)/);
  const projectId = match ? Number(match[1]) : null;

//   console.log("[ActivityController]", location.pathname, "pid:", projectId);


  // 모달만 React state (열릴 때만 렌더)
  const [modalOpen, setModalOpen] = useState(false);
  const [countdown, setCountdown] = useState(MODAL_TIMEOUT_SEC);

  const idleCheckRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const modalOpenRef = useRef(false); // interval 안에서 최신 값 참조용

  /* ── 편집기 진입/이탈 시 초기화 ── */
  useEffect(() => {
    if (!projectId) return;
    resetTimestamps();
    return () => {
      // 편집기 이탈 시 정리
      if (idleCheckRef.current) clearInterval(idleCheckRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setModalOpen(false);
      modalOpenRef.current = false;
    };
  }, [projectId]);

  /* ── 이벤트 리스너 (편집기에서만) ── */
  useEffect(() => {
    if (!projectId) return;

    const handlePresence = () => {
      const now = Date.now();
      if (now - lastPresenceThrottle < PRESENCE_THROTTLE_MS) return;
      lastPresenceThrottle = now;
      lastPresenceAt = now;
    };

    const handleKeydown = () => {
      const now = Date.now();
      lastMeaningfulAt = now;
      lastPresenceAt = now;
      lastUserIntentAt = now;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        isForeground = false;
        hiddenSince = Date.now();
      } else {
        isForeground = true;
        const was = hiddenSince;
        hiddenSince = null;
        if (was && Date.now() - was >= TAB_AWAY_THRESHOLD_MS) {
          openModal();
        } else {
          lastPresenceAt = Date.now();
        }
      }
    };

    window.addEventListener("mousemove", handlePresence, { passive: true });
    window.addEventListener("mousedown", handlePresence, { passive: true });
    window.addEventListener("wheel", handlePresence, { passive: true });
    window.addEventListener("scroll", handlePresence, { passive: true, capture: true });
    window.addEventListener("touchstart", handlePresence, { passive: true });
    window.addEventListener("keydown", handleKeydown, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("mousemove", handlePresence);
      window.removeEventListener("mousedown", handlePresence);
      window.removeEventListener("wheel", handlePresence);
      window.removeEventListener("scroll", handlePresence, { capture: true });
      window.removeEventListener("touchstart", handlePresence);
      window.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [projectId]);

  /* ── store subscribe (playing/subtitles 변경 감지) ── */
  useEffect(() => {
    if (!projectId) return;

    let prevPlaying = usePlayerStore.getState().playing;
    let prevRate = usePlayerStore.getState().playbackRate;

    const unsubPlayer = usePlayerStore.subscribe((state) => {
      if (state.playing !== prevPlaying) {
        prevPlaying = state.playing;
        const now = Date.now();
        lastUserIntentAt = now;
        lastPresenceAt = now;
      }
      if (state.playbackRate !== prevRate) {
        prevRate = state.playbackRate;
        const now = Date.now();
        lastUserIntentAt = now;
        lastPresenceAt = now;
      }
    });

    let prevSubtitles = useSubtitleStore.getState().subtitles;
    const unsubSubtitle = useSubtitleStore.subscribe((state) => {
      if (state.subtitles !== prevSubtitles) {
        prevSubtitles = state.subtitles;
        const now = Date.now();
        lastMeaningfulAt = now;
        lastPresenceAt = now;
        lastUserIntentAt = now;
      }
    });

    return () => { unsubPlayer(); unsubSubtitle(); };
  }, [projectId]);

  /* ── 1초 idle 체크 ── */
  useEffect(() => {
    if (!projectId) return;

    idleCheckRef.current = window.setInterval(() => {
      if (modalOpenRef.current) return;
      if (!isForeground) return;

      const now = Date.now();
      const sincePresence = now - lastPresenceAt;
      // 콘솔 로그 추가 (5초마다만 찍기)
      if (Math.floor(sincePresence / 1000) % 5 === 0) {
        // console.log("[IdleCheck]", Math.floor(sincePresence / 1000) + "s idle");
      }

      if (sincePresence >= IDLE_TIMEOUT_MS) {
        // console.log("[IdleCheck] OPENING MODAL");
        openModal();
      }
    }, 1000);

    return () => { if (idleCheckRef.current) clearInterval(idleCheckRef.current); };
  }, [projectId]);

  /* ── 모달 열기 ── */
  const openModal = useCallback(() => {
    setModalOpen(true);
    setCountdown(MODAL_TIMEOUT_SEC);
    modalOpenRef.current = true;
    // 재생 중이면 일시정지
    if (usePlayerStore.getState().playing) {
      usePlayerStore.getState().togglePlay();
    }
  }, []);

  /* ── 모달 카운트다운 ── */
  useEffect(() => {
    if (!modalOpen) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    countdownRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          handleAutoExit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [modalOpen]);

  /* ── 계속 작업하기 ── */
  const handleContinue = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setModalOpen(false);
    modalOpenRef.current = false;
    resetTimestamps();
  }, []);

  /* ── 자동 퇴장 ── */
  const handleAutoExit = useCallback(async () => {
    setModalOpen(false);
    modalOpenRef.current = false;

    if (projectId) {
      try {
        await useSubtitleStore.getState().saveAll();
        const currentMs = usePlayerStore.getState().currentMs;
        const selectedId = useSubtitleStore.getState().selectedId;
        await projectsApi.markSaved(projectId, currentMs, selectedId);
      } catch {}
    }

    navigate("/projects");
  }, [projectId, navigate]);

  /* ── 렌더: 모달만, portal로 ── */
  if (!modalOpen) return null;

  const dark = localStorage.getItem("editor_darkMode") === "true";
  const dm = dark;
  const progressPct = (countdown / MODAL_TIMEOUT_SEC) * 100;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`relative w-[420px] rounded-2xl shadow-2xl overflow-hidden ${dm ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"}`}>
        <div className={`h-1 ${dm ? "bg-gray-700" : "bg-gray-200"}`}>
          <div className="h-full bg-amber-500 transition-all duration-1000 ease-linear" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="px-8 pt-8 pb-6">
          <div className="flex flex-col items-center text-center mb-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${dm ? "bg-amber-500/10" : "bg-amber-50"}`}>
              <AlertTriangle size={32} className="text-amber-500" />
            </div>
            <h2 className={`text-lg font-bold mb-1 ${dm ? "text-gray-100" : "text-gray-900"}`}>작업 중이신가요?</h2>
            <p className={`text-sm ${dm ? "text-gray-400" : "text-gray-500"}`}>일정 시간 동안 활동이 감지되지 않았습니다.</p>
          </div>

          <div className={`flex items-center justify-center gap-2 mb-6 py-3 rounded-xl ${dm ? "bg-gray-900/60" : "bg-gray-50"}`}>
            <Timer size={18} className={countdown <= 10 ? "text-red-500" : "text-amber-500"} />
            <span className={`text-2xl font-mono font-bold tabular-nums ${countdown <= 10 ? "text-red-500" : dm ? "text-gray-100" : "text-gray-800"}`}>{countdown}</span>
            <span className={`text-sm ${dm ? "text-gray-500" : "text-gray-400"}`}>초</span>
          </div>

          <p className={`text-xs text-center mb-6 ${dm ? "text-gray-500" : "text-gray-400"}`}>
            응답하지 않으면 자동으로 저장 후 작업 목록으로 이동합니다.
          </p>

          <button
            onClick={handleContinue}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            autoFocus
          >
            계속 작업하기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}