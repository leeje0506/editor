/**
 * 한글(과 모든 결합 문자) NFC 정규화 헬퍼.
 *
 * 맥OS 입력기는 종종 NFD(자모 분리)로 문자열을 만든다.
 * 같은 글자라도 NFD/NFC가 섞이면 검색·비교·DB 정렬·UI 표시가 어긋나므로,
 * **서버로 보내기 직전** 단계에서 일관되게 NFC로 정규화해 저장한다.
 *
 * IME composition 중에는 절대 호출하지 말 것 — 자모가 갈라진다.
 * onChange/value 바인딩이 아니라 submit/PATCH 직전에만 사용.
 */
export function nfc(s: string | null | undefined): string {
  return (s ?? "").normalize("NFC");
}

/** NFC 정규화 + 양 끝 공백 제거. 사람이 입력한 짧은 텍스트(이름/제목 등)에 적합. */
export function nfcTrim(s: string | null | undefined): string {
  return (s ?? "").normalize("NFC").trim();
}