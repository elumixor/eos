<script lang="ts">
  import { onMount } from "svelte";
  import { Shuffle, Smile, ImagePlus, Trash2, X, Eye, EyeOff } from "lucide-svelte";
  import { defaultHue } from "$lib/marble";
  import type { Project } from "$lib/api";
  import { applyCap, toCapMode, type CapMode } from "$lib/capitalize";
  import { projects } from "$lib/projects.svelte";
  import ProjectAvatar from "./ProjectAvatar.svelte";

  let { project, onClose }: { project: Project; onClose: () => void } = $props();

  let tab = $state<"auto" | "emoji" | "image">(project.avatarType as "auto" | "emoji" | "image");
  const live = $derived(project ? (projects.byId(project.id) ?? project) : project);
  let confirmDelete = $state(false);

  // Name + parents state. parentsDraft mirrors the persisted parentIds while
  // the user edits, so additions/removals show instantly without a server hop.
  let nameDraft = $state(project.name);
  let parentsDraft = $state<string[]>([...project.parentIds]);
  let nameEl: HTMLInputElement | undefined = $state();

  const parentObjects = $derived(
    parentsDraft.map((id) => projects.byId(id)).filter((p): p is Project => !!p),
  );

  let pickerHost: HTMLDivElement | undefined = $state();
  let fileEl: HTMLInputElement | undefined = $state();
  let busy = $state(false);

  // Local preview copy so the avatar updates instantly.
  let preview = $state<Project>({ ...project });

  let hueDraft = $state(project.hue ?? defaultHue(project.name));
  let hueTimer: ReturnType<typeof setTimeout> | null = null;

  // ── "@mention" parent picker ────────────────────────────────────
  // Typing `@query` opens a project list. Choosing one adds it to
  // parentsDraft and strips the typed `@query…` chunk from the name.
  let mentionOpen = $state(false);
  let mentionItems = $state<Project[]>([]);
  let mentionActive = $state(0);
  let mStart = 0;
  let mEnd = 0;

  function detectMention() {
    const el = nameEl;
    if (!el) return (mentionOpen = false);
    const caret = el.selectionStart ?? nameDraft.length;
    const m = nameDraft.slice(0, caret).match(/@([^\s@]*)$/);
    if (!m) return (mentionOpen = false);
    mStart = caret - m[0].length;
    mEnd = caret;
    const q = m[1].trim().toLowerCase();
    // Exclude self + all descendants (cycle-safe) and already-added parents.
    const exclude = projects.descendantIds(project.id);
    for (const id of parentsDraft) exclude.add(id);
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

  function chooseParent(p: Project) {
    parentsDraft = [...parentsDraft, p.id];
    nameDraft = nameDraft.slice(0, mStart) + nameDraft.slice(mEnd);
    mentionOpen = false;
    requestAnimationFrame(() => {
      nameEl?.focus();
      nameEl?.setSelectionRange(mStart, mStart);
    });
  }

  function removeParent(id: string) {
    parentsDraft = parentsDraft.filter((x) => x !== id);
  }

  function onNameKeydown(e: KeyboardEvent) {
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        mentionActive = (mentionActive + 1) % mentionItems.length;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        mentionActive = (mentionActive - 1 + mentionItems.length) % mentionItems.length;
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        chooseParent(mentionItems[mentionActive]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        mentionOpen = false;
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  // Save name + parents whenever something actually changed.
  async function commit() {
    if (!project) return;
    mentionOpen = false;
    const name = nameDraft.trim();
    const cur = projects.byId(project.id) ?? project;
    const patch: { name?: string; parentIds?: string[] } = {};
    if (name && name !== cur.name) patch.name = name;
    const samePar =
      parentsDraft.length === cur.parentIds.length &&
      parentsDraft.every((id, i) => id === cur.parentIds[i]);
    if (!samePar) patch.parentIds = parentsDraft;
    if (Object.keys(patch).length) await projects.update(project.id, patch);
  }

  function cancel() {
    nameDraft = live.name;
    parentsDraft = [...live.parentIds];
    mentionOpen = false;
    nameEl?.blur();
  }

  async function toggleHidden() {
    busy = true;
    await projects.update(project.id, { hidden: !live.hidden });
    busy = false;
  }

  async function remove() {
    busy = true;
    await projects.remove(project.id);
    onClose();
  }

  function setHue(v: number) {
    hueDraft = v;
    preview = { ...preview, avatarType: "auto", hue: v } as Project;
    if (hueTimer) clearTimeout(hueTimer);
    hueTimer = setTimeout(() => projects.update(project.id, { avatarType: "auto", hue: v }), 250);
  }

  onMount(async () => {
    await import("emoji-picker-element");
  });

  async function pick(patch: Partial<Project>) {
    busy = true;
    preview = { ...preview, ...patch } as Project;
    await projects.update(project.id, patch as never);
    busy = false;
  }

  const capMode = $derived(toCapMode(live.capitalization));
  async function setCap(mode: CapMode) {
    if (mode === capMode) return;
    await projects.update(project.id, { capitalization: mode } as never);
  }
  const capPreview = (mode: CapMode) => applyCap(live.name || "Aa", mode, true);

  $effect(() => {
    if (tab !== "emoji" || !pickerHost) return;
    const el = document.createElement("emoji-picker");
    el.classList.add("light");
    el.addEventListener("emoji-click", (e) => {
      const u = (e as unknown as { detail?: { unicode?: string } }).detail?.unicode;
      if (u) pick({ avatarType: "emoji", emoji: u });
    });
    pickerHost.replaceChildren(el);
  });

  function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const s = 128;
        const canvas = document.createElement("canvas");
        canvas.width = s;
        canvas.height = s;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.max(s / img.width, s / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
        pick({ avatarType: "image", image: canvas.toDataURL("image/jpeg", 0.82) });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(f);
  }
</script>

<div class="space-y-4">
  <div class="flex items-start gap-3">
    <ProjectAvatar project={preview} size={44} />
    <div class="min-w-0 flex-1">
      <div class="relative">
        <input
          bind:this={nameEl}
          bind:value={nameDraft}
          oninput={detectMention}
          onclick={detectMention}
          onkeyup={detectMention}
          onkeydown={onNameKeydown}
          onblur={() => setTimeout(commit, 150)}
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
                  chooseParent(p);
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
      <!-- Parents — always shown below the name in the editor. -->
      <div class="mt-2 flex flex-wrap items-center gap-1.5 min-h-[20px]">
        {#each parentObjects as p (p.id)}
          <span class="pill pill-project">
            <ProjectAvatar project={p} size={12} />
            {applyCap(p.name, toCapMode(p.capitalization), true)}
            <button
              type="button"
              onclick={() => removeParent(p.id)}
              aria-label="Remove parent"
              class="ml-0.5 text-[var(--color-ink-3)] hover:text-[var(--color-danger)]"
            >
              <X size={10} />
            </button>
          </span>
        {:else}
          <span class="text-[11px] text-[var(--color-ink-3)]">Type @ to nest under another project</span>
        {/each}
      </div>
    </div>
  </div>

  <div class="flex gap-1.5 p-1 rounded-2xl bg-[var(--color-surface)]">
    {#each [["auto", Shuffle, "Auto"], ["emoji", Smile, "Emoji"], ["image", ImagePlus, "Image"]] as [id, Icon, label] (id)}
      {@const Comp = Icon as typeof Shuffle}
      <button
        onclick={() => {
          tab = id as typeof tab;
          if (id === "auto") pick({ avatarType: "auto" });
          if (id === "image") fileEl?.click();
        }}
        class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-medium transition-colors
          {tab === id ? 'bg-[var(--color-surface-3)] text-[var(--color-ink)]' : 'text-[var(--color-ink-3)]'}"
      >
        <Comp size={14} />
        {label}
      </button>
    {/each}
  </div>

  {#if tab === "auto"}
    <div class="px-1">
      <label
        for="hue"
        class="block text-[11px] uppercase tracking-wider text-[var(--color-ink-3)] mb-2"
      >
        Color
      </label>
      <input
        id="hue"
        type="range"
        min="0"
        max="360"
        value={hueDraft}
        oninput={(e) => setHue(Number(e.currentTarget.value))}
        class="hue-slider w-full"
      />
    </div>
  {/if}

  {#if tab === "emoji"}
    <div bind:this={pickerHost} class="rounded-2xl overflow-hidden"></div>
  {/if}

  <input bind:this={fileEl} type="file" accept="image/*" class="hidden" onchange={onFile} />

  <div class="px-1">
    <div class="text-[11px] uppercase tracking-wider text-[var(--color-ink-3)] mb-2">
      Capitalization
    </div>
    <div class="flex gap-1.5 p-1 rounded-2xl bg-[var(--color-surface)]">
      {#each [["sentence", "Sentence"], ["lower", "lower"], ["capitalized", "Capitalized"], ["upper", "UPPER"]] as [id, label] (id)}
        <button
          type="button"
          onclick={() => setCap(id as CapMode)}
          class="flex-1 py-1.5 rounded-xl text-[12px] font-medium transition-colors
            {capMode === id
            ? 'bg-[var(--color-surface-3)] text-[var(--color-ink)]'
            : 'text-[var(--color-ink-3)]'}"
          title={capPreview(id as CapMode)}
        >
          {label}
        </button>
      {/each}
    </div>
  </div>

  <button
    onclick={onClose}
    disabled={busy}
    class="w-full py-2.5 rounded-2xl bg-[var(--color-accent)] text-[var(--color-bg)] text-[13px] font-medium
      active:scale-[0.98] transition-transform disabled:opacity-50"
  >
    Done
  </button>

  {#if confirmDelete}
    <div class="flex items-center gap-2">
      <button
        onclick={remove}
        disabled={busy}
        class="flex-1 py-2.5 rounded-2xl bg-[var(--color-danger)] text-white text-[13px] font-medium
          active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        Delete “{live.name}”
      </button>
      <button
        onclick={() => (confirmDelete = false)}
        class="px-4 py-2.5 rounded-2xl bg-[var(--color-surface)] text-[13px] font-medium
          text-[var(--color-ink-2)]"
      >
        Cancel
      </button>
    </div>
  {:else}
    <div class="flex items-center gap-2">
      <button
        onclick={toggleHidden}
        disabled={busy}
        class="flex-1 flex items-center justify-center gap-2 py-2 text-[12px] font-medium
          text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors disabled:opacity-50"
      >
        {#if live.hidden}
          <Eye size={13} />
          Unhide
        {:else}
          <EyeOff size={13} />
          Hide
        {/if}
      </button>
      <button
        onclick={() => (confirmDelete = true)}
        class="flex-1 flex items-center justify-center gap-2 py-2 text-[12px] font-medium
          text-[var(--color-ink-3)] hover:text-[var(--color-danger)] transition-colors"
      >
        <Trash2 size={13} />
        Delete
      </button>
    </div>
  {/if}
</div>

<style>
  .hue-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 14px;
    border-radius: 999px;
    outline: none;
    background: linear-gradient(
      to right,
      oklch(65% 0.18 0),
      oklch(65% 0.18 60),
      oklch(65% 0.18 120),
      oklch(65% 0.18 180),
      oklch(65% 0.18 240),
      oklch(65% 0.18 300),
      oklch(65% 0.18 360)
    );
  }
  .hue-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #fff;
    border: 2px solid rgba(0, 0, 0, 0.25);
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
  .hue-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #fff;
    border: 2px solid rgba(0, 0, 0, 0.25);
    cursor: pointer;
  }
  .pill-muted {
    opacity: 0.7;
  }
</style>
