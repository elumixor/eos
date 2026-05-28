<script lang="ts">
  import { onDestroy } from "svelte";
  import AudioMotionAnalyzer from "audiomotion-analyzer";

  let { stream }: { stream: MediaStream | null } = $props();

  let container: HTMLDivElement | undefined = $state();
  let analyzer: AudioMotionAnalyzer | null = null;
  let audioCtx: AudioContext | null = null;

  $effect(() => {
    if (!container || !stream) return;
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    analyzer = new AudioMotionAnalyzer(container, {
      source,
      audioCtx,
      height: 48,
      mode: 6,
      barSpace: 0.4,
      showScaleX: false,
      showScaleY: false,
      showPeaks: false,
      showBgColor: false,
      overlay: true,
      smoothing: 0.7,
      gradient: "steelblue",
      lumiBars: false,
      reflexRatio: 0,
      ledBars: false,
      radial: false,
      mirror: 0,
    });
    analyzer.registerGradient("white", {
      bgColor: "transparent",
      colorStops: [{ pos: 0, color: "#ffffff" }],
    });
    analyzer.setOptions({ gradient: "white" });

    return () => {
      analyzer?.destroy();
      analyzer = null;
      void audioCtx?.close();
      audioCtx = null;
    };
  });

  onDestroy(() => {
    analyzer?.destroy();
    void audioCtx?.close();
  });
</script>

<div bind:this={container} class="w-full h-12"></div>
