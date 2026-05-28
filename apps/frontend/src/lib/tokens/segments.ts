import type { Project } from "$lib/api";
import { parseISO, TOKEN_RE } from "./regex";

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "project"; id: string; project: Project | undefined }
  | { kind: "time"; date: Date; hasTime: boolean }
  | { kind: "dur"; minutes: number }
  | { kind: "place"; name: string; lat: number; lng: number }
  | { kind: "link"; url: string };

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

// Structured fields for the backend (last token of each kind wins).
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

export function projectIds(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) if (m[1] === "project") ids.push(m[2]);
  return ids;
}

export const stripTokens = (text: string): string => text.replace(TOKEN_RE, "").replace(/\s+/g, " ").trim();
