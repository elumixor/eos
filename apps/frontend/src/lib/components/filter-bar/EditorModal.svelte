<script lang="ts">
  import type { Project } from "$lib/api";
  import ProjectAvatarEditor from "../ProjectAvatarEditor.svelte";

  let { project, onClose }: { project: Project; onClose: () => void } = $props();
</script>

<button
  aria-label="Close"
  class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-fade-in"
  onclick={onClose}
></button>
<div
  class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[min(92vw,360px)]
    p-5 rounded-3xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
    shadow-2xl shadow-black/50 animate-scale-in"
>
  <ProjectAvatarEditor {project} {onClose} />
</div>
