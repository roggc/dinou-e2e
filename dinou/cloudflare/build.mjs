// dinou/cloudflare/build.mjs
// Build script for packaging Dinou v7 for Cloudflare Workers.

import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { generateRouteModulesCode } = require("../core/route-generator.js");

const projectRoot = process.cwd();
const cloudflareDir = path.resolve(projectRoot, ".dinou/cloudflare");
fs.mkdirSync(cloudflareDir, { recursive: true });

// Locate dinou root: ejected in project or in package directory
const dinouDir = fs.existsSync(path.resolve(projectRoot, "dinou"))
  ? path.resolve(projectRoot, "dinou")
  : path.resolve(__dirname, "..");
const cloudflareAdapterPath = path.resolve(dinouDir, "adapters/cloudflare.js").replace(/\\/g, "/");

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      count += copyRecursive(srcPath, destPath);
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

const dist2Dir = path.resolve(projectRoot, ".dinou/dist2");
const dist3Dir = path.resolve(projectRoot, ".dinou/dist3");
if (fs.existsSync(dist2Dir)) {
  console.log("📄 [Dinou Cloudflare] Synchronizing pre-rendered static HTML and RSC from .dinou/dist2 to .dinou/dist3...");
  const copiedCount = copyRecursive(dist2Dir, dist3Dir);
  console.log(`   Copied ${copiedCount} pre-rendered file(s) for Cloudflare Workers Static Assets.`);
}

console.log("⚡ [Dinou Cloudflare] Generating static route modules...");
const routeModulesCode = generateRouteModulesCode(projectRoot, "../..");
const routeModulesPath = path.join(cloudflareDir, "route-modules.js");
fs.writeFileSync(routeModulesPath, routeModulesCode, "utf8");

console.log("📦 [Dinou Cloudflare] Preparing worker entry point...");

