import { fileURLToPath } from "node:url";

const preloadPath = fileURLToPath(new URL("./preload.mjs", import.meta.url));

export function getMainWindowOptions() {
  return {
    width: 980,
    height: 760,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
}
