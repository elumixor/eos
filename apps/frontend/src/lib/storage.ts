import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { browser } from "$app/environment";

// Thin async key/value wrapper. Uses Capacitor Preferences on native (so
// values survive WKWebView storage purges) and localStorage on web.
const native = browser && Capacitor.isNativePlatform();

export const ls = {
  async get(key: string): Promise<string | null> {
    if (!browser) return null;
    if (native) return (await Preferences.get({ key })).value;
    return localStorage.getItem(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (!browser) return;
    if (native) await Preferences.set({ key, value });
    else localStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    if (!browser) return;
    if (native) await Preferences.remove({ key });
    else localStorage.removeItem(key);
  },
};
