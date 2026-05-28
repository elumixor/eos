<script lang="ts">
  import { ArrowLeft, LogOut, Moon, Sun, Trash2 } from "lucide-svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api/client";
  import { auth } from "$lib/auth.svelte";
  import {
    clearSocialSessions,
    initSocialLogin,
    isUserCancellation,
    signInWithApple,
    signInWithGoogle,
  } from "$lib/auth/social-login";
  import SignInButtons from "$lib/components/SignInButtons.svelte";
  import { user } from "$lib/user.svelte";

  const me = $derived(user.me);
  const anonymous = $derived(me?.anonymous ?? true);

  let signingIn = $state(false);
  let deleting = $state(false);
  let error = $state<string | null>(null);
  let dark = $state(true);

  onMount(async () => {
    dark = localStorage.getItem("theme") !== "light";
    await initSocialLogin();
  });

  function toggleTheme() {
    dark = !dark;
    localStorage.setItem("theme", dark ? "dark" : "light");
    document.documentElement.classList.toggle("light", !dark);
  }

  async function handleSignIn(provider: "google" | "apple") {
    signingIn = true;
    error = null;
    try {
      const { token } = provider === "google" ? await signInWithGoogle() : await signInWithApple();
      await auth.setToken(token);
      await user.refresh();
      location.assign("/");
    } catch (e) {
      if (!isUserCancellation(e)) error = e instanceof Error ? e.message : "Sign in failed";
    } finally {
      signingIn = false;
    }
  }

  async function handleSignOut() {
    await clearSocialSessions();
    user.reset();
    await auth.logout();
    location.assign("/");
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      "Delete your account?\n\nThis permanently removes your tasks, projects, and account from our servers. This cannot be undone.",
    );
    if (!confirmed) return;
    deleting = true;
    error = null;
    try {
      await api.users.me.$delete();
      await clearSocialSessions();
      user.reset();
      await auth.logout();
      location.assign("/");
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not delete account";
      deleting = false;
    }
  }
</script>

<main class="relative max-w-md mx-auto px-5 pt-10 pb-24 safe-top min-h-screen">
  <header class="flex items-center gap-3 mb-8">
    <button
      type="button"
      onclick={() => goto("/")}
      aria-label="Back"
      class="w-10 h-10 rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]
        flex items-center justify-center transition-colors"
    >
      <ArrowLeft size={16} class="text-[var(--color-ink-2)]" />
    </button>
    <h1 class="text-lg font-semibold tracking-tight">Settings</h1>
  </header>

  <section class="mb-8">
    <h2 class="text-[11px] font-mono tracking-widest text-[var(--color-ink-3)] uppercase mb-3">Theme</h2>
    <button
      type="button"
      onclick={toggleTheme}
      class="w-full flex items-center justify-between h-14 px-4 rounded-2xl
        bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors"
    >
      <span class="text-sm font-medium">{dark ? "Dark" : "Light"}</span>
      {#if dark}
        <Moon size={18} class="text-[var(--color-ink-2)]" />
      {:else}
        <Sun size={18} class="text-[var(--color-ink-2)]" />
      {/if}
    </button>
  </section>

  <section>
    <h2 class="text-[11px] font-mono tracking-widest text-[var(--color-ink-3)] uppercase mb-3">Account</h2>

    {#if anonymous}
      <p class="text-sm text-[var(--color-ink-2)] mb-4">
        Keep your tasks safe across devices. Anything you've added so far carries over.
      </p>
      <SignInButtons {signingIn} onSignIn={handleSignIn} />
      {#if error}<p class="text-sm text-red-500 mt-4">{error}</p>{/if}
    {:else}
      <p class="text-sm text-[var(--color-ink-2)] mb-4 truncate">{me?.email}</p>
      <button
        onclick={handleSignOut}
        class="flex items-center justify-center gap-2 w-full h-12 rounded-2xl
          bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <LogOut size={17} />
        <span class="text-sm font-medium">Sign out</span>
      </button>
      {#if error}<p class="text-sm text-red-500 mt-4">{error}</p>{/if}
    {/if}
  </section>

  <section class="mt-10">
    <div class="flex justify-center pt-4">
      <button
        type="button"
        onclick={handleDeleteAccount}
        disabled={deleting}
        class="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs
          text-[var(--color-ink-3)] hover:text-[var(--color-danger)] disabled:opacity-60 transition-colors"
      >
        <Trash2 size={13} />
        <span>{deleting ? "Deleting…" : "Delete account"}</span>
      </button>
    </div>
    <p class="text-center text-[0.7rem] text-[var(--color-ink-3)] mt-2 leading-relaxed">
      Permanently removes your tasks and account from our servers.
    </p>
  </section>
</main>
