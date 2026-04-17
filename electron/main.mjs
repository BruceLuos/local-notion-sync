import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { createMainWindow } from "./window.mjs";

const rendererEntryPath = fileURLToPath(new URL("../renderer/index.html", import.meta.url));

let mainWindow;

async function openMainWindow() {
  const window = createMainWindow();
  mainWindow = window;

  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) {
      window.show();
    }
  });

  window.once("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  try {
    await window.loadFile(rendererEntryPath);
  } catch (error) {
    console.error("Failed to load renderer entry:", error);
  }
}

app.whenReady().then(async () => {
  await openMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void openMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
