<script lang="ts">
  import { Trash2 } from "lucide-svelte";
  import type { Section } from "$lib/api";
  import { sections, type SectionSpec } from "$lib/sections.svelte";
  import { localISO, parseRangeQuery } from "$lib/tokens";

  let {
    section,
    onClose,
  }: {
    section: Section | null;
    onClose: () => void;
  } = $props();

  const today = localISO(new Date(), false);

  let name = $state(section?.name ?? "");
  let rangeKind = $state<SectionSpec["rangeKind"]>(
    (section?.rangeKind as SectionSpec["rangeKind"]) ?? "calendar",
  );
  let unit = $state<NonNullable<SectionSpec["unit"]>>(
    (section?.unit as NonNullable<SectionSpec["unit"]>) ?? "week",
  );
  let offset = $state(section?.offset ?? 0);
  let count = $state(section?.count ?? 3);
  let startDate = $state(section?.startDate ?? today);
  let endDate = $state(section?.endDate ?? today);

  const kinds: { id: SectionSpec["rangeKind"]; label: string }[] = [
    { id: "calendar", label: "Calendar" },
    { id: "relative", label: "Relative" },
    { id: "absolute", label: "Absolute" },
  ];
  const units: NonNullable<SectionSpec["unit"]>[] = ["day", "week", "month", "year"];
  const offsets = [
    { v: -1, label: "Last" },
    { v: 0, label: "This" },
    { v: 1, label: "Next" },
  ];
  const presets = ["This week", "This month", "This year", "Next 3 days", "Next 3 weeks"];

  function applyPreset(p: string) {
    const spec = parseRangeQuery(p);
    if (!spec) return;
    rangeKind = spec.rangeKind;
    if (spec.unit) unit = spec.unit;
    if (spec.offset !== undefined) offset = spec.offset;
    if (spec.count != null) count = spec.count;
    if (!name.trim()) name = p;
  }

  async function save() {
    const n = name.trim();
    if (!n) return;
    const spec: SectionSpec = { name: n, rangeKind };
    if (rangeKind === "calendar") {
      spec.unit = unit;
      spec.offset = offset;
    } else if (rangeKind === "relative") {
      spec.unit = unit;
      spec.count = count;
    } else {
      spec.startDate = startDate;
      spec.endDate = endDate;
    }
    if (section) await sections.update(section.id, spec);
    else await sections.create(spec);
    onClose();
  }

  async function remove() {
    if (section) await sections.remove(section.id);
    onClose();
  }
</script>

<button
  type="button"
  aria-label="Close"
  class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-fade-in"
  onclick={onClose}
></button>
<div
  class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[min(92vw,400px)]
    p-5 rounded-3xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
    shadow-2xl shadow-black/50 animate-scale-in space-y-4"
>
  <h3 class="text-base font-semibold tracking-tight">
    {section ? "Edit section" : "New section"}
  </h3>

  <input
    bind:value={name}
    placeholder="Section name"
    class="w-full h-11 px-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]
      text-[14px] outline-none focus:border-[var(--color-accent)] transition-colors"
  />

  <div class="flex flex-wrap gap-1.5">
    {#each presets as p}
      <button
        type="button"
        onclick={() => applyPreset(p)}
        class="px-2.5 h-7 rounded-lg text-[11px] font-medium bg-[var(--color-surface)]
          hover:bg-[var(--color-surface-3)] text-[var(--color-ink-2)] transition-colors"
      >
        {p}
      </button>
    {/each}
  </div>

  <div class="flex gap-1.5">
    {#each kinds as k}
      <button
        type="button"
        onclick={() => (rangeKind = k.id)}
        class="flex-1 h-9 rounded-xl text-[12px] font-medium transition-colors
          {rangeKind === k.id
            ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
            : 'bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-3)]'}"
      >
        {k.label}
      </button>
    {/each}
  </div>

  {#if rangeKind === "calendar"}
    <div class="flex gap-1.5">
      {#each offsets as o}
        <button
          type="button"
          onclick={() => (offset = o.v)}
          class="flex-1 h-9 rounded-xl text-[12px] transition-colors
            {offset === o.v
              ? 'bg-[var(--color-accent-dim)] text-[var(--color-ink)]'
              : 'bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-3)]'}"
        >
          {o.label}
        </button>
      {/each}
    </div>
    <div class="flex gap-1.5">
      {#each units as u}
        <button
          type="button"
          onclick={() => (unit = u)}
          class="flex-1 h-9 rounded-xl text-[12px] capitalize transition-colors
            {unit === u
              ? 'bg-[var(--color-accent-dim)] text-[var(--color-ink)]'
              : 'bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-3)]'}"
        >
          {u}
        </button>
      {/each}
    </div>
  {:else if rangeKind === "relative"}
    <div class="flex items-center gap-2 text-[13px] text-[var(--color-ink-2)]">
      <span>Next</span>
      <input
        type="number"
        min="1"
        bind:value={count}
        class="w-16 h-9 px-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]
          text-center outline-none focus:border-[var(--color-accent)]"
      />
      <div class="flex gap-1.5 flex-1">
        {#each units as u}
          <button
            type="button"
            onclick={() => (unit = u)}
            class="flex-1 h-9 rounded-xl text-[12px] capitalize transition-colors
              {unit === u
                ? 'bg-[var(--color-accent-dim)] text-[var(--color-ink)]'
                : 'bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-3)]'}"
          >
            {u}{count === 1 ? "" : "s"}
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <div class="flex items-center gap-2 text-[13px] text-[var(--color-ink-2)]">
      <input
        type="date"
        bind:value={startDate}
        class="flex-1 h-9 px-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]
          outline-none focus:border-[var(--color-accent)]"
      />
      <span>→</span>
      <input
        type="date"
        bind:value={endDate}
        class="flex-1 h-9 px-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]
          outline-none focus:border-[var(--color-accent)]"
      />
    </div>
  {/if}

  <div class="flex items-center gap-2 pt-1">
    {#if section}
      <button
        type="button"
        onclick={remove}
        aria-label="Delete section"
        class="w-11 h-11 rounded-2xl bg-[var(--color-surface)] hover:bg-red-500/15
          flex items-center justify-center text-[var(--color-ink-3)] hover:text-red-400 transition-colors"
      >
        <Trash2 size={16} />
      </button>
    {/if}
    <button
      type="button"
      onclick={onClose}
      class="flex-1 h-11 rounded-2xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-3)]
        text-[13px] font-medium text-[var(--color-ink-2)] transition-colors"
    >
      Cancel
    </button>
    <button
      type="button"
      onclick={save}
      class="flex-1 h-11 rounded-2xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]
        text-[13px] font-medium text-[var(--color-bg)] transition-colors"
    >
      Save
    </button>
  </div>
</div>
