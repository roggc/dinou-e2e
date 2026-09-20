// dinou/cloudflare/build.mjs
// Build script for packaging Dinou v7 for Cloudflare Workers.

import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { generateRouteModulesCode } = require("../core/route-generator.js");
const parseExports = require("../core/parse-exports.js");
const { useClientRegex, useServerRegex } = require("../constants.js");

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
  const rawManifest = JSON.parse(fs.readFileSync(clientManifestPath, "utf8"));
  const normalizedManifest = { ...rawManifest };
  for (const [k, v] of Object.entries(rawManifest)) {
    if (k.startsWith("file:///c:/")) {
      normalizedManifest["file:///C:/" + k.slice(11)] = v;
    } else if (k.startsWith("file:///C:/")) {
      normalizedManifest["file:///c:/" + k.slice(11)] = v;
    }
  }
  manifestInlines += `\nglobalThis.__DINOU_CLIENT_MANIFEST__ = ${JSON.stringify(normalizedManifest)};\n`;
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
    const slashPath = fullPath.replace(/\\/g, "/");
    if (isDir) {
      walkVfs(fullPath);
    } else {
      vfsSnapshot[edgePath] = { type: "file" };
      vfsSnapshot[slashPath] = { type: "file" };
      if (slashPath.length > 2 && slashPath[1] === ":") {
        vfsSnapshot[slashPath.slice(2)] = { type: "file" };
      }
      vfsSnapshot["src/" + relFromSrc] = { type: "file" };
    }
  }
  const dirRel = path.relative(srcDir, dir).replace(/\\/g, "/");
  const edgeDir = dirRel ? "/src/" + dirRel : "/src";
  const dirSlash = dir.replace(/\\/g, "/");
  vfsSnapshot[edgeDir] = { type: "directory", children };
  vfsSnapshot[dirSlash] = { type: "directory", children };
  if (dirSlash.length > 2 && dirSlash[1] === ":") {
    vfsSnapshot[dirSlash.slice(2)] = { type: "directory", children };
  }
  vfsSnapshot[dirRel ? "src/" + dirRel : "src"] = { type: "directory", children };
}
walkVfs(srcDir);

const envSetupContent = `// Auto-generated environment setup
${manifestInlines}
globalThis.__DINOU_VFS__ = ${JSON.stringify(vfsSnapshot)};
`;
const envSetupPath = path.join(cloudflareDir, "env-setup.js");
fs.writeFileSync(envSetupPath, envSetupContent, "utf8");

const workerEntryContent = `// Auto-generated worker entry for Cloudflare Workers
import "./env-setup.js";
import "./route-modules.js";
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

const reactServerShimPlugin = {
  name: "react-server-shim",
  setup(build) {
    build.onLoad({ filter: /react\.react-server(\.production|\.development)?\.js$/ }, async (args) => {
      let contents = await fs.promises.readFile(args.path, "utf8");
      contents += `
