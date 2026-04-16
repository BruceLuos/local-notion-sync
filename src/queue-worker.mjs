// 创建一个队列事件处理器。
// 这里把“如何处理事件”和“如何执行真实同步”拆开，
// 这样可以让测试直接注入假的 `syncLatest`，不需要真的访问 Notion。
export function createQueueEventProcessor(options) {
  const {
    syncLatest,
    now = Date.now,
    dedupeWindowMs = 2000
  } = options;

  // 用内存保存最近一次执行 `sync_latest` 的时间戳，
  // 避免 Stop hook 在短时间内连续触发时重复同步。
  let lastSyncLatestAt = null;

  return async function processQueueEvents(events) {
    for (const event of events) {
      // 初版只关心 `sync_latest` 事件，其他类型先忽略，
      // 这样未来如果扩展更多事件种类，也不会影响当前逻辑。
      if (!event || event.type !== "sync_latest") {
        continue;
      }

      const currentTime = now();
      // 首次事件一定执行；之后在去重窗口内的重复事件直接跳过。
      if (lastSyncLatestAt !== null && currentTime - lastSyncLatestAt < dedupeWindowMs) {
        continue;
      }

      lastSyncLatestAt = currentTime;
      // 真正的同步仍然复用 `syncLatestNote()`，
      // 这里只负责把事件转成一次标准化的调用。
      await syncLatest({ silent: true, source: "queue-worker" });
    }
  };
}
