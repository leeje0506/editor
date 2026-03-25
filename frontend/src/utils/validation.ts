/**
 * 텍스트 글자수 카운트
 * - 공백 포함 (줄바꿈만 제외)
 * - NFD → NFC 정규화 후 카운트
 */
export function countTextChars(text: string): number {
  return text.normalize("NFC").replace(/\n/g, "").length;
}

/**
 * 실제 사용 가능한 줄당 글자수 계산
 * - 화자가 있으면 bracket_chars만큼 차감
 */
export function getEffectiveMaxChars(
  maxCharsPerLine: number,
  bracketChars: number,
  hasSpeaker: boolean,
): number {
  return hasSpeaker ? maxCharsPerLine - bracketChars : maxCharsPerLine;
}

/**
 * 클라이언트 사이드 검수 (미리보기용)
 */
export function validateSubtitle(
  text: string,
  startMs: number,
  endMs: number,
  maxChars: number,
  maxLines: number,
  bracketChars: number,
  hasSpeaker: boolean,
): string {
  const normalized = text.normalize("NFC");
  const lines = normalized.split("\n");
  const effectiveMax = getEffectiveMaxChars(maxChars, bracketChars, hasSpeaker);
  for (const line of lines) {
    if (line.length > effectiveMax) return "글자초과";
  }
  if (lines.length > maxLines) return "줄초과";
  if (endMs <= startMs) return "시간오류";
  return "";
}