import { browser } from "$app/environment";
import { api } from "$lib/api/client";
import { markAuthReady } from "$lib/auth-ready";
import { clearAll, setMeta } from "$lib/db/idb";
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
  // Called after Google/Apple sign-in. The backend has merged the anonymous
  // user's rows into the signed-in account (mergeAnonymousUser), so IDs are
  // stable. We reset the sync cursor so the next pull picks up the full
  // dataset for this account — including rows from other devices that the
  // anonymous session never saw.
  async setToken(t: string) {
    await ls.set("authToken", t);
    token = t;
    await setMeta("lastSyncAt", null);
  },
  async logout() {
    await ls.remove("authToken");
    // Wipe the local cache so the next user (anonymous or signed-in)
    // doesn't see stale rows from the previous session.
    try {
      await clearAll();
    } catch {
      // ignore — IDB unavailable on some platforms
    }
    token = null;
    bootstrapPromise = null;
    void bootstrap();
  },
};
