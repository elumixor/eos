<script lang="ts">
  import { X } from "lucide-svelte";
  import { tasks as tasksStore } from "$lib/tasks.svelte";
  import { voiceTurn } from "$lib/voice-turn.svelte";
  import TaskContent from "./TaskContent.svelte";
  import VoiceVisualizer from "./VoiceVisualizer.svelte";

  let { bubble = $bindable<HTMLDivElement | undefined>() }: { bubble?: HTMLDivElement } = $props();
</script>

{#if voiceTurn.message || voiceTurn.loading || voiceTurn.recording}
  <div
    bind:this={bubble}
    class="relative px-4 pt-3 pb-6 -mb-4 rounded-t-2xl bg-[var(--color-accent)]
      border border-b-0 border-[var(--color-accent)] animate-fade-up"
  >
    {#if voiceTurn.recording}
      <VoiceVisualizer stream={voiceTurn.stream} />
    {:else if voiceTurn.loading && !voiceTurn.message}
      <div class="flex items-center justify-center h-14">
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-white animate-voice-bounce [animation-delay:-0.32s]"></span>
          <span class="w-2 h-2 rounded-full bg-white animate-voice-bounce [animation-delay:-0.16s]"></span>
          <span class="w-2 h-2 rounded-full bg-white animate-voice-bounce"></span>
        </div>
      </div>
    {:else}
      <div class="flex items-start gap-3">
        <p class="flex-1 min-h-[18px] text-[13px] font-light leading-relaxed text-white whitespace-pre-wrap">
          {voiceTurn.message}{#if voiceTurn.loading}<span
              class="inline-block w-1.5 h-1.5 ml-1 align-middle rounded-full bg-white animate-pulse"
            ></span>{/if}
        </p>
        {#if !voiceTurn.loading && voiceTurn.message}
          <div class="shrink-0 -mt-0.5 flex items-center gap-1">
            {#if voiceTurn.canUndo}
              <button
                onclick={() => voiceTurn.undo()}
                aria-label="Undo last voice turn"
                title="Undo (⌘Z)"
                class="px-2 py-0.5 rounded-lg text-[11px] font-medium text-white/90
                  hover:text-white hover:bg-white/15 transition-colors"
              >
                Undo
              </button>
            {:else if voiceTurn.canRedo}
              <button
                onclick={() => voiceTurn.redo()}
                aria-label="Redo last voice turn"
                title="Redo (⌘⇧Z)"
                class="px-2 py-0.5 rounded-lg text-[11px] font-medium text-white/90
                  hover:text-white hover:bg-white/15 transition-colors"
              >
                Redo
              </button>
            {/if}
            <button
              onclick={() => voiceTurn.dismiss()}
              aria-label="Dismiss"
              class="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        {/if}
      </div>
      {#if voiceTurn.taskRefs.length > 0}
        <ul class="mt-3 space-y-1.5">
          {#each voiceTurn.taskRefs as id (id)}
            {@const t = tasksStore.byId(id)}
            {#if t}
              <li class="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg)] shadow-sm">
                <span
                  class="mt-1 shrink-0 w-3.5 h-3.5 rounded-sm border
                    {t.completed ? 'bg-[var(--color-accent)] border-[var(--color-accent)]' : 'border-[var(--color-ink-3)]'}"
                ></span>
                <div class="flex-1 min-w-0">
                  <TaskContent task={t} dimmed={t.completed} />
                </div>
              </li>
            {/if}
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
{/if}
