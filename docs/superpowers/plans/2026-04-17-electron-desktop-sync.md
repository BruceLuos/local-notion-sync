# Electron Desktop Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop MVP for macOS and Windows that lets ordinary users configure Notion plus a local Markdown folder, then keeps syncing in the background without terminal commands.

**Architecture:** Keep the existing Node sync logic as a reusable core, but remove its hard dependency on repo-local `.env` values during runtime. Add an Electron shell with a main-process-managed sync runtime, a preload IPC bridge, and a small vanilla HTML/CSS/JS renderer for onboarding, settings, and status.

**Tech Stack:** Node.js ESM, Electron, Electron Forge, `node:test`, existing Notion sync modules, vanilla HTML/CSS/JS renderer

---

## File Map

### Existing files to modify

- `package.json`
  - add Electron and Electron Forge dependencies
  - add desktop dev/package scripts
- `README.md`
  - document desktop MVP usage separately from CLI usage
- `src/sync-notion.mjs`
  - allow explicit runtime config instead of only `process.env`
- `src/sync-latest-note.mjs`
  - allow explicit runtime config and app-owned log/state paths
- `src/watch-notes.mjs`
  - allow Electron to start watchers with explicit config
- `src/state-store.mjs`
  - support app-managed state file paths cleanly
- `src/sync-log.mjs`
  - support app-managed log locations cleanly

### New desktop-layer files

- `electron/main.mjs`
  - app bootstrap, window lifecycle, tray, login item integration
- `electron/preload.mjs`
  - expose safe renderer API
- `electron/window.mjs`
  - create and manage the BrowserWindow
- `electron/tray.mjs`
  - tray/menu creation and status updates
- `electron/app-paths.mjs`
  - compute config/state/log file paths in OS app-data locations
- `electron/config-store.mjs`
  - read/write desktop app config JSON
- `electron/sync-runtime.mjs`
  - own watcher lifecycle, sync-now action, pause/resume, status snapshots
- `electron/ipc.mjs`
  - bind IPC handlers between renderer and main

### New renderer files

- `renderer/index.html`
  - single-window shell for onboarding and status
- `renderer/app.css`
  - MVP styling for wizard and status panel
- `renderer/app.js`
  - renderer state machine and IPC calls

### New tests

- `tests/desktop/config-store.test.mjs`
- `tests/desktop/app-paths.test.mjs`
- `tests/desktop/sync-runtime.test.mjs`
- `tests/desktop/ipc.test.mjs`
- `tests/watch-notes.test.mjs`
- `tests/sync-latest-note.test.mjs`
- `tests/sync-notion.test.mjs`

### New packaging config

- `forge.config.cjs`

## Task 1: Bootstrap Electron desktop workspace

**Files:**
- Modify: `package.json`
- Create: `forge.config.cjs`

- [ ] **Step 1: Write the failing package-level smoke assertions**

Create `tests/desktop/package-scripts.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("package.json exposes desktop scripts", async () => {
  const pkg = JSON.parse(await fs.readFile(new URL("../../package.json", import.meta.url), "utf8"));

  assert.equal(pkg.main, "electron/main.mjs");
  assert.equal(pkg.scripts["desktop:dev"], "electron-forge start");
  assert.equal(pkg.scripts["desktop:package"], "electron-forge package");
  assert.equal(pkg.scripts["desktop:make"], "electron-forge make");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/desktop/package-scripts.test.mjs`
Expected: FAIL because `package.json` does not yet declare Electron entrypoint or desktop scripts.

- [ ] **Step 3: Add minimal Electron packaging setup**

Update `package.json`:

```json
{
  "main": "electron/main.mjs",
  "scripts": {
    "desktop:dev": "electron-forge start",
    "desktop:package": "electron-forge package",
    "desktop:make": "electron-forge make"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.7.0",
    "@electron-forge/maker-dmg": "^7.7.0",
    "@electron-forge/maker-squirrel": "^7.7.0",
    "electron": "^36.3.1"
  }
}
```

Create `forge.config.cjs`:

