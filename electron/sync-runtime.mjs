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

  async function start() {
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
  }

  async function syncNow() {
    const result = await syncLatestNoteImpl({
      source: "desktop-manual",
      config
    });

    status.lastSyncedFile = result?.filePath ?? null;
    status.lastError = null;
    return result;
  }

  async function stop() {
    if (watcher?.close) {
      await watcher.close();
    }
    if (queueWatcher?.close) {
      await queueWatcher.close();
    }

    watcher = null;
    queueWatcher = null;
    status.phase = "idle";
    status.isRunning = false;
    status.isPaused = false;
    return getStatus();
  }

  async function pause() {
    if (watcher?.close) {
      await watcher.close();
    }
    if (queueWatcher?.close) {
      await queueWatcher.close();
    }

    watcher = null;
    queueWatcher = null;
    status.phase = "paused";
    status.isRunning = false;
    status.isPaused = true;
    return getStatus();
  }

  async function resume() {
    await start();
    status.phase = "watching";
    status.isRunning = true;
    status.isPaused = false;
    return getStatus();
  }

  return { getStatus, start, syncNow, stop, pause, resume };
}
