<script lang="ts">
  import { Capacitor } from "@capacitor/core";
  import { SocialLogin } from "@capgo/capacitor-social-login";
  import { LogIn, LogOut, User as UserIcon } from "lucide-svelte";
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { auth } from "$lib/auth.svelte";
  import { user } from "$lib/user.svelte";

  const me = $derived(user.me);
  const anonymous = $derived(me?.anonymous ?? true);

  let open = $state(false);
  let signingIn = $state(false);
  let error = $state<string | null>(null);

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

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
    onclick={() => (open = false)}
    onkeydown={(e) => e.key === "Escape" && (open = false)}
    role="presentation"
  >
    <div
      class="w-full max-w-sm m-4 rounded-3xl bg-[var(--color-surface-1)] p-6 shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      {#if anonymous}
        <h2 class="text-lg font-semibold mb-1">Sign in</h2>
        <p class="text-sm text-[var(--color-ink-3)] mb-5">
          Keep your tasks safe across devices. Your current data will be carried over.
        </p>
        <div class="flex flex-col gap-2">
          <button
            onclick={() => handleSignIn("google")}
            disabled={signingIn}
            class="flex items-center justify-center gap-2 h-12 rounded-2xl
              bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] disabled:opacity-60"
          >
            <LogIn size={17} />
            <span>{signingIn ? "Signing in…" : "Continue with Google"}</span>
          </button>
          <button
            onclick={() => handleSignIn("apple")}
            disabled={signingIn}
            class="flex items-center justify-center gap-2 h-12 rounded-2xl
              bg-black text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            <LogIn size={17} />
            <span>{signingIn ? "Signing in…" : "Continue with Apple"}</span>
          </button>
        </div>
        {#if error}
          <p class="text-sm text-red-500 mt-3">{error}</p>
        {/if}
      {:else}
        <h2 class="text-lg font-semibold mb-1">Signed in</h2>
        <p class="text-sm text-[var(--color-ink-3)] mb-5">{me?.email}</p>
        <button
          onclick={handleSignOut}
          class="flex items-center justify-center gap-2 w-full h-12 rounded-2xl
            bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]"
        >
          <LogOut size={17} />
          <span>Sign out</span>
        </button>
      {/if}
    </div>
  </div>
{/if}
