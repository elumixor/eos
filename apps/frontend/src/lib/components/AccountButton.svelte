<script lang="ts">
  import { LogOut, User as UserIcon, X } from "lucide-svelte";
  import { onMount } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { auth } from "$lib/auth.svelte";
  import {
    clearSocialSessions,
    initSocialLogin,
    isUserCancellation,
    signInWithApple,
    signInWithGoogle,
  } from "$lib/auth/social-login";
  import { portal } from "$lib/portal";
  import { user } from "$lib/user.svelte";
  import SignInButtons from "./SignInButtons.svelte";

  const me = $derived(user.me);
  const anonymous = $derived(me?.anonymous ?? true);

  let open = $state(false);
  let signingIn = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  });

  onMount(initSocialLogin);

  async function handleSignIn(provider: "google" | "apple") {
    signingIn = true;
    error = null;
    try {
      const { token } = provider === "google" ? await signInWithGoogle() : await signInWithApple();
      await auth.setToken(token);
      await user.refresh();
      open = false;
      // Reload so data-loading screens re-fetch under the new identity.
      location.reload();
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
    location.reload();
  }
</script>

<button
  onclick={() => (open = true)}
  aria-label={anonymous ? "Sign in" : "Account"}
  class="w-11 h-11 rounded-2xl bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]
    flex items-center justify-center transition-all duration-300"
>
  <UserIcon size={17} class="text-[var(--color-ink-2)]" />
</button>

<svelte:window onkeydown={(e) => open && e.key === "Escape" && (open = false)} />

{#if open}
  <div
    use:portal
    class="fixed inset-0 z-50 grid place-items-center px-4 py-6 bg-black/70 backdrop-blur-md overscroll-contain
      [-webkit-tap-highlight-color:transparent]"
    onclick={() => (open = false)}
    role="presentation"
    transition:fade={{ duration: 150 }}
  >
    <div
      class="relative w-full max-w-[22rem] rounded-3xl bg-[var(--color-surface)] p-6 shadow-2xl
        ring-1 ring-black/5 dark:ring-white/10"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      transition:scale={{ duration: 180, start: 0.96 }}
    >
      <button
        onclick={() => (open = false)}
        aria-label="Close"
        class="absolute top-3 right-3 w-8 h-8 rounded-full
          flex items-center justify-center text-[var(--color-ink-2)]
          hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <X size={16} />
      </button>

      {#if anonymous}
        <h2 class="text-lg font-semibold mb-1">Sign in</h2>
        <p class="text-sm text-[var(--color-ink-2)] mb-5 pr-6">
          Keep your tasks safe across devices. Anything you've added so far carries over.
        </p>
        <SignInButtons {signingIn} onSignIn={handleSignIn} />
        {#if error}<p class="text-sm text-red-500 mt-4">{error}</p>{/if}
      {:else}
        <h2 class="text-lg font-semibold mb-1">Signed in</h2>
        <p class="text-sm text-[var(--color-ink-2)] mb-5 pr-6 truncate">{me?.email}</p>
        <button
          onclick={handleSignOut}
          class="flex items-center justify-center gap-2 w-full h-12 rounded-2xl
            bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <LogOut size={17} />
          <span class="text-sm font-medium">Sign out</span>
        </button>
      {/if}
    </div>
  </div>
{/if}
