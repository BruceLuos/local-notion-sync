import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

// 把任意标题或 slug 源值规整成 Notion 数据库里稳定可查的 slug。
// 当前规则偏保守，只保留小写字母、数字和连字符，便于跨平台和 URL 使用。
function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 读取并解析一篇 Markdown 笔记，产出后续同步链路统一使用的 note 对象。
// 这里负责把文件内容、frontmatter 和路径信息揉成一个稳定结构。
export async function parseNote(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const { data, content } = matter(raw);
  const parsedPath = path.parse(filePath);
  const fallbackName = parsedPath.name;

  // 标题优先用 frontmatter.title；没有的话退回文件名。
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : fallbackName;

  // slug 优先用 frontmatter.slug；没有的话再退回标题或文件名。
  // 最终还会统一经过 slugify，避免用户直接填入不稳定字符。
  const slugSource =
    typeof data.slug === "string" && data.slug.trim() ? data.slug.trim() : title || fallbackName;

  return {
    filePath,
    title,
    slug: slugify(slugSource),
    // 下面这些字段都是“尽量容错地读取”：
    // frontmatter 缺项时给默认值，而不是直接抛错，
    // 这样对手写笔记更友好。
    tags: Array.isArray(data.tags) ? data.tags.filter(Boolean).map(String) : [],
    status: typeof data.status === "string" ? data.status : "",
    sourceUrl: typeof data.source_url === "string" ? data.source_url : "",
    // 正文在同步前会 trim，一方面减少无意义空白，
    // 另一方面让“只有空行”的文档统一表现为空正文。
    content: content.trim(),
    // 原始 frontmatter 整体保留下来，方便未来扩展更多属性映射。
    metadata: data
  };
}
