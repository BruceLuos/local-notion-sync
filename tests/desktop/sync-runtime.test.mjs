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

test("start is safe to call twice and closes previous watchers", async () => {
  const closed = [];
  const handles = [
    {
      watcher: { close: async () => closed.push("watcher-1") },
      queueWatcher: { close: async () => closed.push("queue-1") }
    },
    {
      watcher: { close: async () => closed.push("watcher-2") },
      queueWatcher: { close: async () => closed.push("queue-2") }
    }
  ];
  let index = 0;

  const runtime = createSyncRuntime({
    config: { notesDir: "/tmp/notes" },
    startWatchersImpl: async () => handles[index++]
  });

  await runtime.start();
  await runtime.start();

  assert.deepEqual(closed, ["watcher-1", "queue-1"]);
  assert.deepEqual(runtime.getStatus(), {
    phase: "watching",
    isRunning: true,
    isPaused: false,
    lastSyncedFile: null,
    lastError: null
  });
});

test("syncNow forwards source and config then updates lastSyncedFile", async () => {
  const calls = [];
  const config = { notesDir: "/tmp/notes", notionToken: "token" };
  const runtime = createSyncRuntime({
    config,
    startWatchersImpl: async () => ({}),
    syncLatestNoteImpl: async (options = {}) => {
      calls.push(options);
      return { status: "synced", filePath: "/tmp/notes/a.md" };
    }
  });

  await runtime.syncNow();

  assert.deepEqual(calls, [{ source: "desktop-manual", config }]);
  assert.equal(runtime.getStatus().lastSyncedFile, "/tmp/notes/a.md");
});

test("stop closes watchers and transitions to idle state", async () => {
  const closed = [];
  const runtime = createSyncRuntime({
    config: { notesDir: "/tmp/notes" },
    startWatchersImpl: async () => ({
      watcher: { close: async () => closed.push("watcher") },
      queueWatcher: { close: async () => closed.push("queue") }
    })
  });

  await runtime.start();
  await runtime.stop();

  assert.deepEqual(closed, ["watcher", "queue"]);
  assert.deepEqual(runtime.getStatus(), {
    phase: "idle",
    isRunning: false,
    isPaused: false,
    lastSyncedFile: null,
    lastError: null
  });
});

test("syncNow failure populates lastError", async () => {
  const runtime = createSyncRuntime({
    config: { notesDir: "/tmp/notes" },
    startWatchersImpl: async () => ({}),
    syncLatestNoteImpl: async () => {
      throw new Error("manual sync failed");
    }
  });

  await assert.rejects(() => runtime.syncNow(), /manual sync failed/);
  assert.equal(runtime.getStatus().lastError, "manual sync failed");
});
