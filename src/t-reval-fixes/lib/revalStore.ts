const STORE_KEY = Symbol.for("dinou.e2e.revalFixesStore");

interface RevalFixesGlobalStore {
  bootId: string;
  counts: Map<string, number>;
}

function getStore(): RevalFixesGlobalStore {
  const g = globalThis as Record<symbol, RevalFixesGlobalStore | undefined>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = {
      bootId: `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      counts: new Map<string, number>(),
    };
  }
  return g[STORE_KEY]!;
}

export function nextRevalStamp(prefix: string, scope: string): string {
  const store = getStore();
  const key = `${prefix}:${scope}`;
  const next = (store.counts.get(key) ?? 0) + 1;
  store.counts.set(key, next);
  return `${prefix}:${scope}:${store.bootId}:${next}`;
}
