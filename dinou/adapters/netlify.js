// dinou/adapters/netlify.js
// Netlify Functions v2 Adapter for Dinou (Pre-bundled AOT Dual-Bundle).
// Delegates to the standalone AOT Dual-Bundle in .dinou/netlify/functions/ssr.mjs
// (or .dinou/dist1/server/netlify.js) so dynamic SSR, TypeScript/JSX routes,
// Server Functions, and read-only AWS Lambda filesystems work with zero runtime flags.

import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { loadEnvFiles } from "../core/env.js";

if (typeof process !== "undefined" && process.env && !process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

if (
  typeof globalThis.AsyncLocalStorage === "undefined" &&
  typeof AsyncLocalStorage !== "undefined"
) {
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
}

const bundleCacheByCwd = new Map();
let bundleLoadSeq = 0;

function resolveNetlifyBundlePath(cwd) {
  const dedicated = path.resolve(cwd, ".dinou/netlify/functions/ssr.mjs");
  if (fs.existsSync(dedicated)) {
    return dedicated;
  }
  const dist1Fallback = path.resolve(cwd, ".dinou/dist1/server/netlify.js");
  if (fs.existsSync(dist1Fallback)) {
    return dist1Fallback;
  }
  return null;
}

async function getNetlifyBundle(cwd) {
  const resolvedCwd = path.resolve(cwd || ".");
  const bundlePath = resolveNetlifyBundlePath(resolvedCwd);
  if (!bundlePath) {
    return null;
  }
  let mtimeMs = 0;
  let size = 0;
  try {
    const stat = fs.statSync(bundlePath);
    mtimeMs = stat.mtimeMs;
    size = stat.size;
  } catch (e) {}

  const cached = bundleCacheByCwd.get(bundlePath);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    return cached.promise;
  }

  try {
    loadEnvFiles(resolvedCwd, { mode: "production" });
  } catch (e) {}

  const reloadSeq = ++bundleLoadSeq;
  const moduleUrl = `${pathToFileURL(bundlePath).href}?v=${encodeURIComponent(
    `${mtimeMs}-${size}-${reloadSeq}`
  )}`;
  const loadPromise = import(moduleUrl).catch((err) => {
    const cur = bundleCacheByCwd.get(bundlePath);
    if (cur && cur.promise === loadPromise) {
      bundleCacheByCwd.delete(bundlePath);
    }
    console.error(`[Dinou Netlify Adapter] Failed to load ${bundlePath}:`, err);
    return null;
  });
  bundleCacheByCwd.set(bundlePath, { mtimeMs, size, promise: loadPromise });
  return loadPromise;
}

const initialCwd =
  typeof process !== "undefined" && typeof process.cwd === "function"
    ? process.cwd()
    : ".";
if (resolveNetlifyBundlePath(initialCwd)) {
  await getNetlifyBundle(initialCwd);
}

/**
 * Netlify Function v2 handler
 * @param {Request} request
 * @param {object} context
 * @returns {Promise<Response>}
 */
export default async function netlifyHandler(request, context) {
  const cwd =
    typeof process !== "undefined" && typeof process.cwd === "function"
      ? process.cwd()
      : initialCwd;
  const mod = await getNetlifyBundle(cwd);
  const fn =
    mod && typeof mod.default === "function"
      ? mod.default
      : mod && typeof mod.netlifyHandler === "function"
        ? mod.netlifyHandler
        : null;

  if (fn) {
    return fn(request, context);
  }

  return new Response(
    "Dinou Netlify bundle not found. Please run 'npm run build' or 'npx dinou build:netlify' first.",
    {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }
  );
}

export const config = {
  path: "/*",
  preferStatic: true,
};
