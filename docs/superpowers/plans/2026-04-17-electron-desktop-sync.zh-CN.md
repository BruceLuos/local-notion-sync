# Electron 桌面同步实现说明

> 对应原始实现计划：
> [2026-04-17-electron-desktop-sync.md](/Users/bruceluo/Desktop/Developer/notion-sync/docs/superpowers/plans/2026-04-17-electron-desktop-sync.md)

## 目标

把当前基于 Node.js 的 Notion Markdown 同步工具，逐步演进成一个可安装的 Electron 桌面应用。第一版重点解决这些问题：

- 普通用户不需要命令行
- 配置不再依赖仓库里的 `.env`
- 应用可以在后台常驻运行
- 可以通过图形界面完成 Notion 配置和文件夹选择
- 保留现有同步核心，避免重写同步逻辑

## 实现思路

整个实现分成两层：

1. 同步核心层
- 继续复用现有 `src/` 下的 Notion 同步逻辑
- 把原本依赖 `process.env` 的地方改成“显式 runtime config + env fallback”
- 这样既能兼容 CLI，也能被桌面主进程直接调用

2. Electron 桌面层
- `main` 负责应用生命周期、窗口、托盘、IPC 和后台运行
- `preload` 暴露安全的前端桥接 API
- `renderer` 提供首次配置和状态展示界面
- `sync-runtime` 负责 watcher 生命周期、手动同步、暂停/恢复和状态管理

## 主要文件分工

### 已存在并会继续演进的核心文件

- [src/sync-notion.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/src/sync-notion.mjs)
  单文件同步到 Notion
- [src/sync-latest-note.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/src/sync-latest-note.mjs)
  负责“同步最新文档”这条链路
- [src/watch-notes.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/src/watch-notes.mjs)
  watcher 入口
- [src/state-store.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/src/state-store.mjs)
  本地状态缓存
- [src/sync-log.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/src/sync-log.mjs)
  同步日志

### 桌面层新增文件

- [electron/main.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/electron/main.mjs)
  Electron 主进程入口
- [electron/window.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/electron/window.mjs)
  BrowserWindow 创建逻辑
- [electron/tray.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/electron/tray.mjs)
  托盘与菜单
- [electron/preload.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/electron/preload.mjs)
  renderer 可用的桌面 API 暴露层
- [electron/ipc.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/electron/ipc.mjs)
  IPC channel 常量与后续 handler 注册点
- [electron/app-paths.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/electron/app-paths.mjs)
  OS app-data 路径计算
- [electron/config-store.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/electron/config-store.mjs)
  桌面应用配置存储
- [electron/sync-runtime.mjs](/Users/bruceluo/Desktop/Developer/notion-sync/electron/sync-runtime.mjs)
  后台同步运行时

### 桌面前端文件

- [renderer/index.html](/Users/bruceluo/Desktop/Developer/notion-sync/renderer/index.html)
- [renderer/app.css](/Users/bruceluo/Desktop/Developer/notion-sync/renderer/app.css)
- [renderer/app.js](/Users/bruceluo/Desktop/Developer/notion-sync/renderer/app.js)

## 任务拆分

### Task 1：Electron/Forge 打包骨架

目的：
- 给桌面应用补齐 Electron 入口和 Electron Forge 打包配置

主要产出：
- `package.json` 新增桌面脚本
- `forge.config.cjs`
- `tests/desktop/package-scripts.test.mjs`

### Task 2：桌面配置与 app-data 路径

目的：
- 把配置、状态、日志迁移到操作系统自己的应用目录

主要产出：
- `electron/app-paths.mjs`
- `electron/config-store.mjs`
- 对应测试

### Task 3：同步核心去 `.env` 强绑定

目的：
- 让桌面层可以把配置对象直接传进同步核心

主要变化：
- `syncFile()` 支持 `options.config`
- `syncLatestNote()` 支持 `options.config`
- 仍保留 CLI 的环境变量回退能力

### Task 4：desktop sync runtime

