import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

// 这一组变量覆盖了 `syncLatestNote` 判定“是否需要跳过”的核心输入。
// 测试前后统一备份和恢复，避免污染本机真实环境。
const ENV_KEYS = [
  "NOTES_DIR",
  "NOTION_TOKEN",
  "NOTION_DATABASE_ID",
  "STATE_FILE",
  "NOTION_SYNC_LOG_FILE"
];

test("syncLatestNote writes a skipped log when required env is missing", async () => {
  // 用临时目录承接测试日志，确保测试不写入真实 `logs/notion-sync.log`。
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "notion-sync-log-"));
  const logFilePath = path.join(tempRoot, "logs", "notion-sync.log");
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  try {
    const { syncLatestNote } = await import("../src/sync-latest-note.mjs");

    // 故意清空所有必需环境变量，制造“应该被跳过”的场景。
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    // 单独把日志路径指到临时目录，便于断言写入结果。
    process.env.NOTION_SYNC_LOG_FILE = logFilePath;

    const result = await syncLatestNote({ silent: true });
    const logContent = await fs.readFile(logFilePath, "utf8");

    // 验证两件事：
    // 1. 返回值确实说明这次同步被跳过
    // 2. 日志文件里留下了足够定位原因的信息
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "missing_env");
    assert.match(logContent, /\[skipped\]/);
    assert.match(logContent, /reason=missing_env/);
    assert.match(logContent, /missing=NOTES_DIR,NOTION_TOKEN,NOTION_DATABASE_ID,STATE_FILE/);
  } finally {
    // 测试结束后恢复环境变量并删除临时目录，保持测试可重复执行。
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
