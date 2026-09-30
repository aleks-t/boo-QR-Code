export function normalizeCode(value: string) {
  let code = value.trim();
  if (/^https?:\/\//i.test(code)) {
    try {
      const path = new URL(code).pathname;
      const match = path.match(/^\/parts\/([^/]+)\/?$/);
      if (match) code = decodeURIComponent(match[1]);
    } catch {
      /* Invalid URLs follow the usual not-found path. */
    }
  }
  return code.toUpperCase();
}
export function parseCode(value: string) {
  const code = normalizeCode(value);
  const match = code.match(/^(.*)-(V|S)([1-9]\d*)$/);
  return {
    code,
    partNumber: match ? match[1] : code,
    revisionNum: match?.[2] === "V" ? Number(match[3]) : null,
    sampleNumber: match?.[2] === "S" ? Number(match[3]) : null,
  };
}
export function resolveCode(value: string) {
  return parseCode(value).partNumber;
}
export function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function currentRevision<
  T extends { voided: boolean; revisionNum: number },
>(revisions: T[]): T | null {
  return (
    revisions
      .filter((r) => !r.voided)
      .sort((a, b) => b.revisionNum - a.revisionNum)[0] ?? null
  );
}
export function csvCell(value: string) {
  // Spreadsheet formula injection is possible even inside CSV quotes.
  const safe = /^[=+@\-\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function similarCode(a: string, b: string) {
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
  return d[a.length][b.length] <= 1;
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
