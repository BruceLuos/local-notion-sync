import process from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import chokidar from "chokidar";
import { loadProjectEnv } from "./env-loader.mjs";
import { createQueueEventProcessor } from "./queue-worker.mjs";
import { drainQueueEvents, ensureQueueFile } from "./sync-queue.mjs";

import { syncLatestNote } from "./sync-latest-note.mjs";
import { syncFile } from "./sync-notion.mjs";

// watcher 可能由 launchd、shell、Codex 等不同入口拉起，
// 所以先统一加载 notion-sync 自己的 `.env`。
loadProjectEnv(import.meta.url);

// 统一判断某个路径是不是我们关心的 Markdown 笔记文件。
// watcher 改为监听目录本身后，会接收到目录内各种文件事件，
// 所以这里需要一道显式过滤。
export function isMarkdownNotePath(filePath) {
  return typeof filePath === "string" && filePath.endsWith(".md");
}

// 监听目标改为 NOTES_DIR 根目录，而不是 `**/*.md` glob。
// 这样可以显著减少底层 watch 句柄数量，避开当前遇到的 `EMFILE` 问题。
export function getNotesWatchTarget(notesDir) {
  return path.resolve(notesDir);
}

// 为 notes watcher 统一生成一套更稳的配置。
// 这里显式使用 polling，是为了降低 launchd 后台场景下对底层 fs event 的依赖。
export function createNotesWatcherOptions() {
  return {
    ignoreInitial: false,
    ignorePermissionErrors: true,
    usePolling: true,
    interval: 300,
    binaryInterval: 300,
    awaitWriteFinish: {
      stabilityThreshold: 800,
      pollInterval: 100
    }
  };
}

// 队列文件也使用 polling，同样优先选择稳定性而不是最省资源的模式。
export function createQueueWatcherOptions() {
  return {
    ignoreInitial: false,
    ignorePermissionErrors: true,
    usePolling: true,
    interval: 200,
    binaryInterval: 200,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50
    }
  };
}

// 启动整个 watcher 体系：
// - 一个 watcher 负责监听 NOTES_DIR 下的 markdown 变化
// - 一个 watcher 负责监听 Stop hook 投递的本地队列文件
export async function startWatchers(options = {}) {
  const {
    notesDir = process.env.NOTES_DIR,
    chokidarImpl = chokidar,
    syncFileImpl = syncFile,
    syncLatestImpl = syncLatestNote,
    drainQueueEventsImpl = drainQueueEvents,
    ensureQueueFileImpl = ensureQueueFile,
    consoleImpl = console
  } = options;

  if (!notesDir) {
    throw new Error("缺少环境变量：NOTES_DIR");
  }

  const notesWatchTarget = getNotesWatchTarget(notesDir);
  const queueFilePath = await ensureQueueFileImpl();

  // 用来做“防抖”的定时器表：
  // 某个文件在短时间内连续触发 add/change 时，只保留最后一次同步。
  const pending = new Map();
  const processQueueEvents = createQueueEventProcessor({
    syncLatest: syncLatestImpl
  });
  let isDrainingQueue = false;

  function queueSync(filePath) {
    if (!isMarkdownNotePath(filePath)) {
      return;
    }

    const absolutePath = path.resolve(filePath);
    const existing = pending.get(absolutePath);
    if (existing) {
      // 保存时编辑器可能连发多次 change 事件，先清掉旧定时器，
      // 避免同一文件被重复同步。
      clearTimeout(existing);
    }

    const timeout = setTimeout(async () => {
      pending.delete(absolutePath);
      try {
        // 真正的同步仍然复用单文件同步逻辑，watcher 只负责调度触发。
        await syncFileImpl(absolutePath);
      } catch (error) {
        // watcher 是常驻进程，单次失败只记录错误，不让整个监听器退出。
        consoleImpl.error(`同步失败 ${absolutePath}: ${error.message}`);
      }
    }, 500);

    pending.set(absolutePath, timeout);
  }

  async function drainAndProcessQueue() {
    if (isDrainingQueue) {
      return;
    }

    isDrainingQueue = true;

    try {
      while (true) {
        const { events, invalidLines } = await drainQueueEventsImpl(import.meta.url);

        for (const invalidLine of invalidLines) {
          consoleImpl.error(
            `队列事件无效 line=${invalidLine.lineNumber}: ${invalidLine.message}`
          );
        }

        if (!events.length && !invalidLines.length) {
          break;
        }

        try {
          await processQueueEvents(events);
        } catch (error) {
          consoleImpl.error(`队列同步失败: ${error.message}`);
        }
      }
    } finally {
      isDrainingQueue = false;
    }
  }

  const watcher = chokidarImpl.watch(notesWatchTarget, createNotesWatcherOptions());
  const queueWatcher = chokidarImpl.watch(queueFilePath, createQueueWatcherOptions());

  watcher
    // 新建和修改都进入同一套排队逻辑，减少重复分支。
    .on("add", queueSync)
    .on("change", queueSync)
    .on("error", (error) => {
      consoleImpl.error(`监听器错误：${error.message}`);
    });

  queueWatcher
    .on("add", () => {
      void drainAndProcessQueue();
    })
    .on("change", () => {
      void drainAndProcessQueue();
    })
    .on("error", (error) => {
      consoleImpl.error(`队列监听器错误：${error.message}`);
    });

  // 保留启动日志，方便确认 watcher 当前到底在盯哪个目录和队列文件。
  consoleImpl.log(`正在监听：${notesWatchTarget}`);
  consoleImpl.log(`正在监听队列：${queueFilePath}`);
  void drainAndProcessQueue();

  return { watcher, queueWatcher, notesWatchTarget, queueFilePath };
}

async function main() {
  try {
    await startWatchers();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  void main();
}
