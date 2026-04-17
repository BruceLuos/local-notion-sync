import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { getAppPaths } from "./app-paths.mjs";
import { loadDesktopConfig, saveDesktopConfig } from "./config-store.mjs";
import { registerDesktopIpc } from "./ipc.mjs";
import { createSyncRuntime } from "./sync-runtime.mjs";
import { createDesktopTray } from "./tray.mjs";
import { createMainWindow } from "./window.mjs";

const rendererEntryPath = fileURLToPath(new URL("../renderer/index.html", import.meta.url));

let runtime;
let mainWindow;
let tray;
let paths;

function isConfigComplete(config = {}) {
  return Boolean(config.notesDir && config.notionToken && config.notionDatabaseId);
}

function createRuntimeForConfig(savedConfig = {}) {
  return createSyncRuntime({
    config: {
      ...savedConfig,
      stateFile: paths.stateFile,
      logFile: paths.logFile
    }
  });
}

function logRuntimeActionError(actionName, error) {
  console.error(`Runtime action failed (${actionName}):`, error);
}

function runTrayAction(actionName, action) {
  void Promise.resolve()
    .then(() => action())
    .catch((error) => {
      logRuntimeActionError(actionName, error);
    });
}

async function openMainWindow({ showOnReady = false } = {}) {
  const window = createMainWindow();
  mainWindow = window;

  window.once("ready-to-show", () => {
    if (showOnReady && !window.isDestroyed()) {
      window.show();
    }
  });

  window.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      window.hide();
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

  return window;
}

app.whenReady().then(async () => {
  app.isQuiting = false;

  paths = getAppPaths({ userDataPath: app.getPath("userData") });
  const savedConfig = (await loadDesktopConfig(paths.configFile)) ?? {};
  const shouldStartRuntime = isConfigComplete(savedConfig);
  runtime = createRuntimeForConfig(savedConfig);

  const window = await openMainWindow({ showOnReady: !shouldStartRuntime });

  registerDesktopIpc({
    paths,
    getRuntime: () => runtime,
    loadConfig: loadDesktopConfig,
    saveConfig: async (filePath, payload) => {
      await saveDesktopConfig(filePath, payload);
      app.setLoginItemSettings({
        openAtLogin: Boolean(payload.launchAtLogin)
      });
      const previousRuntime = runtime;
      const previousStatus = previousRuntime.getStatus();
      const nextRuntime = createRuntimeForConfig(payload);
      let previousRuntimeStopped = false;

      try {
        await previousRuntime.stop();
        previousRuntimeStopped = true;
        runtime = nextRuntime;
        if (isConfigComplete(payload)) {
          await runtime.start();
        }
      } catch (error) {
        runtime = previousRuntime;
        if (previousRuntimeStopped) {
          try {
            if (previousStatus.isPaused) {
              await previousRuntime.pause();
            } else if (previousStatus.isRunning) {
              await previousRuntime.start();
            }
          } catch (restoreError) {
            console.error("Failed to restore previous runtime after save-config error:", restoreError);
          }
        }
        throw error;
      }

      return payload;
    },
    browserWindow: window
  });

  tray = createDesktopTray({
    onOpen: () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        void openMainWindow({ showOnReady: true });
        return;
      }
      mainWindow.show();
    },
    onSyncNow: () => {
      runTrayAction("sync-now", () => runtime.syncNow());
    },
    onTogglePause: () => {
      runTrayAction("toggle-pause", async () => {
        if (runtime.getStatus().isPaused) {
          await runtime.resume();
          return;
        }
        await runtime.pause();
      });
    },
    onQuit: () => {
      app.isQuiting = true;
      app.quit();
    }
  });

  if (shouldStartRuntime) {
    try {
      await runtime.start();
    } catch (error) {
      console.error("Failed to start sync runtime:", error);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
    }
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      return;
    }
    if (BrowserWindow.getAllWindows().length === 0) {
      void openMainWindow({ showOnReady: true });
    }
  });
});

app.on("before-quit", () => {
  app.isQuiting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
