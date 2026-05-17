<script lang="ts">
  import { marbleData } from "$lib/marble";

  let {
    name,
    size = 22,
    hue = null,
  }: { name: string; size?: number; hue?: number | null } = $props();

  const d = $derived(marbleData(name, size, hue));
  const PATH_A = "M32.5 5.5C28 16 9 25 2 41c-7 16 6 38 22 42s35-7 40-22-1-37-12-47S37 -5 32.5 5.5Z";
  const PATH_B = "M60 12C50 8 36 18 30 30s-6 30 4 40 30 8 40-2 6-32-2-44Z";
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 80 80"
  fill="none"
  class="shrink-0 rounded-full"
  style="display:block"
>
  <mask id={`${d.fid}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="80" height="80">
    <rect width="80" height="80" rx="160" fill="#fff" />
  </mask>
  <g mask={`url(#${d.fid}-mask)`}>
    <rect width="80" height="80" fill={d.bg} />
    <path d={PATH_A} fill={d.a.fill} transform={`translate(${d.a.x} ${d.a.y}) rotate(${d.a.r} 40 40)`} />
    <path
      d={PATH_B}
      fill={d.b.fill}
      style="mix-blend-mode:overlay"
      transform={`translate(${d.b.x} ${d.b.y}) rotate(${d.b.r} 40 40)`}
    />
  </g>
</svg>
