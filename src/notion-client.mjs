import { Client } from "@notionhq/client";

// Notion 单个 rich_text 节点的 `content` 长度有限制，
// 所以所有文本写入前都统一走这个裁剪入口。
function textBlock(content) {
  return {
    type: "text",
    text: {
      content: content.slice(0, 2000)
    }
  };
}

// 把长文本拆成多个 rich_text 片段。
// 这里预留到 1800 而不是硬贴 2000，是给未来可能附加标记或格式留一点安全余量。
function chunkRichText(content, chunkSize = 1800) {
  const chunks = [];
  let cursor = 0;
  while (cursor < content.length) {
    chunks.push(textBlock(content.slice(cursor, cursor + chunkSize)));
    cursor += chunkSize;
  }
  return chunks.length ? chunks : [textBlock("")];
}

// 下面这些 helper 都是在把 Markdown 结构映射成 Notion block。
// 这样主转换函数里只需要决定“当前行属于什么结构”，不用重复拼对象字面量。
function paragraphBlock(content) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: chunkRichText(content) }
  };
}

function headingBlock(level, content) {
  const key = `heading_${level}`;
  return {
    object: "block",
    type: key,
    [key]: { rich_text: chunkRichText(content) }
  };
}

function listBlock(type, content) {
  return {
    object: "block",
    type,
    [type]: { rich_text: chunkRichText(content) }
  };
}

function codeBlock(content, language = "plain text") {
  return {
    object: "block",
    type: "code",
    code: {
      language,
      rich_text: chunkRichText(content)
    }
  };
}

function quoteBlock(content) {
  return {
    object: "block",
    type: "quote",
    quote: { rich_text: chunkRichText(content) }
  };
}

function dividerBlock() {
  return { object: "block", type: "divider", divider: {} };
}

function calloutBlock(content) {
  return {
    object: "block",
    type: "callout",
    callout: {
      icon: { emoji: "📝" },
      rich_text: chunkRichText(content)
    }
  };
}

// 将 Markdown 文本转换成 Notion blocks。
// 当前支持的是一组“足够覆盖常见工作笔记”的基础语法，
// 目标不是 100% 还原 Markdown，而是稳定、简单、可维护。
export function markdownToBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split("\n");
  let paragraphBuffer = [];
  let codeBuffer = [];
  let codeLanguage = "plain text";
  let inCodeFence = false;

  // 段落以“连续非空普通文本行”为单位缓存，
  // 碰到空行或其他结构化块时再一次性 flush 成一个 paragraph block。
  const flushParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }
    const content = paragraphBuffer.join(" ").trim();
    if (content) {
      blocks.push(paragraphBlock(content));
    }
    paragraphBuffer = [];
  };

  // 代码块在三反引号之间缓存所有原始行，
  // 保持换行，不做额外 trim，这样更接近原文。
  const flushCode = () => {
    if (!codeBuffer.length) {
      return;
    }
    blocks.push(codeBlock(codeBuffer.join("\n"), codeLanguage));
    codeBuffer = [];
    codeLanguage = "plain text";
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // 三反引号既可能是“进入代码块”，也可能是“结束代码块”，
    // 因此这里根据 `inCodeFence` 状态切换。
    if (trimmed.startsWith("```")) {
      flushParagraph();
      if (inCodeFence) {
        flushCode();
        inCodeFence = false;
      } else {
        inCodeFence = true;
        codeLanguage = trimmed.slice(3).trim() || "plain text";
      }
      continue;
    }

    // 代码块内部不再尝试解析标题、列表等 markdown 结构，
    // 原样收集即可。
    if (inCodeFence) {
      codeBuffer.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // 单独一行 `---` 映射为分割线。
    if (trimmed === "---") {
      flushParagraph();
      blocks.push(dividerBlock());
      continue;
    }

    // 只支持 h1-h3，是因为工作笔记场景下已经够用，
    // 再高层级继续加收益不大。
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push(headingBlock(headingMatch[1].length, headingMatch[2]));
      continue;
    }

    // Todo 列表和普通列表分开处理，
    // 因为 Notion 里它们对应的是不同 block 类型。
    const todoMatch = trimmed.match(/^- \[( |x)\]\s+(.*)$/i);
    if (todoMatch) {
      flushParagraph();
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          checked: todoMatch[1].toLowerCase() === "x",
          rich_text: chunkRichText(todoMatch[2])
        }
      });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      blocks.push(listBlock("bulleted_list_item", bulletMatch[1]));
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numberedMatch) {
      flushParagraph();
      blocks.push(listBlock("numbered_list_item", numberedMatch[1]));
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s+(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      blocks.push(quoteBlock(quoteMatch[1]));
      continue;
    }

    // 用 `! ` 开头的行作为 callout 的一个轻量约定，
    // 方便在原始 Markdown 里快速表达“提醒/备注”。
    const calloutMatch = trimmed.match(/^!\s+(.*)$/);
    if (calloutMatch) {
      flushParagraph();
      blocks.push(calloutBlock(calloutMatch[1]));
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushCode();

  // Notion 单次 children 数量也有限，这里统一截到 100；
  // 如果正文完全为空，则补一个占位段落，避免创建空页面内容。
  return blocks.length ? blocks.slice(0, 100) : [paragraphBlock("无正文内容")];
}

// 包一层工厂函数，方便未来替换客户端初始化策略或在测试里 mock。
export function createNotionClient(auth) {
  return new Client({ auth });
}

// 按数据库里的 `Slug` 字段查找页面。
// 约定 slug 是页面的稳定主键，所以这里只取第一条结果即可。
export async function findPageBySlug(notion, databaseId, slug) {
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: "Slug",
      rich_text: { equals: slug }
    },
    page_size: 1
  });

  return response.results[0] || null;
}

