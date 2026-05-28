<script lang="ts">
  import { ChevronLeft } from "lucide-svelte";
  import { goto } from "$app/navigation";

  const updated = "May 28, 2026";
</script>

<svelte:head>
  <title>Privacy Policy — PureType</title>
  <meta name="description" content="PureType privacy policy. What we collect, why, and how to delete it." />
</svelte:head>

<div class="mx-auto max-w-2xl px-6 py-10 text-ink">
  <button
    class="mb-6 flex items-center gap-1 text-ink-2 hover:text-ink"
    onclick={() => goto("/")}
    type="button"
  >
    <ChevronLeft size={18} /> Back
  </button>

  <h1 class="font-display text-3xl font-semibold mb-2">Privacy Policy</h1>
  <p class="text-ink-3 text-sm mb-8">Last updated: {updated}</p>

  <div class="space-y-6 text-ink-2 leading-relaxed">
    <p>
      PureType is a minimal todo app. We collect the smallest amount of data
      needed to make the app work. This page explains exactly what that is.
    </p>

    <section>
      <h2 class="text-ink font-semibold mb-2">What we collect</h2>
      <ul class="list-disc pl-5 space-y-1">
        <li><span class="text-ink">Your tasks.</span> The text you type or dictate, plus dates, projects, and completion state.</li>
        <li><span class="text-ink">An account ID.</span> Created automatically on first launch. Anonymous until you sign in.</li>
        <li><span class="text-ink">Your email,</span> only if you sign in with Apple or Google to sync across devices.</li>
        <li><span class="text-ink">Voice recordings,</span> only while you hold the microphone button. The audio is sent for transcription and then discarded — we don't keep the audio file.</li>
      </ul>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">What we don't collect</h2>
      <ul class="list-disc pl-5 space-y-1">
        <li>No tracking. No advertising identifiers. No third-party analytics.</li>
        <li>No location, no contacts, no calendar, no photos.</li>
        <li>No background microphone access. The mic only runs while you hold the button.</li>
      </ul>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Where your data goes</h2>
      <p>
        Tasks are stored on our servers (Turso, hosted in the EU) so they can
        sync across your devices. Voice audio is routed through the Vercel AI
        Gateway to a transcription model (Google Gemini) and discarded after the
        text comes back. Authentication is handled by Apple and Google when you
        choose to sign in.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Deleting your data</h2>
      <p>
        Open <span class="font-mono text-ink">Settings → Delete account</span> to
        wipe your tasks and account from our servers. You can also email
        <a class="text-accent hover:text-accent-hover" href="mailto:support@puretype.app">support@puretype.app</a>
        and we'll do it for you within 7 days.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Children</h2>
      <p>
        PureType is rated 4+. We do not knowingly collect data from children
        under 13. If you believe a child has created an account, email us and
        we'll delete it.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Changes</h2>
      <p>
        If we change this policy in a way that affects what we collect, we'll
        update the date above and surface a notice in the app before the change
        takes effect.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Contact</h2>
      <p>
        Questions? <a class="text-accent hover:text-accent-hover" href="mailto:support@puretype.app">support@puretype.app</a>
      </p>
    </section>
  </div>
</div>
