<script lang="ts">
  import { Loader2 } from "lucide-svelte";
  import RichTaskInput from "./RichTaskInput.svelte";
  import VoiceBubble from "./VoiceBubble.svelte";
  import VoiceButton from "./VoiceButton.svelte";
  import { voiceTurn } from "$lib/voice-turn.svelte";

  let {
    input = $bindable<RichTaskInput | undefined>(),
    bubble = $bindable<HTMLDivElement | undefined>(),
    onSubmit,
    onVoiceRecorded,
  }: {
    input?: RichTaskInput;
    bubble?: HTMLDivElement;
    onSubmit: (text: string) => void;
    onVoiceRecorded: (file: File) => void | Promise<void>;
  } = $props();
</script>

<div class="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
  <div
    class="max-w-md mx-auto px-5 pt-14 pointer-events-auto
      bg-[linear-gradient(to_top,var(--color-bg)_0%,var(--color-bg)_75%,transparent_100%)]"
    style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));"
  >
    <VoiceBubble bind:bubble />
    <div class="relative" data-voice-keep>
      <RichTaskInput bind:this={input} placeholder="@ for project, time, place" onsubmit={onSubmit}>
        {#snippet endSlot()}
          {#if voiceTurn.loading}
            <div class="w-8 h-8 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center">
              <Loader2 size={14} class="animate-spin text-[var(--color-ink-2)]" />
            </div>
          {:else}
            <VoiceButton
              compact
              onRecorded={onVoiceRecorded}
              onError={(m) => voiceTurn.setError(m)}
              onTapSend={() => input?.submit()}
              onStart={(s) => voiceTurn.setRecording(s)}
              onStop={() => voiceTurn.setRecording(null)}
            />
          {/if}
        {/snippet}
      </RichTaskInput>
    </div>
  </div>
</div>
