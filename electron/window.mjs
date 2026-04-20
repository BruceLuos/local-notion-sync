import { BrowserWindow } from "electron";
import { getMainWindowOptions } from "./window-options.mjs";

export function createMainWindow() {
  return new BrowserWindow(getMainWindowOptions());
}
