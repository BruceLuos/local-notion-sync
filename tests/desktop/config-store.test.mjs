import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadDesktopConfig, saveDesktopConfig } from "../../electron/config-store.mjs";

test("loadDesktopConfig returns null for missing file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notion-sync-config-missing-"));
  const missingPath = path.join(root, "does-not-exist.json");

  const config = await loadDesktopConfig(missingPath);

  assert.equal(config, null);
});

test("config store persists desktop settings", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notion-sync-config-"));
  const filePath = path.join(root, "config.json");

  await saveDesktopConfig(filePath, {
    notionToken: "secret",
    notionDatabaseId: "db123",
    notesDir: "/notes",
    launchAtLogin: true
  });

  const config = await loadDesktopConfig(filePath);

  assert.deepEqual(config, {
    notionToken: "secret",
    notionDatabaseId: "db123",
    notesDir: "/notes",
    launchAtLogin: true
  });
});
