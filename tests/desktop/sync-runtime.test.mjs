import test from "node:test";
import assert from "node:assert/strict";
import { createSyncRuntime } from "../../electron/sync-runtime.mjs";

test("createSyncRuntime exposes idle initial status", () => {
  const runtime = createSyncRuntime({
    config: { notesDir: "/tmp/notes" },
    startWatchersImpl: async () => ({})
  });

  assert.deepEqual(runtime.getStatus(), {
    phase: "idle",
    isRunning: false,
    isPaused: false,
    lastSyncedFile: null,
    lastError: null
  });
});

test("pause and resume toggle state without losing config", async () => {
  const config = { notesDir: "/tmp/notes", notionToken: "token" };
  const startCalls = [];
  const syncCalls = [];

  const startWatchersImpl = async (options) => {
    startCalls.push(options);
    return {
      watcher: { close: async () => {} },
      queueWatcher: { close: async () => {} }
    };
  };

  const syncLatestNoteImpl = async (options = {}) => {
    syncCalls.push(options);
    return { status: "synced", filePath: "/tmp/notes/latest.md" };
  };

  const runtime = createSyncRuntime({
    config,
    startWatchersImpl,
    syncLatestNoteImpl
  });

  await runtime.start();
  await runtime.pause();

  assert.deepEqual(runtime.getStatus(), {
    phase: "paused",
    isRunning: false,
    isPaused: true,
    lastSyncedFile: null,
    lastError: null
  });

  await runtime.resume();
  assert.equal(startCalls.length, 2);

  await startCalls[1].syncLatestImpl({ source: "watcher" });

  assert.deepEqual(syncCalls[0], {
    source: "watcher",
    config
  });
});
