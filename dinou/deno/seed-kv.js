// dinou/deno/seed-kv.js
// Pre-seeds Deno KV database (Local SQLite or Remote Deno Deploy KV) with static SSG pages.

import * as path from "node:path";
import * as fs from "node:fs";

const cwd = typeof Deno !== "undefined" && typeof Deno.cwd === "function" ? Deno.cwd() : process.cwd();
const kvUrl = typeof Deno !== "undefined" ? Deno.env.get("DENO_KV_URL") : process.env.DENO_KV_URL;
const dist2Dir = path.resolve(cwd, ".dinou/dist2");

if (!fs.existsSync(dist2Dir)) {
  console.log("ℹ️  [Deno KV Seed] No static files found at .dinou/dist2. Skipping KV pre-seed.");
  if (typeof Deno !== "undefined") Deno.exit(0);
}

let kv;
if (kvUrl) {
  console.log(`🌐 [Deno KV Seed] Connecting to remote Deno KV: ${kvUrl}...`);
  kv = await Deno.openKv(kvUrl);
} else {
  const defaultDbPath = path.resolve(cwd, ".dinou/kv.db");
  const kvPath = (typeof Deno !== "undefined" ? Deno.env.get("DENO_KV_PATH") : process.env.DENO_KV_PATH) || defaultDbPath;
  fs.mkdirSync(path.dirname(kvPath), { recursive: true });
  console.log(`💾 [Deno KV Seed] Pre-seeding local Deno KV at ${kvPath}...`);
  kv = await Deno.openKv(kvPath);
}

let seededCount = 0;

async function processDir(dir, relPrefix = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const cleanRelPath = relPath.replace(/\\/g, "/");

    if (entry.isDirectory()) {
      await processDir(fullPath, cleanRelPath);
    } else if (entry.name === "index.html") {
      const html = fs.readFileSync(fullPath, "utf8");
      let metadata = null;
      const metaPath = path.join(dir, "metadata.json");
      if (fs.existsSync(metaPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        } catch (e) {}
      }

      await kv.set(["dinou_cache", cleanRelPath], { content: html, metadata });
      seededCount++;
      console.log(`   ✅ Cached HTML: ${cleanRelPath}`);

      if (cleanRelPath.endsWith("/index.html")) {
        const folderKey = cleanRelPath.slice(0, -11);
        await kv.set(["dinou_cache", folderKey], { content: html, metadata });
      } else if (cleanRelPath === "index.html") {
        await kv.set(["dinou_cache", ""], { content: html, metadata });
      }
    } else if (entry.name === "rsc.rsc") {
      const rsc = fs.readFileSync(fullPath, "utf8");
      await kv.set(["dinou_cache", cleanRelPath], { content: rsc, metadata: null });
      seededCount++;
      console.log(`   ✅ Cached RSC:  ${cleanRelPath}`);
    }
  }
}

await processDir(dist2Dir);
await kv.close();
console.log(`🎉 [Deno KV Seed] Finished successfully! ${seededCount} file(s) cached in KV.\n`);
