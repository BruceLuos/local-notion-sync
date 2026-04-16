import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { loadProjectEnv } from "./env-loader.mjs";

import { createNotionClient, createPage, findPageBySlug, markdownToBlocks, replacePageContent, updatePageProperties } from "./notion-client.mjs";
import { parseNote } from "./parse-note.mjs";
import { loadState, saveState } from "./state-store.mjs";

// 同步逻辑依赖 notion-sync 自己的配置，而不是调用方当前目录下的 `.env`。
loadProjectEnv(import.meta.url);

// 单篇文件同步到 Notion 时必需的最小配置。
// `NOTES_DIR` 不在这里校验，因为按文件路径直传时并不依赖目录扫描。
const requiredKeys = ["NOTION_TOKEN", "NOTION_DATABASE_ID", "STATE_FILE"];

// 在真正发请求前统一校验环境变量，避免中途才因空值报出更难理解的异常。
function assertEnv() {
  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`缺少环境变量：${missing.join(", ")}`);
  }
}

// 把单个 Markdown 文件同步到 Notion。
// 主要流程分成四步：
// 1. 解析 markdown 和 frontmatter
// 2. 把正文转成 Notion block
// 3. 先从本地状态或 Notion 数据库里找对应页面
// 4. 找到则更新，找不到则创建，然后刷新本地 slug -> pageId 映射
export async function syncFile(filePath, options = {}) {
  assertEnv();
  const { silent = false } = options;

  // Notion 客户端和笔记解析都在这里按需初始化，
  // 保持模块加载阶段足够轻，便于测试和复用。
  const notion = createNotionClient(process.env.NOTION_TOKEN);
  const note = await parseNote(path.resolve(filePath));
  const blocks = markdownToBlocks(note.content);
  const state = await loadState(process.env.STATE_FILE);
  state.pages ||= {};

  // 优先命中本地状态缓存，避免每次都先 query Notion 数据库；
  // 如果缓存不存在，再回退到按 slug 查询远端页面。
  const cachedPageId = state.pages?.[note.slug]?.pageId;
  let page = cachedPageId ? { id: cachedPageId } : await findPageBySlug(notion, process.env.NOTION_DATABASE_ID, note.slug);

  if (!page) {
    // 首次同步：创建新页面，并立刻把 pageId 写入状态文件，
    // 这样后续同一 slug 就能走更快的更新路径。
    page = await createPage(
      notion,
      process.env.NOTION_DATABASE_ID,
      note,
      blocks,
      process.env.SOURCE_BASE_URL || ""
    );
    state.pages[note.slug] = { pageId: page.id, filePath: note.filePath };
    await saveState(process.env.STATE_FILE, state);
    if (!silent) {
      console.log(`已创建：${note.slug}`);
    }
    return;
  }

  // 已存在页面：先更新属性，再整体替换正文内容。
  await updatePageProperties(notion, page.id, note, process.env.SOURCE_BASE_URL || "");
  await replacePageContent(notion, page.id, blocks);
  state.pages[note.slug] = { pageId: page.id, filePath: note.filePath };
  await saveState(process.env.STATE_FILE, state);
  if (!silent) {
    console.log(`已更新：${note.slug}`);
  }
}

// CLI 模式要求显式传入目标文件路径，避免误同步。
async function main() {
  const [, , targetPath] = process.argv;
  if (!targetPath) {
    console.error("用法：npm run sync -- /绝对路径/到/笔记.md");
    process.exit(1);
  }

  await syncFile(targetPath);
}

// 与其他脚本保持一致：被 import 时不自动执行，直接运行时才进入入口函数。
const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
