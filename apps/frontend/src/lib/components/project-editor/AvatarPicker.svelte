<script lang="ts">
  import { ImagePlus, Shuffle, Smile } from "lucide-svelte";
  import { onMount } from "svelte";
  import type { Project } from "$lib/api";

  let {
    tab = $bindable<"auto" | "emoji" | "image">(),
    hue = $bindable<number>(),
    onAutoPick,
    onPick,
  }: {
    tab: "auto" | "emoji" | "image";
    hue: number;
    onAutoPick: () => void;
    onPick: (patch: Partial<Project>) => void;
  } = $props();

  let pickerHost: HTMLDivElement | undefined = $state();
  let fileEl: HTMLInputElement | undefined = $state();
  let hueTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    await import("emoji-picker-element");
  });

  function setHue(v: number) {
    hue = v;
    if (hueTimer) clearTimeout(hueTimer);
    hueTimer = setTimeout(() => onPick({ avatarType: "auto", hue: v }), 250);
  }

  $effect(() => {
    if (tab !== "emoji" || !pickerHost) return;
    const el = document.createElement("emoji-picker");
    el.classList.add("light");
    el.addEventListener("emoji-click", (e) => {
      const u = (e as unknown as { detail?: { unicode?: string } }).detail?.unicode;
      if (u) onPick({ avatarType: "emoji", emoji: u });
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
        onPick({ avatarType: "image", image: canvas.toDataURL("image/jpeg", 0.82) });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(f);
  }
</script>

<div class="flex gap-1.5 p-1 rounded-2xl bg-[var(--color-surface)]">
  {#each [["auto", Shuffle, "Auto"], ["emoji", Smile, "Emoji"], ["image", ImagePlus, "Image"]] as [id, Icon, label] (id)}
    {@const Comp = Icon as typeof Shuffle}
    <button
      onclick={() => {
        tab = id as typeof tab;
        if (id === "auto") onAutoPick();
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
    <label for="hue" class="block text-[11px] uppercase tracking-wider text-[var(--color-ink-3)] mb-2">Color</label>
    <input
      id="hue"
      type="range"
      min="0"
      max="360"
      value={hue}
      oninput={(e) => setHue(Number(e.currentTarget.value))}
      class="hue-slider w-full"
    />
  </div>
{/if}

{#if tab === "emoji"}
  <div bind:this={pickerHost} class="rounded-2xl overflow-hidden"></div>
{/if}

<input bind:this={fileEl} type="file" accept="image/*" class="hidden" onchange={onFile} />

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
</style>
