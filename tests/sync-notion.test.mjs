import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

test("resolveSyncConfig prefers explicit runtime config over process.env", async () => {
  const { resolveSyncConfig } = await import("../src/sync-notion.mjs");

  const previous = {
    notionToken: process.env.NOTION_TOKEN,
    notionDatabaseId: process.env.NOTION_DATABASE_ID,
    stateFile: process.env.STATE_FILE,
    sourceBaseUrl: process.env.SOURCE_BASE_URL
  };

  process.env.NOTION_TOKEN = "env-token";
  process.env.NOTION_DATABASE_ID = "env-database";
  process.env.STATE_FILE = "env-state";
  process.env.SOURCE_BASE_URL = "https://env.example.com";

  try {
    const config = resolveSyncConfig({
      notionToken: "runtime-token",
      notionDatabaseId: "runtime-database",
      stateFile: "runtime-state",
      sourceBaseUrl: "https://runtime.example.com"
    });

    assert.deepEqual(config, {
      notionToken: "runtime-token",
      notionDatabaseId: "runtime-database",
      stateFile: "runtime-state",
      sourceBaseUrl: "https://runtime.example.com"
    });
  } finally {
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

    if (previous.sourceBaseUrl === undefined) {
      delete process.env.SOURCE_BASE_URL;
    } else {
      process.env.SOURCE_BASE_URL = previous.sourceBaseUrl;
    }
  }
});
