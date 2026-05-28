// Position the suggestion picker in viewport coordinates so it escapes
// every ancestor stacking context. Picks above when below is cramped.
export function computePickerStyle(editor: HTMLElement, maxH = 256, gap = 6): string {
  const rect = editor.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom;
  const placeAbove = below < maxH + gap && rect.top > below;
  const vert = placeAbove
    ? `bottom:${Math.round(window.innerHeight - rect.top + gap)}px`
    : `top:${Math.round(rect.bottom + gap)}px`;
  return `left:${Math.round(rect.left)}px;width:${Math.round(rect.width)}px;${vert}`;
}

export function detectTouchDevice(isNative: boolean): boolean {
  if (typeof window === "undefined") return false;
  if (isNative) return true;
  return !!window.matchMedia?.("(pointer: coarse)").matches && !!window.matchMedia?.("(hover: none)").matches;
}
