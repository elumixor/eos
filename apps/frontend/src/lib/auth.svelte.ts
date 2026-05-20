import { browser } from "$app/environment";
import { api } from "$lib/api/client";
import { markAuthReady } from "$lib/auth-ready";
import { ls } from "$lib/storage";

let token = $state<string | null | undefined>(undefined);

// Single in-flight promise so concurrent callers don't both mint anon users.
let bootstrapPromise: Promise<void> | null = null;

function bootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    if (!browser) return;
    try {
      const stored = await ls.get("authToken");
      if (stored) {
        token = stored;
        return;
      }
      try {
        const { token: anonToken } = await api.auth.anonymous.$post();
        await ls.set("authToken", anonToken);
        token = anonToken;
      } catch {
        token = null;
      }
    } finally {
      markAuthReady();
    }
  })();
  return bootstrapPromise;
}
void bootstrap();

export const auth = {
  get ready() {
    return token !== undefined;
  },
  // Anonymous JWTs make this true too. Use `user.me?.anonymous` to
  // distinguish anonymous vs. signed-in in UI.
  get isLoggedIn() {
    return token !== null && token !== undefined;
  },
  async setToken(t: string) {
    await ls.set("authToken", t);
    token = t;
  },
  async logout() {
    await ls.remove("authToken");
    token = null;
    bootstrapPromise = null;
    void bootstrap();
  },
};
