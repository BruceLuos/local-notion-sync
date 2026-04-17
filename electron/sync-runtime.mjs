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
  let startInFlight = null;
  let lifecycleIntent = "idle";
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

  async function closeWatcherHandles(activeWatcher, activeQueueWatcher) {
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

  async function closeActiveWatchers() {
    const activeWatcher = watcher;
    const activeQueueWatcher = queueWatcher;
    watcher = null;
    queueWatcher = null;
    await closeWatcherHandles(activeWatcher, activeQueueWatcher);
  }

  function start() {
    lifecycleIntent = "watching";
    if (startInFlight) {
      return startInFlight;
    }

    const wasPaused = status.isPaused;
    startInFlight = (async () => {
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

        if (lifecycleIntent !== "watching") {
          await closeWatcherHandles(handles?.watcher ?? null, handles?.queueWatcher ?? null);
          status.phase = lifecycleIntent;
          status.isRunning = false;
          status.isPaused = lifecycleIntent === "paused";
          status.lastError = null;
          return getStatus();
        }

        watcher = handles?.watcher ?? null;
        queueWatcher = handles?.queueWatcher ?? null;
        status.phase = "watching";
        status.isRunning = true;
        status.isPaused = false;
        status.lastError = null;
        return getStatus();
      } catch (error) {
        const fallbackPhase =
          lifecycleIntent === "watching" ? (wasPaused ? "paused" : "idle") : lifecycleIntent;
        status.phase = fallbackPhase;
        status.isRunning = false;
        status.isPaused = fallbackPhase === "paused";
        status.lastError = getErrorMessage(error);
        throw error;
      } finally {
        startInFlight = null;
      }
    })();

    return startInFlight;
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
    lifecycleIntent = "idle";
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
    lifecycleIntent = "paused";
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
