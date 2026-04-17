import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { getAppPaths } from "../../electron/app-paths.mjs";

test("getAppPaths builds config, state, and log paths under app data", () => {
  const userDataPath = path.join("/tmp", "notion-sync-desktop");
  const paths = getAppPaths({ userDataPath });

  assert.equal(paths.configFile, path.join(userDataPath, "config.json"));
  assert.equal(paths.stateFile, path.join(userDataPath, "state.json"));
  assert.equal(paths.logFile, path.join(userDataPath, "logs", "notion-sync.log"));
});
