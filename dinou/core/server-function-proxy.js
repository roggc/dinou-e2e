import { createFromFetch } from "@roggc/react-server-dom-esm/client";
import {
  encodeServerFunctionArgs,
  createBinarySafeFlightFilterStream,
} from "./server-function-codec.js";

function isSafeRedirect(url) {
  if (typeof url !== "string" || url.length === 0) return false;
  if (/[\u0000-\u001F\u007F]/.test(url)) return false;
  if (!url.startsWith("/") || /^\/[\/\\]/.test(url)) return false;
  const pathOnly = url.split("?")[0].split("#")[0];
  if (pathOnly.includes("\\")) return false;
  try {
    const parsed = new URL(url, "http://dinou.invalid");
    return parsed.origin === "http://dinou.invalid";
  } catch {
    return false;
  }
}

function applyRevalidationHint(hint) {
  if (!hint || typeof window === "undefined") return;
  if (typeof window.__DINOU_INVALIDATE_CLIENT_CACHE__ === "function") {
    try {
      window.__DINOU_INVALIDATE_CLIENT_CACHE__(hint);
    } catch (e) {}
  }
}

function applyRevalidationHeader(res) {
  if (!res || !res.headers) return;
  const raw = res.headers.get("X-Dinou-Revalidated");
  if (!raw) return;
  try {
    applyRevalidationHint(JSON.parse(raw));
  } catch (e) {}
}

function executeRedirect(url) {
  const safeUrl = isSafeRedirect(url) ? url : "/";
  const isInternal = safeUrl.startsWith("/") && !safeUrl.startsWith("//");
  if (isInternal && typeof window !== "undefined" && window.__DINOU_ROUTER_NAVIGATE__) {
    window.__DINOU_ROUTER_NAVIGATE__(safeUrl, { fresh: true });
  } else if (typeof window !== "undefined") {
    window.__DINOU_STATIC_EXPORT_UNLOADING__ = true;
    window.location.href = safeUrl;
  }
}

const activeServerFunctionControllers = new Set();

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  !window.__DINOU_SF_UNLOAD_HOOKED__
) {
  window.__DINOU_SF_UNLOAD_HOOKED__ = true;
  const abortInFlightServerFunctions = () => {
    window.__DINOU_STATIC_EXPORT_UNLOADING__ = true;
    for (const controller of activeServerFunctionControllers) {
      try {
        controller.abort();
      } catch {}
    }
    activeServerFunctionControllers.clear();
  };
  window.addEventListener("beforeunload", abortInFlightServerFunctions);
  window.addEventListener("pagehide", abortInFlightServerFunctions);
  window.addEventListener("pageshow", (event) => {
    if (event && event.persisted) {
      window.__DINOU_STATIC_EXPORT_UNLOADING__ = false;
    }
  });
}

