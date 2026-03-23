/**
 * 텍스트 글자수 카운트
 * - 공백 제외, 나머지 모든 문자 포함 ([], () 등)
 * - 효과음이면 [] 포함하여 세어야 함
 */
export function countTextChars(text: string): number {
  return text.replace(/\s/g, "").length;
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
  const lines = text.split("\n");
  const effectiveMax = getEffectiveMaxChars(maxChars, bracketChars, hasSpeaker);
  for (const line of lines) {
    if (countTextChars(line) > effectiveMax) return "글자초과";
  }
  if (lines.length > maxLines) return "줄초과";
  if (endMs <= startMs) return "시간오류";
  return "";
}