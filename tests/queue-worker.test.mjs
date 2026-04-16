import test from "node:test";
import assert from "node:assert/strict";

test("queue worker runs syncLatest once for rapid repeated sync_latest events", async () => {
  const calls = [];
  let nowValue = 1000;

  const { createQueueEventProcessor } = await import("../src/queue-worker.mjs");
  const processEvents = createQueueEventProcessor({
    syncLatest: async (options) => {
      calls.push(options);
    },
    now: () => nowValue
  });

  await processEvents([
    { type: "sync_latest", source: "stop-hook", createdAt: "2026-04-16T03:40:00.000Z" },
    { type: "sync_latest", source: "stop-hook", createdAt: "2026-04-16T03:40:01.000Z" }
  ]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, "queue-worker");

  nowValue = 4000;
  await processEvents([{ type: "sync_latest", source: "stop-hook", createdAt: "2026-04-16T03:40:05.000Z" }]);

  assert.equal(calls.length, 2);
});
