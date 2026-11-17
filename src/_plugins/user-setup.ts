const g = globalThis as Record<string, unknown>;
if (!Array.isArray(g.__E2E_PLUGINS_SETUP_LOG__)) {
  g.__E2E_PLUGINS_SETUP_LOG__ = [];
}
(g.__E2E_PLUGINS_SETUP_LOG__ as string[]).push("user-setup");
g.__E2E_USER_SETUP_TAG__ = "user-polyfill-ready";

export {};