// 统一构造页面属性，保证创建和更新页面时写入规则完全一致。
function buildProperties(note, sourceBaseUrl) {
  const sourceValue = sourceBaseUrl
    ? `${sourceBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(note.slug)}`
    : note.filePath;

  return {
    // 这里的几个字段名称直接对应 README 里约定好的 Notion 数据库 schema。
    Name: {
      title: [{ text: { content: note.title.slice(0, 2000) } }]
    },
    Slug: {
      rich_text: [{ text: { content: note.slug.slice(0, 2000) } }]
    },
    UpdatedAt: {
      date: { start: new Date().toISOString() }
    },
    SourcePath: {
      rich_text: [{ text: { content: sourceValue.slice(0, 2000) } }]
    }
  };
}

// 创建页面时除了属性，还会直接带上正文 blocks。
export async function createPage(notion, databaseId, note, blocks, sourceBaseUrl) {
  return notion.pages.create({
    parent: { database_id: databaseId },
    properties: buildProperties(note, sourceBaseUrl),
    children: blocks
  });
}

// 更新时只修改页面属性，不动正文内容。
export async function updatePageProperties(notion, pageId, note, sourceBaseUrl) {
  return notion.pages.update({
    page_id: pageId,
    properties: buildProperties(note, sourceBaseUrl)
  });
}

// 用“先删旧 children，再批量 append 新 children”的方式整体替换正文。
// 这不是最细粒度的 diff 更新，但实现简单、结果稳定，适合当前这个同步工具。
export async function replacePageContent(notion, pageId, blocks) {
  const childBlockIds = [];
  let cursor;

  // 先把现有子 block 全部翻页取完。
  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100
    });

    childBlockIds.push(...response.results.map((block) => block.id));
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  // Notion 不支持一次性“清空全部 children”，所以逐个 delete。
  for (const blockId of childBlockIds) {
    await notion.blocks.delete({ block_id: blockId });
  }

  // Notion append children 也有单次上限，这里按 100 个一批提交。
  for (let index = 0; index < blocks.length; index += 100) {
    const children = blocks.slice(index, index + 100);
    await notion.blocks.children.append({
      block_id: pageId,
      children
    });
  }
}
