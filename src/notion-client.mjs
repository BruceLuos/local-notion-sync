import { Client } from "@notionhq/client";

function textBlock(content) {
  return {
    type: "text",
    text: {
      content: content.slice(0, 2000)
    }
  };
}

function chunkRichText(content, chunkSize = 1800) {
  const chunks = [];
  let cursor = 0;
  while (cursor < content.length) {
    chunks.push(textBlock(content.slice(cursor, cursor + chunkSize)));
    cursor += chunkSize;
  }
  return chunks.length ? chunks : [textBlock("")];
}

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

export function markdownToBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split("\n");
  let paragraphBuffer = [];
  let codeBuffer = [];
  let codeLanguage = "plain text";
  let inCodeFence = false;

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

    if (inCodeFence) {
      codeBuffer.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (trimmed === "---") {
      flushParagraph();
      blocks.push(dividerBlock());
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push(headingBlock(headingMatch[1].length, headingMatch[2]));
      continue;
    }

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

  return blocks.length ? blocks.slice(0, 100) : [paragraphBlock("无正文内容")];
}

export function createNotionClient(auth) {
  return new Client({ auth });
}

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

function buildProperties(note, sourceBaseUrl) {
  const sourceValue = sourceBaseUrl
    ? `${sourceBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(note.slug)}`
    : note.filePath;

  return {
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

export async function createPage(notion, databaseId, note, blocks, sourceBaseUrl) {
  return notion.pages.create({
    parent: { database_id: databaseId },
    properties: buildProperties(note, sourceBaseUrl),
    children: blocks
  });
}

export async function updatePageProperties(notion, pageId, note, sourceBaseUrl) {
  return notion.pages.update({
    page_id: pageId,
    properties: buildProperties(note, sourceBaseUrl)
  });
}

export async function replacePageContent(notion, pageId, blocks) {
  let cursor;
  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100
    });

    for (const block of response.results) {
      await notion.blocks.delete({ block_id: block.id });
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  for (let index = 0; index < blocks.length; index += 100) {
    const children = blocks.slice(index, index + 100);
    await notion.blocks.children.append({
      block_id: pageId,
      children
    });
  }
}
