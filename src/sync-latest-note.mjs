import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import "dotenv/config";

import { syncFile } from "./sync-notion.mjs";

async function collectMarkdownFiles(dirPath) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
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

async function findLatestMarkdownFile(dirPath) {
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

async function main() {
  const required = ["NOTES_DIR", "NOTION_TOKEN", "NOTION_DATABASE_ID", "STATE_FILE"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.log(`notion-sync 已跳过：缺少 ${missing.join(", ")}`);
    return;
  }

  const latest = await findLatestMarkdownFile(process.env.NOTES_DIR);
  if (!latest) {
    console.log("没有找到可同步的 Markdown 笔记");
    return;
  }

  await syncFile(latest);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
