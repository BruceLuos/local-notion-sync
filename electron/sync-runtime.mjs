import { startWatchers } from "../src/watch-notes.mjs";
import { syncLatestNote } from "../src/sync-latest-note.mjs";

export function createSyncRuntime(options = {}) {
  const {
    config = {},
    startWatchersImpl = startWatchers,
    syncLatestNoteImpl = syncLatestNote
  } = options;

  let watcher = null;
  let queueWatcher = null;
  const status = {
    phase: "idle",
    isRunning: false,
    isPaused: false,
    lastSyncedFile: null,
    lastError: null
  };

  function getStatus() {
    return { ...status };
  }

  function getErrorMessage(error) {
    if (error && typeof error.message === "string" && error.message) {
      return error.message;
    }
    return String(error);
  }

  async function closeActiveWatchers() {
    const activeWatcher = watcher;
    const activeQueueWatcher = queueWatcher;
    watcher = null;
    queueWatcher = null;

    let closeError = null;

    if (activeWatcher?.close) {
      try {
        await activeWatcher.close();
      } catch (error) {
        closeError = error;
      }
    }

    if (activeQueueWatcher?.close) {
      try {
        await activeQueueWatcher.close();
      } catch (error) {
        if (!closeError) {
          closeError = error;
        }
      }
    }

    if (closeError) {
      throw closeError;
    }
  }

  async function start() {
    const wasPaused = status.isPaused;

    try {
      if (watcher || queueWatcher || status.isRunning) {
        await closeActiveWatchers();
      }

      const handles = await startWatchersImpl({
        notesDir: config.notesDir,
        syncLatestImpl: (syncOptions = {}) =>
          syncLatestNoteImpl({
            ...syncOptions,
            config
          })
      });

      watcher = handles?.watcher ?? null;
      queueWatcher = handles?.queueWatcher ?? null;
      status.phase = "watching";
      status.isRunning = true;
      status.isPaused = false;
      status.lastError = null;
      return getStatus();
    } catch (error) {
      status.phase = wasPaused ? "paused" : "idle";
      status.isRunning = false;
      status.isPaused = wasPaused;
      status.lastError = getErrorMessage(error);
      throw error;
    }
  }

  async function syncNow() {
    try {
      const result = await syncLatestNoteImpl({
        source: "desktop-manual",
        config
      });

      status.lastSyncedFile = result?.filePath ?? null;
      status.lastError = null;
      return result;
    } catch (error) {
      status.lastError = getErrorMessage(error);
      throw error;
    }
  }

  async function stop() {
    try {
      await closeActiveWatchers();
      status.phase = "idle";
      status.isRunning = false;
      status.isPaused = false;
      status.lastError = null;
      return getStatus();
    } catch (error) {
      status.lastError = getErrorMessage(error);
      throw error;
    }
  }

  async function pause() {
    try {
      await closeActiveWatchers();
      status.phase = "paused";
      status.isRunning = false;
      status.isPaused = true;
      status.lastError = null;
      return getStatus();
    } catch (error) {
      status.lastError = getErrorMessage(error);
      throw error;
    }
  }

  async function resume() {
    return start();
  }

  return { getStatus, start, syncNow, stop, pause, resume };
}
