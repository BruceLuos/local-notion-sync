import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function parseNote(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const { data, content } = matter(raw);
  const parsedPath = path.parse(filePath);
  const fallbackName = parsedPath.name;
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : fallbackName;
  const slugSource =
    typeof data.slug === "string" && data.slug.trim() ? data.slug.trim() : title || fallbackName;

  return {
    filePath,
    title,
    slug: slugify(slugSource),
    tags: Array.isArray(data.tags) ? data.tags.filter(Boolean).map(String) : [],
    status: typeof data.status === "string" ? data.status : "",
    sourceUrl: typeof data.source_url === "string" ? data.source_url : "",
    content: content.trim(),
    metadata: data
  };
}
