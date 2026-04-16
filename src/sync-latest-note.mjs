import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { loadProjectEnv } from "./env-loader.mjs";

import { appendSyncLog } from "./sync-log.mjs";
import { syncFile } from "./sync-notion.mjs";

// 在模块加载时先读取 notion-sync 自己的 `.env`，
// 避免这个脚本被从别的 cwd 调用时读错环境变量。
loadProjectEnv(import.meta.url);

// 列出“同步最新文档”这条链路最少依赖的环境变量。
// 这里不直接抛错，而是先让上层决定：
// - CLI 模式下可以打印友好的跳过提示
// - Stop hook 模式下可以静默返回并写日志
export function getMissingEnvKeys() {
  const required = ["NOTES_DIR", "NOTION_TOKEN", "NOTION_DATABASE_ID", "STATE_FILE"];
  return required.filter((key) => !process.env[key]);
}

// 递归收集目录下的所有 Markdown 文件。
// 之所以不用一层 `readdir` 就结束，是因为 NOTES_DIR 下可能会继续按主题分子目录。
export async function collectMarkdownFiles(dirPath) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    // NOTES_DIR 还不存在时，按“没有可同步文件”处理会比直接抛异常更稳，
    // 尤其是在新机器或临时目录场景下更友好。
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return collectMarkdownFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
    })
  );

  return files.flat();
}

// 找出最近一次被修改的 Markdown 文件。
// 当前 `sync:latest` 的定义就是“同步最新改动的一篇”，
// 所以这里按 mtime 倒序选择第一项。
export async function findLatestMarkdownFile(dirPath) {
  const files = await collectMarkdownFiles(dirPath);
  if (!files.length) {
    return null;
  }

  const stats = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      mtimeMs: (await fs.stat(filePath)).mtimeMs
    }))
  );

  stats.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return stats[0].filePath;
}

// 同步 NOTES_DIR 里最近更新的一篇笔记。
// 这个函数同时服务于：
// - `npm run sync:latest` 命令行入口
// - Codex `Stop` hook 的静默同步入口
//
// 因此它会统一返回结构化结果，并在每个关键分支都写日志，
// 这样 CLI 与 hook 就不需要各自重复处理状态记录。
export async function syncLatestNote(options = {}) {
  const { silent = false, source = "sync:latest" } = options;

  // 先留一个空值占位，方便后续失败时把“原本准备同步哪一篇”写进日志。
  let latest = null;

  try {
    const missing = getMissingEnvKeys();
    if (missing.length) {
      // 缺环境变量时不算程序异常，而算“本次跳过”：
      // 这样 Stop hook 不会因为配置未完成而干扰正常会话结束。
      const result = { status: "skipped", reason: "missing_env", missing };
      await appendSyncLog(import.meta.url, { source, ...result });

      if (!silent) {
        console.log(`notion-sync 已跳过：缺少 ${missing.join(", ")}`);
      }
      return result;
    }

    // 只有在依赖齐全时才去扫描 NOTES_DIR，避免无效 IO。
    latest = await findLatestMarkdownFile(process.env.NOTES_DIR);
    if (!latest) {
      // 目录存在但没有 markdown 文件，同样按“跳过”处理并记录原因。
      const result = { status: "skipped", reason: "no_notes" };
      await appendSyncLog(import.meta.url, { source, ...result });

      if (!silent) {
        console.log("没有找到可同步的 Markdown 笔记");
      }
      return result;
    }

    // 真正的同步动作仍然委托给 `syncFile`，
    // 这里负责的是“选哪一篇”和“把结果记下来”。
    await syncFile(latest, { silent });

    const result = { status: "synced", filePath: latest };
    await appendSyncLog(import.meta.url, { source, ...result });
    return result;
  } catch (error) {
    // 任何运行期异常都落成 failed 日志，保留来源、目标文件和错误信息，
    // 便于后续从日志快速判断是网络问题、Notion 配置问题还是单篇文档问题。
    await appendSyncLog(import.meta.url, {
      status: "failed",
      source,
      reason: "sync_error",
      filePath: latest,
      message: error.message
    });
    throw error;
  }
}

// CLI 入口默认执行一次“同步最新文档”。
async function main() {
  await syncLatestNote();
}

// 只在文件被直接执行时进入 CLI 模式；
// 如果是被别的模块 import，就只暴露函数，不自动运行。
const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    // 保持命令行行为简单明确：打印错误消息并返回非 0 状态码。
    console.error(error.message);
    process.exit(1);
  });
}
