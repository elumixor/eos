<script lang="ts">
  import { onMount } from "svelte";
  import { Shuffle, Smile, ImagePlus, Trash2 } from "lucide-svelte";
  import type { Project } from "$lib/api";
  import { projects } from "$lib/projects.svelte";
  import ProjectAvatar from "./ProjectAvatar.svelte";

  let { project, onClose }: { project: Project; onClose: () => void } = $props();

  let tab = $state<"auto" | "emoji" | "image">(project.avatarType as "auto" | "emoji" | "image");
  const live = $derived(projects.byId(project.id) ?? project);
  let confirmDelete = $state(false);
  let editingName = $state(false);
  let nameDraft = $state(project.name);
  let nameEl: HTMLInputElement | undefined = $state();

  function startRename() {
    nameDraft = live.name;
    editingName = true;
    requestAnimationFrame(() => nameEl?.select());
  }

  async function commitName() {
    if (!editingName) return;
    editingName = false;
    const name = nameDraft.trim();
    if (name && name !== live.name) await projects.update(project.id, { name });
  }

  async function remove() {
    busy = true;
    await projects.remove(project.id);
    onClose();
  }
  let pickerHost: HTMLDivElement | undefined = $state();
  let fileEl: HTMLInputElement | undefined = $state();
  let busy = $state(false);

  // Local preview copy so the avatar updates instantly.
  let preview = $state<Project>({ ...project });

  onMount(async () => {
    await import("emoji-picker-element");
  });

  async function pick(patch: Partial<Project>) {
    busy = true;
    preview = { ...preview, ...patch } as Project;
    await projects.update(project.id, patch as never);
    busy = false;
  }

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
  <div class="flex items-center gap-3">
    <ProjectAvatar project={preview} size={44} />
    <div class="min-w-0">
      {#if editingName}
        <input
          bind:this={nameEl}
          bind:value={nameDraft}
          onblur={commitName}
          onkeydown={(e) => {
            if (e.key === "Enter") commitName();
            if (e.key === "Escape") editingName = false;
          }}
          class="w-full bg-transparent text-sm font-semibold outline-none border-b
            border-[var(--color-accent)] pb-0.5 text-[var(--color-ink)]"
        />
      {:else}
        <button
          onclick={startRename}
          class="block max-w-full truncate text-sm font-semibold text-left
            hover:text-[var(--color-accent)] transition-colors"
        >
          {live.name}
        </button>
      {/if}
      <p class="text-[11px] text-[var(--color-ink-3)]">Tap name to rename</p>
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

  {#if tab === "emoji"}
    <div bind:this={pickerHost} class="rounded-2xl overflow-hidden"></div>
  {/if}

  <input bind:this={fileEl} type="file" accept="image/*" class="hidden" onchange={onFile} />

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
    <button
      onclick={() => (confirmDelete = true)}
      class="w-full flex items-center justify-center gap-2 py-2 text-[12px] font-medium
        text-[var(--color-ink-3)] hover:text-[var(--color-danger)] transition-colors"
    >
      <Trash2 size={13} />
      Delete project
    </button>
  {/if}
</div>
