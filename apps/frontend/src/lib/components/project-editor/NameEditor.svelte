<script lang="ts">
  import type { Project } from "$lib/api";
  import { applyCap, toCapMode } from "$lib/capitalize";
  import { projects } from "$lib/projects.svelte";
  import ProjectAvatar from "../ProjectAvatar.svelte";

  let {
    name = $bindable<string>(),
    parents,
    selfId,
    onCommit,
    onCancel,
    onAddParent,
  }: {
    name: string;
    parents: string[];
    selfId: string;
    onCommit: () => void;
    onCancel: () => void;
    onAddParent: (p: Project) => void;
  } = $props();

  let nameEl: HTMLInputElement | undefined = $state();
  let mentionOpen = $state(false);
  let mentionItems = $state<Project[]>([]);
  let mentionActive = $state(0);
  let mStart = 0;
  let mEnd = 0;

  function detectMention() {
    if (!nameEl) return (mentionOpen = false);
    const caret = nameEl.selectionStart ?? name.length;
    const m = name.slice(0, caret).match(/@([^\s@]*)$/);
    if (!m) return (mentionOpen = false);
    mStart = caret - m[0].length;
    mEnd = caret;
    const q = m[1].trim().toLowerCase();
    // Exclude self + all descendants (cycle-safe) and already-added parents.
    const exclude = projects.descendantIds(selfId);
    for (const id of parents) exclude.add(id);
    mentionItems = projects.list
      .filter((p) => !exclude.has(p.id) && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => {
        const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name);
      });
    mentionActive = 0;
    mentionOpen = mentionItems.length > 0;
  }

  function choose(p: Project) {
    onAddParent(p);
    name = name.slice(0, mStart) + name.slice(mEnd);
    mentionOpen = false;
    requestAnimationFrame(() => {
      nameEl?.focus();
      nameEl?.setSelectionRange(mStart, mStart);
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        mentionActive = (mentionActive + 1) % mentionItems.length;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        mentionActive = (mentionActive - 1 + mentionItems.length) % mentionItems.length;
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(mentionItems[mentionActive]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        mentionOpen = false;
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      mentionOpen = false;
      onCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      nameEl?.blur();
    }
  }
</script>

<div class="relative">
  <input
    bind:this={nameEl}
    bind:value={name}
    oninput={detectMention}
    onclick={detectMention}
    onkeyup={detectMention}
    onkeydown={onKeydown}
    onblur={() => setTimeout(() => {
      mentionOpen = false;
      onCommit();
    }, 150)}
    class="w-full bg-transparent text-sm font-semibold outline-none border-b
      border-[var(--color-border)] focus:border-[var(--color-accent)] pb-0.5
      text-[var(--color-ink)] transition-colors"
  />
  {#if mentionOpen}
    <div
      class="absolute left-0 top-full mt-1.5 z-[70] w-[280px] max-h-56 overflow-y-auto py-1.5
        rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
        shadow-xl shadow-black/40 animate-fade-in"
    >
      {#each mentionItems as p, i (p.id)}
        {@const ups = projects.parentsOf(p.id)}
        <button
          type="button"
          onpointerdown={(e) => {
            e.preventDefault();
            choose(p);
          }}
          onmouseenter={() => (mentionActive = i)}
          class="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors
            {i === mentionActive ? 'bg-[var(--color-surface-3)]' : ''}"
        >
          <span class="pill pill-project">
            <ProjectAvatar project={p} size={14} />
            {applyCap(p.name, toCapMode(p.capitalization), true)}
          </span>
          {#if ups.length}
            <span class="ml-auto flex items-center gap-1 flex-wrap justify-end">
              {#each ups as up (up.id)}
                <span class="pill pill-project pill-muted">
                  <ProjectAvatar project={up} size={12} />
                  {applyCap(up.name, toCapMode(up.capitalization), true)}
                </span>
              {/each}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pill-muted {
    opacity: 0.7;
  }
</style>
