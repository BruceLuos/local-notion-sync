import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ENV_KEYS = ["NOTION_SYNC_QUEUE_FILE"];

test("appendQueueEvent writes one JSONL event and drainQueueEvents consumes it", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "notion-sync-queue-"));
  const queueFilePath = path.join(tempRoot, "queue.jsonl");
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  try {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    process.env.NOTION_SYNC_QUEUE_FILE = queueFilePath;

    const { appendQueueEvent, drainQueueEvents } = await import("../src/sync-queue.mjs");

    await appendQueueEvent(import.meta.url, {
      type: "sync_latest",
      source: "stop-hook",
      createdAt: "2026-04-16T03:40:00.000Z"
    });

    const raw = await fs.readFile(queueFilePath, "utf8");
    assert.match(raw, /"type":"sync_latest"/);

    const drained = await drainQueueEvents(import.meta.url);
    assert.equal(drained.events.length, 1);
    assert.equal(drained.events[0].type, "sync_latest");
    assert.equal(drained.invalidLines.length, 0);

    const afterDrain = await fs.readFile(queueFilePath, "utf8");
    assert.equal(afterDrain, "");
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

test("drainQueueEvents skips invalid JSON lines and keeps valid events", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "notion-sync-queue-invalid-"));
  const queueFilePath = path.join(tempRoot, "queue.jsonl");
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  try {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    process.env.NOTION_SYNC_QUEUE_FILE = queueFilePath;

    const { drainQueueEvents } = await import("../src/sync-queue.mjs");

    await fs.mkdir(path.dirname(queueFilePath), { recursive: true });
    await fs.writeFile(
      queueFilePath,
      [
        JSON.stringify({ type: "sync_latest", source: "stop-hook", createdAt: "2026-04-16T03:40:00.000Z" }),
        "{bad json"
      ].join("\n") + "\n",
      "utf8"
    );

    const drained = await drainQueueEvents(import.meta.url);
    assert.equal(drained.events.length, 1);
    assert.equal(drained.invalidLines.length, 1);
    assert.match(drained.invalidLines[0].message, /JSON/);
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
