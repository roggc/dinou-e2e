// scripts/verify-plugins-ci.mjs
// Verifies Dinou v9.4.0 Configuration, setupFiles & Plugin Architecture (x-plugins-fixes.md):
// 1. resolveSetupFiles & resolveSingleSetupFile: plugin-first hierarchy, deduplication, tsconfig/jsconfig aliases, extensionless specifiers, npm package subpaths & setupFiles: [] convention opt-out
// 2. load-dinou-config.js: config precedence (dinou.config.ts > .mjs > .js > .cjs), aliased imports, mtimeMs dev hot-reload cache, isWatchedDinouConfigOrSetupFile & __DINOU_AOT_CONFIG__ lock
// 3. node-middleware-runner.js: sync next(), Promise async, callback-async Connect/Express (cors-style), next(err) 500 propagation, 2-arg short-circuit, Socket.IO external listener hijack & per-plugin configureServer fault isolation
// 4. handler.js & ppr-runtime.js: normalizeLogicalRequestPathname (page, layout, payload, error, slot + rawPath & isRscRequest), finalizePluginResponse (3xx -> 200 x-rsc-redirect + Set-Cookie + upstream header/cookie merge + external https:// redirect), context.res.redirect() short-circuit, explicit status/Cache-Control preservation & PPR streaming resume status/Cache-Control/cookies
// 5. Full 3-bundler (esbuild, rollup, webpack) x 4-runtime (Node AOT, Cloudflare Worker, Bun, Deno) + .dinou/dist1/server/handler.js standalone AOT execution AFTER deleting dinou.config.ts & src/_plugins/, plus single-execution setupFiles guarantee
// 6. dinou/node/dev.js TypeScript + aliased setupFiles execution (DINOU_BUILD_DEV_ONLY=true)

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

const guardedManifestRelPaths = [
  ".dinou/dist1/manifest.json",
  ".dinou/dist1/react-client-manifest.json",
  ".dinou/dist1/react-ssr-manifest.json",
  ".dinou/dist1/server-functions-manifest.json",
  ".dinou/node-dev/manifest.json",
  ".dinou/node-dev/react-client-manifest.json",
  ".dinou/node-dev/react-ssr-manifest.json",
  ".dinou/node-dev/server-functions-manifest.json",
];
const manifestSnapshotBefore = new Map(
  guardedManifestRelPaths.map((rel) => {
    const abs = path.join(projectRoot, rel);
    return [rel, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null];
  })
);

const dinouRootCandidates = [
  path.resolve(projectRoot, "dinou"),
  path.resolve(projectRoot, "node_modules/dinou/dinou"),
  path.resolve(projectRoot, "node_modules/dinou"),
];
const dinouRoot =
  dinouRootCandidates.find((dir) => fs.existsSync(path.join(dir, "core"))) ??
  dinouRootCandidates[0];
const cliPath = path.join(dinouRoot, "cli.js");

const importDinou = (relPath) =>
  import(pathToFileURL(path.join(dinouRoot, relPath)).href);

function removeDirSafe(dirPath) {
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  } catch {}
}

