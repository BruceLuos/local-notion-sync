export async function openDesktopWindow({
  showOnReady = false,
  createWindowImpl,
  loadRendererImpl,
  onBeforeLoad,
  onClosed,
  shouldHideOnClose = () => true,
  onLoadError = (error) => {
    console.error("Failed to load renderer entry:", error);
  }
}) {
  const window = createWindowImpl();

  window.once("ready-to-show", () => {
    if (showOnReady && !window.isDestroyed()) {
      window.show();
    }
  });

  window.on("close", (event) => {
    if (shouldHideOnClose(window) && !event?.defaultPrevented) {
      event?.preventDefault?.();
      window.hide();
    }
  });

  window.once("closed", () => {
    onClosed?.(window);
  });

  await onBeforeLoad?.(window);

  try {
    await loadRendererImpl(window);
  } catch (error) {
    onLoadError(error, window);
  }

  return window;
}
