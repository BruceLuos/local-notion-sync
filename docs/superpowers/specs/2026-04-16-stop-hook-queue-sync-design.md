# Stop Hook Queue Sync Design

## 背景

当前 `codex-stop-hook.mjs` 会在 Codex 对话结束时直接调用 `syncLatestNote()`。  
这条链路在 Codex 沙箱里会因为无法访问外网而失败，即使本机环境、Notion 配置和手动同步都正常，也无法完成自动兜底同步。

现有系统里已经有一条可工作的“沙箱外同步”链路：

- `watch-notes.mjs` 作为常驻进程运行
- 它在本机环境里监听 `NOTES_DIR` 下的 Markdown 变更
- 触发后调用 `syncFile()`，可以正常访问 Notion API

需要补上的能力是：

- 保留“保存即同步”的 watcher
- 同时让 Codex 对话结束后也能触发一次沙箱外同步
- 不再让 `Stop hook` 自己直接访问 Notion

## 目标

- `Stop hook` 结束时自动发出一条“请同步最新文档”的事件
- 这条事件由沙箱外常驻进程消费
- 常驻进程消费后执行真实的 `syncLatestNote()`
- 保留现有 `watch-notes.mjs` 的保存即同步能力
- 继续复用现有 `logs/notion-sync.log` 记录同步结果

## 非目标

- 不重写现有单文件同步逻辑
- 不引入数据库、消息队列或额外第三方依赖
- 不做复杂的多项目调度
- 不在本次改动里实现日志轮转

## 方案选型

采用“轻量队列方案”：

- `Stop hook` 不再直接同步 Notion
- `Stop hook` 只往 `/tmp/notion-sync-queue.jsonl` 追加一条事件
- 常驻 worker 消费该事件并调用 `syncLatestNote({ source: "queue-worker" })`

选择这个方案的原因：

- 相比“直接同步”，它绕过了 Codex 沙箱网络限制
- 相比“单纯写触发文件”，JSONL 事件格式更容易扩展和排查
- 相比“双进程拆分”，它可以直接并入现有 watcher 常驻进程，复杂度更低

## 事件模型

队列文件位置：

- `/tmp/notion-sync-queue.jsonl`

每条事件一行 JSON，初版字段如下：

```json
{
  "type": "sync_latest",
  "source": "stop-hook",
  "createdAt": "2026-04-16T03:40:00.000Z"
}
```

说明：

- `type` 用于区分未来可能扩展的任务类型
- `source` 用于日志溯源
- `createdAt` 用于排查和简单去重

## 模块职责

### `codex-stop-hook.mjs`

改为只做两件事：

- 生成一条 `sync_latest` 事件
- 追加写入 `/tmp/notion-sync-queue.jsonl`

它不再直接调用 Notion API，也不再直接执行 `syncLatestNote()`。

### `watch-notes.mjs`

在保留现有文件监听逻辑的同时，新增一条队列消费路径：

- 启动时确保队列文件存在
- 监听 `/tmp/notion-sync-queue.jsonl` 的新增内容
- 解析新增的 JSONL 事件
- 对 `sync_latest` 事件执行 `syncLatestNote({ silent: true, source: "queue-worker" })`

### `sync-latest-note.mjs`

保留现有逻辑，仅作为队列消费时的真实执行入口继续复用。

### `sync-log.mjs`

无需改职责，继续记录：

- `synced`
- `skipped`
- `failed`

新增来源值：

- `queue-worker`

## 去重策略

`Stop hook` 可能在短时间内连续触发多次，因此 worker 需要做简单去重。

初版策略：

- worker 维护一个内存级“最近执行时间”
- 如果两条 `sync_latest` 事件间隔小于 2 秒，只执行一次

这样足以避免连续会话结束导致的重复同步，同时不引入复杂状态管理。

## 错误处理

### Stop hook 写队列失败

- 返回 `systemMessage`
- 不中断 Codex 结束流程

### Worker 解析事件失败

- 写错误日志
- 跳过坏行，继续处理后续事件

### Worker 执行同步失败

- 由 `syncLatestNote()` 继续写 `failed` 日志
- worker 本身不中止，继续保持监听

## 测试策略

至少覆盖以下场景：

1. `Stop hook` 会写出一条合法 JSONL 事件
2. worker 能消费 `sync_latest` 事件并调用 `syncLatestNote`
3. 短时间重复事件只触发一次同步
4. 非法 JSONL 行不会导致 worker 退出

## 实施步骤

1. 给 `Stop hook` 增加队列写入逻辑
2. 给 watcher 增加队列消费逻辑
3. 增加针对队列投递与消费的测试
4. 更新 README，补充新的自动兜底同步说明

## 风险与边界

- `/tmp` 在系统重启后会被清理，但这符合“临时队列”的预期
- 如果常驻进程没有启动，`Stop hook` 只会成功投递，不会真正同步
- 当前方案默认只处理“同步最新文档”，不保证补齐所有历史未同步文件

## 成功标准

满足以下条件视为完成：

- 保存 Markdown 文件时仍然会自动同步
- Codex 对话结束后，即使沙箱内无法联网，也会通过队列触发一次沙箱外同步
- 同步结果可在 `logs/notion-sync.log` 中看到 `queue-worker` 来源记录
