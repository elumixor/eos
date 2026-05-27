import type { Project } from "$lib/api";

// ── Canonical token format stored inside Task.text ──────────────
//   @project:<cuid>                      → project pill
//   @time:YYYY-MM-DDTHH:MM               → datetime pill (display only)
//   @dur:<minutes>                       → duration pill
//   @place:<urlEncodedName>|<lat>,<lng>  → Google Maps place pill
//   @link:<urlEncodedUrl>                → external URL pill
//
// Date-only @time tokens are no longer used for bucketing — the bucket is
// stored on the task. @time:YYYY-MM-DDTHH:MM survives because users still
// add reminders / start times to a task; the date portion is informational.
export const TOKEN_RE = /@(project|time|dur|place|link):([^\s@]+)/g;

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "project"; id: string; project: Project | undefined }
  | { kind: "time"; date: Date; hasTime: boolean }
  | { kind: "dur"; minutes: number }
  | { kind: "place"; name: string; lat: number; lng: number }
  | { kind: "link"; url: string };

const pad = (n: number) => String(n).padStart(2, "0");

export function localISO(d: Date, withTime: boolean): string {
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${base}T${pad(d.getHours())}:${pad(d.getMinutes())}` : base;
}

function parseISO(v: string): { date: Date; hasTime: boolean } | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0));
  return { date, hasTime: h !== undefined };
}

export function parseSegments(text: string, projects: Project[]): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const [full, type, value] = m;
    const idx = m.index ?? 0;
    if (idx > last) segs.push({ kind: "text", value: text.slice(last, idx) });
    last = idx + full.length;

    if (type === "project") {
      segs.push({ kind: "project", id: value, project: projects.find((p) => p.id === value) });
    } else if (type === "dur") {
      segs.push({ kind: "dur", minutes: Number(value) });
    } else if (type === "link") {
      try {
        segs.push({ kind: "link", url: decodeURIComponent(value) });
      } catch {
        segs.push({ kind: "text", value: full });
      }
    } else if (type === "place") {
      const pm = value.match(/^([^|]+)\|(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
      if (pm) {
        try {
          segs.push({ kind: "place", name: decodeURIComponent(pm[1]), lat: Number(pm[2]), lng: Number(pm[3]) });
        } catch {
          segs.push({ kind: "text", value: full });
        }
      } else segs.push({ kind: "text", value: full });
    } else {
      const iso = parseISO(value);
      if (iso) segs.push({ kind: "time", date: iso.date, hasTime: iso.hasTime });
      else segs.push({ kind: "text", value: full });
    }
  }
  if (last < text.length) segs.push({ kind: "text", value: text.slice(last) });
  return segs;
}

// Structured fields derived for the backend (last token of each kind wins).
export function extractFields(text: string): {
  projectId: string | null;
  startTime: string | null;
  duration: number | null;
} {
  let projectId: string | null = null;
  let startTime: string | null = null;
  let duration: number | null = null;
  for (const m of text.matchAll(TOKEN_RE)) {
    const [, type, value] = m;
    if (type === "project") projectId = value;
    else if (type === "dur") duration = Number(value);
    else {
      const iso = parseISO(value);
      if (iso) startTime = iso.date.toISOString();
    }
  }
  return { projectId, startTime, duration };
}

// Every project id referenced in the text (a task can have several).
export function projectIds(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) if (m[1] === "project") ids.push(m[2]);
  return ids;
}

// Plain text with all tokens stripped (used for voice / fallbacks).
export function stripTokens(text: string): string {
  return text.replace(TOKEN_RE, "").replace(/\s+/g, " ").trim();
}

// ── Display helpers ─────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

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

// ── Link helpers ────────────────────────────────────────────────
const URL_LIKE_RE = /^(?:https?:\/\/\S+|[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?:\/\S*)?)$/i;

export function isUrlLike(q: string): boolean {
  return URL_LIKE_RE.test(q.trim());
}

export function normalizeUrl(typed: string): string {
  const t = typed.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function fmtLinkLabel(url: string): string {
  let s = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const slash = s.indexOf("/");
  let host = slash >= 0 ? s.slice(0, slash) : s;
  const path = slash >= 0 ? s.slice(slash + 1).replace(/\/+$/, "") : "";
  const dot = host.lastIndexOf(".");
  if (dot > 0) host = host.slice(0, dot);
  if (!path) return host;
  const tail = path.split("/").filter(Boolean).pop() ?? "";
  return tail ? `${host} / ${tail}` : host;
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}` : `${h}h`;
}

// ── Natural-language parsing for the picker ─────────────────────
export type Suggestion = {
  type: "time" | "dur";
  token: string;
  label: string;
  detail: string;
  score: number;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseDurationStr(s: string): number | null {
  const t = s.replace(/\s+/g, "").toLowerCase();
  let m = t.match(/^(\d+)h(\d+)m?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours)$/);
  if (m) return Math.round(Number(m[1]) * 60);
  m = t.match(/^(\d+)(m|min|mins|minute|minutes)$/);
  if (m) return Number(m[1]);
  return null;
}