export function createServerFunctionProxy(id) {
  return new Proxy(() => { }, {
    apply: async (_target, _thisArg, args) => {
      if (
        typeof window !== "undefined" &&
        window.__DINOU_STATIC_EXPORT_UNLOADING__
      ) {
        return new Promise(() => {});
      }

      let customHeaders = {};
      if (typeof window !== "undefined") {
        if (typeof window.__DINOU_SERVER_FUNCTION_HEADERS__ === "function") {
          try {
            customHeaders = window.__DINOU_SERVER_FUNCTION_HEADERS__() || {};
          } catch (e) {
            console.error("[Dinou] Error getting custom headers for server function:", e);
          }
        } else if (typeof window.__DINOU_GET_AUTH_TOKEN__ === "function") {
          try {
            const token = window.__DINOU_GET_AUTH_TOKEN__();
            if (token) customHeaders = { Authorization: `Bearer ${token}` };
          } catch (e) {
            console.error("[Dinou] Error getting auth token for server function:", e);
          }
        }
      }

      const headers = {
        "x-server-function-call": "1",
        ...customHeaders,
      };
      if (typeof window !== "undefined" && window.location) {
        headers["x-dinou-current-path"] = window.location.pathname;
      }

      let body;
      const formDataIndex = args.findIndex((arg) => arg instanceof FormData);

      if (formDataIndex !== -1) {
        const callerFormData = args[formDataIndex];
        // Clone caller's FormData so internal metadata keys NEVER mutate caller state on retry
        const payloadFormData = new FormData();
        for (const [k, v] of callerFormData.entries()) {
          payloadFormData.append(k, v);
        }

        payloadFormData.append("__dinou_func_id", id);
        payloadFormData.append("__dinou_formData_index", String(formDataIndex));

        if (args.length > 1) {
          const extraArgs = args.map((arg, i) => (i === formDataIndex ? null : arg));
          payloadFormData.append(
            "__dinou_args",
            JSON.stringify(encodeServerFunctionArgs(extraArgs))
          );
          payloadFormData.append("__dinou_args_codec", "1");
        }

        body = payloadFormData;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({
          id,
          args: encodeServerFunctionArgs(args),
          __dinou_codec: 1,
        });
      }
      if (
        typeof window !== "undefined" &&
        window.__DINOU_STATIC_EXPORT_UNLOADING__
      ) {
        return new Promise(() => {});
      }
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      if (controller) {
        activeServerFunctionControllers.add(controller);
      }
      let res;
      try {
        res = await fetch("/____server_function____", {
          method: "POST",
          headers,
          body,
          signal: controller ? controller.signal : undefined,
        });
      } catch (err) {
        if (controller) {
          activeServerFunctionControllers.delete(controller);
        }
        if (
          controller?.signal?.aborted ||
          (typeof window !== "undefined" &&
            window.__DINOU_STATIC_EXPORT_UNLOADING__)
        ) {
          return new Promise(() => {});
        }
        throw err;
      }
      if (controller) {
        activeServerFunctionControllers.delete(controller);
      }

      if (!res.ok) {
        let errorMessage = "Server function failed";
        let errorDigest;
        try {
          const errContentType = res.headers.get("content-type") || "";
          if (errContentType.includes("application/json")) {
            const errData = await res.json();
            if (errData && typeof errData.error === "string" && errData.error) {
              errorMessage = errData.error;
            }
            if (errData && typeof errData.digest === "string") {
              errorDigest = errData.digest;
            }
          }
        } catch (_) {}
        const err = new Error(errorMessage);
        if (errorDigest !== undefined) {
          err.digest = errorDigest;
        }
        throw err;
      }

      // Apply any server-side revalidate*() invalidation hints before redirect or return
      applyRevalidationHeader(res);

      // Check header first
      const redirectUrl = res.headers.get("X-Dinou-Redirect");
      if (redirectUrl) {
        try {
          res.body?.cancel?.().catch(() => {});
        } catch {}
        executeRedirect(redirectUrl);
        return Promise.resolve();
      }

      const contentType = res.headers.get("content-type") || "";

      // Reject unexpected HTML responses entirely to prevent security bugs
      if (contentType.includes("text/html")) {
        const html = await res.text();
        console.warn("[Dinou] Received unexpected HTML response from server function:", html);
        throw new Error("Unexpected HTML response from server function");
      }

      // Check if it's application/json (Scenario A clean redirect or json response)
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data && data.redirect) {
          executeRedirect(data.redirect);
          return Promise.resolve();
        }
        return data;
      }

      // Case 2: RSC or Hybrid Stream (Binary-safe byte-level Flight framing filter)
      if (contentType.includes("text/x-component")) {
        const readableStream = createBinarySafeFlightFilterStream(
          res.body,
          (payload) => {
            if (!payload || typeof payload !== "object") return;
            if (payload.type === "redirect") {
              executeRedirect(payload.url);
            } else if (payload.type === "cookie") {
              if (typeof document !== "undefined") {
                document.cookie = payload.cookie;
              }
            } else if (payload.type === "revalidate") {
              applyRevalidationHint(payload);
            }
          }
        );

        return createFromFetch(Promise.resolve(new Response(readableStream)), {
          callServer: async (nextId, nextArgs) => {
            const proxy = createServerFunctionProxy(nextId);
            return proxy(...nextArgs);
          },
        });
      }
      return res.json();
    },
  });
}
