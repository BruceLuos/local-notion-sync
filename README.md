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

给 Codex `Stop` hook 使用的静默入口：

```bash
npm run hook:stop
```

这个入口现在只负责往本地临时队列里写入一条 `sync_latest` 事件，
真正的 Notion 同步需要由沙箱外常驻运行的 watcher 进程消费该事件后完成。

## 自动同步需要什么条件和流程

要让自动同步稳定工作，至少要满足这些条件：

- `.env` 里要正确配置 `NOTION_TOKEN`、`NOTION_DATABASE_ID`、`NOTES_DIR`、`STATE_FILE`
- `NOTES_DIR` 必须指向你真正存放 Markdown 笔记的目录
- 本机网络和 Notion 数据库权限要正常
- macOS 上的常驻 watcher 要处于运行状态
- Markdown 文档本身最好带可识别的 frontmatter，例如 `title`、`slug`

当前自动同步有两条触发链路：

### 1. 保存即同步

- 常驻 watcher 会监听 `NOTES_DIR`
- 当目录里的 `.md` 文件被新建或修改时，watcher 会调用 `syncFile()`
- `syncFile()` 会解析 Markdown、查本地状态文件、再创建或更新对应的 Notion 页面

这条链路适合你平时正常编辑文档的场景，也是最直接的自动同步方式。

### 2. Codex 对话结束兜底同步

- Codex 对话结束时，`Stop hook` 会调用 `src/codex-stop-hook.mjs`
- 这个 hook 不会直接访问 Notion，而是往 `/tmp/notion-sync-queue.jsonl` 写一条 `sync_latest` 事件
- 常驻 watcher 同时也会监听这个队列文件
- 当 watcher 消费到这条事件后，会调用 `syncLatestNote()`，把最近更新的一篇笔记同步到 Notion

这条链路主要用于“文件保存事件没有触发到，但希望在对话结束后再兜底同步一次”的场景。

### 怎么判断自动同步有没有成功

你可以从这几个地方确认：

- `/tmp/notion-sync.log`
  - 主要看 watcher 直接处理文件事件时的输出
  - 成功时通常会看到 `已创建：...` 或 `已更新：...`
- `logs/notion-sync.log`
  - 主要看 `syncLatest` / `queue-worker` 这类链路的结构化日志
- `.state.json`
  - 如果新的 `slug` 已经写进去，并且带有对应 `pageId`，通常说明 Notion 页面已经创建或更新成功

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

先确认全局 `~/.codex/config.toml` 里已经开启：

```toml
[features]
codex_hooks = true
```

再把 `.codex/hooks.json.example` 复制到全局 `~/.codex/hooks.json`，并按需要调整路径。这个 hook 会调用 `src/codex-stop-hook.mjs`，成功时保持静默，失败时返回合法的 JSON 提示。它不会直接访问 Notion，而是把“同步最新文档”的请求写入 `/tmp/notion-sync-queue.jsonl`，再由常驻 watcher 在本机环境里完成真正同步。

## launchd

如果想让监听器在 macOS 上自动常驻运行，可以执行：

```bash
cp launchd/com.example.notion-sync.plist ~/Library/LaunchAgents/com.example.notion-sync.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.notion-sync.plist
```

如果你在本机上需要使用自己的 label、路径或日志文件名，建议复制这份示例 plist 后在仓库外或被忽略的本地文件里改，不要把个人化配置提交到 git。

常驻 watcher 同时承担两件事：

- 监听 `NOTES_DIR` 下的 Markdown 保存事件并立即同步
- 监听 `/tmp/notion-sync-queue.jsonl`，消费 Codex `Stop` hook 投递的兜底同步请求
