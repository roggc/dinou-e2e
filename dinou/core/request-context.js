// dinou/core/request-context.js

const DINOU_CONTEXT_KEY = Symbol.for("dinou.request.context.storage");
let requestStorage;

if (typeof window === "undefined") {
  let AsyncLocalStorageClass;
  try {
    const nodeRequire =
      typeof module !== "undefined" && typeof module.require === "function"
        ? module.require.bind(module)
        : (typeof eval === "function" ? eval("require") : null);
    if (nodeRequire) {
      const asyncHooks = nodeRequire("node:async_hooks");
      AsyncLocalStorageClass = asyncHooks.AsyncLocalStorage;
    }
  } catch (e) {}

  if (!AsyncLocalStorageClass && typeof globalThis.AsyncLocalStorage !== "undefined") {
    AsyncLocalStorageClass = globalThis.AsyncLocalStorage;
  }

  if (AsyncLocalStorageClass) {
    if (!globalThis[DINOU_CONTEXT_KEY]) {
      globalThis[DINOU_CONTEXT_KEY] = new AsyncLocalStorageClass();
    }
    requestStorage = globalThis[DINOU_CONTEXT_KEY];
  } else {
    requestStorage = {
      run: (store, callback) => callback(),
      getStore: () => undefined,
    };
  }
} else {
  requestStorage = {
    run: (store, callback) => callback(),
    getStore: () => undefined,
  };
}

function getContext() {
  if (typeof window !== "undefined") {
    console.error(
      "[Dinou] ❌ You are calling getContext() inside a Client Component running in the browser. This function is Server-Only. Pass the data as props from a Server Component instead."
    );
    return {};
  }
  if (!requestStorage) return undefined;
  const store = requestStorage.getStore();
  return store;
}

module.exports = {
  requestStorage,
  getContext,
};
