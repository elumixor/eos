import { api } from "$lib/api/client";
import { auth } from "$lib/auth.svelte";

type Me = (typeof api.users.me.$get.$response);

let me = $state<Me | null>(null);
let loadPromise: Promise<void> | null = null;

function ensureLoaded() {
  if (loadPromise) return loadPromise;
  if (!auth.isLoggedIn) return Promise.resolve();
  loadPromise = (async () => {
    try {
      me = await api.users.me.$get();
    } catch {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

export const user = {
  get me() {
    void ensureLoaded();
    return me;
  },
  async refresh() {
    loadPromise = null;
    me = null;
    await ensureLoaded();
  },
  reset() {
    me = null;
    loadPromise = null;
  },
};
