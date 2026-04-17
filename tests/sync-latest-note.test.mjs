import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

test("getMissingEnvKeys treats explicit runtime config as satisfying requirements", async () => {
  const { getMissingEnvKeys } = await import("../src/sync-latest-note.mjs");

  const previous = {
    notesDir: process.env.NOTES_DIR,
    notionToken: process.env.NOTION_TOKEN,
    notionDatabaseId: process.env.NOTION_DATABASE_ID,
    stateFile: process.env.STATE_FILE
  };

  process.env.NOTES_DIR = "";
  process.env.NOTION_TOKEN = "";
  process.env.NOTION_DATABASE_ID = "";
  process.env.STATE_FILE = "";

  try {
    const missing = getMissingEnvKeys({
      notesDir: "/tmp/notes",
      notionToken: "runtime-token",
      notionDatabaseId: "runtime-db",
      stateFile: "/tmp/state.json"
    });

    assert.deepEqual(missing, []);
  } finally {
    if (previous.notesDir === undefined) {
      delete process.env.NOTES_DIR;
    } else {
      process.env.NOTES_DIR = previous.notesDir;
    }

    if (previous.notionToken === undefined) {
      delete process.env.NOTION_TOKEN;
    } else {
      process.env.NOTION_TOKEN = previous.notionToken;
    }

    if (previous.notionDatabaseId === undefined) {
      delete process.env.NOTION_DATABASE_ID;
    } else {
      process.env.NOTION_DATABASE_ID = previous.notionDatabaseId;
    }

    if (previous.stateFile === undefined) {
      delete process.env.STATE_FILE;
    } else {
      process.env.STATE_FILE = previous.stateFile;
    }
  }
});
