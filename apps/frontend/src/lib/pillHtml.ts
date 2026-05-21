import type { Project } from "$lib/api";
import { applyCap, sentenceStartFlags, toCapMode } from "$lib/capitalize";
import { marbleSvg } from "$lib/marble";
import { fmtDateTime, fmtDuration, fmtLinkLabel, parseSegments, type Segment } from "$lib/tokens";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

// Editor-only escape: like `esc` but also turns `\n` into `<br>` so newlines
// from saved task text render correctly inside the contenteditable. A
// trailing `<br>` in Chrome/Safari contenteditable renders as a zero-height
// line the caret can't land on, so we append a ZWSP to give the caret a
// valid landing position.
const escEditor = (s: string) => {
  const html = esc(s).replace(/\n/g, "<br>");
  return html.endsWith("<br>") ? `${html}​` : html;
};

const CLOCK = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const HOURGLASS = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/></svg>`;
const MAPPIN = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
const LINK = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1.5-1.5"/></svg>`;

export function avatarHtml(project: Project | undefined, name: string, size = 15): string {
  if (project?.avatarType === "image" && project.image)
    return `<img src="${esc(project.image)}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:9999px;object-fit:cover" alt="">`;
  if (project?.avatarType === "emoji" && project.emoji)
    return `<span class="pill-emoji" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.62)}px">${esc(project.emoji)}</span>`;
  return marbleSvg(project?.name ?? name, size, project?.hue);
}

// Inner HTML (no wrapping span) for a token segment.
function pillInner(seg: Segment, atSentenceStart = true): string {
  if (seg.kind === "project") {
    const raw = seg.project?.name ?? "Unknown";
    const display = seg.project
      ? applyCap(raw, toCapMode(seg.project.capitalization), atSentenceStart)
      : raw;
    return `${avatarHtml(seg.project, raw)}<span>${esc(display)}</span>`;
  }
  if (seg.kind === "time")
    return `${CLOCK}<span>${esc(fmtDateTime(seg.date, seg.hasTime, atSentenceStart))}</span>`;
  if (seg.kind === "dur") return `${HOURGLASS}<span>${esc(fmtDuration(seg.minutes))}</span>`;
  if (seg.kind === "place") return `${MAPPIN}<span>${esc(seg.name)}</span>`;
  if (seg.kind === "link") return `${LINK}<span>${esc(fmtLinkLabel(seg.url))}</span>`;
  return "";
}

function pillClass(seg: Segment): string {
  if (seg.kind === "project") return "pill pill-project";
  if (seg.kind === "time") return "pill pill-time";
  if (seg.kind === "place") return "pill pill-place";
  if (seg.kind === "link") return "pill pill-link";
  return "pill pill-dur";
}

function tokenOf(seg: Segment): string {
  if (seg.kind === "project") return `@project:${seg.id}`;
  if (seg.kind === "dur") return `@dur:${seg.minutes}`;
  if (seg.kind === "place") return `@place:${encodeURIComponent(seg.name)}|${seg.lat},${seg.lng}`;
  if (seg.kind === "link") return `@link:${encodeURIComponent(seg.url)}`;
  if (seg.kind !== "time") return "";
  const d = seg.date;
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `@time:${seg.hasTime ? `${base}T${pad(d.getHours())}:${pad(d.getMinutes())}` : base}`;
}

// Standalone pill element (for the contenteditable editor).
export function pillElement(seg: Segment, atSentenceStart = true): string {
  return `<span class="${pillClass(seg)}" contenteditable="false" data-token="${esc(tokenOf(seg))}" data-pill="${seg.kind}">${pillInner(seg, atSentenceStart)}</span>`;
}

// Full canonical text → editor HTML (pills + escaped text).
export function renderEditorHtml(text: string, projects: Project[]): string {
  const segs = parseSegments(text, projects);
  const flags = sentenceStartFlags(segs);
  return segs.map((s, i) => (s.kind === "text" ? escEditor(s.value) : pillElement(s, flags[i]))).join("");
}

export { pillClass, pillInner };
