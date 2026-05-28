// Canonical token format stored inside Task.text:
//   @project:<cuid>                      → project pill
//   @time:YYYY-MM-DDTHH:MM               → datetime pill (display only)
//   @dur:<minutes>                       → duration pill
//   @place:<urlEncodedName>|<lat>,<lng>  → Google Maps place pill
//   @link:<urlEncodedUrl>                → external URL pill
//
// Date-only @time tokens are no longer used for bucketing — the bucket is
// stored on the task. @time:YYYY-MM-DDTHH:MM survives because users still
// add reminders / start times; the date portion is informational.
export const TOKEN_RE = /@(project|time|dur|place|link):([^\s@]+)/g;

export const pad = (n: number) => String(n).padStart(2, "0");

export function localISO(d: Date, withTime: boolean): string {
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${base}T${pad(d.getHours())}:${pad(d.getMinutes())}` : base;
}

export function parseISO(v: string): { date: Date; hasTime: boolean } | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return {
    date: new Date(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0)),
    hasTime: h !== undefined,
  };
}