// Check manifests from build (supports Esbuild, Rollup, and Webpack output locations)
function findManifest(filename, fallbackFolder) {
  const candidates = [
    path.resolve(projectRoot, ".dinou", fallbackFolder, filename),
    path.resolve(projectRoot, ".dinou/dist3", filename),
    path.resolve(projectRoot, ".dinou/public", filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const clientManifestPath = findManifest("react-client-manifest.json", "react_client_manifest");
const sfManifestPath = findManifest("server-functions-manifest.json", "server_functions_manifest");

let manifestInlines = "";
if (clientManifestPath) {
  const content = fs.readFileSync(clientManifestPath, "utf8");
  manifestInlines += `\nglobalThis.__DINOU_CLIENT_MANIFEST__ = ${content};\n`;
} else {
  manifestInlines += `\nglobalThis.__DINOU_CLIENT_MANIFEST__ = {};\n`;
}

if (sfManifestPath) {
  const content = fs.readFileSync(sfManifestPath, "utf8");
  manifestInlines += `\nglobalThis.__DINOU_SERVER_FUNCTIONS_MANIFEST__ = ${content};\n`;
} else {
  manifestInlines += `\nglobalThis.__DINOU_SERVER_FUNCTIONS_MANIFEST__ = {};\n`;
}

console.log("⚡ [Dinou Cloudflare] Building in-memory VFS for Edge routing...");
const srcDir = path.resolve(projectRoot, "src");
const vfsSnapshot = {};
function walkVfs(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const children = [];
  for (const entry of entries) {
    const isDir = entry.isDirectory();
    children.push({ name: entry.name, isDirectory: isDir });
    const fullPath = path.join(dir, entry.name);
    const relFromSrc = path.relative(srcDir, fullPath).replace(/\\/g, "/");
    const edgePath = "/src/" + relFromSrc;
    if (isDir) {
      walkVfs(fullPath);
    } else {
      vfsSnapshot[edgePath] = { type: "file" };
      vfsSnapshot[fullPath.replace(/\\/g, "/")] = { type: "file" };
    }
  }
  const dirRel = path.relative(srcDir, dir).replace(/\\/g, "/");
  const edgeDir = dirRel ? "/src/" + dirRel : "/src";
  vfsSnapshot[edgeDir] = { type: "directory", children };
  vfsSnapshot[dir.replace(/\\/g, "/")] = { type: "directory", children };
}
walkVfs(srcDir);
const vfsInline = `\nglobalThis.__DINOU_VFS__ = ${JSON.stringify(vfsSnapshot)};\n`;

const workerEntryContent = `// Auto-generated worker entry for Cloudflare Workers
import "./route-modules.js";
${manifestInlines}
${vfsInline}
import worker from "${cloudflareAdapterPath}";

export default worker;
`;

const workerEntryPath = path.join(cloudflareDir, "worker-entry.js");
fs.writeFileSync(workerEntryPath, workerEntryContent, "utf8");

console.log("🚀 [Dinou Cloudflare] Bundling worker with esbuild...");

const supportedNodeModules = [
  "assert", "assert/strict",
  "async_hooks",
  "buffer",
  "crypto",
  "diagnostics_channel",
  "events",
  "path", "path/posix", "path/win32",
  "process",
  "stream", "stream/consumers", "stream/promises", "stream/web",
  "string_decoder",
  "timers", "timers/promises",
  "url",
  "util", "util/types",
  "zlib",
];

const externalList = [
  "cloudflare:*",
  ...supportedNodeModules,
  ...supportedNodeModules.map((b) => "node:" + b),
];

const shimsDir = path.resolve(__dirname, "shims");

const outfile = path.join(cloudflareDir, "worker.js");

try {
  await esbuild.build({
    entryPoints: [workerEntryPath],
    outfile,
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "neutral",
    mainFields: ["module", "main"],
    conditions: ["workerd", "worker", "react-server", "browser"],
    external: externalList,
    banner: {
      js: "import { createRequire as ___createRequire } from 'node:module'; const require = ___createRequire(import.meta.url || 'file:///worker.js'); globalThis.__dinou_require__ = require;",
    },
    alias: {
      "@": path.resolve(projectRoot, "src"),
      dinou: dinouDir,
      fs: path.resolve(shimsDir, "fs.js"),
      "node:fs": path.resolve(shimsDir, "fs.js"),
      "fs/promises": path.resolve(shimsDir, "fs.js"),
      "node:fs/promises": path.resolve(shimsDir, "fs.js"),
      child_process: path.resolve(shimsDir, "child_process.js"),
      "node:child_process": path.resolve(shimsDir, "child_process.js"),
      http: path.resolve(shimsDir, "empty.js"),
      "node:http": path.resolve(shimsDir, "empty.js"),
      https: path.resolve(shimsDir, "empty.js"),
      "node:https": path.resolve(shimsDir, "empty.js"),
      net: path.resolve(shimsDir, "empty.js"),
      "node:net": path.resolve(shimsDir, "empty.js"),
      tls: path.resolve(shimsDir, "empty.js"),
      "node:tls": path.resolve(shimsDir, "empty.js"),
      os: path.resolve(shimsDir, "os.js"),
      "node:os": path.resolve(shimsDir, "os.js"),
      cluster: path.resolve(shimsDir, "empty.js"),
      "node:cluster": path.resolve(shimsDir, "empty.js"),
      dgram: path.resolve(shimsDir, "empty.js"),
      "node:dgram": path.resolve(shimsDir, "empty.js"),
      dns: path.resolve(shimsDir, "empty.js"),
      "node:dns": path.resolve(shimsDir, "empty.js"),
    },
    loader: {
      ".js": "jsx",
      ".jsx": "jsx",
      ".ts": "ts",
      ".tsx": "tsx",
      ".json": "json",
      ".css": "empty",
      ".svg": "dataurl",
      ".png": "dataurl",
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".webp": "dataurl",
      ".ico": "dataurl",
    },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.DINOU_RUNTIME": '"edge"',
    },
    logLevel: "info",
  });

  console.log(`✅ [Dinou Cloudflare] Worker bundled successfully: ${outfile}`);
  console.log("👉 Deploy to Cloudflare using: npx wrangler deploy");
} catch (err) {
  console.error("❌ [Dinou Cloudflare] Worker bundling failed:", err);
  process.exit(1);
}
