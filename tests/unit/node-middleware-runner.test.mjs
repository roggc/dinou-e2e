// tests/unit/node-middleware-runner.test.mjs
// Series Z — Phase 1 — Stage 5 (Check #Z5 — Part B):
// Node `configureServer` Express/Connect middleware runner contract & live HTTP
// production AOT integration suite:
// 1. Sync next(), async Promise middleware, callback-async middleware.
// 2. Short-circuit res.end() / res.writeHead() (sync & async) without ERR_HTTP_HEADERS_SENT.
// 3. <3-arg (req, res) middleware + external server.on("request") hijack (Socket.IO style).
// 4. next(err) error propagation (sync, callback-async, Promise throw, headers-already-sent).
// 5. Early client abort (req "aborted") & already-destroyed res cleanup (zero hang, zero listener leak).
// 6. Upstream middleware Set-Cookie preservation across sendWebResponseToNode().
// 7. Streaming SSE coexistence with concurrent Dinou SSR / RSC / 3D PPR requests.
// 8. Coexistence of configureServer middlewares + onRequest Web Standard plugins.
// 9. Faulty plugin.configureServer isolation.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const DINOU_ROOT = fs.existsSync(path.resolve(REPO_ROOT, "dinou", "cli.js"))
  ? path.resolve(REPO_ROOT, "dinou")
  : fs.existsSync(
        path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou", "cli.js")
      )
    ? path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou")
    : path.resolve(REPO_ROOT, "node_modules", "dinou");
const CLI_PATH = path.join(DINOU_ROOT, "cli.js");
const SWC_CACHE_DIR = path.join(REPO_ROOT, ".dinou", ".swc-cache");
fs.mkdirSync(SWC_CACHE_DIR, { recursive: true });

const { runNodeMiddlewares, applyConfigureServerPlugins } = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core/node-middleware-runner.js")).href
);
const { sendWebResponseToNode } = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core/http-adapter.js")).href
);

function removeDirSafe(dirPath) {
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 80,
    });
  } catch {}
}

