<script lang="ts">
  import { ChevronLeft } from "lucide-svelte";
  import { goto } from "$app/navigation";
</script>

<svelte:head>
  <title>Support — PureType</title>
  <meta name="description" content="Get help with PureType." />
</svelte:head>

<div class="mx-auto max-w-2xl px-6 py-10 text-ink">
  <button
    class="mb-6 flex items-center gap-1 text-ink-2 hover:text-ink"
    onclick={() => goto("/")}
    type="button"
  >
    <ChevronLeft size={18} /> Back
  </button>

  <h1 class="font-display text-3xl font-semibold mb-2">Support</h1>
  <p class="text-ink-3 text-sm mb-8">We read every message.</p>

  <div class="space-y-6 text-ink-2 leading-relaxed">
    <section>
      <h2 class="text-ink font-semibold mb-2">Contact</h2>
      <p>
        Email <a class="text-accent hover:text-accent-hover" href="mailto:support@puretype.app">support@puretype.app</a>.
        Bug reports, feature ideas, and "this thing confused me" notes are all
        welcome. We usually reply within two business days.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Quick tips</h2>
      <ul class="list-disc pl-5 space-y-2">
        <li>
          <span class="text-ink">Type natural language.</span> Try
          <span class="font-mono text-ink">"gym tomorrow 9am 45min @health"</span> — date, time, duration, and project become chips inline.
        </li>
        <li>
          <span class="text-ink">Voice.</span> Hold the microphone button, speak,
          release. The transcript is parsed the same way as typing.
        </li>
        <li>
          <span class="text-ink">Archive.</span> Swipe a task left to archive.
          Open the Archive tab to restore.
        </li>
        <li>
          <span class="text-ink">Sync.</span> Sign in with Apple or Google in
          Settings to sync across devices. Sign-in is optional.
        </li>
      </ul>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Delete account</h2>
      <p>
        Settings → Delete account removes everything from our servers. If you
        can't reach the screen, email us and we'll wipe it for you.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Status</h2>
      <p>
        If the app feels offline, your tasks are kept locally and will sync once
        the connection comes back. Voice transcription needs an internet
        connection to work.
      </p>
    </section>
  </div>
</div>
