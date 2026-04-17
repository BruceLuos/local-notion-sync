import test from "node:test";
import assert from "node:assert/strict";
import { getAppPaths } from "../../electron/app-paths.mjs";

test("getAppPaths builds config, state, and log paths under app data", () => {
  const paths = getAppPaths({
    userDataPath: "/tmp/notion-sync-desktop"
  });

  assert.equal(paths.configFile, "/tmp/notion-sync-desktop/config.json");
  assert.equal(paths.stateFile, "/tmp/notion-sync-desktop/state.json");
  assert.equal(paths.logFile, "/tmp/notion-sync-desktop/logs/notion-sync.log");
});
