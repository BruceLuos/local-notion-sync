import fs from "node:fs/promises";

// 从本地状态文件读取 slug -> pageId 映射。
// 这个状态文件的价值在于：
// - 已同步过的页面不用每次都 query Notion 数据库
// - 可以记录某个 slug 当前对应的是哪一个远端 pageId
export async function loadState(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    // 第一次运行时状态文件通常还不存在，这属于正常情况，
    // 所以这里直接返回一个空结构，而不是把它视为错误。
    if (error && error.code === "ENOENT") {
      return { pages: {} };
    }
    throw error;
  }
}

// 把当前状态完整写回磁盘。
// 使用两空格缩进和结尾换行，主要是为了便于人手查看和 git diff。
export async function saveState(filePath, state) {
  const payload = JSON.stringify(state, null, 2);
  await fs.writeFile(filePath, `${payload}\n`, "utf8");
}
