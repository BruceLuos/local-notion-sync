import { app } from "electron";
import { createMainWindow } from "./window.mjs";

let mainWindow;

app.whenReady().then(() => {
  mainWindow = createMainWindow();
  mainWindow.loadFile("renderer/index.html");
  mainWindow.once("ready-to-show", () => mainWindow.show());
});
