import type { Segment } from "$lib/tokens";

export type CapMode = "sentence" | "lower" | "capitalized" | "upper";

function isCapMode(v: string): v is CapMode {
  return v === "sentence" || v === "lower" || v === "capitalized" || v === "upper";
}

export function toCapMode(v: string | undefined | null): CapMode {
  return v && isCapMode(v) ? v : "sentence";
}

function capFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

export function applyCap(name: string, mode: CapMode, atSentenceStart: boolean): string {
  switch (mode) {
    case "lower":
      return name.toLowerCase();
    case "upper":
      return name.toUpperCase();
    case "capitalized":
      return capFirst(name);
    case "sentence":
      return atSentenceStart ? capFirst(name) : name.toLowerCase();
  }
}

// For each segment, returns true if it sits at the start of a sentence:
// either nothing visible came before it, or the most recent non-whitespace
// character of preceding text is one of . ! ?
export function sentenceStartFlags(segments: Segment[]): boolean[] {
  const flags: boolean[] = [];
  let atStart = true;
  for (const seg of segments) {
    if (seg.kind === "text") {
      flags.push(atStart);
      const trimmed = seg.value.replace(/\s+$/, "");
      if (trimmed.length) {
        const last = trimmed[trimmed.length - 1];
        atStart = last === "." || last === "!" || last === "?";
      }
    } else {
      flags.push(atStart);
      // pills don't end a sentence — keep atStart as-is for following text/pills
      atStart = false;
    }
  }
  return flags;
}
