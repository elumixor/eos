<script lang="ts">
  import { LogOut } from "lucide-svelte";
  import { SocialLogin } from "@capgo/capacitor-social-login";
  import { auth } from "$lib/auth.svelte";
  import { user } from "$lib/user.svelte";

  const me = $derived(user.me);
  const anonymous = $derived(me?.anonymous ?? true);

  // App version baked in at build time (matches capacitor.config.ts / Info.plist).
  const appVersion = "1.0";

  async function handleSignOut() {
    await SocialLogin.logout({ provider: "google" }).catch(() => {});
    await SocialLogin.logout({ provider: "apple" }).catch(() => {});
    user.reset();
    await auth.logout();
    location.assign("/");
  }
</script>

<svelte:head>
  <title>Profile — Eos</title>
</svelte:head>

<div
  class="flex min-h-dvh flex-col mt-4"
  style="background-color: var(--color-bg); color: var(--color-ink);"
>
  <header class="safe-top px-4 pb-2 max-w-2xl mx-auto w-full">
    <a
      href="/"
      class="text-sm"
      style="color: var(--color-ink-2);"
    >← Back</a>
  </header>

  <main
    class="mx-auto w-full max-w-2xl flex-1 px-4 py-6 flex flex-col gap-6"
    style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);"
  >
    <h1
      style="font-family: var(--font-display); font-size: 1.75rem; font-weight: 700;"
    >
      Profile
    </h1>

    <section
      class="rounded-3xl p-5 flex flex-col gap-2"
      style="background-color: var(--color-surface);"
    >
      <p
        style="font-size: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-ink-3);"
      >
        Signed in as
      </p>
      <p style="font-size: 1.125rem; font-weight: 600;">
        {#if anonymous}
          Anonymous
        {:else}
          {me?.email ?? "—"}
        {/if}
      </p>
      {#if anonymous}
        <p style="font-size: 0.8125rem; color: var(--color-ink-2);">
          Your tasks live on this device. Sign in from the home screen to keep
          them safe across devices.
        </p>
      {/if}
    </section>

    {#if !anonymous}
      <button
        onclick={handleSignOut}
        class="flex items-center justify-center gap-2 w-full h-12 rounded-2xl"
        style="background-color: var(--color-surface-2); color: var(--color-ink);"
      >
        <LogOut size={17} />
        <span>Sign out</span>
      </button>
    {/if}

    <section
      class="flex flex-col gap-2"
      style="font-size: 0.8125rem; color: var(--color-ink-2);"
    >
      <p style="color: var(--color-ink-3);">About</p>
      <p>Eos · v{appVersion}</p>
    </section>

    <footer
      class="mt-auto pt-8 text-center"
      style="font-size: 0.75rem; color: var(--color-ink-3);"
    >
      <a href="/privacy" class="underline">Privacy</a>
      <span style="margin: 0 0.5rem;">·</span>
      <a href="/terms" class="underline">Terms</a>
    </footer>
  </main>
</div>
