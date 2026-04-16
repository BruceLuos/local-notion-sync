# Stop Hook Queue Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep save-to-sync behavior and add a queue-backed fallback so Codex `Stop` hooks can trigger sandbox-external syncs.

**Architecture:** `codex-stop-hook.mjs` stops talking to Notion directly and instead appends a `sync_latest` event to `/tmp/notion-sync-queue.jsonl`. The long-running watcher drains and processes queue events, dedupes rapid repeats, and reuses `syncLatestNote()` for real syncing.

**Tech Stack:** Node.js ESM, chokidar, node:test, local JSONL queue file

---

### Task 1: Queue helpers

**Files:**
- Create: `src/sync-queue.mjs`
- Test: `tests/sync-queue.test.mjs`

- [ ] Step 1: Write failing tests for queue file path, enqueue, and drain behavior
- [ ] Step 2: Run `node --test tests/sync-queue.test.mjs` and verify it fails
- [ ] Step 3: Implement queue helpers with JSONL append and atomic drain-by-rename
- [ ] Step 4: Re-run `node --test tests/sync-queue.test.mjs` and verify it passes

### Task 2: Stop hook queue producer

**Files:**
- Modify: `src/codex-stop-hook.mjs`
- Test: `tests/codex-stop-hook.test.mjs`

- [ ] Step 1: Write a failing test proving the stop hook appends a `sync_latest` queue event
- [ ] Step 2: Run `node --test tests/codex-stop-hook.test.mjs` and verify it fails
- [ ] Step 3: Refactor the hook to export a queue-write function and use queue helpers
- [ ] Step 4: Re-run `node --test tests/codex-stop-hook.test.mjs` and verify it passes

### Task 3: Queue worker consumption and dedupe

**Files:**
- Create: `src/queue-worker.mjs`
- Test: `tests/queue-worker.test.mjs`

- [ ] Step 1: Write a failing test proving `sync_latest` events trigger one sync and dedupe rapid repeats
- [ ] Step 2: Run `node --test tests/queue-worker.test.mjs` and verify it fails
- [ ] Step 3: Implement queue event processing with a 2-second dedupe window
- [ ] Step 4: Re-run `node --test tests/queue-worker.test.mjs` and verify it passes

### Task 4: Watcher integration

**Files:**
- Modify: `src/watch-notes.mjs`

- [ ] Step 1: Integrate queue draining into the existing watcher without breaking markdown file watching
- [ ] Step 2: Keep invalid queue lines non-fatal and log them to stderr
- [ ] Step 3: Ensure startup processes any queued backlog once

### Task 5: Docs and verification

**Files:**
- Modify: `README.md`
- Modify: `.codex/hooks.json.example`

- [ ] Step 1: Update docs to explain that the stop hook now enqueues and the long-running watcher performs the actual sync
- [ ] Step 2: Run `node --test tests/sync-queue.test.mjs tests/codex-stop-hook.test.mjs tests/queue-worker.test.mjs tests/env-loader.test.mjs tests/sync-logging.test.mjs`
- [ ] Step 3: Manually enqueue one event and verify the watcher path can drain it in-process
