import { useCallback, useSyncExternalStore } from "react";

const refreshKeysByScope = new Map<string, number>();
const listenersByScope = new Map<string, Set<() => void>>();

function subscribeScope(scope: string, listener: () => void): () => void {
  let set = listenersByScope.get(scope);
  if (!set) {
    set = new Set();
    listenersByScope.set(scope, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

function getScopeSnapshot(scope: string): number {
  return refreshKeysByScope.get(scope) ?? 0;
}

export function triggerScopeRefresh(scope: string): void {
  const next = (refreshKeysByScope.get(scope) ?? 0) + 1;
  refreshKeysByScope.set(scope, next);
  const listeners = listenersByScope.get(scope);
  if (listeners) {
    for (const listener of listeners) {
      listener();
    }
  }
}

export function resetScopeRefreshKey(scope: string): void {
  refreshKeysByScope.set(scope, 0);
  const listeners = listenersByScope.get(scope);
  if (listeners) {
    for (const listener of listeners) {
      listener();
    }
  }
}

export function useScopeRefreshKey(scope: string): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeScope(scope, onStoreChange),
    [scope]
  );
  const getSnapshot = useCallback(() => getScopeSnapshot(scope), [scope]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

