import fs from "node:fs/promises";

export async function loadState(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { pages: {} };
    }
    throw error;
  }
}

export async function saveState(filePath, state) {
  const payload = JSON.stringify(state, null, 2);
  await fs.writeFile(filePath, `${payload}\n`, "utf8");
}
