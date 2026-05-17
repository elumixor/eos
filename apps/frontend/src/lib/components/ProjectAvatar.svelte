<script lang="ts">
  import type { Project } from "$lib/api";
  import BoringAvatar from "./BoringAvatar.svelte";

  let { project, size = 22 }: { project: Project; size?: number } = $props();
</script>

{#if project.avatarType === "image" && project.image}
  <img
    src={project.image}
    alt={project.name}
    width={size}
    height={size}
    class="shrink-0 rounded-full object-cover"
    style="width:{size}px;height:{size}px"
  />
{:else if project.avatarType === "emoji" && project.emoji}
  <span
    class="shrink-0 inline-flex items-center justify-center rounded-full bg-[var(--color-surface-3)] leading-none"
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.62)}px"
  >
    {project.emoji}
  </span>
{:else}
  <BoringAvatar name={project.name} {size} hue={project.hue} />
{/if}
