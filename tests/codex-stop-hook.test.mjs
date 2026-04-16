import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ENV_KEYS = ["NOTION_SYNC_QUEUE_FILE"];

test("requestLatestSyncFromStopHook enqueues a sync_latest event", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "notion-stop-hook-"));
  const queueFilePath = path.join(tempRoot, "queue.jsonl");
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  try {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    process.env.NOTION_SYNC_QUEUE_FILE = queueFilePath;

    const { requestLatestSyncFromStopHook } = await import("../src/codex-stop-hook.mjs");

    await requestLatestSyncFromStopHook();

    const raw = await fs.readFile(queueFilePath, "utf8");
    const [line] = raw.trim().split("\n");
    const event = JSON.parse(line);

    assert.equal(event.type, "sync_latest");
    assert.equal(event.source, "stop-hook");
    assert.ok(event.createdAt);
  } finally {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
