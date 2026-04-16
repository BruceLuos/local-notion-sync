import process from "node:process";
import { pathToFileURL } from "node:url";

import { appendQueueEvent } from "./sync-queue.mjs";

// Codex hook 只能通过 stdout 读取结构化结果，
// 所以这里用一个很小的工具函数统一输出 JSON 行。
function emitJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export async function requestLatestSyncFromStopHook() {
  return appendQueueEvent(import.meta.url, {
    type: "sync_latest",
    source: "stop-hook",
    createdAt: new Date().toISOString()
  });
}

// Stop hook 的目标不是“强制同步成功”，而是“投递同步请求且不要打断会话结束”。
async function main() {
  try {
    await requestLatestSyncFromStopHook();
  } catch (error) {
    // 失败时不抛出未捕获异常，避免 hook 把整个结束流程搞乱；
    // 而是返回一条系统警告，让上层有机会展示给用户。
    emitJson({
      continue: true,
      systemMessage: `notion-sync Stop hook 执行失败：${error.message}`
    });
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// 这个文件的职责非常单一，直接运行一次入口即可。
if (isEntrypoint) {
  main();
}