function writeFiles(baseDir, filesObj) {
  for (const [rel, content] of Object.entries(filesObj)) {
    const abs = path.join(baseDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
}

function createFixtureApp(prefix) {
  const fixturesBase = path.join(
    projectRoot,
    ".dinou",
    "tmp-plugins-fixtures"
  );
  fs.mkdirSync(fixturesBase, { recursive: true });
  const tmpApp = fs.mkdtempSync(path.join(fixturesBase, prefix));

  const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
  fs.mkdirSync(path.join(dinouShimDir, "adapters"), { recursive: true });
  const relToDinou = (sub) =>
    path.relative(dinouShimDir, path.join(dinouRoot, sub)).replace(/\\/g, "/");
  const relFromAdapters = (sub) =>
    path
      .relative(path.join(dinouShimDir, "adapters"), path.join(dinouRoot, sub))
      .replace(/\\/g, "/");

  fs.writeFileSync(
    path.join(dinouShimDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "9.4.0",
        type: "module",
        main: "./index.js",
        exports: {
          ".": "./index.js",
          "./server": "./server.js",
          "./config": "./config.js",
          "./adapters/node": "./adapters/node.js",
          "./adapters/netlify": "./adapters/netlify.js",
        },
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "index.js"),
    `export * from ${JSON.stringify(relToDinou("index.js"))};\nexport { default } from ${JSON.stringify(relToDinou("index.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(relToDinou("server.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(relToDinou("core/config.js"))};\nexport { default } from ${JSON.stringify(relToDinou("core/config.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "adapters", "node.js"),
    `export * from ${JSON.stringify(relFromAdapters("adapters/node.js"))};\nexport { default } from ${JSON.stringify(relFromAdapters("adapters/node.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "adapters", "netlify.js"),
    `export * from ${JSON.stringify(relFromAdapters("adapters/netlify.js"))};\nexport { default } from ${JSON.stringify(relFromAdapters("adapters/netlify.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(tmpApp, "package.json"),
    JSON.stringify(
      { name: "dinou-plugins-fixture", version: "1.0.0", type: "module" },
      null,
      2
    ),
    "utf8"
  );
  return { fixturesBase, tmpApp };
}

function cleanupFixtureApp(fixturesBase, tmpApp) {
  removeDirSafe(tmpApp);
  try {
    if (
      fs.existsSync(fixturesBase) &&
      fs.readdirSync(fixturesBase).length === 0
    ) {
      fs.rmdirSync(fixturesBase);
    }
  } catch {}
}

class MockServerResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.headersSent = false;
    this.writableEnded = false;
    this.body = "";
  }
  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = String(value);
  }
  writeHead(code, hdrs = {}) {
    this.statusCode = code;
    for (const [k, v] of Object.entries(hdrs)) {
      this.setHeader(k, v);
    }
    this.headersSent = true;
  }
  end(chunk = "") {
    this.headersSent = true;
    this.writableEnded = true;
    this.body += String(chunk);
    this.emit("finish");
  }
}

const { resolveSetupFiles, resolveSingleSetupFile } = await importDinou(
  "core/resolve-setup-files.js"
);
const {
  getDinouConfig,
  clearDinouConfigCache,
  findDinouConfigFile,
  isWatchedDinouConfigOrSetupFile,
} = await importDinou("core/load-dinou-config.js");
const { runNodeMiddlewares, applyConfigureServerPlugins } = await importDinou(
  "core/node-middleware-runner.js"
);
const { clearTsconfigAliasCache } = await importDinou(
  "core/tsconfig-aliases.js"
);

console.log(
  "1️⃣ Verifying resolveSetupFiles hierarchy, deduplication, tsconfig/jsconfig aliases, extensionless paths, npm package subpaths & convention opt-out..."
);
{
  const { fixturesBase, tmpApp } = createFixtureApp("setup-res-");
  try {
    writeFiles(tmpApp, {
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
            "@init/*": ["./src/init/*"],
          },
        },
      }),
      "src/init/otel.ts": "globalThis.__OTEL__ = 1;\n",
      "src/init/shared.ts": "globalThis.__SHARED__ = 1;\n",
      "src/polyfills.ts": "globalThis.__USER__ = 1;\n",
      "dinou.setup.mjs": "globalThis.__ROOT_MJS__ = 1;\n",
      "dinou.setup.ts": "globalThis.__ROOT_TS__ = 1;\n",
      "node_modules/acme-telemetry/package.json": JSON.stringify({
        name: "acme-telemetry",
        exports: { "./register": "./register.mjs" },
      }),
      "node_modules/acme-telemetry/register.mjs":
        "globalThis.__PKG_SETUP__ = 1;\n",
    });

    const pluginA = path.join(tmpApp, "src/init/otel.ts");
    const pluginShared = path.join(tmpApp, "src/init/shared.ts");
    const userPolyfill = path.join(tmpApp, "src/polyfills.ts");
    const rootMjs = path.join(tmpApp, "dinou.setup.mjs");
    const pkgSetup = path.join(
      tmpApp,
      "node_modules/acme-telemetry/register.mjs"
    );

    const explicit = resolveSetupFiles(tmpApp, {
      setupFiles: ["@/polyfills", "./src/init/shared", "acme-telemetry/register"],
      plugins: [
        { name: "otel", setupFiles: ["@init/otel.ts", "@/init/shared"] },
      ],
    });
    assert.deepEqual(explicit, [pluginA, pluginShared, userPolyfill, pkgSetup]);

    const disabledConvention = resolveSetupFiles(tmpApp, {
      setupFiles: [],
      plugins: [{ name: "otel", setupFiles: ["./src/init/otel"] }],
    });
    assert.deepEqual(disabledConvention, [pluginA]);

    const fallbackConvention = resolveSetupFiles(tmpApp, {
      plugins: [{ name: "otel", setupFiles: ["@init/otel"] }],
    });
    assert.deepEqual(fallbackConvention, [pluginA, rootMjs]);

    assert.equal(resolveSingleSetupFile("", tmpApp), null);
    assert.equal(resolveSingleSetupFile("@/does-not-exist", tmpApp), null);
  } finally {
    clearTsconfigAliasCache(tmpApp);
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}
console.log("   ✅ Section 1 passed!");

console.log(
  "2️⃣ Verifying load-dinou-config.js precedence, tsconfig aliases, mtimeMs dev hot-reload, watched filenames & __DINOU_AOT_CONFIG__ lock..."
);
{
  const { fixturesBase, tmpApp } = createFixtureApp("cfg-hot-");
  const prevEnv = process.env.NODE_ENV;
  const savedAot = globalThis.__DINOU_AOT_CONFIG__;
  const savedCfg = globalThis.__DINOU_CONFIG__;
  const savedCfgCwd = globalThis.__DINOU_CONFIG_CWD__;
  try {
    delete globalThis.__DINOU_AOT_CONFIG__;
    delete globalThis.__DINOU_CONFIG__;
    delete globalThis.__DINOU_CONFIG_CWD__;

    writeFiles(tmpApp, {
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          paths: {
            "@/*": ["./src/*"],
          },
        },
      }),
      "src/_plugins/meta.ts":
        'export const PLUGIN_NAME: string = "aliased-plugin-v1";\n',
      "dinou.config.mjs":
        'export default { ppr: false, plugins: [{ name: "mjs-fallback" }] };\n',
      "dinou.config.ts": [
        'import { defineConfig, getContext } from "dinou";',
        'import { PLUGIN_NAME } from "@/_plugins/meta";',
        "export default defineConfig({",
        "  ppr: true,",
        "  plugins: [{ name: PLUGIN_NAME, probeCtxType: typeof getContext }],",
        "});",
      ].join("\n"),
    });

    const cfgTs = path.join(tmpApp, "dinou.config.ts");
    assert.equal(findDinouConfigFile(tmpApp), cfgTs);
    assert.equal(
      isWatchedDinouConfigOrSetupFile(cfgTs, tmpApp),
      true
    );
    assert.equal(
      isWatchedDinouConfigOrSetupFile(
        path.join(tmpApp, "dinou.setup.ts"),
        tmpApp
      ),
      true
    );
    assert.equal(
      isWatchedDinouConfigOrSetupFile(
        path.join(tmpApp, "src", "dinou.config.ts"),
        tmpApp
      ),
      false
    );

    process.env.NODE_ENV = "development";
    clearDinouConfigCache(tmpApp);
    const first = await getDinouConfig(tmpApp);
    assert.equal(first.ppr, true);
    assert.equal(first.plugins[0].name, "aliased-plugin-v1");
    assert.equal(first.plugins[0].probeCtxType, "function");

    // Hot-reload on mtimeMs change WITHOUT calling clearDinouConfigCache manually
    fs.writeFileSync(
      cfgTs,
      [
        'import { defineConfig } from "dinou/config";',
        "export default defineConfig({",
        "  ppr: false,",
        "  allowISG: false,",
        '  plugins: [{ name: "reloaded-v2" }],',
        "});",
      ].join("\n"),
      "utf8"
    );
    const bumped = new Date(Date.now() + 5000);
    fs.utimesSync(cfgTs, bumped, bumped);

    const second = await getDinouConfig(tmpApp);
    assert.equal(second.ppr, false);
    assert.equal(second.allowISG, false);
    assert.equal(second.plugins[0].name, "reloaded-v2");

    // Verify __DINOU_AOT_CONFIG__ takes precedence and survives clearDinouConfigCache
    const syntheticAot = { plugins: [{ name: "aot-locked" }] };
    globalThis.__DINOU_AOT_CONFIG__ = syntheticAot;
    globalThis.__DINOU_CONFIG_CWD__ = tmpApp;
    clearDinouConfigCache(tmpApp);
    const fromAot = await getDinouConfig(tmpApp);
    assert.equal(fromAot, syntheticAot);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (savedAot !== undefined) globalThis.__DINOU_AOT_CONFIG__ = savedAot;
    else delete globalThis.__DINOU_AOT_CONFIG__;
    if (savedCfg !== undefined) globalThis.__DINOU_CONFIG__ = savedCfg;
    else delete globalThis.__DINOU_CONFIG__;
    if (savedCfgCwd !== undefined)
      globalThis.__DINOU_CONFIG_CWD__ = savedCfgCwd;
    else delete globalThis.__DINOU_CONFIG_CWD__;
    clearDinouConfigCache(tmpApp);
    clearTsconfigAliasCache(tmpApp);
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}
console.log("   ✅ Section 2 passed!");

console.log(
  "3️⃣ Verifying node-middleware-runner.js (sync, Promise, callback-async cors, next(err), 2-arg handler, Socket.IO hijack & configureServer fault isolation)..."
);
{
  const middlewares = [];
  const serverEmitter = new EventEmitter();

  serverEmitter.on("request", (req, res) => {
    if (req.url && req.url.startsWith("/socket.io/")) {
      res.writeHead(200, { "x-socket-io": "handled" });
      res.end('0{"sid":"xyz"}');
    }
  });

  const origConsoleError = console.error;
  const capturedErrors = [];
  console.error = (...args) => capturedErrors.push(args.join(" "));
  try {
    await applyConfigureServerPlugins({
      server: serverEmitter,
      isDev: true,
      middlewares,
      plugins: [
        {
          name: "faulty-startup-plugin",
          configureServer() {
            throw new Error("simulated startup crash");
          },
        },
        {
          name: "working-node-plugin",
          configureServer({ use }) {
            use((req, _res, next) => {
              if (req.url?.startsWith("/socket.io/")) return;
              next();
            });
            use((req, res, next) => {
              setTimeout(() => {
                if (req.url === "/callback-error") {
                  next(new Error("cors-origin-rejected"));
                  return;
                }
                res.setHeader("x-callback-async", "ok");
                next();
              }, 10);
            });
            use(async (_req, res, next) => {
              await new Promise((r) => setTimeout(r, 4));
              res.setHeader("x-promise-async", "ok");
              next();
            });
            use((req, res, next) => {
              if (req.url === "/healthz") {
                res.writeHead(200, { "content-type": "text/plain" });
                res.end("OK");
                return;
              }
              next();
            });
          },
        },
      ],
    });
  } finally {
    console.error = origConsoleError;
  }

  assert.ok(
    capturedErrors.some((msg) => msg.includes("faulty-startup-plugin")),
    "Expected per-plugin fault attribution log for faulty-startup-plugin"
  );

  async function sendMockRequest(url) {
    const req = { url, method: "GET", headers: {} };
    const res = new MockServerResponse();
    const runner = (async () => {
      try {
        const cont = await runNodeMiddlewares(middlewares, req, res);
        if (!cont || res.writableEnded || res.headersSent) return;
        res.statusCode = 200;
        res.end("reached-dinou-router");
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(`err:${err.message}`);
        }
      }
    })();
    serverEmitter.emit("request", req, res);
    await runner;
    return res;
  }

  const normal = await sendMockRequest("/docs");
  assert.equal(normal.statusCode, 200);
  assert.equal(normal.headers["x-callback-async"], "ok");
  assert.equal(normal.headers["x-promise-async"], "ok");
  assert.equal(normal.body, "reached-dinou-router");

  const socketPoll = await sendMockRequest(
    "/socket.io/?EIO=4&transport=polling"
  );
  assert.equal(socketPoll.statusCode, 200);
  assert.equal(socketPoll.headers["x-socket-io"], "handled");
  assert.equal(socketPoll.body, '0{"sid":"xyz"}');

  const callbackErr = await sendMockRequest("/callback-error");
  assert.equal(callbackErr.statusCode, 500);
  assert.match(callbackErr.body, /err:cors-origin-rejected/);

  const probe = await sendMockRequest("/healthz");
  assert.equal(probe.statusCode, 200);
  assert.equal(probe.body, "OK");
}
console.log("   ✅ Section 3 passed!");

console.log(
  "4️⃣ & 5️⃣ Verifying 3-bundler (esbuild, rollup, webpack) x 4-runtime (Node AOT, Cloudflare, Bun, Deno) + dist1/server AOT bootstrap, SPA x-rsc-redirect, context.res mutations, PPR resume & single-execution setupFiles..."
);
{
  const { fixturesBase, tmpApp } = createFixtureApp("aot-matrix-");
  try {
    writeFiles(tmpApp, {
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@/*": ["./src/*"],
            },
          },
        },
        null,
        2
      ),
      "src/polyfills.ts": [
        "globalThis.__SETUP_EXEC_LOG__ = globalThis.__SETUP_EXEC_LOG__ || [];",
        'globalThis.__SETUP_EXEC_LOG__.push("user-setup");',
      ].join("\n"),
      "src/_plugins/plugin-polyfill.ts": [
        "globalThis.__SETUP_EXEC_LOG__ = globalThis.__SETUP_EXEC_LOG__ || [];",
        'globalThis.__SETUP_EXEC_LOG__.push("plugin-setup");',
      ].join("\n"),
      "src/_plugins/security-guard.ts": `import type { DinouPlugin } from "dinou";
import { getContext } from "dinou/server";

export function upstreamHeaderPlugin(): DinouPlugin {
  return {
    name: "upstream-header-plugin",
    async onRequest(_request, context) {
      context.res.setHeader("x-upstream-plugin", "active");
      context.res.cookie("upstream_seen", "1", { path: "/" });
    },
  };
}

export function securityGuardPlugin(): DinouPlugin {
  return {
    name: "security-guard",
    setupFiles: ["@/_plugins/plugin-polyfill"],
    async onRequest(request, context) {
      if (context.platformContext?.isSSG) {
        (globalThis as any).__SSG_HOOK_INVOKED__ = true;
      }

      const alsCtx = getContext();
      context.res.setHeader("x-plugin-shield", "enabled");

      if (context.req.path === "/api/ping") {
        context.res.cookie("ping_seen", "yes", { path: "/", httpOnly: true });
        return Response.json({
          ok: true,
          alsMatched: alsCtx === context,
          logicalPath: context.req.path,
          rawPath: context.req.rawPath,
          isRscRequest: context.req.isRscRequest,
          setupLog: (globalThis as any).__SETUP_EXEC_LOG__ || [],
        });
      }

      if (context.req.path === "/slot-path-probe") {
        return Response.json({
          logicalPath: context.req.path,
          rawPath: context.req.rawPath,
          isRscRequest: context.req.isRscRequest,
        });
      }

      if (context.req.path === "/external-sso") {
        return Response.redirect("https://idp.example.test/authorize?client=dinou", 302);
      }

      if (context.req.path === "/res-redirect-test") {
        context.res.redirect("/login");
        return;
      }

      if (context.req.path === "/teapot") {
        context.res.status(418);
        context.res.setHeader("Cache-Control", "private, max-age=90");
        return;
      }

      if (context.req.path === "/ppr-page") {
        context.res.status(202);
        context.res.setHeader("Cache-Control", "private, max-age=45");
        context.res.cookie("ppr_cookie", "stream-ok", { path: "/" });
        context.pprRole = "edge-ppr-user";
        return;
      }

      if (context.req.path.startsWith("/dashboard")) {
        if (context.req.cookies.session !== "authenticated") {
          context.res.cookie("flash", "auth-required", { path: "/" });
          return Response.redirect(new URL("/login", request.url), 302);
        }
        context.user = { id: "user_99" };
      }
    },
  };
}
`,
      "dinou.config.ts": `import { defineConfig } from "dinou";
import { upstreamHeaderPlugin, securityGuardPlugin } from "@/_plugins/security-guard";

export default defineConfig({
  setupFiles: ["@/polyfills"],
  plugins: [upstreamHeaderPlugin(), securityGuardPlugin()],
});
`,
      "src/layout.tsx": `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Plugin Matrix</title></head>
      <body>{children}</body>
    </html>
  );
}
`,
      "src/page.tsx": `export default function HomePage() {
  return <main>Public Home</main>;
}
`,
      "src/login/page.tsx": `export default function LoginPage() {
  return <main>Sign In</main>;
}
`,
      "src/teapot/page.tsx": `export default function TeapotPage() {
  return <main>Custom Status Page</main>;
}
`,
      "src/dashboard/page_functions.ts": `export const revalidate = 0;\n`,
      "src/dashboard/page.tsx": `import { getContext } from "dinou";
export default function DashboardPage() {
  const ctx = getContext();
  return <main data-uid={ctx.user?.id || "prerendered"}>Secret Dashboard {ctx.user?.id || "anon"}</main>;
}
`,
      "src/ssg-protected/page.tsx": `export default function SsgProtectedPage() {
  return <main>SSG Protected Content</main>;
}
`,
      "src/ppr-page/page_functions.ts": `export const ppr = true;\n`,
      "src/ppr-page/page.tsx": `import { Suspense } from "react";
import { getContext } from "dinou";

async function Hole() {
  const ctx = getContext() as any;
  const v = ctx?.req?.cookies?.viewer || "guest";
  return <span data-ppr-role={ctx?.pprRole || "none"}>HOLE:{v}:{ctx?.pprRole || "none"}</span>;
}

export default function PprPage() {
  return (
    <main>
      <h1>PPR Shell</h1>
      <Suspense fallback={<span>Loading...</span>}>
        <Hole />
      </Suspense>
    </main>
  );
}
`,
    });

    // Also guard /ssg-protected in security-guard.ts so SSG pre-rendering + runtime guard are both verified
    const guardPath = path.join(tmpApp, "src/_plugins/security-guard.ts");
    fs.writeFileSync(
      guardPath,
      fs
        .readFileSync(guardPath, "utf8")
        .replace(
          'if (context.req.path.startsWith("/dashboard")) {',
          'if (context.req.path.startsWith("/dashboard") || context.req.path.startsWith("/ssg-protected")) {'
        ),
      "utf8"
    );

    const runCli = (subcmd) => {
      execFileSync(process.execPath, [cliPath, subcmd], {
        cwd: tmpApp,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "pipe",
      });
    };

    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      runCli(`build:node:${bundler}`);

      assert.equal(
        fs.existsSync(
          path.join(tmpApp, ".dinou/dist2/ssg-protected/index.html")
        ),
        true,
        `[${bundler}] SSG build must pre-render /ssg-protected without firing runtime auth guard`
      );
      assert.equal(
        fs.existsSync(
          path.join(tmpApp, ".dinou/dist1/dinou-server-bootstrap.mjs")
        ),
        true,
        `[${bundler}] .dinou/dist1/dinou-server-bootstrap.mjs must exist`
      );
      assert.equal(
        fs.existsSync(path.join(tmpApp, ".dinou/dist1/server/handler.js")),
        true,
        `[${bundler}] .dinou/dist1/server/handler.js must exist`
      );
      assert.equal(
        fs.existsSync(path.join(tmpApp, ".dinou/dist1/_entries")),
        false,
        `[${bundler}] temporary .dinou/dist1/_entries must be cleaned up`
      );
      const serverMjsTxt = fs.readFileSync(
        path.join(tmpApp, ".dinou/node/server.mjs"),
        "utf8"
      );
      assert.ok(
        !/import\(\s*["'][^"']*core\/load-dinou-config\.js["']\s*\)/.test(
          serverMjsTxt
        ),
        `[${bundler}] .dinou/node/server.mjs must not dynamically import build-machine load-dinou-config.js`
      );
    }

    // Build Cloudflare, Bun & Deno directly via Node builder scripts
    const cleanAdapterBuildEnv = {
      ...process.env,
      NODE_ENV: "production",
      DINOU_BUILD_TOOL: "esbuild",
    };
    delete cleanAdapterBuildEnv.DINOU_DEV;
    delete cleanAdapterBuildEnv.DINOU_WRITE_TO_DISK;

    for (const relScript of [
      "cloudflare/build.js",
      "bun/build.js",
      "deno/build.js",
    ]) {
      const res = spawnSync(
        process.execPath,
        [path.join(dinouRoot, relScript)],
        {
          cwd: tmpApp,
          encoding: "utf8",
          env: cleanAdapterBuildEnv,
        }
      );
      assert.equal(
        res.status,
        0,
        `${relScript} failed:\n${res.stdout}\n${res.stderr}`
      );
    }

    // Delete source dinou.config.ts, polyfills.ts & src/_plugins to prove 100% standalone AOT execution!
    fs.rmSync(path.join(tmpApp, "dinou.config.ts"), { force: true });
    fs.rmSync(path.join(tmpApp, "src/polyfills.ts"), { force: true });
    fs.rmSync(path.join(tmpApp, "src/_plugins"), {
      recursive: true,
      force: true,
    });

    // 5A. Verify .dinou/node/server.mjs & rsc-engine.mjs standalone AOT runtime
    const verifyNodeScript = path.join(tmpApp, "verify-node-aot.mjs");
    fs.writeFileSync(
      verifyNodeScript,
      `import assert from "node:assert/strict";
import { handleRequest } from "./.dinou/node/rsc-engine.mjs";
import { renderHtml } from "./.dinou/node/ssr-engine.mjs";

const invoke = (urlPath, init = {}, extra = {}) =>
  handleRequest(new Request("http://localhost:3000" + urlPath, init), {
    runtime: "node-bundle",
    renderHtmlStream: renderHtml,
    ...extra,
  });

// SSG pass skips onRequest completely
const ssgPass = await invoke("/ssg-protected", {}, { isSSG: true });
assert.equal(ssgPass.status, 200);
assert.equal(globalThis.__SSG_HOOK_INVOKED__, undefined);

// Webhook + upstream header/cookie merge + single-execution setupFiles order
const ping = await invoke("/api/ping");
assert.equal(ping.status, 200);
assert.equal(ping.headers.get("x-upstream-plugin"), "active");
assert.equal(ping.headers.get("x-plugin-shield"), "enabled");
const pingCookies = ping.headers.get("set-cookie") || "";
assert.match(pingCookies, /upstream_seen=1/);
assert.match(pingCookies, /ping_seen=yes/);
assert.deepEqual(await ping.json(), {
  ok: true,
  alsMatched: true,
  logicalPath: "/api/ping",
  rawPath: "/api/ping",
  isRscRequest: false,
  setupLog: ["plugin-setup", "user-setup"],
});

// Slot wire request normalizes logical path from x-dinou-current-path
const slotProbe = await invoke("/____rsc_slot____/hero-slot", {
  headers: { "x-dinou-current-path": "/slot-path-probe?foo=1" },
});
assert.equal(slotProbe.status, 200);
assert.deepEqual(await slotProbe.json(), {
  logicalPath: "/slot-path-probe",
  rawPath: "/____rsc_slot____/hero-slot",
  isRscRequest: true,
});

// External https:// redirect on RSC wire request -> 200 x-rsc-redirect
const extSsoRsc = await invoke("/____rsc_page____/external-sso");
assert.equal(extSsoRsc.status, 200);
assert.equal(
  extSsoRsc.headers.get("x-rsc-redirect"),
  "https://idp.example.test/authorize?client=dinou"
);

// Unauthenticated hard navigation to cached SSG page -> 302 + Set-Cookie
const unauthSsgHard = await invoke("/ssg-protected");
assert.equal(unauthSsgHard.status, 302);
assert.match(unauthSsgHard.headers.get("location") || "", /\\/login$/);
assert.match(unauthSsgHard.headers.get("set-cookie") || "", /flash=auth-required/);

// Unauthenticated SPA <Link> RSC page & layout requests -> 200 x-rsc-redirect + Set-Cookie
const unauthSpaPage = await invoke("/____rsc_page____/dashboard");
assert.equal(unauthSpaPage.status, 200);
assert.equal(unauthSpaPage.headers.get("x-rsc-redirect"), "/login");
assert.match(unauthSpaPage.headers.get("set-cookie") || "", /flash=auth-required/);
assert.match(unauthSpaPage.headers.get("set-cookie") || "", /upstream_seen=1/);

const unauthSpaLayout = await invoke("/____rsc_layout____/dashboard");
assert.equal(unauthSpaLayout.status, 200);
assert.equal(unauthSpaLayout.headers.get("x-rsc-redirect"), "/login");

// Authenticated request enriches context.user
const authOk = await invoke("/dashboard", {
  headers: { Cookie: "session=authenticated" },
});
assert.equal(authOk.status, 200);
assert.equal(authOk.headers.get("x-plugin-shield"), "enabled");
assert.match(await authOk.text(), /user_99/);

// context.res.redirect() without returning Response halts onRequest on both hard & SPA requests
const proxyRedirectHard = await invoke("/res-redirect-test");
assert.equal(proxyRedirectHard.status, 302);
assert.equal(proxyRedirectHard.headers.get("location"), "/login");

const proxyRedirectSpa = await invoke("/____rsc_page____/res-redirect-test");
assert.equal(proxyRedirectSpa.status, 200);
assert.equal(proxyRedirectSpa.headers.get("x-rsc-redirect"), "/login");

// Explicit status(418) + custom Cache-Control preserved on cached SSG page
const teapot = await invoke("/teapot");
assert.equal(teapot.status, 418);
assert.equal(teapot.headers.get("cache-control"), "private, max-age=90");
assert.match(await teapot.text(), /Custom Status Page/);

// PPR streaming resume preserves status(202), custom Cache-Control (+ no-transform), cookies & context
const pprRes = await invoke("/ppr-page", {
  headers: { Cookie: "viewer=grace" },
});
assert.equal(pprRes.status, 202);
assert.equal(
  pprRes.headers.get("cache-control"),
  "private, max-age=45, no-transform"
);
assert.match(pprRes.headers.get("set-cookie") || "", /ppr_cookie=stream-ok/);
const pprHtml = (await pprRes.text()).replaceAll("<!-- -->", "");
assert.match(pprHtml, /PPR Shell/);
assert.match(pprHtml, /HOLE:grace:edge-ppr-user/);

console.log("NODE_AOT_OK");
process.exit(0);
`,
      "utf8"
    );

    const nodeRes = spawnSync(process.execPath, [verifyNodeScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    });
    assert.equal(
      nodeRes.status,
      0,
      `Node AOT plugin verification failed:\n${nodeRes.stdout}\n${nodeRes.stderr}`
    );
    assert.match(nodeRes.stdout, /NODE_AOT_OK/);

    // 5B. Verify Cloudflare Worker (.dinou/cloudflare/worker.js) standalone AOT execution on Windows & Linux
    const verifyCfScript = path.join(tmpApp, "verify-cf-worker.mjs");
    fs.writeFileSync(
      verifyCfScript,
      `import assert from "node:assert/strict";
import worker from "./.dinou/cloudflare/worker.js";

const ctx = { waitUntil() {} };
const env = {};

const ping = await worker.fetch(new Request("https://edge.test/api/ping"), env, ctx);
assert.equal(ping.status, 200);
assert.equal(ping.headers.get("x-upstream-plugin"), "active");
assert.equal(ping.headers.get("x-plugin-shield"), "enabled");
const pingData = await ping.json();
assert.deepEqual(pingData.setupLog, ["plugin-setup", "user-setup"]);

const unauthSpa = await worker.fetch(
  new Request("https://edge.test/____rsc_page____/dashboard"),
  env,
  ctx
);
assert.equal(unauthSpa.status, 200);
assert.equal(unauthSpa.headers.get("x-rsc-redirect"), "/login");

const authRes = await worker.fetch(
  new Request("https://edge.test/dashboard", {
    headers: { Cookie: "session=authenticated" },
  }),
  env,
  ctx
);
assert.equal(authRes.status, 200);
assert.match(await authRes.text(), /user_99/);

console.log("CF_WORKER_OK");
process.exit(0);
`,
      "utf8"
    );

    const cfRes = spawnSync(process.execPath, [verifyCfScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    });
    assert.equal(
      cfRes.status,
      0,
      `Cloudflare Worker plugin verification failed:\n${cfRes.stdout}\n${cfRes.stderr}`
    );
    assert.match(cfRes.stdout, /CF_WORKER_OK/);

    // 5C. Verify .dinou/dist1/server/handler.js standalone AOT bootstrap (after source dinou.config.ts was deleted!)
    const verifyDist1Script = path.join(tmpApp, "verify-dist1-handler.mjs");
    fs.writeFileSync(
      verifyDist1Script,
      `import assert from "node:assert/strict";
import { handleRequest } from "./.dinou/dist1/server/handler.js";

const res = await handleRequest(new Request("http://localhost:3000/api/ping"));
assert.equal(res.status, 200);
assert.equal(res.headers.get("x-plugin-shield"), "enabled");
const json = await res.json();
assert.deepEqual(json.setupLog, ["plugin-setup", "user-setup"]);
console.log("DIST1_HANDLER_OK");
process.exit(0);
`,
      "utf8"
    );

    const dist1Res = spawnSync(
      process.execPath,
      ["--conditions=react-server", verifyDist1Script],
      {
        cwd: tmpApp,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "production" },
      }
    );
    assert.equal(
      dist1Res.status,
      0,
      `dist1/server/handler.js verification failed:\n${dist1Res.stdout}\n${dist1Res.stderr}`
    );
    assert.match(dist1Res.stdout, /DIST1_HANDLER_OK/);
  } finally {
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}
console.log("   ✅ Sections 4 & 5 passed!");

console.log(
  "6️⃣ Verifying dinou/node/dev.js TypeScript + aliased setupFiles execution (DINOU_BUILD_DEV_ONLY=true)..."
);
{
  const { fixturesBase, tmpApp } = createFixtureApp("dev-setup-ts-");
  try {
    writeFiles(tmpApp, {
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          paths: {
            "@/*": ["./src/*"],
          },
        },
      }),
      "src/_setup/helper.ts":
        'export const SETUP_BANNER: string = "DEV_TS_SETUP_OK";\n',
      "dinou.setup.ts": [
        'import { SETUP_BANNER } from "@/_setup/helper";',
        "(globalThis as any).__DEV_TS_SETUP__ = SETUP_BANNER;",
      ].join("\n"),
      "dinou.config.ts": [
        'import { defineConfig } from "dinou";',
        "export default defineConfig({",
        '  plugins: [{ name: "dev-ts-probe" }],',
        "});",
      ].join("\n"),
      "src/layout.tsx":
        "export default function Layout({ children }: { children: any }) { return <html><body>{children}</body></html>; }\n",
      "src/page.tsx":
        "export default function Page() { return <main>Dev TS Setup</main>; }\n",
    });

    const cleanDevEnv = {
      ...process.env,
      DINOU_BUILD_DEV_ONLY: "true",
      DINOU_WRITE_TO_DISK: "false",
    };
    delete cleanDevEnv.PORT;
    delete cleanDevEnv.HMR_PORT;
    delete cleanDevEnv.NODE_ENV;

    const devRes = spawnSync(
      process.execPath,
      [path.join(dinouRoot, "node/dev.js")],
      {
        cwd: tmpApp,
        encoding: "utf8",
        env: cleanDevEnv,
      }
    );
    assert.equal(
      devRes.status,
      0,
      `dinou/node/dev.js TypeScript setupFiles build failed:\n${devRes.stdout}\n${devRes.stderr}`
    );
  } finally {
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}
console.log("   ✅ Section 6 passed!");

// Verify host workspace manifests were never mutated
for (const [rel, before] of manifestSnapshotBefore.entries()) {
  const abs = path.join(projectRoot, rel);
  const after = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  assert.equal(
    after,
    before,
    `Host workspace manifest ${rel} was unexpectedly mutated during verify-plugins-ci.mjs`
  );
}

console.log(
  "\n🎉 All 6 Dinou v9.4.0 Configuration, setupFiles & Plugin Architecture verification suites PASSED!"
);
