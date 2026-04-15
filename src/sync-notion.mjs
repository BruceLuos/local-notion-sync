import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import "dotenv/config";

import { createNotionClient, createPage, findPageBySlug, markdownToBlocks, replacePageContent, updatePageProperties } from "./notion-client.mjs";
import { parseNote } from "./parse-note.mjs";
import { loadState, saveState } from "./state-store.mjs";

const requiredKeys = ["NOTION_TOKEN", "NOTION_DATABASE_ID", "STATE_FILE"];

function assertEnv() {
  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`缺少环境变量：${missing.join(", ")}`);
  }
}

export async function syncFile(filePath) {
  assertEnv();

  const notion = createNotionClient(process.env.NOTION_TOKEN);
  const note = await parseNote(path.resolve(filePath));
  const blocks = markdownToBlocks(note.content);
  const state = await loadState(process.env.STATE_FILE);
  state.pages ||= {};
  const cachedPageId = state.pages?.[note.slug]?.pageId;
  let page = cachedPageId ? { id: cachedPageId } : await findPageBySlug(notion, process.env.NOTION_DATABASE_ID, note.slug);

  if (!page) {
    page = await createPage(
      notion,
      process.env.NOTION_DATABASE_ID,
      note,
      blocks,
      process.env.SOURCE_BASE_URL || ""
    );
    state.pages[note.slug] = { pageId: page.id, filePath: note.filePath };
    await saveState(process.env.STATE_FILE, state);
    console.log(`已创建：${note.slug}`);
    return;
  }

  await updatePageProperties(notion, page.id, note, process.env.SOURCE_BASE_URL || "");
  await replacePageContent(notion, page.id, blocks);
  state.pages[note.slug] = { pageId: page.id, filePath: note.filePath };
  await saveState(process.env.STATE_FILE, state);
  console.log(`已更新：${note.slug}`);
}

async function main() {
  const [, , targetPath] = process.argv;
  if (!targetPath) {
    console.error("用法：npm run sync -- /绝对路径/到/笔记.md");
    process.exit(1);
  }

  await syncFile(targetPath);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
