import { pad } from "./regex";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function fmtTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return m ? `${h}:${pad(m)} ${ap}` : `${h} ${ap}`;
}

export function fmtDateTime(d: Date, hasTime: boolean, atSentenceStart = true): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  let day: string;
  if (sameDay(d, now)) day = atSentenceStart ? "Today" : "today";
  else if (sameDay(d, tomorrow)) day = atSentenceStart ? "Tomorrow" : "tomorrow";
  else day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return hasTime ? `${day}, ${fmtTime(d)}` : day;
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}` : `${h}h`;
}

// ── Link helpers ────────────────────────────────────────────────
const URL_LIKE_RE = /^(?:https?:\/\/\S+|[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?:\/\S*)?)$/i;

export const isUrlLike = (q: string): boolean => URL_LIKE_RE.test(q.trim());

export function normalizeUrl(typed: string): string {
  const t = typed.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function fmtLinkLabel(url: string): string {
  const s = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const slash = s.indexOf("/");
  let host = slash >= 0 ? s.slice(0, slash) : s;
  const path = slash >= 0 ? s.slice(slash + 1).replace(/\/+$/, "") : "";
  const dot = host.lastIndexOf(".");
  if (dot > 0) host = host.slice(0, dot);
  if (!path) return host;
  const tail = path.split("/").filter(Boolean).pop() ?? "";
  return tail ? `${host} / ${tail}` : host;
}
