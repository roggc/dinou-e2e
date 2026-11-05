import React from "react";
import { createRequire } from "node:module";
import {
  isPprBuildActive,
  isInsideSuspense,
  isInsideOuterSuspenseOutsideSlot,
  rollbackPprHolesAfter,
  isInsideCachedSlot,
  getActiveCachedSlotStore,
  runInSuspense,
  getPprHoleCounter,
  commitPprSuspenseEffects,
  registerHole,
  markDynamicAccess,
  isPageRootElement,
  runInPageSegment,
  getActivePageSegmentStore,
  getActiveLayoutSegmentStore,
  resetComponentNoDynamicFlag,
  consumeComponentNoDynamicFlag,
  isNoDynamicActive,
  isSlotDiscoveryActive,
} from "./ppr-context.js";
import { getContext } from "./request-context.js";

const REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel");
const REACT_CONTEXT_TYPE = Symbol.for("react.context");
const CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference");

let fallbackRenderSeq = 0;

function unsupportedHook() {
  throw new Error("This Hook is not supported in Server Components.");
}

function unsupportedRefresh() {
  throw new Error("Refreshing the cache is not supported in Server Components.");
}

function unsupportedContext() {
  throw new Error("Cannot read a Client Context from a Server Component.");
}

function sanitizeIdSegment(val) {
  return String(val || "slot").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function useServerId() {
  const slotStore = getActiveCachedSlotStore();
  if (slotStore && slotStore.slotId) {
    slotStore.idCount = (slotStore.idCount || 0) + 1;
    const safeSlot = sanitizeIdSegment(slotStore.slotId);
    return `_slot_${safeSlot}_dS_${slotStore.idCount.toString(32)}_`;
  }
  const layoutStore = getActiveLayoutSegmentStore();
  if (layoutStore && layoutStore.active) {
    layoutStore.idCount = (layoutStore.idCount || 0) + 1;
    return `_layout_dS_${layoutStore.idCount.toString(32)}_`;
  }
  const pageStore = getActivePageSegmentStore();
  if (pageStore && pageStore.active) {
    pageStore.idCount = (pageStore.idCount || 0) + 1;
    return `_page_dS_${pageStore.idCount.toString(32)}_`;
  }
  const reqCtx = getContext();
  if (reqCtx) {
    reqCtx._dinouUseIdCount = (reqCtx._dinouUseIdCount || 0) + 1;
    return `_dS_${reqCtx._dinouUseIdCount.toString(32)}_`;
  }
  const id = ++fallbackRenderSeq;
  return `_dS_${id.toString(32)}_`;
}

function useServerUsable(usable) {
  if (
    (usable !== null && typeof usable === "object") ||
    typeof usable === "function"
  ) {
    if (typeof usable.then === "function") {
      if (usable.status === "fulfilled") {
        return usable.value;
      }
      if (usable.status === "rejected") {
        throw usable.reason;
      }
      throw usable;
    }
    if (usable.$$typeof === REACT_CONTEXT_TYPE) {
      unsupportedContext();
    }
    if (usable.$$typeof === CLIENT_REFERENCE_TAG) {
      if (usable.value != null && usable.value.$$typeof === REACT_CONTEXT_TYPE) {
        unsupportedContext();
      }
      throw new Error("Cannot use() an already resolved Client Reference.");
    }
  }
  throw new Error("An unsupported type was passed to use(): " + String(usable));
}

const DinouServerHooksDispatcher = {
  readContext: unsupportedContext,
  use: useServerUsable,
  useCallback(callback) {
    return callback;
  },
  useContext: unsupportedContext,
  useEffect: unsupportedHook,
  useImperativeHandle: unsupportedHook,
  useLayoutEffect: unsupportedHook,
  useInsertionEffect: unsupportedHook,
  useMemo(nextCreate) {
    return nextCreate();
  },
  useReducer: unsupportedHook,
  useRef: unsupportedHook,
  useState: unsupportedHook,
  useDebugValue() {},
  useDeferredValue: unsupportedHook,
  useTransition: unsupportedHook,
  useSyncExternalStore: unsupportedHook,
  useId: useServerId,
  useHostTransitionStatus: unsupportedHook,
  useFormState: unsupportedHook,
  useActionState: unsupportedHook,
  useOptimistic: unsupportedHook,
  useMemoCache(size) {
    const data = new Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = REACT_MEMO_CACHE_SENTINEL;
    }
    return data;
  },
  useCacheRefresh() {
    return unsupportedRefresh;
  },
  useEffectEvent: unsupportedHook,
};

let _cachedReactInternalsList = null;
function getReactInternalsList() {
  if (_cachedReactInternalsList) return _cachedReactInternalsList;
  const set = new Set();
  const addFromModule = (mod) => {
    if (!mod || typeof mod !== "object") return;
    const s = mod.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const c = mod.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    if (s && typeof s === "object" && "H" in s) set.add(s);
    if (c && typeof c === "object" && "H" in c) set.add(c);
  };
  addFromModule(React);
  try {
    const req = createRequire(import.meta.url);
    try {
      addFromModule(req("react/index.js"));
    } catch (_) {}
    try {
      addFromModule(req("react/react.react-server.js"));
    } catch (_) {}
  } catch (_) {}
  _cachedReactInternalsList = Array.from(set);
  return _cachedReactInternalsList;
}

