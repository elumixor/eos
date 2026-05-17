import type { Project } from "$lib/api";

// ── Canonical token format stored inside Task.text ──────────────
//   @project:<cuid>          → project pill
//   @time:YYYY-MM-DD         → date pill (no time)
//   @time:YYYY-MM-DDTHH:MM   → datetime pill
//   @dur:<minutes>           → duration pill
export const TOKEN_RE = /@(project|time|dur):([0-9A-Za-z:T-]+)/g;

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "project"; id: string; project: Project | undefined }
  | { kind: "time"; date: Date; hasTime: boolean }
  | { kind: "dur"; minutes: number };

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

export function fmtDateTime(d: Date, hasTime: boolean): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  let day: string;
  if (sameDay(d, now)) day = "Today";
  else if (sameDay(d, tomorrow)) day = "Tomorrow";
  else day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return hasTime ? `${day}, ${fmtTime(d)}` : day;
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
  token: string; // canonical token incl. @prefix
  label: string;
  detail: string;
  score: number; // higher = more relevant
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseDurationStr(s: string): number | null {
  const t = s.replace(/\s+/g, "").toLowerCase();
  // 1h30, 1h30m
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

// Returns { date, hasTime } or null. `q` is one space/hyphen-free chunk.
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
  // d.m.y / d/m/y / d-m-y / d.m  (day-first)
  let m = t.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (m) {
    const day = Number(m[1]);
    const mon = Number(m[2]) - 1;
    let yr = m[3] ? Number(m[3]) : now.getFullYear();
    if (yr < 100) yr += 2000;
    const d = new Date(yr, mon, day);
    if (!Number.isNaN(d.getTime())) return { date: d, hasTime: false };
  }
  // ISO yyyy-mm-dd
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

  // Duration?
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

  // Split a combined chunk like "today-5pm" or "today 5pm".
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
