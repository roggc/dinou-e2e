import RefreshRuntime from "/refresh.js";
import { isReactRefreshBoundary } from "./is-react-refresh-boundary";

const runtime = RefreshRuntime?.default || RefreshRuntime;

if (
  typeof window !== "undefined" &&
  !window.__REACT_REFRESH_RUNTIME_INSTALLED__
) {
  runtime.injectIntoGlobalHook(window);

  // React 19 RSC client references arrive as REACT_LAZY_TYPE elements. After a
  // Fast Refresh update, `current.type` is the patched v2 component while a
  // subsequent `rsc-update` produces a new lazy element resolving to the
  // cached v1 export. Wrapping `setRefreshHandler` so `resolveFamily` unwraps
  // already-resolved lazy types lets React's `isCompatibleFamilyForHotReloading`
  // match the family and preserve client component state across RSC refreshes.
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook && !hook.__dinouLazyRefreshWrapped) {
    hook.__dinouLazyRefreshWrapped = true;
    const REACT_LAZY_TYPE = Symbol.for("react.lazy");
    const wrapResolveFamily = (resolveFamily) => {
      if (typeof resolveFamily !== "function") return resolveFamily;
      return (type) => {
        let family = resolveFamily(type);
        if (
          family === undefined &&
          type &&
          typeof type === "object" &&
          type.$$typeof === REACT_LAZY_TYPE
        ) {
          const payload = type._payload;
          if (payload && typeof payload === "object") {
            if (payload.status === "fulfilled" && payload.value !== undefined) {
              family = resolveFamily(payload.value);
            } else if (
              payload.status === "resolved_module" &&
              typeof type._init === "function"
            ) {
              try {
                const unwrapped = type._init(payload);
                if (unwrapped && unwrapped !== type) {
                  family = resolveFamily(unwrapped);
                }
              } catch {}
            } else if (
              payload._status === 1 &&
              payload._result &&
              payload._result.default !== undefined
            ) {
              family = resolveFamily(payload._result.default);
            }
          }
        }
        return family;
      };
    };
    const wrapRendererHelpers = (helpers) => {
      if (
        !helpers ||
        typeof helpers.setRefreshHandler !== "function" ||
        helpers.__dinouLazyRefreshWrapped
      ) {
        return;
      }
      helpers.__dinouLazyRefreshWrapped = true;
      const origSetRefreshHandler = helpers.setRefreshHandler;
      helpers.setRefreshHandler = function (handler) {
        return origSetRefreshHandler.call(this, wrapResolveFamily(handler));
      };
    };
    if (hook.renderers && typeof hook.renderers.forEach === "function") {
      hook.renderers.forEach((helpers) => wrapRendererHelpers(helpers));
    }
    if (typeof hook.inject === "function") {
      const prevInject = hook.inject;
      hook.inject = function (injected) {
        wrapRendererHelpers(injected);
        return prevInject.apply(this, arguments);
      };
    }
  }
  window.__reactRefreshRuntime = runtime;
  window.$RefreshReg$ = (type, id) => {
    runtime?.register(type, id);
  };
  window.$RefreshSig$ = runtime?.createSignatureFunctionForTransform
    ? runtime.createSignatureFunctionForTransform.bind(runtime)
    : () => (type) => type;
  window.__REACT_REFRESH_RUNTIME_INSTALLED__ = true;

  let refreshTimeout;
  window.performReactRefresh = runtime.performReactRefresh;
  window.__debouncePerformReactRefresh = () => {
    clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
      try {
        runtime.performReactRefresh();
      } catch (err) {
        console.warn("React Refresh failed:", err);
      }
    }, 30); // 30ms debounce
  };

  window.__isReactRefreshBoundary = (moduleExports) =>
    isReactRefreshBoundary(runtime, moduleExports);
}