function invokeWithServerHooksDispatcher(callFn) {
  const internalsList = getReactInternalsList();
  const prevDispatchers = internalsList.map((internals) => internals.H);
  for (const internals of internalsList) {
    internals.H = DinouServerHooksDispatcher;
  }
  try {
    return callFn();
  } finally {
    for (let i = 0; i < internalsList.length; i++) {
      internalsList[i].H = prevDispatchers[i];
    }
  }
}

function isThenable(val) {
  return (
    val !== null &&
    (typeof val === "object" || typeof val === "function") &&
    typeof val.then === "function"
  );
}

function isCacheSlotComponent(fn) {
  if (!fn) return false;
  return Boolean(fn.$$dinouCacheSlot || fn.name === "DinouCacheSlot");
}

async function invokeServerComponentInPpr(fn, callFn) {
  resetComponentNoDynamicFlag();
  const rawResult = invokeWithServerHooksDispatcher(callFn);
  const optedOut = consumeComponentNoDynamicFlag();
  if (
    isThenable(rawResult) &&
    !isCacheSlotComponent(fn) &&
    isPprBuildActive() &&
    isInsideOuterSuspenseOutsideSlot() &&
    !isSlotDiscoveryActive() &&
    !optedOut &&
    !isNoDynamicActive()
  ) {
    try {
      rawResult.then(null, () => {});
    } catch (_) {}
    markDynamicAccess("async-suspense");
  }
  return await rawResult;
}

function cloneWithDevProps(jsx, newProps, resolvedKey, overrideType) {
  const cloned = {
    ...jsx,
    $$typeof: Symbol.for("react.transitional.element"),
    type: overrideType !== undefined ? overrideType : jsx.type,
    props: newProps,
    key: resolvedKey,
  };
  if ("_owner" in jsx) cloned._owner = jsx._owner;
  if ("_store" in jsx && jsx._store) {
    cloned._store = {};
    Object.defineProperty(cloned._store, "validated", {
      configurable: false,
      enumerable: false,
      writable: true,
      value: jsx._store.validated || 1,
    });
  }
  for (const devProp of ["ref", "_debugInfo", "_debugStack", "_debugTask"]) {
    const desc = Object.getOwnPropertyDescriptor(jsx, devProp);
    if (desc) {
      Object.defineProperty(cloned, devProp, desc);
    }
  }
  return cloned;
}

// Function to check if a component is a client component
function isClientComponent(type) {
  if (!type) {
    return false;
  }
  const CLIENT_REFERENCE = Symbol.for("react.client.reference");
  return (
    (typeof type === "function" && type.$$typeof === CLIENT_REFERENCE) ||
    (typeof type === "object" && type.$$typeof === CLIENT_REFERENCE)
  );
}

async function asyncRenderJSXToClientJSX(jsx, key = null) {
  if (isPageRootElement(jsx)) {
    return await runInPageSegment(async () => {
      const resolved = await asyncRenderJSXToClientJSXInner(jsx, key);
      const ctx = getContext();
      if (ctx) {
        ctx._resolvedPageClientJsx = resolved;
      }
      return resolved;
    });
  }
  return await asyncRenderJSXToClientJSXInner(jsx, key);
}

