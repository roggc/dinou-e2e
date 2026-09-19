// dinou/adapters/bun.js
// Native Bun Adapter for Dinou v7.
// Ultra-fast zero-copy static file streaming with Bun.file() and Web Standards fetch.

import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { handleRequest } from "../core/handler.js";

// Ensure global runtime flag
if (typeof globalThis !== "undefined") {
  globalThis.__DINOU_RUNTIME__ = "bun";
}

// 1. Load in-memory route modules if generated
const routeModulesPath = path.resolve(process.cwd(), ".dinou/route-modules.js");
if (fs.existsSync(routeModulesPath)) {
  try {
    await import(pathToFileURL(routeModulesPath).href);
  } catch (e) {
    console.warn("[Dinou Bun] Route modules load warning:", e.message);
  }
}

const PORT = Number(process.env.PORT || 3000);
const cwd = process.cwd();
const dist3Dir = path.resolve(cwd, ".dinou/dist3");
const clientDir = path.resolve(cwd, ".dinou/dist1/client");
const dinouPublicDir = path.resolve(cwd, ".dinou/public");
const userPublicDir = path.resolve(cwd, "public");

export async function fetch(req) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Static assets delivery (Zero-copy with Bun.file)
  if (pathname !== "/") {
    const staticDirs = [dist3Dir, clientDir, dinouPublicDir, userPublicDir];
    for (const dir of staticDirs) {
      const filePath = path.join(dir, pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
    }
  }

  // Dinou Universal Handler
  return handleRequest(req, { runtime: "bun" });
}

export default {
  port: PORT,
  fetch,
};