if (typeof exports !== 'undefined') {
  if (!exports.Component) {
    exports.Component = class Component {
      constructor(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = {};
        this.updater = updater || {};
      }
    };
    exports.Component.prototype.isReactComponent = {};
  }
  if (!exports.PureComponent) {
    exports.PureComponent = class PureComponent extends exports.Component {};
    exports.PureComponent.prototype.isPureReactComponent = true;
  }
  if (!exports.useState) exports.useState = (init) => [typeof init === 'function' ? init() : init, () => {}];
  if (!exports.useEffect) exports.useEffect = () => {};
  if (!exports.useLayoutEffect) exports.useLayoutEffect = () => {};
  if (!exports.useInsertionEffect) exports.useInsertionEffect = () => {};
  if (!exports.useRef) exports.useRef = (v) => ({ current: v });
  if (!exports.useMemo) exports.useMemo = (fn) => fn();
  if (!exports.useCallback) exports.useCallback = (fn) => fn;
  if (!exports.useReducer) exports.useReducer = (r, init) => [init, () => {}];
  if (!exports.useContext) exports.useContext = (ctx) => (ctx ? ctx._currentValue : undefined);
  if (!exports.useId) exports.useId = () => ":r0:";
  if (!exports.useTransition) exports.useTransition = () => [false, (fn) => fn()];
}
`;
      return { contents, loader: "js" };
    });
  },
};

const clientReferencesPlugin = {
  name: "dinou-client-references",
  setup(build) {
    build.onResolve({ filter: /\?dinou-ssr$/ }, (args) => {
      const cleanPath = path.isAbsolute(args.path.replace(/\?dinou-ssr$/, ""))
        ? args.path.replace(/\?dinou-ssr$/, "")
        : path.resolve(args.resolveDir, args.path.replace(/\?dinou-ssr$/, ""));
      return {
        path: cleanPath,
        namespace: "dinou-client-ssr",
      };
    });

    build.onLoad({ filter: /.*/, namespace: "dinou-client-ssr" }, async (args) => {
      let code;
      try {
        code = fs.readFileSync(args.path, "utf8");
      } catch (e) {
        return null;
      }
      code = `import * as React from "react";\n` + code;
      const ext = path.extname(args.path).slice(1);
      return {
        contents: code,
        loader: ext === "ts" ? "ts" : ext === "tsx" ? "tsx" : ext === "jsx" ? "jsx" : "js",
        resolveDir: path.dirname(args.path),
      };
    });

    build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
      if (args.path.includes("node_modules")) return null;
      const normalizedPath = args.path.replace(/\\/g, "/");
      if (normalizedPath.includes("dinou/core/navigation")) return null;

      let code;
      try {
        code = fs.readFileSync(args.path, "utf8");
      } catch (e) {
        return null;
      }

      if (!useClientRegex.test(code.trim())) return null;

      const exports = parseExports(code);
      const absPath = path.resolve(args.path);
      const fileUrl = pathToFileURL(absPath).href;
      const importPath = absPath.replace(/\\/g, "/") + "?dinou-ssr";

      let proxyCode = `import { createClientModuleProxy } from "react-server-dom-webpack/server.edge";\n`;
      proxyCode += `import * as __dinou_ssr_mod__ from ${JSON.stringify(importPath)};\n`;
      proxyCode += `const proxy = createClientModuleProxy(${JSON.stringify(fileUrl)});\n`;
      proxyCode += `if (typeof globalThis !== 'undefined') {\n`;
      proxyCode += `  globalThis.__DINOU_CLIENT_SSR__ = globalThis.__DINOU_CLIENT_SSR__ || {};\n`;
      proxyCode += `  for (const k of Object.keys(__dinou_ssr_mod__)) {\n`;
      proxyCode += `    if (typeof __dinou_ssr_mod__[k] === 'function') {\n`;
      proxyCode += `      globalThis.__DINOU_CLIENT_SSR__[${JSON.stringify(fileUrl)} + '#' + k] = __dinou_ssr_mod__[k];\n`;
      proxyCode += `    }\n`;
      proxyCode += `  }\n`;
      proxyCode += `  if ('default' in __dinou_ssr_mod__ && typeof __dinou_ssr_mod__.default === 'function') {\n`;
      proxyCode += `    globalThis.__DINOU_CLIENT_SSR__[${JSON.stringify(fileUrl)} + '#default'] = __dinou_ssr_mod__.default;\n`;
      proxyCode += `  }\n`;
      proxyCode += `}\n`;

      for (const name of exports) {
        if (name === "default") {
          proxyCode += `export default proxy.default;\n`;
        } else {
          proxyCode += `export const ${name} = proxy[${JSON.stringify(name)}];\n`;
        }
      }

      if (!exports.includes("default")) {
        proxyCode += `export default proxy.default;\n`;
      }

      return {
        contents: proxyCode,
        loader: "js",
      };
    });
  },
};

const serverReferencesPlugin = {
  name: "dinou-server-references",
  setup(build) {
    build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
      if (args.path.includes("node_modules")) return null;

      let code;
      try {
        code = fs.readFileSync(args.path, "utf8");
      } catch (e) {
        return null;
      }

      if (!useServerRegex.test(code.trim())) return null;

      const exports = parseExports(code);
      const absPath = path.resolve(args.path);
      const relPath = path.relative(projectRoot, absPath).replace(/\\/g, "/");
      const relativeFileUrl = "file:///" + relPath;

      let transformed = code + "\n\n";
      transformed += `import { registerServerReference } from "react-server-dom-webpack/server.edge";\n`;

      for (const name of exports) {
        if (name !== "default") {
          transformed += `registerServerReference(${name}, ${JSON.stringify(relativeFileUrl)}, ${JSON.stringify(name)});\n`;
        }
      }

      const ext = path.extname(args.path);
      const loader = ext === ".ts" ? "ts" : ext === ".tsx" ? "tsx" : ext === ".jsx" ? "jsx" : "js";

      return {
        contents: transformed,
        loader,
      };
    });
  },
};

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
    plugins: [reactServerShimPlugin, clientReferencesPlugin, serverReferencesPlugin],
    banner: {
      js: `import { createRequire as ___createRequire } from 'node:module';
import { AsyncLocalStorage as ___AsyncLocalStorage } from 'node:async_hooks';
const require = ___createRequire(import.meta.url || 'file:///worker.js');
const __dirname = '';
const __filename = '';
globalThis.__dinou_require__ = require;
if (typeof globalThis.AsyncLocalStorage === 'undefined' && typeof ___AsyncLocalStorage !== 'undefined') {
  globalThis.AsyncLocalStorage = ___AsyncLocalStorage;
}`,
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
