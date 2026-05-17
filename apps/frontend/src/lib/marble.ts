// Shared deterministic "marble" avatar generator so the Svelte component
// and the contenteditable HTML renderer never drift apart.
const PALETTE = ["#0a9396", "#94d2bd", "#ee9b00", "#ca6702", "#bb3e03", "#005f73"];

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.abs(s.charCodeAt(i) * (i + 1) - h) | 0) >>> 0;
  return h;
}

// Default hue when none is set: derived from the name so it stays stable.
export function defaultHue(name: string) {
  return hashCode(name || "?") % 360;
}

function huePalette(hue: number) {
  return [
    `oklch(70% 0.13 ${hue})`,
    `oklch(83% 0.10 ${hue})`,
    `oklch(58% 0.15 ${hue})`,
    `oklch(46% 0.13 ${hue})`,
    `oklch(76% 0.12 ${(hue + 28) % 360})`,
    `oklch(38% 0.10 ${hue})`,
  ];
}

export function marbleData(name: string, size: number, hue?: number | null) {
  const n = name || "?";
  const h = hashCode(n);
  const pal = hue == null ? PALETTE : huePalette(hue);
  const range = pal.length;
  const unit = size / 8;
  const c = (k: number) => pal[(h + k) % range];
  const num = (k: number, m: number) => (((h >> k) % m) - m / 2) | 0;
  return {
    fid: `m${h}`,
    bg: c(0),
    a: { fill: c(1), x: num(0, 6) * unit, y: num(1, 6) * unit, r: ((h % 4) + 1) * 12 },
    b: { fill: c(3), x: num(2, 6) * unit, y: num(3, 6) * unit, r: -((h % 5) + 1) * 14 },
  };
}

const PATH_A = "M32.5 5.5C28 16 9 25 2 41c-7 16 6 38 22 42s35-7 40-22-1-37-12-47S37 -5 32.5 5.5Z";
const PATH_B = "M60 12C50 8 36 18 30 30s-6 30 4 40 30 8 40-2 6-32-2-44Z";

export function marbleSvg(name: string, size: number, hue?: number | null): string {
  const d = marbleData(name, size, hue);
  return `<svg width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" style="display:block;border-radius:9999px">
<mask id="${d.fid}-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="80" height="80"><rect width="80" height="80" rx="160" fill="#fff"/></mask>
<g mask="url(#${d.fid}-mask)">
<rect width="80" height="80" fill="${d.bg}"/>
<path d="${PATH_A}" fill="${d.a.fill}" transform="translate(${d.a.x} ${d.a.y}) rotate(${d.a.r} 40 40)"/>
<path d="${PATH_B}" fill="${d.b.fill}" style="mix-blend-mode:overlay" transform="translate(${d.b.x} ${d.b.y}) rotate(${d.b.r} 40 40)"/>
</g></svg>`;
}
