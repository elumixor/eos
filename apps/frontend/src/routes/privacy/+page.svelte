<script lang="ts">
  const lastUpdated = "May 2026";
  const contactEmail = "todoro.app.atma@gmail.com";
</script>

<svelte:head>
  <title>Privacy Policy — Eos</title>
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
      Privacy Policy
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
        Eos ("we", "us") is a minimal todo app. This page explains what we
        collect, why, and your rights.
      </p>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        What we collect
      </h2>
      <ul style="padding-left: 1.25rem; list-style: disc;">
        <li>
          <strong>Account info</strong>: your email and name from Google or
          Apple when you sign in. We never see your password. Apple may relay a
          private email; we store whatever Apple gives us. If you do not sign
          in, we issue an anonymous device-scoped token instead.
        </li>
        <li>
          <strong>Task content</strong>: the tasks, projects, sections, dates,
          and durations you create. Stored so they sync across your devices.
        </li>
        <li>
          <strong>Telegram link</strong>: if you connect a Telegram account, we
          store your Telegram user id so messages you send to the Eos bot can
          be turned into tasks under your account. You can disconnect any time
          from inside the app.
        </li>
        <li>
          <strong>Device data</strong>: minimal — browser/OS for compatibility
          and to render correctly on iPhone and iPad. No third-party tracking
          IDs across apps.
        </li>
      </ul>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        How we use it
      </h2>
      <ul style="padding-left: 1.25rem; list-style: disc;">
        <li>To run the product: store your tasks, sync across devices, schedule reminders.</li>
        <li>Telegram bridge: messages you send to the Eos bot are stored as tasks under your account. We do not read your other Telegram conversations.</li>
        <li>To improve the app: aggregate, non-identifying usage trends — never the content of your tasks.</li>
      </ul>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        Sharing
      </h2>
      <p>
        We do not sell your data. We share data only with the service providers
        strictly needed to run the product: Google and Apple (sign-in),
        Telegram (the Bot API, for the optional sync), Turso (database), and
        Vercel (hosting).
      </p>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        Your rights
      </h2>
      <p>
        You can sign out and delete your account and all associated tasks at
        any time from the Profile screen, or by emailing
        <a href="mailto:{contactEmail}" style="color: var(--color-accent);"
          >{contactEmail}</a
        >. Under GDPR (EU) and similar laws, you can also request a copy of
        your data.
      </p>

      <h2
        style="font-size: 1.125rem; font-weight: 600; color: var(--color-ink); margin-top: 1rem;"
      >
        Children
      </h2>
      <p>
        Eos is not directed at children under 13. If you believe a child has
        created an account, contact us and we will delete it.
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
