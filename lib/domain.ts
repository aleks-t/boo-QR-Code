export function resolveCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/-V\d+$/, "");
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