async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
  if (
    typeof jsx === "string" ||
    typeof jsx === "number" ||
    typeof jsx === "boolean" ||
    typeof jsx === "function" ||
    typeof jsx === "undefined" ||
    jsx === null
  ) {
    return jsx;
  } else if (Array.isArray(jsx)) {
    if (isPprBuildActive()) {
      const results = [];
      for (const child of jsx) {
        results.push(await asyncRenderJSXToClientJSX(child, child?.key ?? null));
      }
      return results;
    }
    return await Promise.all(
      jsx.map((child) =>
        asyncRenderJSXToClientJSX(
          child,
          child?.key ?? null
        )
      )
    );
  } else if (typeof jsx === "symbol") {
    if (jsx === Symbol.for("react.fragment")) {
      // Handle Fragment as an empty props object
      return React.createElement(React.Fragment, key != null ? { key } : null);
    }
    console.error("Unsupported symbol:", String(jsx));
    throw new Error(`Unsupported symbol: ${String(jsx)}`);
  } else if (typeof jsx === "object") {
    if (jsx.$$typeof === Symbol.for("react.transitional.element")) {
      if (jsx.type === Symbol.for("react.suspense")) {
        if (isPprBuildActive()) {
          return await runInSuspense(async (holeId, suspenseStore) => {
            const countBefore = getPprHoleCounter();
            try {
              const renderedChildren = await asyncRenderJSXToClientJSX(jsx.props?.children);
              const renderedFallback = await asyncRenderJSXToClientJSX(jsx.props?.fallback);
              const hasNestedSuspense = getPprHoleCounter() > countBefore;
              await commitPprSuspenseEffects(suspenseStore);
              return cloneWithDevProps(
                jsx,
                {
                  ...jsx.props,
                  ...(hasNestedSuspense ? { "data-ppr-static-parent": holeId } : {}),
                  children: hasNestedSuspense
                    ? React.createElement(
                        "div",
                        { "data-ppr-static-parent": holeId, style: { display: "contents" } },
                        renderedChildren
                      )
                    : renderedChildren,
                  fallback: renderedFallback,
                },
                key ?? jsx.key
              );
            } catch (err) {
              if (
                (suspenseStore?.slotDepthAtSuspense || 0) === 0 &&
                ((err && err.$$typeof === Symbol.for("dinou.ppr.postpone")) ||
                  (err && typeof err?.then === "function") ||
                  (err && err?.$$typeof === Symbol.for("react.postpone")))
              ) {
                rollbackPprHolesAfter(countBefore);
                registerHole(holeId, { type: err.pprType || "suspense" });
                const renderedFallback = await asyncRenderJSXToClientJSX(jsx.props?.fallback);
                return cloneWithDevProps(
                  jsx,
                  {
                    "data-ppr-hole": holeId,
                    style: { display: "contents" },
                    children: renderedFallback,
                  },
                  key ?? jsx.key,
                  "div"
                );
              }
              throw err;
            } finally {
              if (suspenseStore) {
                suspenseStore.settled = true;
              }
            }
          });
        }
        return await runInSuspense(async () => {
          return cloneWithDevProps(
            jsx,
            await asyncRenderJSXToClientJSX(jsx.props),
            key ?? jsx.key
          );
        });
      } else if (
        jsx.type === Symbol.for("react.fragment") ||
        jsx.type === Symbol.for("react.view_transition") ||
        typeof jsx.type === "string"
      ) {
        return cloneWithDevProps(
          jsx,
          await asyncRenderJSXToClientJSX(jsx.props),
          key ?? jsx.key
        );
      } else if (typeof jsx.type === "function") {
        const Component = jsx.type;
        const props = jsx.props;
        if (isClientComponent(Component)) {
          if (jsx.__clientJsxAlreadyRendered) {
            return cloneWithDevProps(
              jsx,
              props,
              key ?? jsx.key,
              Component
            );
          }
          return cloneWithDevProps(
            jsx,
            await asyncRenderJSXToClientJSX(props),
            key ?? jsx.key,
            Component
          );
        } else {
          // Server component: execute and process
          const returnedJsx = await invokeServerComponentInPpr(Component, () =>
            Component(props)
          );
          return await asyncRenderJSXToClientJSX(returnedJsx, key ?? jsx.key);
        }
      } else if (
        typeof jsx.type === "object" &&
        jsx.type !== null &&
        jsx.type.$$typeof === Symbol.for("react.forward_ref")
      ) {
        if (isClientComponent(jsx.type)) {
          return cloneWithDevProps(
            jsx,
            await asyncRenderJSXToClientJSX(jsx.props),
            key ?? jsx.key,
            jsx.type
          );
        } else {
          const returnedJsx = await invokeServerComponentInPpr(
            jsx.type.render,
            () => jsx.type.render(jsx.props, jsx.ref)
          );
          return await asyncRenderJSXToClientJSX(returnedJsx, key ?? jsx.key);
        }
      } else if (
        typeof jsx.type === "object" &&
        jsx.type !== null &&
        jsx.type.$$typeof === Symbol.for("react.memo")
      ) {
        if (isClientComponent(jsx.type)) {
          return cloneWithDevProps(
            jsx,
            await asyncRenderJSXToClientJSX(jsx.props),
            key ?? jsx.key,
            jsx.type
          );
        } else {
          const innerComp = jsx.type.type;
          const returnedJsx =
            typeof innerComp === "function"
              ? await invokeServerComponentInPpr(innerComp, () =>
                  innerComp(jsx.props)
                )
              : null;
          return await asyncRenderJSXToClientJSX(returnedJsx, key ?? jsx.key);
        }
      } else {
        console.error("Unsupported JSX type:", jsx.type);
        throw new Error("Unsupported JSX type");
      }
    } else if (jsx instanceof Promise) {
      return jsx;
    } else {
      // Process object props (e.g., { className: "foo" })
      if (isPprBuildActive()) {
        const entries = [];
        for (const [propName, value] of Object.entries(jsx)) {
          entries.push([propName, await asyncRenderJSXToClientJSX(value)]);
        }
        return Object.fromEntries(entries);
      }
      return Object.fromEntries(
        await Promise.all(
          Object.entries(jsx).map(async ([propName, value]) => [
            propName,
            await asyncRenderJSXToClientJSX(value),
          ])
        )
      );
    }
  } else {
    throw new Error("Not implemented");
  }
}

export {
  asyncRenderJSXToClientJSX,
  invokeWithServerHooksDispatcher,
};
export default {
  asyncRenderJSXToClientJSX,
  invokeWithServerHooksDispatcher,
};
