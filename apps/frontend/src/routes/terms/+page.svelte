<script lang="ts">
  import { ChevronLeft } from "lucide-svelte";
  import { goto } from "$app/navigation";

  const updated = "May 28, 2026";
</script>

<svelte:head>
  <title>Terms of Service — PureType</title>
  <meta name="description" content="PureType terms of service." />
</svelte:head>

<div class="mx-auto max-w-2xl px-6 py-10 text-ink">
  <button
    class="mb-6 flex items-center gap-1 text-ink-2 hover:text-ink"
    onclick={() => goto("/")}
    type="button"
  >
    <ChevronLeft size={18} /> Back
  </button>

  <h1 class="font-display text-3xl font-semibold mb-2">Terms of Service</h1>
  <p class="text-ink-3 text-sm mb-8">Last updated: {updated}</p>

  <div class="space-y-6 text-ink-2 leading-relaxed">
    <p>
      By using PureType you agree to these terms. They're short on purpose.
    </p>

    <section>
      <h2 class="text-ink font-semibold mb-2">The service</h2>
      <p>
        PureType is a todo app that turns plain text into structured tasks. It
        is provided as-is. We may change, pause, or end the service at any time
        without notice. If we shut down, we'll give you a way to export your
        tasks first.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Your account</h2>
      <p>
        You can use PureType anonymously, or sign in with Apple or Google to
        sync across devices. You are responsible for what you write in your
        tasks and for keeping your sign-in credentials safe.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Acceptable use</h2>
      <ul class="list-disc pl-5 space-y-1">
        <li>Don't use PureType to break the law or harm others.</li>
        <li>Don't try to reverse-engineer, attack, or overload our servers.</li>
        <li>Don't use PureType to store content that is illegal where you live.</li>
      </ul>
      <p class="mt-2">
        We may suspend accounts that abuse the service.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Your content</h2>
      <p>
        Your tasks belong to you. We only process them to make the app work —
        sync, voice transcription, and showing the list back to you. We don't
        train models on your data. We don't sell your data.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Cancellation and deletion</h2>
      <p>
        You can delete your account from
        <span class="font-mono text-ink">Settings → Delete account</span>. That
        removes your tasks and account from our servers. There is no
        subscription to cancel — PureType is free in this version.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Disclaimer and liability</h2>
      <p>
        PureType is provided without warranty of any kind. To the extent
        permitted by law, we are not liable for any indirect or consequential
        loss arising from your use of the app. Don't use PureType as the only
        place you store information you can't afford to lose.
      </p>
    </section>

    <section>
      <h2 class="text-ink font-semibold mb-2">Changes</h2>
      <p>
        If we change these terms in a material way, we'll update the date above
        and surface a notice in the app.
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
