import { fmtDateTime, fmtDuration, fmtTime } from "./format";
import { localISO } from "./regex";

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
  if (dur != null)
    out.push({ type: "dur", token: `@dur:${dur}`, label: fmtDuration(dur), detail: "Duration", score: 10 });

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
      ((): Date => {
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
