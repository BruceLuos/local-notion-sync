const form = document.querySelector("#config-form");
const notionTokenInput = document.querySelector("#notion-token");
const databaseIdInput = document.querySelector("#database-id");
const notesDirInput = document.querySelector("#notes-dir");
const statusCard = document.querySelector("#status-card");
const chooseFolderButton = document.querySelector("#choose-folder");

const desktopApi = window.desktopApi ?? null;
let lastKnownStatus = null;
let uiErrorMessage = "";

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "暂时不可用";
}

function statusValue(value, fallback) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return fallback;
}

function createStatusLine(label, value) {
  const line = document.createElement("p");
  line.textContent = `${label}：${value}`;
  return line;
}

function renderStatus() {
  if (!statusCard) {
    return;
  }

  const runtimeStatus = lastKnownStatus ?? {};
  const heading = document.createElement("h2");
  heading.textContent = "当前状态";

  const fragment = document.createDocumentFragment();
  fragment.append(heading);
  fragment.append(createStatusLine("阶段", statusValue(runtimeStatus.phase, "未启动")));
  fragment.append(createStatusLine("运行中", runtimeStatus.isRunning === true ? "是" : "否"));
  fragment.append(createStatusLine("最近同步文件", statusValue(runtimeStatus.lastSyncedFile, "暂无")));
  fragment.append(createStatusLine("最近错误", statusValue(runtimeStatus.lastError, "无")));

  if (uiErrorMessage) {
    const uiErrorLine = document.createElement("p");
    uiErrorLine.className = "ui-error";
    uiErrorLine.textContent = `界面错误：${uiErrorMessage}`;
    fragment.append(uiErrorLine);
  }

  statusCard.replaceChildren(fragment);
}

async function readStatus(errorPrefix = "读取状态失败") {
  try {
    if (typeof desktopApi?.getStatus !== "function") {
      throw new Error("desktopApi.getStatus is unavailable");
    }

    const status = await desktopApi.getStatus();
    lastKnownStatus = status && typeof status === "object" ? status : {};
    uiErrorMessage = "";
  } catch (error) {
    uiErrorMessage = `${errorPrefix}：${getErrorMessage(error)}`;
  }

  renderStatus();
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

    uiErrorMessage = "";
    renderStatus();
  } catch (error) {
    uiErrorMessage = `选择文件夹失败：${getErrorMessage(error)}`;
    renderStatus();
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    if (typeof desktopApi?.saveConfig !== "function") {
      throw new Error("desktopApi.saveConfig is unavailable");
    }

    await desktopApi.saveConfig({
      notionToken: notionTokenInput?.value ?? "",
      notionDatabaseId: databaseIdInput?.value ?? "",
      notesDir: notesDirInput?.value ?? ""
    });

    await readStatus("保存后读取状态失败");
  } catch (error) {
    uiErrorMessage = `保存配置失败：${getErrorMessage(error)}`;
    renderStatus();
  }
});

await readStatus();
