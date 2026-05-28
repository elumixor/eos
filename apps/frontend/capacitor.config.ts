import type { CapacitorConfig } from "@capacitor/cli";
import { networkInterfaces } from "os";

function getLocalIP() {
  for (const iface of Object.values(networkInterfaces()).flat()) {
    if (iface?.family === "IPv4" && !iface.internal) return iface.address;
  }
  return "localhost";
}

const useLiveReload = process.env.CAPACITOR_LIVE_RELOAD === "true";

const config: CapacitorConfig = {
  appId: "app.puretype",
  appName: "PureType",
  webDir: "build",
  ...(useLiveReload
    ? {
        server: {
          url: `http://${getLocalIP()}:3000`,
          cleartext: true,
        },
      }
    : {
        server: {
          androidScheme: "https",
        },
      }),
};

export default config;
