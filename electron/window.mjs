import { BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";

const preloadPath = fileURLToPath(new URL("./preload.mjs", import.meta.url));

export function createMainWindow() {
  return new BrowserWindow({
    width: 980,
    height: 760,
    show: false,
    webPreferences: {
      preload: preloadPath
    }
  });
}
