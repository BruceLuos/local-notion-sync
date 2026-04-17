const form = document.querySelector("#config-form");
const notesDirInput = document.querySelector("#notes-dir");
const statusCard = document.querySelector("#status-card");
const chooseFolderButton = document.querySelector("#choose-folder");

const desktopApi = window.desktopApi ?? null;

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "暂时不可用";
}

function fallbackStatus(message) {
  return {
    phase: "待连接",
    isRunning: false,
    lastSyncedFile: null,
    lastError: message
  };
}

function renderStatus(status = {}) {
  statusCard.innerHTML = `
    <h2>当前状态</h2>
    <p>阶段：${status.phase ?? "未启动"}</p>
    <p>运行中：${status.isRunning ? "是" : "否"}</p>
    <p>最近同步文件：${status.lastSyncedFile ?? "暂无"}</p>
    <p>最近错误：${status.lastError ?? "无"}</p>
  `;
}

async function readStatus(errorPrefix = "读取状态失败") {
  try {
    if (typeof desktopApi?.getStatus !== "function") {
      throw new Error("desktopApi.getStatus is unavailable");
    }

    const status = await desktopApi.getStatus();
    renderStatus(status ?? {});
  } catch (error) {
    renderStatus(fallbackStatus(`${errorPrefix}：${getErrorMessage(error)}`));
  }
}

chooseFolderButton?.addEventListener("click", async () => {
  try {
    if (typeof desktopApi?.chooseFolder !== "function") {
      throw new Error("desktopApi.chooseFolder is unavailable");
    }

    const folder = await desktopApi.chooseFolder();
    if (folder && notesDirInput) {
      notesDirInput.value = folder;
    }
  } catch (error) {
    renderStatus(fallbackStatus(`选择文件夹失败：${getErrorMessage(error)}`));
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    if (typeof desktopApi?.saveConfig !== "function") {
      throw new Error("desktopApi.saveConfig is unavailable");
    }

    await desktopApi.saveConfig({
      notionToken: document.querySelector("#notion-token").value,
      notionDatabaseId: document.querySelector("#database-id").value,
      notesDir: notesDirInput?.value ?? ""
    });

    await readStatus("保存后读取状态失败");
  } catch (error) {
    renderStatus(fallbackStatus(`保存配置失败：${getErrorMessage(error)}`));
  }
});

await readStatus();
