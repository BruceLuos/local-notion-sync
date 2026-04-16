import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { getProjectRoot } from "./env-loader.mjs";

// 把不同类型的字段值统一压平为适合写单行日志的字符串。
// 这里刻意做得比较保守：
// 1. `undefined/null/空串` 直接忽略，避免日志里出现大量无意义字段
// 2. 数组使用逗号连接，方便像 `missing` 这类字段直接阅读
// 3. 其余值转成字符串后压缩空白字符，保证每条日志尽量只占一行
function normalizeLogValue(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (Array.isArray(value)) {
    return value.join(",");
  }

  return String(value).replace(/\s+/g, " ").trim();
}

// 统一计算日志文件路径。
// 默认写到 notion-sync 仓库内的 `logs/notion-sync.log`，
// 但也允许通过环境变量覆盖，方便测试或未来迁移到别的目录。
export function getLogFilePath(importMetaUrl) {
  if (process.env.NOTION_SYNC_LOG_FILE) {
    return path.resolve(process.env.NOTION_SYNC_LOG_FILE);
  }

  return path.join(getProjectRoot(importMetaUrl), "logs", "notion-sync.log");
}

// 追加一条同步日志。
// 日志格式故意保持为“时间戳 + 状态 + key=value 字段”的纯文本单行：
// - 人眼直接 `tail -f` 就能看
// - 出问题时不依赖额外解析器
// - 也方便后续用 grep / rg 按状态或字段检索
export async function appendSyncLog(importMetaUrl, entry) {
  const logFilePath = getLogFilePath(importMetaUrl);
  const fields = [];
  const timestamp = new Date().toISOString();

  // `status` 会被写进方括号里，保持视觉上最显眼；
  // 其余字段统一按 `key=value` 形式附在后面。
  for (const [key, value] of Object.entries(entry)) {
    if (key === "status") {
      continue;
    }

    const normalized = normalizeLogValue(value);
    if (!normalized) {
      continue;
    }

    fields.push(`${key}=${normalized}`);
  }

  const line = `${timestamp} [${entry.status}]${fields.length ? ` ${fields.join(" ")}` : ""}\n`;

  // 无论日志目录是否存在，都先确保它可用，
  // 这样调用方不需要关心初始化目录这件事。
  await fs.mkdir(path.dirname(logFilePath), { recursive: true });
  await fs.appendFile(logFilePath, line, "utf8");

  return logFilePath;
}
