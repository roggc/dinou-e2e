import { useId } from "react";

const STORE_KEY = Symbol.for("dinou.e2e.streaming.suspense.store");

interface StreamSuspenseStore {
  bootId: string;
  counters: Map<string, number>;
}

function getStore(): StreamSuspenseStore {
  const g = globalThis as Record<symbol, StreamSuspenseStore | undefined>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = {
      bootId:
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 6),
      counters: new Map(),
    };
  }
  return g[STORE_KEY]!;
}

export function nextStreamStamp(prefix: string, scope = "global"): string {
  const store = getStore();
  const key = `${prefix}:${scope}`;
  const next = (store.counters.get(key) ?? 0) + 1;
  store.counters.set(key, next);
  return `${prefix}:${scope}:${store.bootId}:${next}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ServerUidBadge({
  testId,
  label,
}: {
  testId: string;
  label: string;
}) {
  const uid = useId();
  return (
    <span data-testid={testId} data-uid={uid}>
      {label}
    </span>
  );
}

