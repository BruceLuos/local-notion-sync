import test from "node:test";
import assert from "node:assert/strict";
import { openDesktopWindow } from "../../electron/window-controller.mjs";

function createFakeWindow() {
  const onceHandlers = new Map();
  const onHandlers = new Map();

  return {
    isDestroyed: () => false,
    show: () => {},
    hide: () => {},
    once(eventName, handler) {
      onceHandlers.set(eventName, handler);
    },
    on(eventName, handler) {
      onHandlers.set(eventName, handler);
    },
    emitOnce(eventName, ...args) {
      const handler = onceHandlers.get(eventName);
      if (handler) {
        onceHandlers.delete(eventName);
        handler(...args);
      }
    },
    emit(eventName, ...args) {
      const handler = onHandlers.get(eventName);
      if (handler) {
        handler(...args);
      }
    }
  };
}

test("openDesktopWindow runs setup before loading the renderer", async () => {
  const calls = [];
  const fakeWindow = createFakeWindow();

  await openDesktopWindow({
    createWindowImpl: () => {
      calls.push("createWindow");
      return fakeWindow;
    },
    onBeforeLoad: async () => {
      calls.push("beforeLoad");
    },
    loadRendererImpl: async () => {
      calls.push("loadRenderer");
    }
  });

  assert.deepEqual(calls, ["createWindow", "beforeLoad", "loadRenderer"]);
});

test("openDesktopWindow only hides the window when close interception is enabled", async () => {
  let hideCalls = 0;
  const fakeWindow = createFakeWindow();
  fakeWindow.hide = () => {
    hideCalls += 1;
  };

  await openDesktopWindow({
    createWindowImpl: () => fakeWindow,
    loadRendererImpl: async () => {},
    shouldHideOnClose: () => false
  });

  const closeEvent = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };

  fakeWindow.emit("close", closeEvent);

  assert.equal(closeEvent.defaultPrevented, false);
  assert.equal(hideCalls, 0);
});