```js
module.exports = {
  packagerConfig: {
    asar: true
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {}
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"]
    }
  ]
};
```

- [ ] **Step 4: Re-run test to verify it passes**

Run: `node --test tests/desktop/package-scripts.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json forge.config.cjs tests/desktop/package-scripts.test.mjs
git commit -m "build: add Electron desktop packaging setup"
```

## Task 2: Create app-owned paths and persistent config store

**Files:**
- Create: `electron/app-paths.mjs`
- Create: `electron/config-store.mjs`
- Test: `tests/desktop/app-paths.test.mjs`
- Test: `tests/desktop/config-store.test.mjs`

- [ ] **Step 1: Write the failing app-paths test**

Create `tests/desktop/app-paths.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/desktop/app-paths.test.mjs`
Expected: FAIL because `electron/app-paths.mjs` does not exist.

- [ ] **Step 3: Implement app path resolver**

Create `electron/app-paths.mjs`:

```js
import path from "node:path";

export function getAppPaths({ userDataPath }) {
  return {
    rootDir: userDataPath,
    configFile: path.join(userDataPath, "config.json"),
    stateFile: path.join(userDataPath, "state.json"),
    logDir: path.join(userDataPath, "logs"),
    logFile: path.join(userDataPath, "logs", "notion-sync.log")
  };
}
```

- [ ] **Step 4: Write the failing config-store test**

Create `tests/desktop/config-store.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadDesktopConfig, saveDesktopConfig } from "../../electron/config-store.mjs";

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
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test tests/desktop/config-store.test.mjs`
Expected: FAIL because `electron/config-store.mjs` does not exist.

- [ ] **Step 6: Implement desktop config store**

Create `electron/config-store.mjs`:

```js
import fs from "node:fs/promises";
import path from "node:path";

export async function loadDesktopConfig(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveDesktopConfig(filePath, config) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}
```

- [ ] **Step 7: Re-run both tests**

Run: `node --test tests/desktop/app-paths.test.mjs tests/desktop/config-store.test.mjs`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add electron/app-paths.mjs electron/config-store.mjs tests/desktop/app-paths.test.mjs tests/desktop/config-store.test.mjs
git commit -m "feat: add desktop config and app path storage"
```

## Task 3: Decouple sync core from repo-local environment variables

**Files:**
- Modify: `src/sync-notion.mjs`
- Modify: `src/sync-latest-note.mjs`
- Modify: `src/watch-notes.mjs`
- Test: `tests/sync-notion.test.mjs`
- Test: `tests/sync-latest-note.test.mjs`
- Test: `tests/watch-notes.test.mjs`

- [ ] **Step 1: Write the failing sync-file config test**

Create `tests/sync-notion.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveSyncConfig } from "../src/sync-notion.mjs";

