import type { ProjectStatusLabel, ProjectStatusRaw } from "../types";

/**
 * Project의 raw status + reject_count → UI 라벨 파생.
 *
 * 매핑 규칙 (명세 v8.3 PART 1 ACT-B04 T03):
 *   - 진행중: status="in_progress" AND reject_count=0
 *   - 제출:   status="submitted"
 *   - 반려:   status="rejected"  (반려 직후, 작업자가 자막 수정 시작 전)
 *   - 재작업: status="in_progress" AND reject_count>0  (반려 후 자막 수정 시작)
 *   - 완료:   status="completed"
 */
export function getStatusLabel(
  status: ProjectStatusRaw,
  rejectCount: number = 0,
): ProjectStatusLabel {
  if (status === "submitted") return "제출";
  if (status === "rejected") return "반려";
  if (status === "completed") return "완료";
  // status === "in_progress"
  return rejectCount > 0 ? "재작업" : "진행중";
}

/** 모든 라벨 (필터 드롭다운 등). 첫 항목은 "전체" */
export const STATUS_LABELS_WITH_ALL = [
  "전체",
  "진행중",
  "제출",
  "반려",
  "재작업",
  "완료",
] as const;

export type StatusFilterLabel = (typeof STATUS_LABELS_WITH_ALL)[number];

/**
 * UI 라벨 → 백엔드 list_projects의 status 쿼리 파라미터.
 *
 * 백엔드 라우터가 라벨을 직접 인식하므로 그대로 전달.
 * "전체"는 undefined로 변환해 필터 미적용.
 */
export function statusLabelToQueryParam(
  label: StatusFilterLabel,
): string | undefined {
  return label === "전체" ? undefined : label;
}

/**
 * 라벨별 표시 색상 (Tailwind 클래스). 카드 배지/필터 버튼 등에 공통 사용.
 * bg + text 조합. border가 필요하면 컴포넌트에서 추가.
 */
export const STATUS_LABEL_COLORS: Record<ProjectStatusLabel, string> = {
  "진행중": "bg-blue-500/20 text-blue-300",
  "제출":   "bg-amber-500/20 text-amber-300",
  "반려":   "bg-red-500/20 text-red-300",
  "재작업": "bg-orange-500/20 text-orange-300",
  "완료":   "bg-green-500/20 text-green-300",
};

/**
 * 편집기 readOnly 판정 (역할별 분기).
 *
 * - submitted, completed → 전 역할 읽기전용
 * - rejected → worker만 편집 가능, master/manager는 읽기전용
 * - 그 외 (in_progress) → 편집 가능
 */
export function isReadOnly(
  status: ProjectStatusRaw,
  isWorker: boolean,
): boolean {
  if (status === "submitted" || status === "completed") return true;
  if (status === "rejected" && !isWorker) return true;
  return false;
}