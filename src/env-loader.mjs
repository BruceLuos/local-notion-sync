import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// 根据当前模块的 `import.meta.url` 反推出 notion-sync 项目根目录。
// 约定是：这些脚本都位于 `src/` 下，所以向上一层就是项目根目录。
export function getProjectRoot(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}

// 从 notion-sync 项目根目录加载 `.env`。
// 这里刻意不使用 `process.cwd()`，因为这些脚本经常会被：
// - 在别的仓库里通过绝对路径调用
// - 被 Codex hook 调用
// - 被 launchd / watcher 常驻进程调用
// 如果按 cwd 取 `.env`，就很容易读到错误配置。
export function loadProjectEnv(importMetaUrl) {
  const projectRoot = getProjectRoot(importMetaUrl);
  const envPath = path.join(projectRoot, ".env");
  dotenv.config({ path: envPath });

  // 把解析出的关键信息返回给调用方，方便测试或调试时检查实际加载位置。
  return { projectRoot, envPath };
}
