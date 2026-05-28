<script lang="ts">
  let { signingIn, onSignIn }: { signingIn: boolean; onSignIn: (provider: "google" | "apple") => void } = $props();
</script>

<div class="flex flex-col gap-2">
  <button
    onclick={() => onSignIn("google")}
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
    onclick={() => onSignIn("apple")}
    disabled={signingIn}
    class="flex items-center justify-center gap-3 h-12 rounded-2xl
      bg-black text-white hover:bg-neutral-800 disabled:opacity-60 transition-colors"
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25" />
    </svg>
    <span class="text-sm font-medium">{signingIn ? "Signing in…" : "Continue with Apple"}</span>
  </button>
</div>
<p class="text-[0.7rem] text-[var(--color-ink-3)] mt-4 leading-relaxed">
  By continuing you agree to our
  <a href="/terms" class="underline hover:text-[var(--color-ink-2)]">Terms</a>
  and
  <a href="/privacy" class="underline hover:text-[var(--color-ink-2)]">Privacy Policy</a>.
</p>
