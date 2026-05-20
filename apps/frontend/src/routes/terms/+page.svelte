<script lang="ts">
  const lastUpdated = "May 2026";
  const contactEmail = "todoro.app.atma@gmail.com";
</script>

<svelte:head>
  <title>Terms of Service — Eos</title>
</svelte:head>

<div
  class="flex min-h-dvh flex-col mt-4"
  style="background-color: var(--color-bg); color: var(--color-ink);"
>
  <header class="safe-top px-4 pb-2 max-w-2xl mx-auto w-full">
    <a
      href="/profile"
      class="text-sm"
      style="color: var(--color-ink-2);"
    >← Back</a>
  </header>

  <main
    class="mx-auto w-full max-w-2xl flex-1 px-4 py-6"
    style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);"
  >
    <h1
      style="font-family: var(--font-display); font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem;"
    >
      Terms of Service
    </h1>
    <p
      style="color: var(--color-ink-3); font-size: 0.8125rem; margin-bottom: 1.5rem;"
    >
      Last updated: {lastUpdated}
    </p>

    <section
      class="flex flex-col gap-4"
      style="font-size: 0.9375rem; line-height: 1.7; color: var(--color-ink-2);"
    >
      <p>
        By using Eos you agree to these terms. If you do not agree, do not use
        the app.
      </p>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        Your account
      </h2>
      <p>
        You sign in with Google or Apple, or use the app anonymously. Keep
        your account secure — actions taken with your account are your
        responsibility.
      </p>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        Your content
      </h2>
      <p>
        You retain ownership of every task, project, and note you create. You
        grant us a limited license to store and sync that content across your
        devices, including, if you connect Telegram, turning messages you send
        to the Eos bot into tasks on your account.
      </p>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        Acceptable use
      </h2>
      <ul style="padding-left: 1.25rem; list-style: disc;">
        <li>No scraping, bot attacks, or attempts to overload the service.</li>
        <li>No automated mass-creation of tasks, projects, or accounts.</li>
        <li>No harassment, hate content, or content harmful to minors.</li>
      </ul>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        Service availability
      </h2>
      <p>
        Eos is provided "as is". We do our best to keep it running but offer
        no uptime guarantee. Features may change without notice during this
        early stage.
      </p>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        Termination
      </h2>
      <p>
        You can sign out and delete your account anytime. We may suspend
        accounts that violate these terms.
      </p>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        Liability
      </h2>
      <p>
        To the extent permitted by law, Eos is not liable for indirect,
        incidental, or consequential damages arising from use of the service.
      </p>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        Contact
      </h2>
      <p>
        Questions: <a
          href="mailto:{contactEmail}"
          style="color: var(--color-accent);">{contactEmail}</a
        >
      </p>
    </section>
  </main>
</div>