test("resolveSyncConfig prefers explicit runtime config over process.env", () => {
  const config = resolveSyncConfig({
    notionToken: "token",
    notionDatabaseId: "db",
    stateFile: "/tmp/state.json"
  });

  assert.equal(config.notionToken, "token");
  assert.equal(config.notionDatabaseId, "db");
  assert.equal(config.stateFile, "/tmp/state.json");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sync-notion.test.mjs`
Expected: FAIL because `resolveSyncConfig` is not exported yet.

- [ ] **Step 3: Implement minimal sync config resolver**

Add to `src/sync-notion.mjs`:

```js
export function resolveSyncConfig(overrides = {}) {
  return {
    notionToken: overrides.notionToken ?? process.env.NOTION_TOKEN ?? "",
    notionDatabaseId: overrides.notionDatabaseId ?? process.env.NOTION_DATABASE_ID ?? "",
    stateFile: overrides.stateFile ?? process.env.STATE_FILE ?? "",
    sourceBaseUrl: overrides.sourceBaseUrl ?? process.env.SOURCE_BASE_URL ?? ""
  };
}
```

Update `syncFile()` to use:

```js
const config = resolveSyncConfig(options.config);
```

and replace direct `process.env.*` reads with `config.*`.

- [ ] **Step 4: Write the failing latest-sync config test**

Create `tests/sync-latest-note.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getMissingEnvKeys } from "../src/sync-latest-note.mjs";

test("getMissingEnvKeys treats explicit runtime config as satisfying requirements", () => {
  const missing = getMissingEnvKeys({
    notesDir: "/notes",
    notionToken: "token",
    notionDatabaseId: "db",
    stateFile: "/tmp/state.json"
  });

  assert.deepEqual(missing, []);
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test tests/sync-latest-note.test.mjs`
Expected: FAIL because `getMissingEnvKeys()` only inspects `process.env`.

- [ ] **Step 6: Implement minimal runtime-config support in latest sync**

Update `src/sync-latest-note.mjs`:

```js
export function getMissingEnvKeys(config = {}) {
  const required = {
    notesDir: config.notesDir ?? process.env.NOTES_DIR,
    notionToken: config.notionToken ?? process.env.NOTION_TOKEN,
    notionDatabaseId: config.notionDatabaseId ?? process.env.NOTION_DATABASE_ID,
    stateFile: config.stateFile ?? process.env.STATE_FILE
  };

  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
```

Update `syncLatestNote(options = {})` to read `options.config`.

- [ ] **Step 7: Extend watcher test for explicit config**

Add to `tests/watch-notes.test.mjs`:

```js
test("startWatchers uses explicit notesDir config when provided", async () => {
  const events = [];
  const fakeWatcher = {
    on(name, handler) {
      events.push(name);
      this[name] = handler;
      return this;
    }
  };

  const chokidarImpl = {
    watch(target) {
      return fakeWatcher;
    }
  };

  const result = await startWatchers({
    notesDir: "/tmp/notes",
    chokidarImpl,
    ensureQueueFileImpl: async () => "/tmp/notion-sync-queue.jsonl"
  });

  assert.equal(result.notesWatchTarget, "/tmp/notes");
});
```

- [ ] **Step 8: Run the three tests to verify failures/passages incrementally**

Run:
`node --test tests/sync-notion.test.mjs tests/sync-latest-note.test.mjs tests/watch-notes.test.mjs`
Expected: PASS after the config decoupling work is complete.

- [ ] **Step 9: Commit**

```bash
git add src/sync-notion.mjs src/sync-latest-note.mjs src/watch-notes.mjs tests/sync-notion.test.mjs tests/sync-latest-note.test.mjs tests/watch-notes.test.mjs
git commit -m "refactor: decouple sync core from repo env"
```

## Task 4: Build desktop sync runtime with status, pause, and sync-now

**Files:**
- Create: `electron/sync-runtime.mjs`
- Test: `tests/desktop/sync-runtime.test.mjs`

- [ ] **Step 1: Write the failing runtime-status test**

Create `tests/desktop/sync-runtime.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createSyncRuntime } from "../../electron/sync-runtime.mjs";

test("sync runtime exposes initial idle status", () => {
  const runtime = createSyncRuntime({
    config: {
      notesDir: "/notes",
      notionToken: "token",
      notionDatabaseId: "db",
      stateFile: "/tmp/state.json",
      logFile: "/tmp/notion-sync.log"
    },
    startWatchersImpl: async () => ({ watcher: { close() {} }, queueWatcher: { close() {} } })
  });

  assert.deepEqual(runtime.getStatus(), {
    phase: "idle",
    isRunning: false,
    isPaused: false,
    lastSyncedFile: null,
    lastError: null
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/desktop/sync-runtime.test.mjs`
Expected: FAIL because `electron/sync-runtime.mjs` does not exist.

- [ ] **Step 3: Implement minimal runtime wrapper**

Create `electron/sync-runtime.mjs`:

```js
import { startWatchers } from "../src/watch-notes.mjs";
import { syncLatestNote } from "../src/sync-latest-note.mjs";

export function createSyncRuntime({
  config,
  startWatchersImpl = startWatchers,
  syncLatestNoteImpl = syncLatestNote
}) {
  let state = {
    phase: "idle",
    isRunning: false,
    isPaused: false,
    lastSyncedFile: null,
    lastError: null
  };
  let handles = null;

  return {
    getStatus() {
      return { ...state };
    },
    async start() {
      handles = await startWatchersImpl({
        notesDir: config.notesDir,
        syncLatestImpl: (options) => syncLatestNoteImpl({ ...options, config })
      });
      state = { ...state, phase: "watching", isRunning: true, lastError: null };
    },
    async syncNow() {
      const result = await syncLatestNoteImpl({ source: "desktop-manual", config });
      state = { ...state, lastSyncedFile: result.filePath ?? null };
      return result;
    },
    async stop() {
      await handles?.watcher?.close?.();
      await handles?.queueWatcher?.close?.();
      state = { ...state, phase: "idle", isRunning: false };
    }
  };
}
```

- [ ] **Step 4: Add failing pause/resume test**

Append to `tests/desktop/sync-runtime.test.mjs`:

```js
test("pause and resume toggle runtime state without losing config", async () => {
  const runtime = createSyncRuntime({
    config: {
      notesDir: "/notes",
      notionToken: "token",
      notionDatabaseId: "db",
      stateFile: "/tmp/state.json",
      logFile: "/tmp/notion-sync.log"
    },
    startWatchersImpl: async () => ({ watcher: { close() {} }, queueWatcher: { close() {} } })
  });

  await runtime.pause();
  assert.equal(runtime.getStatus().isPaused, true);

  await runtime.resume();
  assert.equal(runtime.getStatus().isPaused, false);
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test tests/desktop/sync-runtime.test.mjs`
Expected: FAIL because `pause()` and `resume()` are not implemented yet.

- [ ] **Step 6: Implement pause/resume**

Add to `electron/sync-runtime.mjs`:

```js
async pause() {
  await handles?.watcher?.close?.();
  await handles?.queueWatcher?.close?.();
  handles = null;
  state = { ...state, phase: "paused", isRunning: false, isPaused: true };
},
async resume() {
  await this.start();
  state = { ...state, phase: "watching", isRunning: true, isPaused: false };
}
```

- [ ] **Step 7: Re-run test to verify it passes**

Run: `node --test tests/desktop/sync-runtime.test.mjs`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add electron/sync-runtime.mjs tests/desktop/sync-runtime.test.mjs
git commit -m "feat: add desktop sync runtime"
```

## Task 5: Add Electron main process, tray, and preload bridge

**Files:**
- Create: `electron/main.mjs`
- Create: `electron/window.mjs`
- Create: `electron/tray.mjs`
- Create: `electron/preload.mjs`
- Create: `electron/ipc.mjs`
- Test: `tests/desktop/ipc.test.mjs`

- [ ] **Step 1: Write the failing IPC contract test**

Create `tests/desktop/ipc.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/desktop/ipc.test.mjs`
Expected: FAIL because `electron/ipc.mjs` does not exist.

- [ ] **Step 3: Implement channel map and preload bridge**

Create `electron/ipc.mjs`:

```js
export function getDesktopApiChannels() {
  return {
    loadConfig: "desktop:load-config",
    saveConfig: "desktop:save-config",
    getStatus: "desktop:get-status",
    syncNow: "desktop:sync-now",
    pauseSync: "desktop:pause-sync",
    resumeSync: "desktop:resume-sync",
    openLogs: "desktop:open-logs",
    chooseFolder: "desktop:choose-folder"
  };
}
```

Create `electron/preload.mjs`:

```js
import { contextBridge, ipcRenderer } from "electron";
import { getDesktopApiChannels } from "./ipc.mjs";

const channels = getDesktopApiChannels();

contextBridge.exposeInMainWorld("desktopApi", {
  loadConfig: () => ipcRenderer.invoke(channels.loadConfig),
  saveConfig: (payload) => ipcRenderer.invoke(channels.saveConfig, payload),
  getStatus: () => ipcRenderer.invoke(channels.getStatus),
  syncNow: () => ipcRenderer.invoke(channels.syncNow),
  pauseSync: () => ipcRenderer.invoke(channels.pauseSync),
  resumeSync: () => ipcRenderer.invoke(channels.resumeSync),
  openLogs: () => ipcRenderer.invoke(channels.openLogs),
  chooseFolder: () => ipcRenderer.invoke(channels.chooseFolder)
});
```

- [ ] **Step 4: Add minimal main-process shell**

Create `electron/window.mjs`:

```js
import { BrowserWindow } from "electron";
import path from "node:path";

export function createMainWindow() {
  return new BrowserWindow({
    width: 980,
    height: 760,
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.mjs")
    }
  });
}
```

Create `electron/tray.mjs`:

```js
import { Menu, Tray, nativeImage } from "electron";

function createTrayIcon() {
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
        <rect x="1" y="1" width="14" height="14" rx="4" fill="#10684f"/>
        <path d="M4 5.5h8v1H4zm0 2.5h8v1H4zm0 2.5h5v1H4z" fill="white"/>
      </svg>
    `)}`
  );
}

export function createDesktopTray({ onOpen, onSyncNow, onTogglePause, onQuit }) {
  const tray = new Tray(createTrayIcon());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开设置", click: onOpen },
      { label: "立即同步", click: onSyncNow },
      { label: "暂停 / 恢复同步", click: onTogglePause },
      { type: "separator" },
      { label: "退出", click: onQuit }
    ])
  );
  return tray;
}
```

Create `electron/main.mjs` with minimal bootstrap:

```js
import { app } from "electron";
import { createMainWindow } from "./window.mjs";

let mainWindow;

app.whenReady().then(() => {
  mainWindow = createMainWindow();
  mainWindow.loadFile("renderer/index.html");
  mainWindow.once("ready-to-show", () => mainWindow.show());
});
```

- [ ] **Step 5: Re-run IPC test**

Run: `node --test tests/desktop/ipc.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/main.mjs electron/window.mjs electron/tray.mjs electron/preload.mjs electron/ipc.mjs tests/desktop/ipc.test.mjs
git commit -m "feat: scaffold Electron main process shell"
```

## Task 6: Build MVP renderer for onboarding and status

**Files:**
- Create: `renderer/index.html`
- Create: `renderer/app.css`
- Create: `renderer/app.js`

- [ ] **Step 1: Create the static renderer shell**

Create `renderer/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Notion Sync Desktop</title>
    <link rel="stylesheet" href="./app.css" />
  </head>
  <body>
    <main class="app-shell">
      <section class="hero">
        <p class="eyebrow">Notion Sync</p>
        <h1>把本地 Markdown 自动同步到 Notion</h1>
        <p class="lede">完成一次配置后，应用会在后台持续监听并自动同步。</p>
      </section>

      <section class="panel">
        <form id="config-form">
          <label>Notion Token<input id="notion-token" type="password" /></label>
          <label>Database ID<input id="database-id" type="text" /></label>
          <label>本地文件夹<input id="notes-dir" type="text" readonly /></label>
          <div class="actions">
            <button id="choose-folder" type="button">选择文件夹</button>
            <button type="submit">保存并启动</button>
          </div>
        </form>

        <div id="status-card" class="status-card"></div>
      </section>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Add MVP styling**

Create `renderer/app.css`:

```css
:root {
  --bg: #f4efe7;
  --panel: rgba(255, 252, 247, 0.88);
  --ink: #1c1b19;
  --accent: #10684f;
  --line: rgba(28, 27, 25, 0.12);
}

body {
  margin: 0;
  font-family: "Iowan Old Style", "Georgia", serif;
  color: var(--ink);
  background:
    radial-gradient(circle at top left, rgba(16, 104, 79, 0.15), transparent 36%),
    linear-gradient(180deg, #f7f1e8 0%, #efe7da 100%);
}

.app-shell {
  max-width: 1040px;
  margin: 0 auto;
  padding: 48px 24px 72px;
}

.panel {
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--panel);
  backdrop-filter: blur(14px);
}
```

- [ ] **Step 3: Wire renderer behavior**

Create `renderer/app.js`:

```js
const form = document.querySelector("#config-form");
const notesDirInput = document.querySelector("#notes-dir");
const statusCard = document.querySelector("#status-card");
const chooseFolderButton = document.querySelector("#choose-folder");

function renderStatus(status) {
  statusCard.innerHTML = `
    <h2>当前状态</h2>
    <p>阶段：${status.phase ?? "未启动"}</p>
    <p>运行中：${status.isRunning ? "是" : "否"}</p>
    <p>最近同步文件：${status.lastSyncedFile ?? "暂无"}</p>
    <p>最近错误：${status.lastError ?? "无"}</p>
  `;
}

chooseFolderButton.addEventListener("click", async () => {
  const folder = await window.desktopApi.chooseFolder();
  if (folder) {
    notesDirInput.value = folder;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  await window.desktopApi.saveConfig({
    notionToken: document.querySelector("#notion-token").value,
    notionDatabaseId: document.querySelector("#database-id").value,
    notesDir: notesDirInput.value
  });

  renderStatus(await window.desktopApi.getStatus());
});

renderStatus(await window.desktopApi.getStatus());
```

- [ ] **Step 4: Smoke test the packaged renderer manually**

Run: `npm run desktop:dev`
Expected: Electron window opens, shows onboarding form, and does not crash before IPC wiring is complete.

- [ ] **Step 5: Commit**

```bash
git add renderer/index.html renderer/app.css renderer/app.js
git commit -m "feat: add desktop onboarding renderer"
```

## Task 7: Connect renderer, config, and runtime in the main process

**Files:**
- Modify: `electron/main.mjs`
- Modify: `electron/ipc.mjs`
- Modify: `electron/window.mjs`
- Modify: `electron/tray.mjs`

- [ ] **Step 1: Bind runtime-backed IPC handlers**

Add to `electron/ipc.mjs`:

```js
import { dialog, ipcMain, shell } from "electron";

export function registerDesktopIpc({
  paths,
  getRuntime,
  loadConfig,
  saveConfig,
  browserWindow
}) {
  const channels = getDesktopApiChannels();

  ipcMain.handle(channels.loadConfig, () => loadConfig(paths.configFile));
  ipcMain.handle(channels.saveConfig, async (_event, payload) => {
    await saveConfig(paths.configFile, payload);
    return payload;
  });
  ipcMain.handle(channels.getStatus, () => getRuntime().getStatus());
  ipcMain.handle(channels.syncNow, () => getRuntime().syncNow());
  ipcMain.handle(channels.pauseSync, () => getRuntime().pause());
  ipcMain.handle(channels.resumeSync, () => getRuntime().resume());
  ipcMain.handle(channels.openLogs, () => shell.showItemInFolder(paths.logFile));
  ipcMain.handle(channels.chooseFolder, async () => {
    const result = await dialog.showOpenDialog(browserWindow, {
      properties: ["openDirectory"]
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
```

- [ ] **Step 2: Update main bootstrap to load config, start runtime, and hide-on-close**

Update `electron/main.mjs`:

```js
import { app } from "electron";
import { getAppPaths } from "./app-paths.mjs";
import { loadDesktopConfig, saveDesktopConfig } from "./config-store.mjs";
import { createSyncRuntime } from "./sync-runtime.mjs";
import { createMainWindow } from "./window.mjs";
import { createDesktopTray } from "./tray.mjs";
import { registerDesktopIpc } from "./ipc.mjs";

let runtime;
let mainWindow;
let tray;

app.whenReady().then(async () => {
  const paths = getAppPaths({ userDataPath: app.getPath("userData") });
  const config = await loadDesktopConfig(paths.configFile);

  function createRuntimeForConfig(savedConfig = {}) {
    return createSyncRuntime({
      config: {
        ...savedConfig,
        stateFile: paths.stateFile,
        logFile: paths.logFile
      }
    });
  }

  runtime = createRuntimeForConfig(config);

  mainWindow = createMainWindow();
  await mainWindow.loadFile("renderer/index.html");

  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  registerDesktopIpc({
    paths,
    getRuntime: () => runtime,
    loadConfig: loadDesktopConfig,
    saveConfig: async (filePath, payload) => {
      await runtime.stop();
      await saveDesktopConfig(filePath, payload);
      app.setLoginItemSettings({
        openAtLogin: Boolean(payload.launchAtLogin)
      });
      runtime = createRuntimeForConfig(payload);
      if (payload.notesDir && payload.notionToken && payload.notionDatabaseId) {
        await runtime.start();
      }
      return payload;
    },
    browserWindow: mainWindow
  });

  tray = createDesktopTray({
    onOpen: () => mainWindow.show(),
    onSyncNow: () => runtime.syncNow(),
    onTogglePause: async () => {
      if (runtime.getStatus().isPaused) {
        await runtime.resume();
        return;
      }
      await runtime.pause();
    },
    onQuit: () => {
      app.isQuiting = true;
      app.quit();
    }
  });

  if (config?.notesDir && config?.notionToken && config?.notionDatabaseId) {
    await runtime.start();
  } else {
    mainWindow.show();
  }
});
```

- [ ] **Step 3: Add launch-at-login handling**

Verify the `saveConfig` wiring in `electron/main.mjs` includes:

```js
app.setLoginItemSettings({
  openAtLogin: Boolean(payload.launchAtLogin)
});
```

and ensure the saved payload includes `launchAtLogin`.

- [ ] **Step 4: Manual verification pass**

Run: `npm run desktop:dev`
Expected:
- saving config no longer crashes
- choosing a folder populates the form
- closing the window hides instead of quitting
- tray menu remains available

- [ ] **Step 5: Commit**

```bash
git add electron/main.mjs electron/ipc.mjs electron/window.mjs electron/tray.mjs
git commit -m "feat: wire desktop runtime into Electron shell"
```

## Task 8: Finish packaging docs and full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document desktop usage**

Add a new README section:

````md
## Desktop App MVP

Run the desktop app locally:

```bash
npm install
npm run desktop:dev
```

Package local installers:

```bash
npm run desktop:package
npm run desktop:make
```

The desktop app stores config, state, and logs in the OS app-data directory instead of repo-local `.env` files.
````

- [ ] **Step 2: Run automated tests**

Run:
`node --test tests/desktop/package-scripts.test.mjs tests/desktop/app-paths.test.mjs tests/desktop/config-store.test.mjs tests/sync-notion.test.mjs tests/sync-latest-note.test.mjs tests/watch-notes.test.mjs tests/desktop/sync-runtime.test.mjs tests/desktop/ipc.test.mjs`

Expected: all tests PASS

- [ ] **Step 3: Run desktop smoke verification**

Run:
`npm run desktop:dev`

Verify manually:
- first-run form renders
- folder chooser works
- config persists across relaunch
- close-to-tray works
- sync-now button triggers runtime call

- [ ] **Step 4: Create installers**

Run:
`npm run desktop:make`

Expected: Electron Forge creates platform-specific artifacts under `out/`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add desktop app usage and verification notes"
```

## Self-Review

### Spec coverage

- Desktop app architecture: covered by Tasks 1, 4, 5, 7
- GUI onboarding and status: covered by Task 6
- Background watcher ownership: covered by Tasks 3, 4, 7
- Tray persistence and close-to-background behavior: covered by Tasks 5 and 7
- Launch at login: covered by Task 7
- Packaging for macOS and Windows: covered by Tasks 1 and 8
- Reuse of current sync core: covered by Task 3
- User-facing docs: covered by Task 8

### Placeholder scan

- No `TBD`, `TODO`, or “handle appropriately” style placeholders remain
- Each code-changing step includes concrete file snippets
- Each verification step includes an explicit command and expected result

### Type consistency

- Desktop config keys use one naming scheme throughout:
  - `notionToken`
  - `notionDatabaseId`
  - `notesDir`
  - `stateFile`
  - `logFile`
  - `launchAtLogin`
- Runtime API uses one naming scheme throughout:
  - `start`
  - `stop`
  - `pause`
  - `resume`
  - `syncNow`
  - `getStatus`

Plan complete and saved to `docs/superpowers/plans/2026-04-17-electron-desktop-sync.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
