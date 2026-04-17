import electron from "electron";

const { dialog, ipcMain, shell } = electron;

export function getDesktopApiChannels() {
  return {
    loadConfig: "desktop:load-config",
    saveConfig: "desktop:save-config",
    getStatus: "desktop:get-status",
    syncNow: "desktop:sync-now",
    pauseSync: "desktop:pause-sync",
    resumeSync: "desktop:resume-sync",
    openLogs: "desktop:open-logs",
    chooseFolder: "desktop:choose-folder"
  };
}

export function registerDesktopIpc({
  paths,
  getRuntime,
  loadConfig,
  saveConfig,
  browserWindow
}) {
  const channels = getDesktopApiChannels();

  ipcMain.handle(channels.loadConfig, () => loadConfig(paths.configFile));
  ipcMain.handle(channels.saveConfig, async (_event, payload) => {
    await saveConfig(paths.configFile, payload);
    return payload;
  });
  ipcMain.handle(channels.getStatus, () => getRuntime().getStatus());
  ipcMain.handle(channels.syncNow, () => getRuntime().syncNow());
  ipcMain.handle(channels.pauseSync, () => getRuntime().pause());
  ipcMain.handle(channels.resumeSync, () => getRuntime().resume());
  ipcMain.handle(channels.openLogs, () => shell.showItemInFolder(paths.logFile));
  ipcMain.handle(channels.chooseFolder, async () => {
    const targetWindow =
      browserWindow && typeof browserWindow.isDestroyed === "function" && !browserWindow.isDestroyed()
        ? browserWindow
        : undefined;
    const result = await dialog.showOpenDialog(targetWindow, {
      properties: ["openDirectory"]
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
