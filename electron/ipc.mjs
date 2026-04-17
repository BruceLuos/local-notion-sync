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
