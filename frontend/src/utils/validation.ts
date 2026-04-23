/**
 * 텍스트 글자수 카운트
 * - 공백 포함 (줄바꿈만 제외)
 * - NFD → NFC 정규화 후 카운트
 */
export function countTextChars(text: string): number {
  return text.normalize("NFC").replace(/\n/g, "").length;
}

/**
 * 클라이언트 사이드 검수 (백엔드 validate_subtitle과 동일 로직)
 */
export function validateSubtitleLocal(
  text: string,
  speaker: string,
  speakerDeleted: boolean,
  startMs: number,
  endMs: number,
  maxCharsPerLine: number,
  maxLines: number,
  minDurationMs: number,
): string[] {
  const errors: string[] = [];

  // 글자수 체크: 전체 글자수 + 화자예약 > maxChars × 실제줄수
  const totalChars = countTextChars(text);
  const speakerReserved = (speaker && !speakerDeleted) ? speaker.length + 3 : 0;
  const lineCount = Math.max(1, text.split("\n").length);
  const limit = maxCharsPerLine * lineCount;

  if (totalChars + speakerReserved > limit) {
    errors.push("글자초과");
  }

  // 줄 수 체크
  if (text.split("\n").length > maxLines) {
    errors.push("줄초과");
  }

  // 시간 오류
  if (endMs <= startMs) {
    errors.push("최소시간");
  }

  // 최소 길이
  if (minDurationMs > 0 && (endMs - startMs) < minDurationMs) {
    errors.push("최소길이");
  }

  return errors;
}