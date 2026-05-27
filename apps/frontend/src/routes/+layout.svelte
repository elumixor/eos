<script>
  import "../app.css";
  // Side-effect import: kicks off the anonymous-auth bootstrap so `authReady`
  // resolves and api calls can fire. Don't remove even if `auth` looks unused.
  import "$lib/auth.svelte";
  // Side-effect import: wires online/offline/visibility listeners and the
  // 30s heartbeat. Stores call sync.schedule() on enqueue; this just makes
  // sure the background triggers are armed early.
  import "$lib/sync.svelte";
  let { children } = $props();
</script>

{@render children()}