function parseTimeStr(s: string, base: Date): Date | null {
  const t = s.replace(/\s+/g, "").toLowerCase();
  let m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3] === "pm") h += 12;
    const d = new Date(base);
    d.setHours(h, Number(m[2] ?? 0), 0, 0);
    return d;
  }
  m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const d = new Date(base);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }
  return null;
}

function parseDateChunk(q: string, now: Date): { date: Date; hasTime: boolean } | null {
  const t = q.toLowerCase();
  const d0 = new Date(now);
  d0.setHours(0, 0, 0, 0);

  if (t === "now") return { date: new Date(now), hasTime: true };
  if (t === "today" || t === "tod") return { date: d0, hasTime: false };
  if (t === "tomorrow" || t === "tmr" || t === "tom") {
    d0.setDate(d0.getDate() + 1);
    return { date: d0, hasTime: false };
  }
  if (t === "yesterday") {
    d0.setDate(d0.getDate() - 1);
    return { date: d0, hasTime: false };
  }
  const wd = WEEKDAYS.findIndex((w) => w.startsWith(t) && t.length >= 3);
  if (wd >= 0) {
    const diff = (wd - d0.getDay() + 7) % 7 || 7;
    d0.setDate(d0.getDate() + diff);
    return { date: d0, hasTime: false };
  }
  let m = t.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (m) {
    const day = Number(m[1]);
    const mon = Number(m[2]) - 1;
    let yr = m[3] ? Number(m[3]) : now.getFullYear();
    if (yr < 100) yr += 2000;
    const d = new Date(yr, mon, day);
    if (!Number.isNaN(d.getTime())) return { date: d, hasTime: false };
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), hasTime: false };
  return null;
}

export function suggestTokens(query: string, now = new Date()): Suggestion[] {
  const q = query.trim();
  const out: Suggestion[] = [];

  if (!q) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tom = new Date(today);
    tom.setDate(tom.getDate() + 1);
    out.push(
      { type: "time", token: `@time:${localISO(now, true)}`, label: "Now", detail: fmtTime(now), score: 5 },
      {
        type: "time",
        token: `@time:${localISO(today, false)}`,
        label: "Today",
        detail: fmtDateTime(today, false),
        score: 4,
      },
      {
        type: "time",
        token: `@time:${localISO(tom, false)}`,
        label: "Tomorrow",
        detail: fmtDateTime(tom, false),
        score: 3,
      },
      { type: "dur", token: "@dur:30", label: "30 min", detail: "Duration", score: 2 },
      { type: "dur", token: "@dur:60", label: "1 hour", detail: "Duration", score: 2 },
    );
    return out;
  }

  const dur = parseDurationStr(q);
  if (dur != null) {
    out.push({
      type: "dur",
      token: `@dur:${dur}`,
      label: fmtDuration(dur),
      detail: "Duration",
      score: 10,
    });
  }

  const parts = q.split(/[\s-]+/).filter(Boolean);
  let date: Date | null = null;
  let hasTime = false;
  let matched = false;

  for (const part of parts) {
    const dc = parseDateChunk(part, now);
    if (dc) {
      date = dc.date;
      hasTime = dc.hasTime;
      matched = true;
      continue;
    }
    const base =
      date ??
      (() => {
        const d = new Date(now);
        d.setSeconds(0, 0);
        return d;
      })();
    const tt = parseTimeStr(part, base);
    if (tt) {
      date = tt;
      hasTime = true;
      matched = true;
    }
  }

  if (matched && date) {
    out.push({
      type: "time",
      token: `@time:${localISO(date, hasTime)}`,
      label: fmtDateTime(date, hasTime),
      detail: hasTime ? "Date & time" : "Date",
      score: 9,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

// ── Bucket helpers ──────────────────────────────────────────────
export type Bucket = "today" | "week" | "later";

// What the user sees: the stored bucket may roll into "overdue" if its
// scheduled stamp is older than the current period (calendar day for
// "today", current week for "week"). "later" never rolls over.
export type DisplayBucket = Bucket | "overdue";

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

// Monday-start week. The settings hook can swap this later; for now Monday
// matches the user's locale. Returns 00:00 on Monday of the week containing d.
function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  const dow = c.getDay(); // 0=Sun ... 6=Sat
  const offset = (dow + 6) % 7; // days since Monday
  c.setDate(c.getDate() - offset);
  return c;
}

export function displayBucket(
  task: { bucket: string; scheduledAt: string | Date | null; completed: boolean },
  now = new Date(),
): DisplayBucket {
  const b = task.bucket as Bucket;
  if (b === "later" || task.completed || !task.scheduledAt) {
    return b === "today" || b === "week" ? b : "later";
  }
  const sched = typeof task.scheduledAt === "string" ? new Date(task.scheduledAt) : task.scheduledAt;
  if (b === "today") {
    return sched < startOfDay(now) ? "overdue" : "today";
  }
  // "week"
  return sched < startOfWeek(now) ? "overdue" : "week";
}
