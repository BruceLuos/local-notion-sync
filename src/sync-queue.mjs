import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_QUEUE_FILE = "/tmp/notion-sync-queue.jsonl";

// 统一计算队列文件路径。
// 默认放到 `/tmp`，因为这个队列本质上只是 Stop hook 与本机常驻进程之间的临时桥梁，
// 不需要进入仓库，也不需要长期保存。
export function getQueueFilePath() {
  if (process.env.NOTION_SYNC_QUEUE_FILE) {
    return path.resolve(process.env.NOTION_SYNC_QUEUE_FILE);
  }

  return DEFAULT_QUEUE_FILE;
}

// 确保队列文件及其父目录存在。
// watcher 和 Stop hook 都会调用它，这样双方都不需要关心“文件是否已初始化”。
export async function ensureQueueFile() {
  const queueFilePath = getQueueFilePath();
  await fs.mkdir(path.dirname(queueFilePath), { recursive: true });
  await fs.appendFile(queueFilePath, "", "utf8");
  return queueFilePath;
}

// 追加一条 JSONL 队列事件。
// 这里故意保持“一行一个 JSON 对象”的格式，便于：
// - Stop hook 低成本投递
// - 人手查看队列内容
// - watcher 按批次整体 drain
export async function appendQueueEvent(importMetaUrl, event) { // eslint-disable-line no-unused-vars
  const queueFilePath = await ensureQueueFile();
  await fs.appendFile(queueFilePath, `${JSON.stringify(event)}\n`, "utf8");
  return queueFilePath;
}

// 把队列文件内容解析成事件数组。
// 非法 JSON 行不会中断整个消费过程，而是被单独记录到 `invalidLines`，
// 交给上层决定如何打日志。
export function parseQueueEvents(raw) {
  const events = [];
  const invalidLines = [];
  const lines = raw.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    try {
      events.push(JSON.parse(line));
    } catch (error) {
      invalidLines.push({
        lineNumber: index + 1,
        raw: line,
        message: error.message
      });
    }
  }

  return { events, invalidLines };
}

// 原子地“取走”当前队列文件并解析事件。
// 核心思路不是直接读完后清空，而是：
// 1. 先把当前队列文件 rename 成一个 processing 文件
// 2. 立即重建一个新的空队列文件
// 3. 再去处理刚才 rename 出来的那份内容
//
// 这样就能避免在“读取旧队列”和“新事件继续写入”之间相互覆盖。
export async function drainQueueEvents(importMetaUrl) { // eslint-disable-line no-unused-vars
  const queueFilePath = await ensureQueueFile();
  const processingFilePath = `${queueFilePath}.${process.pid}.${Date.now()}.processing`;

  // 空文件直接视为“当前没有待处理事件”。
  const stats = await fs.stat(queueFilePath);
  if (stats.size === 0) {
    return { queueFilePath, events: [], invalidLines: [] };
  }

  // 把当前队列切走，新的投递会继续落到重建后的队列文件中。
  await fs.rename(queueFilePath, processingFilePath);
  await ensureQueueFile();

  try {
    const raw = await fs.readFile(processingFilePath, "utf8");
    return {
      queueFilePath,
      ...parseQueueEvents(raw)
    };
  } finally {
    // 无论解析成功还是失败，processing 文件都只是一份临时副本，处理后就删除。
    await fs.rm(processingFilePath, { force: true });
  }
}
