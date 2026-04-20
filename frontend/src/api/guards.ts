export class ApiResponseShapeError extends Error {
  label: string;
  expected: string;
  actual: string;
  data: unknown;

  constructor(label: string, expected: string, data: unknown) {
    const actual = describeData(data);
    super(`${label} 응답 형식 오류: expected ${expected}, got ${actual}`);
    this.name = "ApiResponseShapeError";
    this.label = label;
    this.expected = expected;
    this.actual = actual;
    this.data = data;
  }
}

function describeData(data: unknown): string {
  if (Array.isArray(data)) return "array";
  if (data === null) return "null";
  return typeof data;
}

function isPlainObject(data: unknown): data is object {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

export function ensureArray<T>(data: unknown, label: string): T[] {
  if (!Array.isArray(data)) {
    console.error(`[${label}] expected array but got:`, data);
    throw new ApiResponseShapeError(label, "array", data);
  }
  return data as T[];
}

export function ensureObject<T>(data: unknown, label: string): T {
  if (!isPlainObject(data)) {
    console.error(`[${label}] expected object but got:`, data);
    throw new ApiResponseShapeError(label, "object", data);
  }
  return data as T;
}