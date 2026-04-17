import test from "node:test";
import assert from "node:assert/strict";
import { getDesktopApiChannels } from "../../electron/ipc.mjs";

test("desktop IPC channel map stays stable", () => {
  assert.deepEqual(getDesktopApiChannels(), {
    loadConfig: "desktop:load-config",
    saveConfig: "desktop:save-config",
    getStatus: "desktop:get-status",
    syncNow: "desktop:sync-now",
    pauseSync: "desktop:pause-sync",
    resumeSync: "desktop:resume-sync",
    openLogs: "desktop:open-logs",
    chooseFolder: "desktop:choose-folder"
  });
});
