import { NitroAPI } from "backend";
import { authReady } from "$lib/auth-ready";
import { ls } from "$lib/storage";

export const api = new NitroAPI({
  baseUrl: (import.meta.env.VITE_API_URL as string).replace(/\/+$/, ""),
  async fetch(input, init) {
    const headers = new Headers(init?.headers);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // /auth/anonymous is what *creates* the token, so it cannot wait for itself.
    if (!url.includes("/auth/anonymous")) await authReady;
    const token = await ls.get("authToken");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(input, { ...init, headers });

    if (res.status === 401) {
      // Stale token (user deleted, DB wiped) — clear so the next load
      // re-bootstraps an anonymous session.
      await ls.remove("authToken");
    }

    return res;
  },
});
