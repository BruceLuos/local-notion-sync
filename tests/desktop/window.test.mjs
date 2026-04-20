import test from "node:test";
import assert from "node:assert/strict";
import { getMainWindowOptions } from "../../electron/window-options.mjs";

test("main window disables sandbox so the ESM preload can expose desktopApi", () => {
  const options = getMainWindowOptions();

  assert.equal(options.webPreferences.preload.endsWith("/electron/preload.mjs"), true);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.sandbox, false);
});
