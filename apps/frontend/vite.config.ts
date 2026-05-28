import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { networkInterfaces } from "os";
import { defineConfig } from "vite";

function getLocalIP() {
  for (const iface of Object.values(networkInterfaces()).flat()) {
    if (iface?.family === "IPv4" && !iface.internal) return iface.address;
  }
  return "localhost";
}

const apiPort = 10000;

function resolveApiUrl(mode: string) {
  if (process.env.VITE_API_URL) return process.env.VITE_API_URL;
  // Local dev: fall back to LAN IP so phones on the same network can reach the
  // backend. Any other mode (build, preview, prod) must declare VITE_API_URL —
  // otherwise the bundle ships with whatever LAN IP the build host happened to have.
  if (mode === "development") return `http://${getLocalIP()}:${apiPort}`;
  throw new Error(
    `VITE_API_URL is required for mode="${mode}". ` +
      `Set it as a project env var (Vercel) or pass inline ` +
      `(VITE_API_URL=https://api.example.com bun run build).`,
  );
}

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), sveltekit()],
  server: { port: 3000 },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(resolveApiUrl(mode)),
  },
}));
