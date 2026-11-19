/** Program-side objects hold opaque application handles. Each call resolves the current tool binding. */
export function connectCua(getTool) {
  const call = (method, params = {}) => getTool()({ method, params });
  return Object.freeze({
    getCapabilities: () => call('getCapabilities'),
    listApps: () => call('listApps'),
    getState: () => call('getState'),
    async getApp(id) {
      const selection = await call('getApp', { id });
      return new CuaApp(call, selection);
    },
  });
}

export class CuaApp {
  #call;
  #handle;
  constructor(call, selection) {
    this.#call = call;
    this.#handle = selection.appHandle;
    this.id = selection.id;
    this.displayName = selection.displayName;
  }
  getWindows() { return this.#call('getWindows', { appHandle: this.#handle }); }
  async getWindow(windowId) {
    await this.#call('getWindow', { appHandle: this.#handle, windowId });
    return new CuaWindow(this.#call, this.#handle, windowId);
  }
  activate() { return this.#call('activate', { appHandle: this.#handle }); }
  show() { return this.#call('show', { appHandle: this.#handle }); }
}

export class CuaWindow {
  #call;
  constructor(call, appHandle, windowId) {
    this.id = windowId;
    this.#call = (method, params) => call(method, { ...params, appHandle, windowId });
  }
  getAccessibilityTree(options = {}) { return this.#call('getAccessibilityTree', { options }); }
  getScreenshot(options = {}) { return this.#call('getScreenshot', { options }); }
  click(target, options = {}) { return this.#call('click', { target, options }); }
  mouseMove(target, options = {}) { return this.#call('mouseMove', { target, options }); }
  drag(from, to, options = {}) { return this.#call('drag', { from, to, options }); }
  scroll(point, delta, options = {}) { return this.#call('scroll', { point, delta, options }); }
  type(text) { return this.#call('type', { text }); }
  pressKey(key, options = {}) { return this.#call('pressKey', { key, options }); }
  show() { return this.#call('show', {}); }
}
