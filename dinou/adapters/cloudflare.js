// dinou/adapters/cloudflare.js
// Cloudflare Workers Adapter for Dinou v7.
// Universal edge entry point with KV storage, route registry, and Web Streams.

import { handleRequest } from "../core/handler.js";
import {
  getStorageAdapter,
  setStorageAdapter,
  CloudflareKVStorage,
  MemoryStorage,
} from "../core/storage-adapter.js";

// Ensure Edge runtime flag is set globally
if (typeof globalThis !== "undefined") {
  globalThis.__DINOU_RUNTIME__ = "edge";
}

let storageInitialized = false;

export default {
  /**
   * Cloudflare Workers fetch handler
   * @param {Request} request 
   * @param {object} env Bindings (KV, D1, Environment variables)
   * @param {object} ctx Execution context (waitUntil, passThroughOnException)
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/cdn-cgi/")) {
      return new Response(null, { status: 404 });
    }

    if (!storageInitialized) {
      if (env && env.DINOU_CACHE) {
        setStorageAdapter(new CloudflareKVStorage(env.DINOU_CACHE));
      } else {
        setStorageAdapter(new MemoryStorage());
      }
      storageInitialized = true;
    }

    const isRSCPayload = url.pathname.includes("____rsc_payload");
    const isServerFunction = url.pathname.includes("____server_function____") || request.headers.get("x-server-function-call") === "1";

    if (isRSCPayload) {
      const cleanPath = url.pathname
        .replace("/____rsc_payload_old_static____", "")
        .replace("/____rsc_payload_old____", "")
        .replace("/____rsc_payload_static____", "")
        .replace("/____rsc_payload____", "")
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");

      const rscKey = cleanPath ? `${cleanPath}/rsc.rsc` : "rsc.rsc";
      const storage = getStorageAdapter();
      try {
        const cachedRsc = await storage.get(rscKey);
        if (cachedRsc && cachedRsc.content) {
          return new Response(cachedRsc.content, {
            status: 200,
            headers: {
              "Content-Type": "text/x-component",
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          });
        }
      } catch (e) {}

      if (env && env.ASSETS) {
        const rscAssetPath = cleanPath ? `/${cleanPath}/rsc.rsc` : "/rsc.rsc";
        const assetUrl = new URL(rscAssetPath, request.url);
        try {
          const rscRes = await env.ASSETS.fetch(new Request(assetUrl, request));
          if (rscRes && rscRes.status === 200) {
            const headers = new Headers(rscRes.headers);
            headers.set("Content-Type", "text/x-component");
            return new Response(rscRes.body, {
              status: 200,
              headers,
            });
          }
        } catch (e) {}
      }
    }

    // Static assets: files with extensions like .js, .css, .png, etc. (excluding document .html and RSC/server-functions)
    const staticExtRegex = /\.(js|mjs|cjs|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|wasm|map|txt|webmanifest)$/i;
    const isStaticAsset = staticExtRegex.test(url.pathname) || url.pathname.startsWith("/assets/") || url.pathname.startsWith("/_dinou/");

    if (!isRSCPayload && !isServerFunction && isStaticAsset && env && env.ASSETS && (request.method === "GET" || request.method === "HEAD")) {
      try {
        const assetRes = await env.ASSETS.fetch(request.clone ? request.clone() : request);
        if (assetRes && assetRes.status < 400) {
          return assetRes;
        }
      } catch (e) {}
    }

    return handleRequest(request, {
      env,
      ctx,
      runtime: "edge",
    });
  },
};
