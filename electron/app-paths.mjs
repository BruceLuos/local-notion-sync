import path from "node:path";

export function getAppPaths({ userDataPath }) {
  return {
    rootDir: userDataPath,
    configFile: path.join(userDataPath, "config.json"),
    stateFile: path.join(userDataPath, "state.json"),
    logDir: path.join(userDataPath, "logs"),
    logFile: path.join(userDataPath, "logs", "notion-sync.log")
  };
}
