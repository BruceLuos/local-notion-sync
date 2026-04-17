import { contextBridge, ipcRenderer } from "electron";
import { getDesktopApiChannels } from "./ipc.mjs";

const channels = getDesktopApiChannels();

contextBridge.exposeInMainWorld("desktopApi", {
  loadConfig: () => ipcRenderer.invoke(channels.loadConfig),
  saveConfig: (payload) => ipcRenderer.invoke(channels.saveConfig, payload),
  getStatus: () => ipcRenderer.invoke(channels.getStatus),
  syncNow: () => ipcRenderer.invoke(channels.syncNow),
  pauseSync: () => ipcRenderer.invoke(channels.pauseSync),
  resumeSync: () => ipcRenderer.invoke(channels.resumeSync),
  openLogs: () => ipcRenderer.invoke(channels.openLogs),
  chooseFolder: () => ipcRenderer.invoke(channels.chooseFolder)
});
