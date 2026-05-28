<script lang="ts">
  import { ChevronLeft, RefreshCw } from "lucide-svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api/client";

  type Metrics = typeof api.admin.metrics.$get.$response;

  let data = $state<Metrics | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      data = await api.admin.metrics.$get();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error = msg.includes("403")
        ? "Your account is not in the admin allowlist. Add your email to ADMIN_EMAILS on the backend."
        : msg;
    } finally {
      loading = false;
    }
  }

  onMount(load);

  // Find max user count across voice-usage buckets so bars scale to the
  // widest one. Used to render the simple HTML/CSS histogram below.
  const maxBucket = $derived(
    data ? Math.max(1, ...data.voice.distribution.map((b) => b.users)) : 1,
  );
  const maxDau = $derived(data ? Math.max(1, ...data.activity.dau.map((d) => d.users)) : 1);
</script>

<svelte:head>
  <title>Admin — PureType</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-5 pt-10 pb-24 safe-top text-ink">
  <header class="flex items-center justify-between mb-8">
    <div class="flex items-center gap-3">
      <button
        type="button"
        onclick={() => goto("/")}
        aria-label="Back"
        class="w-10 h-10 rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]
          flex items-center justify-center transition-colors"
      >
        <ChevronLeft size={16} class="text-ink-2" />
      </button>
      <h1 class="text-lg font-semibold tracking-tight">Admin · Metrics</h1>
    </div>
    <button
      type="button"
      onclick={load}
      disabled={loading}
      aria-label="Refresh"
      class="w-10 h-10 rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]
        flex items-center justify-center transition-colors disabled:opacity-60"
    >
      <RefreshCw size={15} class="text-ink-2 {loading ? 'animate-spin' : ''}" />
    </button>
  </header>

  {#if error}
    <div class="rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-danger-glow)] p-4 text-sm text-ink-2 mb-6">
      {error}
    </div>
  {/if}

  {#if data}
    <p class="text-[11px] font-mono uppercase tracking-widest text-ink-3 mb-6">
      Last {data.windowDays} days · refreshed {new Date(data.generatedAt).toLocaleString()}
    </p>

    <!-- Users -->
    <section class="mb-10">
      <h2 class="text-[11px] font-mono tracking-widest text-ink-3 uppercase mb-3">Users</h2>
      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-2xl bg-[var(--color-surface-2)] p-4">
          <p class="text-xs text-ink-3">Total</p>
          <p class="text-2xl font-semibold mt-1">{data.users.total.toLocaleString()}</p>
        </div>
        <div class="rounded-2xl bg-[var(--color-surface-2)] p-4">
          <p class="text-xs text-ink-3">Signed in</p>
          <p class="text-2xl font-semibold mt-1">{data.users.signedIn.toLocaleString()}</p>
        </div>
        <div class="rounded-2xl bg-[var(--color-surface-2)] p-4">
          <p class="text-xs text-ink-3">Anonymous</p>
          <p class="text-2xl font-semibold mt-1">{data.users.anonymous.toLocaleString()}</p>
        </div>
      </div>
    </section>

    <!-- Voice — the pricing-critical block -->
    <section class="mb-10">
      <h2 class="text-[11px] font-mono tracking-widest text-ink-3 uppercase mb-3">
        Voice · pricing signal
      </h2>
      <div class="rounded-2xl bg-[var(--color-surface-2)] p-5">
        <div class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-5">
          <div class="flex justify-between">
            <span class="text-ink-2">Calls</span>
            <span class="font-mono">{data.voice.callsTotal.toLocaleString()}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-2">Failed</span>
            <span class="font-mono">{data.voice.failedTotal.toLocaleString()}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-2">Est. AI cost</span>
            <span class="font-mono">${data.voice.estimatedCostUsd.toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-2">Proposed cap</span>
            <span class="font-mono">{data.voice.proposedFreeCap}/day</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-2">p50 max/day</span>
            <span class="font-mono">{data.voice.perUserPerDayP50}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-2">p90 max/day</span>
            <span class="font-mono">{data.voice.perUserPerDayP90}</span>
          </div>
        </div>

        <p class="text-[11px] font-mono uppercase tracking-widest text-ink-3 mb-2">
          Peak calls / user / day
        </p>
        <div class="space-y-2">
          {#each data.voice.distribution as row (row.bucket)}
            <div class="flex items-center gap-3 text-sm">
              <span class="w-14 text-ink-3 font-mono text-xs">{row.bucket}</span>
              <div class="flex-1 h-5 bg-[var(--color-surface-3)] rounded-md overflow-hidden">
                <div
                  class="h-full bg-[var(--color-accent)]"
                  style="width: {(row.users / maxBucket) * 100}%"
                ></div>
              </div>
              <span class="w-10 text-right font-mono text-xs text-ink-2">{row.users}</span>
            </div>
          {/each}
          {#if data.voice.distribution.length === 0}
            <p class="text-xs text-ink-3 italic">No voice usage in window yet.</p>
          {/if}
        </div>

        <p class="text-[11px] text-ink-3 mt-4 leading-relaxed">
          Pricing read: if p90 ≤ cap, the free tier is barely binding and Pro is an
          enthusiast tier. If p50 &gt; cap, the cap drives meaningful conversion —
          add a graceful rate-limit banner before flipping the paywall on.
        </p>
      </div>
    </section>

    <!-- DAU -->
    <section class="mb-10">
      <h2 class="text-[11px] font-mono tracking-widest text-ink-3 uppercase mb-3">
        Daily active users
      </h2>
      <div class="rounded-2xl bg-[var(--color-surface-2)] p-5">
        {#if data.activity.dau.length === 0}
          <p class="text-xs text-ink-3 italic">No activity in window yet.</p>
        {:else}
          <div class="flex items-end gap-1 h-32">
            {#each [...data.activity.dau].reverse() as d (d.day)}
              <div class="flex-1 flex flex-col items-center gap-1" title="{d.day}: {d.users}">
                <div
                  class="w-full bg-[var(--color-accent)] rounded-sm"
                  style="height: {(d.users / maxDau) * 100}%"
                ></div>
              </div>
            {/each}
          </div>
          <p class="text-[11px] text-ink-3 mt-2 font-mono">
            {data.activity.dau[data.activity.dau.length - 1]?.day} … {data.activity.dau[0]?.day}
          </p>
        {/if}
      </div>
    </section>

    <!-- Events -->
    <section class="mb-10">
      <h2 class="text-[11px] font-mono tracking-widest text-ink-3 uppercase mb-3">
        Event totals
      </h2>
      <div class="rounded-2xl bg-[var(--color-surface-2)] p-5 space-y-2">
        {#each data.events as row (row.event)}
          <div class="flex justify-between text-sm">
            <span class="text-ink-2 font-mono">{row.event}</span>
            <span class="font-mono">{row.count.toLocaleString()}</span>
          </div>
        {/each}
        {#if data.events.length === 0}
          <p class="text-xs text-ink-3 italic">No events yet.</p>
        {/if}
      </div>
    </section>

    <!-- Tasks -->
    <section class="mb-10">
      <h2 class="text-[11px] font-mono tracking-widest text-ink-3 uppercase mb-3">Tasks</h2>
      <div class="rounded-2xl bg-[var(--color-surface-2)] p-4">
        <div class="flex justify-between text-sm">
          <span class="text-ink-2">Active (not deleted)</span>
          <span class="font-mono">{data.tasks.activeTotal.toLocaleString()}</span>
        </div>
      </div>
    </section>
  {:else if loading}
    <p class="text-sm text-ink-3 mt-12 text-center">Loading…</p>
  {/if}
</main>
