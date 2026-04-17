import { Menu, Tray, nativeImage } from "electron";

export function createTrayIcon() {
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
        <rect x="1" y="1" width="14" height="14" rx="4" fill="#10684f"/>
        <path d="M4 5.5h8v1H4zm0 2.5h8v1H4zm0 2.5h5v1H4z" fill="white"/>
      </svg>
    `)}`
  );
}

export function createDesktopTray({ onOpen, onSyncNow, onTogglePause, onQuit }) {
  const tray = new Tray(createTrayIcon());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开设置", click: onOpen },
      { label: "立即同步", click: onSyncNow },
      { label: "暂停 / 恢复同步", click: onTogglePause },
      { type: "separator" },
      { label: "退出", click: onQuit }
    ])
  );
  return tray;
}
