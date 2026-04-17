import test from "node:test";
import assert from "node:assert/strict";

test("watch-notes uses NOTES_DIR root as watch target instead of markdown glob", async () => {
  const { getNotesWatchTarget } = await import("../src/watch-notes.mjs");

  const target = getNotesWatchTarget("/tmp/example-notes");

  assert.equal(target, "/tmp/example-notes");
  assert.equal(target.includes("**/*.md"), false);
});

test("watch-notes watcher configs enable polling to avoid fs watch descriptor exhaustion", async () => {
  const {
    createNotesWatcherOptions,
    createQueueWatcherOptions,
    isMarkdownNotePath
  } = await import("../src/watch-notes.mjs");

  const notesOptions = createNotesWatcherOptions();
  const queueOptions = createQueueWatcherOptions();

  assert.equal(notesOptions.usePolling, true);
  assert.equal(queueOptions.usePolling, true);
  assert.equal(isMarkdownNotePath("/tmp/a.md"), true);
  assert.equal(isMarkdownNotePath("/tmp/a.txt"), false);
});

test("startWatchers uses explicit notesDir config when provided", async () => {
  const { startWatchers } = await import("../src/watch-notes.mjs");

  function createWatcher() {
    return {
      on() {
        return this;
      }
    };
  }

  const chokidarImpl = {
    watch() {
      return createWatcher();
    }
  };

  const result = await startWatchers({
    notesDir: "/tmp/notes",
    chokidarImpl,
    ensureQueueFileImpl: async () => "/tmp/notion-sync-queue.jsonl",
    drainQueueEventsImpl: async () => ({ events: [], invalidLines: [] }),
    consoleImpl: { log() {}, error() {} }
  });

  assert.equal(result.notesWatchTarget, "/tmp/notes");
});
