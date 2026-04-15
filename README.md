# notion-sync

把本地 Markdown 笔记同步到 Notion 数据库，同时不把这些笔记存进业务项目仓库。

## 这个仓库包含什么

- 一个把单篇 Markdown 笔记同步到 Notion 的命令
- 一个监听本地笔记目录并在保存时自动同步的监听器
- 一个用于缓存 `slug -> pageId` 的状态文件
- Codex hook 示例和 macOS `launchd` 配置示例

## Notion 配置

先创建一个 Notion 内部集成，然后把目标数据库共享给这个集成。

数据库建议至少包含这些属性：

- `Name`，类型为 `title`
- `Slug`，类型为 `rich_text`
- `UpdatedAt`，类型为 `date`
- `SourcePath`，类型为 `rich_text`

## 安装

```bash
cd /path/to/notion-sync
npm install
cp .env.example .env
```

然后填写 `.env`：

```bash
NOTION_TOKEN=ntn_xxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxx
NOTES_DIR=/path/to/your/notes
STATE_FILE=/path/to/notion-sync/.state.json
SOURCE_BASE_URL=
```

## 使用方式

同步单个文件：

```bash
npm run sync -- /path/to/your/notes/2026-04-15-example.md
```

监听整个目录：

```bash
npm run watch
```

同步 `NOTES_DIR` 里最近更新的一篇笔记：

```bash
npm run sync:latest
```

## 支持的 Markdown 语法

当前版本支持这些常见 Markdown 结构：

- `#`, `##`, `###`
- 普通段落
- `-` 无序列表
- `1.` 有序列表
- `- [ ]` 和 `- [x]`
- 代码块
- 引用块
- `---` 分割线

如果后面你想要更完整的 Markdown 还原效果，可以把 `markdownToBlocks()` 替换成更强的解析器。

## Git 提交建议

建议提交这些文件：

- 源码文件
- `.env.example`
- `README.md`
- `.codex/hooks.json.example`
- `launchd/com.example.notion-sync.plist`

不要提交这些文件：

- `.env`
- `.state.json`
- 你本地的 Markdown 笔记

## Codex Hook

把 `.codex/hooks.json.example` 复制到全局 `~/.codex/hooks.json`，再按需要调整路径。这个 hook 会调用 `src/sync-latest-note.mjs`，并在同步前自动读取本地 `.env`。

## launchd

如果想让监听器在 macOS 上自动常驻运行，可以执行：

```bash
cp launchd/com.example.notion-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.example.notion-sync.plist
```
