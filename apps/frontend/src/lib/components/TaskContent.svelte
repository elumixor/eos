<script lang="ts">
  import { Clock, Hourglass, MapPin } from "lucide-svelte";
  import type { Task } from "$lib/api";
  import { projects } from "$lib/projects.svelte";
  import { fmtDateTime, fmtDuration, parseSegments } from "$lib/tokens";
  import { placeUrl } from "$lib/placeSearch";
  import ProjectAvatar from "./ProjectAvatar.svelte";

  let { task, dimmed = false }: { task: Task; dimmed?: boolean } = $props();

  const segments = $derived(parseSegments(task.text, projects.list));

  function filterByProject(e: MouseEvent, id: string) {
    e.stopPropagation();
    projects.toggleFilter(id);
  }
</script>

<span
  class="flex-1 text-[13px] font-light tracking-wide leading-relaxed cursor-text select-none
    {dimmed ? 'line-through text-[var(--color-ink-3)] task-done' : 'text-[var(--color-ink)]'}"
>
  {#each segments as seg, i (i)}
    {#if seg.kind === "text"}{seg.value}{:else if seg.kind === "project"}
      <button
        type="button"
        class="pill pill-project"
        onclick={(e) => filterByProject(e, seg.id)}
        onpointerdown={(e) => e.stopPropagation()}
      >
        {#if seg.project}
          <ProjectAvatar project={seg.project} size={15} />
          {seg.project.name}
        {:else}
          Unknown
        {/if}
      </button>
    {:else if seg.kind === "time"}
      <span class="pill pill-time">
        <Clock size={11} strokeWidth={2.5} />
        {fmtDateTime(seg.date, seg.hasTime)}
      </span>
    {:else if seg.kind === "dur"}
      <span class="pill pill-dur">
        <Hourglass size={11} strokeWidth={2.5} />
        {fmtDuration(seg.minutes)}
      </span>
    {:else if seg.kind === "place"}
      <a
        class="pill pill-place"
        href={placeUrl(seg.name, seg.lat, seg.lng)}
        target="_blank"
        rel="noopener noreferrer"
        onclick={(e) => e.stopPropagation()}
        onpointerdown={(e) => e.stopPropagation()}
      >
        <MapPin size={11} strokeWidth={2.5} />
        {seg.name}
      </a>
    {/if}
  {/each}
</span>
