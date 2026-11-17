const g = globalThis as Record<string, unknown>;
const currentReloadSeq = Number(g.__DINOU_CONFIG_RELOAD_SEQ__ || 0);
if (g.__E2E_PLUGINS_LAST_RELOAD_SEQ__ !== currentReloadSeq) {
  g.__E2E_PLUGINS_LAST_RELOAD_SEQ__ = currentReloadSeq;
  g.__E2E_PLUGINS_SETUP_LOG__ = [];
}
if (!Array.isArray(g.__E2E_PLUGINS_SETUP_LOG__)) {
  g.__E2E_PLUGINS_SETUP_LOG__ = [];
}
(g.__E2E_PLUGINS_SETUP_LOG__ as string[]).push("plugin-setup");

export {};