目的：
- 把 watcher 生命周期和手动同步包装成桌面层可调用的运行时对象

职责包括：
- `start`
- `stop`
- `pause`
- `resume`
- `syncNow`
- `getStatus`

补充说明：
- 这一层已经专门处理了并发 `start()`、`pause/stop` 与 `start()` 交错等生命周期边界问题

### Task 5：Electron 主进程最小壳

目的：
- 补齐 `main`、`window`、`tray`、`preload`、`ipc`

职责包括：
- 创建窗口
- 提供 tray 基础菜单
- 提供 renderer 可调用的 `desktopApi`
- 准备后续 Task 7 的 IPC 接线

### Task 6：renderer MVP 页面

目的：
- 补齐 Electron 当前缺失的前端页面

第一版页面内容：
- 欢迎说明
- Notion Token 输入
- Database ID 输入
- 本地目录选择
- 状态展示

### Task 7：renderer / config / runtime 真正接线

目的：
- 把主进程、配置存储、runtime、IPC 和 renderer 串起来

需要完成：
- 保存配置
- 选择文件夹
- 状态查询
- 手动同步
- 暂停/恢复
- 启动后自动拉起 runtime

### Task 8：README 与整体验证

目的：
- 补桌面版使用说明
- 跑最终测试
- 做 `desktop:dev` / `desktop:make` 验证

## 当前进度

截至目前，前 5 个任务已经完成并通过了“实现 -> 规格审查 -> 代码质量审查”闭环。

已完成：
- Task 1
- Task 2
- Task 3
- Task 4
- Task 5

进行中：
- Task 6：renderer 页面

待完成：
- Task 7：主进程与 runtime/config 接线
- Task 8：README、打包与整体验证

## 已完成部分的关键结论

### 1. Electron 骨架已经搭好

当前仓库已经具备：
- Electron 主入口
- Electron Forge 打包配置
- tray 基础能力
- preload 桥接
- IPC channel 常量

### 2. 桌面配置基础已经具备

当前已支持：
- 配置文件保存在 app-data 目录
- 状态文件保存在 app-data 目录
- 日志文件保存在 app-data 目录

### 3. 同步核心已经可被桌面层直接调用

关键能力：
- `sync-notion` 支持显式 runtime config
- `sync-latest-note` 支持显式 runtime config
- 对 `null` 配置做了兜底，不会在桌面启动早期直接崩

### 4. runtime 已经单独做稳

当前 `electron/sync-runtime.mjs` 已覆盖：
- 初始状态管理
- watcher 启停
- 手动同步
- 暂停/恢复
- `lastError` 维护
- 顺序重复启动
- 并发重复启动
- `start()` 与 `pause/stop()` 交错的生命周期竞争

## 关键验证命令

### 核心与桌面测试

```bash
node --test tests/desktop/*.mjs
node --test tests/sync-notion.test.mjs tests/sync-latest-note.test.mjs tests/watch-notes.test.mjs
```

### Electron 相关脚本

```bash
npm run desktop:dev
npm run desktop:package
npm run desktop:make
```

## 后续实现建议

接下来继续做 Task 6-8 时，建议遵守这些原则：

- 先让 renderer 页面可正常加载，再接主进程数据流
- 先接配置保存和状态读取，再接同步动作
- 不要在 Task 6 提前把 Task 7 的 IPC 注册逻辑揉进 renderer 文件
- `desktopApi` 仍然应该保持窄接口，不要把底层 Node 能力直接暴露给 renderer
- 继续保持“桌面层 orchestration，核心层做同步”的边界

## 对照关系

如果你需要精确到每个测试命令、每个 commit 步骤、每段代码片段，请继续看原英文计划：

- [2026-04-17-electron-desktop-sync.md](/Users/bruceluo/Desktop/Developer/notion-sync/docs/superpowers/plans/2026-04-17-electron-desktop-sync.md)

如果你想快速理解这个桌面版是怎么分层、怎么推进、现在做到哪一步，这份中文说明就是主入口。