function createFixtureDir(prefix) {
  const base = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(base, { recursive: true });
    return fs.mkdtempSync(path.join(base, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

function createMockReqRes(url = "/") {
  const req = Object.assign(new EventEmitter(), {
    url,
    method: "GET",
    headers: { host: "localhost" },
    aborted: false,
    destroyed: false,
  });
  const headersMap = new Map();
  const res = Object.assign(new EventEmitter(), {
    req,
    statusCode: 200,
    statusMessage: "",
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    bodyChunks: [],
    setHeader(k, v) {
      headersMap.set(k.toLowerCase(), v);
    },
    getHeader(k) {
      return headersMap.get(k.toLowerCase());
    },
    writeHead(status, hdrs = {}) {
      this.statusCode = status;
      for (const [k, v] of Object.entries(hdrs)) {
        this.setHeader(k, v);
      }
      this.headersSent = true;
    },
    write(chunk) {
      this.headersSent = true;
      this.bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    },
    end(chunk) {
      if (chunk !== undefined) this.write(chunk);
      this.headersSent = true;
      this.writableEnded = true;
      this.emit("finish");
      this.emit("close");
    },
    destroy() {
      this.destroyed = true;
      this.emit("close");
    },
  });
  return { req, res };
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

test("1. [#Z5 Part B] Unit contract: sync, Promise, callback-async, short-circuit, <3-arg, next(err), client abort cleanup, destroyed res & Set-Cookie merge", async () => {
  // 1A. Execution order across sync, async Promise, and callback-async middlewares
  {
    const { req, res } = createMockReqRes("/order");
    const order = [];
    const shouldContinue = await runNodeMiddlewares(
      [
        (_req, _res, next) => {
          order.push("sync");
          next();
        },
        async (_req, _res, next) => {
          await new Promise((r) => setTimeout(r, 10));
          order.push("promise");
          next();
        },
        (_req, _res, next) => {
          setTimeout(() => {
            order.push("callback-async");
            next();
          }, 15);
        },
      ],
      req,
      res
    );
    assert.equal(shouldContinue, true);
    assert.deepEqual(order, ["sync", "promise", "callback-async"]);
  }

  // 1B. Short-circuit middleware (sync & callback-async res.end) stops chain
  {
    const { req, res } = createMockReqRes("/short-sync");
    let ranSecond = false;
    const shouldContinue = await runNodeMiddlewares(
      [
        (_req, r, _next) => {
          r.end("done-sync");
        },
        (_req, _r, next) => {
          ranSecond = true;
          next();
        },
      ],
      req,
      res
    );
    assert.equal(shouldContinue, false);
    assert.equal(ranSecond, false);
  }
  {
    const { req, res } = createMockReqRes("/short-async");
    let ranSecond = false;
    const shouldContinue = await runNodeMiddlewares(
      [
        (_req, r, _next) => {
          setTimeout(() => r.end("done-async"), 10);
        },
        (_req, _r, next) => {
          ranSecond = true;
          next();
        },
      ],
      req,
      res
    );
    assert.equal(shouldContinue, false);
    assert.equal(ranSecond, false);
  }

  // 1C. Fewer-than-3-arg (req, res) middleware short-circuits cleanly without hanging
  {
    const { req, res } = createMockReqRes("/two-arg");
    const shouldContinue = await withTimeout(
      runNodeMiddlewares([(_req, _res) => {}], req, res),
      500,
      "2-arg middleware"
    );
    assert.equal(shouldContinue, false);
  }

  // 1D. next(err) propagation (sync, callback-async, Promise throw, string err)
  {
    const { req, res } = createMockReqRes("/err-sync");
    await assert.rejects(
      () => runNodeMiddlewares([(_req, _res, next) => next(new Error("sync-boom"))], req, res),
      /sync-boom/
    );
  }
  {
    const { req, res } = createMockReqRes("/err-cb");
    await assert.rejects(
      () =>
        runNodeMiddlewares(
          [(_req, _res, next) => setTimeout(() => next("cb-string-boom"), 10)],
          req,
          res
        ),
      /cb-string-boom/
    );
  }
  {
    const { req, res } = createMockReqRes("/err-promise");
    await assert.rejects(
      () =>
        runNodeMiddlewares(
          [
            async (_req, _res, _next) => {
              await new Promise((r) => setTimeout(r, 5));
              throw new Error("promise-boom");
            },
          ],
          req,
          res
        ),
      /promise-boom/
    );
  }

  // 1E. Early client abort (req.emit("aborted")) resolves without hanging AND cleans up ALL listeners
  {
    const { req, res } = createMockReqRes("/aborted-client");
    const runPromise = runNodeMiddlewares(
      [
        (_req, _res, _next) => {
          // Simulates a callback-async middleware that forgets to call next()
          // when the client aborts mid-request.
        },
      ],
      req,
      res
    );
    setTimeout(() => {
      req.aborted = true;
      req.emit("aborted");
    }, 15);
    const shouldContinue = await withTimeout(
      runPromise,
      500,
      "aborted client request cleanup"
    );
    assert.equal(shouldContinue, false);
    assert.equal(res.listenerCount("finish"), 0, "Leaked res 'finish' listener");
    assert.equal(res.listenerCount("close"), 0, "Leaked res 'close' listener");
    assert.equal(res.listenerCount("error"), 0, "Leaked res 'error' listener");
    assert.equal(req.listenerCount("aborted"), 0, "Leaked req 'aborted' listener");
  }

  // 1F. Already-destroyed res before async wait returns false immediately (no hang!)
  {
    const { req, res } = createMockReqRes("/pre-destroyed");
    const shouldContinue = await withTimeout(
      runNodeMiddlewares(
        [
          (_req, r, _next) => {
            r.destroy();
          },
        ],
        req,
        res
      ),
      500,
      "already-destroyed res"
    );
    assert.equal(shouldContinue, false);
    assert.equal(res.listenerCount("close"), 0);
  }

  // 1G. Faulty plugin.configureServer isolation (sync throw & async reject)
  {
    const middlewares = [];
    const fakeServer = new EventEmitter();
    await applyConfigureServerPlugins({
      plugins: [
        {
          name: "faulty-sync",
          configureServer() {
            throw new Error("sync plugin crash");
          },
        },
        {
          name: "faulty-async",
          async configureServer() {
            throw new Error("async plugin crash");
          },
        },
        {
          name: "healthy-plugin",
          configureServer({ use, isDev }) {
            assert.equal(isDev, false);
            use((_req, _res, next) => next());
          },
        },
      ],
      server: fakeServer,
      isDev: false,
      middlewares,
    });
    assert.equal(middlewares.length, 1, "Healthy plugin after faulty plugins must still register");
  }

  // 1H. sendWebResponseToNode merges upstream middleware Set-Cookie with Dinou Response Set-Cookie
  {
    const { res } = createMockReqRes("/cookie-merge");
    res.setHeader("Set-Cookie", "mw_session=abc; Path=/");
    const webHeaders = new Headers({ "content-type": "text/plain" });
    webHeaders.append("Set-Cookie", "dinou_session=xyz; Path=/");
    webHeaders.append("Set-Cookie", "dinou_theme=dark; Path=/");
    const webRes = new Response("ok", { status: 200, headers: webHeaders });
    await sendWebResponseToNode(webRes, res);
    const finalCookies = res.getHeader("set-cookie");
    const arr = Array.isArray(finalCookies) ? finalCookies : [String(finalCookies || "")];
    assert.ok(
      arr.some((c) => c.includes("mw_session=abc")),
      "Upstream middleware Set-Cookie was overwritten! Got: " + JSON.stringify(arr)
    );
    assert.ok(
      arr.some((c) => c.includes("dinou_session=xyz")),
      "Dinou Set-Cookie missing! Got: " + JSON.stringify(arr)
    );
    assert.ok(
      arr.some((c) => c.includes("dinou_theme=dark")),
      "Second Dinou Set-Cookie missing! Got: " + JSON.stringify(arr)
    );
  }
});

function writeDinouShim(tmpApp) {
  const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const relFromRoot = (relPath) => {
    const rel = path
      .relative(dinouShimDir, path.join(DINOU_ROOT, relPath))
      .replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  };
  fs.writeFileSync(
    path.join(dinouShimDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "10.0.7",
        type: "module",
        exports: {
          ".": {
            "react-server": "./server.js",
            default: "./index.js",
          },
          "./server": "./server.js",
          "./config": "./config.js",
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "index.js"),
    `export * from ${JSON.stringify(relFromRoot("index.js"))};\nexport { default } from ${JSON.stringify(relFromRoot("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(relFromRoot("server.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(relFromRoot("core/config.js"))};\nexport { default } from ${JSON.stringify(relFromRoot("core/config.js"))};\n`
  );
}

function httpRequest(port, reqPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: reqPath,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

test("2. [#Z5 Part B] Live Production Node AOT Server: configureServer + onRequest coexistence, Socket.IO hijack, SSE concurrency with SSR/RSC/PPR, next(err) sanitization & post-headers error termination", async () => {
  const tmpApp = createFixtureDir("tmp-z5-node-mw-");
  let server = null;
  const origCwd = process.cwd();

  try {
    fs.mkdirSync(path.join(tmpApp, "src/dynamic"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/ppr-mw"), { recursive: true });
    writeDinouShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "z5-node-mw-app", type: "module" }, null, 2)
    );

    fs.writeFileSync(
      path.join(tmpApp, "dinou.config.mjs"),
      `export default {
  plugins: [
    {
      name: "faulty-startup-plugin",
      configureServer() {
        throw new Error("INTENTIONAL_FAULTY_PLUGIN_BOOM");
      },
    },
    {
      name: "express-connect-suite-plugin",
      configureServer({ server, use }) {
        // External server.on("request") hijack (Socket.IO polling style)
        server.on("request", (req, res) => {
          if (req.url && req.url.startsWith("/socket.io/")) {
            if (!res.headersSent) {
              res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
              res.end('0{"sid":"z5-socketio-ok"}');
            }
          }
        });

        // 1. Socket.IO pass-off middleware (returns without next() so server.on("request") ends res)
        use((req, res, next) => {
          if (req.url && req.url.startsWith("/socket.io/")) {
            return;
          }
          next();
        });

        // 2. Short-circuit middleware
        use((req, res, next) => {
          if (req.url === "/api/mw-short") {
            res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
            res.end("SHORT_CIRCUIT_OK");
            return;
          }
          next();
        });

        // 3. <3-arg (req, res) async handler for dedicated path via wrapper check
        use((req, res, next) => {
          if (req.url === "/api/mw-sse") {
            res.writeHead(200, {
              "content-type": "text/event-stream",
              "cache-control": "no-cache",
              connection: "keep-alive",
            });
            res.write("data: sse-tick-1\\n\\n");
            const timer = setInterval(() => {
              if (res.writableEnded || res.destroyed) {
                clearInterval(timer);
                return;
              }
              res.write("data: sse-tick-2\\n\\n");
            }, 40);
            res.on("close", () => clearInterval(timer));
            return;
          }
          next();
        });

        // 4. next(err) error propagation (must return sanitized 500 in prod)
        use((req, _res, next) => {
          if (req.url === "/api/mw-err") {
            setTimeout(() => next(new Error("SECRET_MW_INTERNAL_ERROR")), 10);
            return;
          }
          next();
        });

        // 5. Post-headersSent error propagation (must end stream cleanly, never hang)
        use((req, res, next) => {
          if (req.url === "/api/mw-headers-then-err") {
            res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
            res.write("PARTIAL_OK:");
            setTimeout(() => next(new Error("MID_STREAM_MW_ERR")), 10);
            return;
          }
          next();
        });

        // 6. Sync + callback-async + Promise chain enriching req & res before Dinou
        use((req, res, next) => {
          req.headers["x-mw-trace"] = "sync";
          res.setHeader("x-from-mw", "mw-active");
          res.setHeader("Set-Cookie", "mw_cookie=from_mw; Path=/");
          next();
        });
        use((req, _res, next) => {
          setTimeout(() => {
            req.headers["x-mw-trace"] += ">cb";
            next();
          }, 10);
        });
        use(async (req, _res, next) => {
          await new Promise((r) => setTimeout(r, 5));
          req.headers["x-mw-trace"] += ">async";
          next();
        });
      },
      onRequest(req, ctx) {
        const trace = req.headers.get("x-mw-trace") || "missing";
        ctx.res.setHeader("x-from-onrequest", "onreq:" + trace);
      },
    },
  ],
};
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/layout.tsx"),
      `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Z5 Node MW</title></head>
      <body>{children}</body>
    </html>
  );
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/page.tsx"),
      `export default function HomePage() {
  return <main data-route="home">HOME_MW_OK</main>;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/dynamic/page_functions.ts"),
      `export const revalidate = 0;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/dynamic/page.tsx"),
      `import { getContext } from "dinou/server";

export default function DynamicMwPage() {
  const ctx = getContext();
  ctx?.res?.cookie?.("dinou_cookie", "from_dinou", { path: "/" });
  const mwTrace = ctx?.req?.headers?.["x-mw-trace"] || "missing";
  return <main data-route="dynamic" data-trace={mwTrace}>{\`DYNAMIC_TRACE:\${mwTrace}\`}</main>;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/ppr-mw/page_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 60;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/ppr-mw/page.tsx"),
      `import { Suspense } from "react";
import { getContext } from "dinou/server";

async function DynamicHole() {
  const ctx = getContext();
  const q = ctx?.req?.query?.v || "default";
  return <span data-hole="ok">{\`PPR_MW_HOLE:\${q}\`}</span>;
}

export default function PprMwPage() {
  return (
    <main data-route="ppr-mw">
      <div>PPR_MW_SHELL</div>
      <Suspense fallback={<span>loading</span>}>
        <DynamicHole />
      </Suspense>
    </main>
  );
}
`
    );

    // Build production Node AOT server bundle
    const buildRes = spawnSync(process.execPath, [CLI_PATH, "build:node:esbuild"], {
      cwd: tmpApp,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        SWC_NATIVE_BINDING_CACHE: SWC_CACHE_DIR,
      },
    });
    assert.equal(
      buildRes.status,
      0,
      `build:node:esbuild failed:\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
    );

    // Boot compiled .dinou/node/server.mjs in-process on ephemeral port 0
    process.chdir(tmpApp);
    const serverPath = path.join(tmpApp, ".dinou/node/server.mjs");
    const serverMod = await import(`${pathToFileURL(serverPath).href}?t=${Date.now()}`);
    server = await serverMod.startServer(0, "127.0.0.1");
    const port = server.address().port;

    // A. Short-circuit middleware (zero ERR_HTTP_HEADERS_SENT)
    const shortRes = await httpRequest(port, "/api/mw-short");
    assert.equal(shortRes.status, 200);
    assert.equal(shortRes.body, "SHORT_CIRCUIT_OK");

    // B. Socket.IO external server.on("request") hijack
    const sioRes = await httpRequest(port, "/socket.io/?EIO=4&transport=polling");
    assert.equal(sioRes.status, 200);
    assert.equal(sioRes.body, '0{"sid":"z5-socketio-ok"}');

    // C. next(err) returns sanitized 500 in production (no secret leak, server stays alive)
    const errRes = await httpRequest(port, "/api/mw-err");
    assert.equal(errRes.status, 500);
    assert.equal(errRes.body.includes("SECRET_MW_INTERNAL_ERROR"), false);
    assert.equal(errRes.body, "Internal Server Error");

    // D. Post-headersSent next(err) terminates response cleanly without hanging
    const postHdrErrRes = await withTimeout(
      httpRequest(port, "/api/mw-headers-then-err"),
      2000,
      "post-headersSent middleware error termination"
    );
    assert.equal(postHdrErrRes.status, 200);
    assert.ok(postHdrErrRes.body.includes("PARTIAL_OK:"));

    // E. configureServer + onRequest coexistence + Set-Cookie merge on dynamic Dinou SSR
    const dynRes = await httpRequest(port, "/dynamic");
    assert.equal(dynRes.status, 200);
    assert.equal(dynRes.headers["x-from-mw"], "mw-active");
    assert.equal(dynRes.headers["x-from-onrequest"], "onreq:sync>cb>async");
    assert.ok(dynRes.body.includes("DYNAMIC_TRACE:sync&gt;cb&gt;async") || dynRes.body.includes("DYNAMIC_TRACE:sync>cb>async"));
    const setCookies = Array.isArray(dynRes.headers["set-cookie"])
      ? dynRes.headers["set-cookie"]
      : [String(dynRes.headers["set-cookie"] || "")];
    assert.ok(
      setCookies.some((c) => c.includes("mw_cookie=from_mw")),
      "Missing mw_cookie in live Node AOT Set-Cookie: " + JSON.stringify(setCookies)
    );
    assert.ok(
      setCookies.some((c) => c.includes("dinou_cookie=from_dinou")),
      "Missing dinou_cookie in live Node AOT Set-Cookie: " + JSON.stringify(setCookies)
    );

    // F. Streaming SSE connection stays open WHILE concurrent SSR, RSC, and 3D PPR requests complete!
    await new Promise((resolve, reject) => {
      const sseReq = http.request(
        { hostname: "127.0.0.1", port, path: "/api/mw-sse", method: "GET" },
        (sseRes) => {
          assert.equal(sseRes.statusCode, 200);
          assert.ok(String(sseRes.headers["content-type"] || "").includes("text/event-stream"));
          let sseBuf = "";
          let concurrentDone = false;
          sseRes.on("data", async (chunk) => {
            sseBuf += chunk.toString("utf8");
            if (!concurrentDone && sseBuf.includes("sse-tick-1")) {
              concurrentDone = true;
              try {
                const [cDyn, cRsc, cPpr] = await Promise.all([
                  httpRequest(port, "/dynamic"),
                  httpRequest(port, "/____rsc_page____/dynamic"),
                  httpRequest(port, "/ppr-mw?v=concurrent"),
                ]);
                assert.equal(cDyn.status, 200);
                assert.equal(cRsc.status, 200);
                assert.ok(cRsc.body.includes("DYNAMIC_TRACE:"));
                assert.equal(cPpr.status, 200);
                assert.ok(cPpr.body.includes("PPR_MW_SHELL"));
                assert.ok(cPpr.body.includes("PPR_MW_HOLE:") && cPpr.body.includes("concurrent"));
                // Wait briefly for second SSE tick while stream is still live, then close SSE
                await new Promise((r) => setTimeout(r, 90));
                assert.ok(sseBuf.includes("sse-tick-2"), "Expected sse-tick-2 while concurrent Dinou requests ran");
                sseReq.destroy();
                resolve();
              } catch (err) {
                sseReq.destroy();
                reject(err);
              }
            }
          });
          sseRes.on("error", () => {});
        }
      );
      sseReq.on("error", (err) => {
        if (err && err.code === "ECONNRESET") return;
        reject(err);
      });
      sseReq.end();
    });
  } finally {
    process.chdir(origCwd);
    if (server) {
      await new Promise((r) => server.close(r));
    }
    removeDirSafe(tmpApp);
  }
});
