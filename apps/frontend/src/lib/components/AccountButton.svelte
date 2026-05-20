<script lang="ts">
  import { Capacitor } from "@capacitor/core";
  import { SocialLogin } from "@capgo/capacitor-social-login";
  import { LogOut, User as UserIcon, X } from "lucide-svelte";
  import { fade, scale } from "svelte/transition";
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { auth } from "$lib/auth.svelte";
  import { user } from "$lib/user.svelte";

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

  onMount(async () => {
    const googleWeb = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
    const googleIOS = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;
    const appleServicesId = import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined;
    if (!googleWeb && !appleServicesId) return;
    try {
      await SocialLogin.initialize({
        ...(googleWeb
          ? {
              google: {
                webClientId: googleWeb,
                iOSServerClientId: googleIOS ?? googleWeb,
                mode: "online",
              },
            }
          : {}),
        ...(appleServicesId
          ? {
              apple: {
                clientId: appleServicesId,
                ...(Capacitor.isNativePlatform()
                  ? {}
                  : { redirectUrl: import.meta.env.VITE_APPLE_REDIRECT_URL as string }),
              },
            }
          : {}),
      });
    } catch (e) {
      console.error("SocialLogin.initialize failed", e);
    }
  });

  async function signInWithGoogle() {
    await SocialLogin.logout({ provider: "google" }).catch(() => {});
    const result = await SocialLogin.login({
      provider: "google",
      options: { scopes: ["profile", "email"] },
    });
    const response = result.result;
    if (response.responseType !== "online") throw new Error("Expected online login response");
    const { idToken } = response;
    if (!idToken) throw new Error("No ID token returned from Google");
    return await api.auth.google.$post({ idToken });
  }

  async function signInWithApple() {
    await SocialLogin.logout({ provider: "apple" }).catch(() => {});
    const result = await SocialLogin.login({
      provider: "apple",
      options: { scopes: ["email", "name"] },
    });
    const response = result.result as { idToken?: string; givenName?: string; familyName?: string };
    const { idToken } = response;
    if (!idToken) throw new Error("No ID token returned from Apple");
    const name = [response.givenName, response.familyName].filter(Boolean).join(" ") || undefined;
    return await api.auth.apple.$post({ idToken, name });
  }

  async function handleSignIn(provider: "google" | "apple") {
    signingIn = true;
    error = null;
    try {
      const { token } = provider === "google" ? await signInWithGoogle() : await signInWithApple();
      await auth.setToken(token);
      await user.refresh();
      open = false;
      // Reload so all data-loading screens re-fetch under the new identity.
      location.reload();
    } catch (e) {
      if (!isUserCancellation(e)) {
        error = e instanceof Error ? e.message : "Sign in failed";
      }
    } finally {
      signingIn = false;
    }
  }

  function isUserCancellation(e: unknown) {
    const message = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
    return (
      message.includes("cancel") ||
      message.includes("closed") ||
      message.includes("1001") ||
      message.includes("12501")
    );
  }

  async function handleSignOut() {
    await SocialLogin.logout({ provider: "google" }).catch(() => {});
    await SocialLogin.logout({ provider: "apple" }).catch(() => {});
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
    class="fixed inset-0 z-50 grid place-items-center px-4 py-6 bg-black/60 backdrop-blur-md overscroll-contain"
    onclick={() => (open = false)}
    role="presentation"
    transition:fade={{ duration: 150 }}
  >
    <div
      class="relative w-full max-w-[22rem] rounded-3xl bg-[var(--color-surface-1)] p-6 shadow-2xl
        ring-1 ring-black/5 dark:ring-white/10"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      transition:scale={{ duration: 180, start: 0.96 }}
    >
      <button
        onclick={() => (open = false)}
        aria-label="Close"
        class="absolute top-3 right-3 w-8 h-8 rounded-full
          flex items-center justify-center text-[var(--color-ink-3)]
          hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <X size={16} />
      </button>

      {#if anonymous}
        <h2 class="text-lg font-semibold mb-1">Sign in</h2>
        <p class="text-sm text-[var(--color-ink-3)] mb-5 pr-6">
          Keep your tasks safe across devices. Anything you've added so far carries over.
        </p>
        <div class="flex flex-col gap-2">
          <button
            onclick={() => handleSignIn("google")}
            disabled={signingIn}
            class="flex items-center justify-center gap-3 h-12 rounded-2xl
              bg-white text-neutral-900 border border-neutral-200
              hover:bg-neutral-50 disabled:opacity-60 transition-colors"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.85 0-5.26-1.92-6.13-4.5H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.87 14.15c-.22-.66-.35-1.36-.35-2.07s.13-1.41.35-2.07V7.17H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.83l3.69-2.68z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.17l3.69 2.84C6.74 7.3 9.15 5.38 12 5.38z" />
            </svg>
            <span class="text-sm font-medium">{signingIn ? "Signing in…" : "Continue with Google"}</span>
          </button>
          <button
            onclick={() => handleSignIn("apple")}
            disabled={signingIn}
            class="flex items-center justify-center gap-3 h-12 rounded-2xl
              bg-black text-white hover:bg-neutral-800 disabled:opacity-60 transition-colors"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
              <path d="M16.365 1.43c0 1.14-.42 2.18-1.13 2.99-.78.92-2.07 1.62-3.13 1.54-.13-1.1.42-2.25 1.12-3 .79-.85 2.13-1.5 3.14-1.53zM20.79 17.39c-.55 1.27-1.21 2.5-2.11 3.6-1.21 1.49-2.91 3.34-5.02 3.36-1.88.02-2.37-1.21-4.93-1.2-2.55.01-3.09 1.23-4.97 1.21-2.11-.02-3.71-1.69-4.92-3.18-3.39-4.16-3.74-9.06-1.65-11.66 1.49-1.85 3.83-2.93 6.04-2.93 2.25 0 3.66 1.22 5.52 1.22 1.8 0 2.9-1.22 5.5-1.22 1.97 0 4.06 1.07 5.55 2.93-4.87 2.66-4.08 9.61.99 8.87z" />
            </svg>
            <span class="text-sm font-medium">{signingIn ? "Signing in…" : "Continue with Apple"}</span>
          </button>
        </div>
        {#if error}
          <p class="text-sm text-red-500 mt-4">{error}</p>
        {/if}
      {:else}
        <h2 class="text-lg font-semibold mb-1">Signed in</h2>
        <p class="text-sm text-[var(--color-ink-3)] mb-5 pr-6 truncate">{me?.email}</p>
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
