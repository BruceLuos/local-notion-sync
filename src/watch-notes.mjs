import process from "node:process";
import path from "node:path";
import chokidar from "chokidar";
import "dotenv/config";

import { syncFile } from "./sync-notion.mjs";

if (!process.env.NOTES_DIR) {
  console.error("缺少环境变量：NOTES_DIR");
  process.exit(1);
}

const notesPattern = path.join(process.env.NOTES_DIR, "**/*.md");
const pending = new Map();

function queueSync(filePath) {
  const absolutePath = path.resolve(filePath);
  const existing = pending.get(absolutePath);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(async () => {
    pending.delete(absolutePath);
    try {
      await syncFile(absolutePath);
    } catch (error) {
      console.error(`同步失败 ${absolutePath}: ${error.message}`);
    }
  }, 500);

  pending.set(absolutePath, timeout);
}

const watcher = chokidar.watch(notesPattern, {
  ignoreInitial: false,
  awaitWriteFinish: {
    stabilityThreshold: 800,
    pollInterval: 100
  }
});

watcher
  .on("add", queueSync)
  .on("change", queueSync)
  .on("error", (error) => {
    console.error(`监听器错误：${error.message}`);
  });

console.log(`正在监听：${notesPattern}`);
