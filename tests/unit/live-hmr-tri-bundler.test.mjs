// tests/unit/live-hmr-tri-bundler.test.mjs
// Series Z — Phase 1 — Stage 4 (Check #Z4 — Part A):
// Live File-Edit HMR across ALL 3 Bundlers (Esbuild, Rollup & Webpack):
//   1. Server Component live edit (`page.tsx`) -> `rsc-update` WS event + live SSR/RSC text update
//   2. Client Component live edit (`hmr-client.tsx`) -> Fast Refresh `update` WS event (Esbuild/Rollup) + live updated SSR/bundle
//   3. CSS Module live edit (`hmr.module.css`) -> color rule update + class export rename (`didCssModuleExportsChange`)
//      matching scoped class between SSR HTML and `/styles.css`
//   4. `"use server"` live edit (`hmr-actions.ts`) -> return value change + adding a brand-new exported action
//      invocable via `POST /____server_function____` WITHOUT restarting the dev server
//   5. `page_functions.ts` live edit -> `getProps` prop updates immediately on live SSR/RSC
//   6. Intentional syntax error -> dev server process survives without crashing -> restores automatically on disk fix

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";

const REPO_ROOT = process.cwd();
const DINOU_ROOT = fs.existsSync(path.resolve(REPO_ROOT, "dinou", "cli.js"))
  ? path.resolve(REPO_ROOT, "dinou")
  : fs.existsSync(
        path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou", "cli.js")
      )
    ? path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou")
    : path.resolve(REPO_ROOT, "node_modules", "dinou");

const CLI_PATH = path.join(DINOU_ROOT, "cli.js");

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
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

function writeDinouShim(tmpApp) {
  const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const relTo = (relPath) => {
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
          ".": "./index.js",
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
    `export * from ${JSON.stringify(relTo("index.js"))};\nexport { default } from ${JSON.stringify(relTo("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(relTo("server.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(relTo("core/config.js"))};\nexport { default } from ${JSON.stringify(relTo("core/config.js"))};\n`
  );
}

async function getFreePortPair() {
  const getPort = () =>
    new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, "127.0.0.1", () => {
        const { port } = srv.address();
        srv.close((err) => (err ? reject(err) : resolve(port)));
      });
      srv.on("error", reject);
    });
  const port = await getPort();
  let hmrPort = await getPort();
  while (hmrPort === port) {
    hmrPort = await getPort();
  }
  return { port, hmrPort };
}

function killProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
        stdio: "ignore",
        timeout: 5000,
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {}
  try {
    child.kill("SIGKILL");
  } catch {}
}

async function waitForCondition(fn, timeoutMs = 45000, intervalMs = 200, label = "condition") {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fn();
      if (res) return res;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timeout (${timeoutMs}ms) waiting for ${label}${lastErr ? ` (last error: ${lastErr.message})` : ""}`
  );
}

async function connectWs(url, protocol, timeoutMs = 25000) {
  return waitForCondition(
    () =>
      new Promise((resolve) => {
        try {
          const ws = protocol ? new WebSocket(url, protocol) : new WebSocket(url);
          const timer = setTimeout(() => {
            try {
              ws.close();
            } catch {}
            resolve(null);
          }, 2500);
          ws.onopen = () => {
            clearTimeout(timer);
            resolve(ws);
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve(null);
          };
        } catch {
          resolve(null);
        }
      }),
    timeoutMs,
    400,
    `WebSocket ${url}`
  );
}

function writeFileWithFreshMtime(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
  // Ensure deterministic mtime advance even on coarse filesystem timers
  const future = new Date(Date.now() + 100);
  try {
    fs.utimesSync(filePath, future, future);
  } catch {}
}

function createHmrFixtureApp(tmpApp) {
  fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });
  writeDinouShim(tmpApp);

  fs.writeFileSync(
    path.join(tmpApp, "package.json"),
    JSON.stringify({ name: "z4-live-hmr-app", type: "module" }, null, 2)
  );

  fs.writeFileSync(
    path.join(tmpApp, "dinou.config.mjs"),
    `export default {\n  plugins: [],\n};\n`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Z4 Live HMR</title></head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/hmr.module.css"),
    `.box {
  color: rgb(255, 0, 0);
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/hmr-actions.ts"),
    `"use server";

export async function hmrAction() {
  return "action-v1";
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/hmr-client.tsx"),
    `"use client";

import { useState } from "react";
import { hmrAction } from "./hmr-actions";

export default function HmrClientCounter() {
  const [count, setCount] = useState(0);
  const [actVal, setActVal] = useState("idle");
  return (
    <div data-testid="z4-client">
      <span data-testid="z4-client-label">CLIENT_LABEL_V1</span>
      <span data-testid="z4-client-count">{count}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>+1</button>
      <button type="button" onClick={async () => setActVal(await hmrAction())}>Run</button>
      <span data-testid="z4-action-val">{actVal}</span>
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/page_functions.ts"),
    `export const dynamic = true;
export async function getProps() {
  return { banner: "PF_BANNER_V1" };
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/page.tsx"),
    `import styles from "./hmr.module.css";
import HmrClientCounter from "./hmr-client";

export default function HmrPage({ banner }: { banner?: string }) {
  return (
    <main data-testid="z4-page">
      <h1 data-testid="z4-server-token">SERVER_TOKEN_V1</h1>
      <div data-testid="z4-pf-banner">{banner || "none"}</div>
      <div data-testid="z4-css-box" className={styles.box}>Styled Box</div>
      <HmrClientCounter />
    </main>
  );
}
`
  );
}

async function runLiveHmrSuiteForBundler(bundler) {
  const tmpApp = createFixtureDir(`tmp-z4-hmr-${bundler}-`);
  const swcCacheDir = path.join(REPO_ROOT, ".dinou", ".swc-cache");
  fs.mkdirSync(swcCacheDir, { recursive: true });
  let devProc = null;
  let ws = null;
  let logs = "";

  try {
    createHmrFixtureApp(tmpApp);
    const { port, hmrPort } = await getFreePortPair();
    const baseUrl = `http://localhost:${port}`;

    devProc = spawn(process.execPath, [CLI_PATH, `dev:${bundler}`], {
      cwd: tmpApp,
      env: {
        ...process.env,
        PORT: String(port),
        HMR_PORT: String(hmrPort),
        SWC_NATIVE_BINDING_CACHE: swcCacheDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    devProc.stdout.on("data", (d) => {
      logs += d.toString();
    });
    devProc.stderr.on("data", (d) => {
      logs += d.toString();
    });

    // Wait until dev server reports ready & initial SSR renders cleanly
    try {
      await waitForCondition(
        async () => {
          if (devProc.exitCode !== null) {
            throw new Error(`dev:${bundler} exited prematurely with code ${devProc.exitCode}:\n${logs}`);
          }
          const statusRes = await fetch(`${baseUrl}/__DINOU_STATUS_PLAYWRIGHT__`);
          if (!statusRes.ok) return false;
          const st = await statusRes.json();
          if (!st?.isReady) return false;
          const pageRes = await fetch(`${baseUrl}/`);
          if (!pageRes.ok) return false;
          const html = await pageRes.text();
          return (
            html.includes("SERVER_TOKEN_V1") &&
            html.includes("CLIENT_LABEL_V1") &&
            html.includes("PF_BANNER_V1")
          );
        },
        30000,
        300,
        `initial dev:${bundler} readiness`
      );
    } catch (e) {
      throw new Error(`${e.message}\n--- DEV LOGS ---\n${logs.slice(-2500)}`);
    }

    // Connect to HMR WebSocket (Esbuild/Rollup use esm-hmr; Webpack uses /ws)
    const wsUrl =
      bundler === "webpack"
        ? `ws://localhost:${hmrPort}/ws`
        : `ws://localhost:${hmrPort}`;
    const wsProto = bundler === "webpack" ? undefined : "esm-hmr";
    ws = await connectWs(wsUrl, wsProto, 25000);
    const receivedWsMsgs = [];
    ws.addEventListener("message", (ev) => {
      try {
        receivedWsMsgs.push(JSON.parse(ev.data));
      } catch {}
    });

    // Give chokidar a tiny settle moment after initial start
    await new Promise((r) => setTimeout(r, 400));

    const pagePath = path.join(tmpApp, "src/page.tsx");
    const clientPath = path.join(tmpApp, "src/hmr-client.tsx");
    const cssPath = path.join(tmpApp, "src/hmr.module.css");
    const actionsPath = path.join(tmpApp, "src/hmr-actions.ts");
    const pfPath = path.join(tmpApp, "src/page_functions.ts");

    // ------------------------------------------------------------------
    // 1. Live Server Component edit (`page.tsx`) -> rsc-update + live SSR/RSC
    // ------------------------------------------------------------------
    receivedWsMsgs.length = 0;
    writeFileWithFreshMtime(
      pagePath,
      fs.readFileSync(pagePath, "utf8").replace("SERVER_TOKEN_V1", "SERVER_TOKEN_V2")
    );
    await waitForCondition(
      async () => {
        const res = await fetch(`${baseUrl}/`);
        if (!res.ok) return false;
        const html = await res.text();
        const rscRes = await fetch(`${baseUrl}/____rsc_page____/`);
        const rsc = rscRes.ok ? await rscRes.text() : "";
        return html.includes("SERVER_TOKEN_V2") && rsc.includes("SERVER_TOKEN_V2");
      },
      25000,
      200,
      `${bundler} Server Component live edit`
    );
    if (bundler !== "webpack") {
      await waitForCondition(
        () => receivedWsMsgs.some((m) => m.type === "rsc-update"),
        8000,
        100,
        `${bundler} rsc-update WS message`
      );
      assert.equal(
        receivedWsMsgs.some((m) => m.type === "reload"),
        false,
        `${bundler}: Server Component edit must NOT broadcast full reload`
      );
    }

    // ------------------------------------------------------------------
    // 2. Live Client Component edit (`hmr-client.tsx`) -> Fast Refresh update + live SSR
    // ------------------------------------------------------------------
    receivedWsMsgs.length = 0;
    writeFileWithFreshMtime(
      clientPath,
      fs.readFileSync(clientPath, "utf8").replace("CLIENT_LABEL_V1", "CLIENT_LABEL_V2")
    );
    await waitForCondition(
      async () => {
        const res = await fetch(`${baseUrl}/`);
        if (!res.ok) return false;
        return (await res.text()).includes("CLIENT_LABEL_V2");
      },
      25000,
      200,
      `${bundler} Client Component live edit`
    );
    if (bundler !== "webpack") {
      await waitForCondition(
        () => receivedWsMsgs.some((m) => m.type === "update"),
        8000,
        100,
        `${bundler} client Fast Refresh update WS message`
      );
    }

    // ------------------------------------------------------------------
    // 3. Live CSS Module edit: (3A) color value change + (3B) class export rename
    // ------------------------------------------------------------------
    writeFileWithFreshMtime(
      cssPath,
      `.box {\n  color: rgb(0, 128, 0);\n}\n`
    );
    await waitForCondition(
      async () => {
        const res = await fetch(`${baseUrl}/styles.css`);
        if (!res.ok) return false;
        const css = await res.text();
        return css.includes("rgb(0, 128, 0)") || css.includes("rgb(0,128,0)");
      },
      25000,
      200,
      `${bundler} CSS Module color value live edit`
    );

    // 3B: Rename class `.box` -> `.boxRenamed` and update `page.tsx`
    const extractCssBoxClass = (html) => {
      const m1 = html.match(/<div[^>]*data-testid="z4-css-box"[^>]*class="([^"]+)"/);
      if (m1 && m1[1]) return m1[1].trim();
      const m2 = html.match(/<div[^>]*class="([^"]+)"[^>]*data-testid="z4-css-box"/);
      return m2 && m2[1] ? m2[1].trim() : "";
    };
    const oldScopedClass = extractCssBoxClass(await (await fetch(`${baseUrl}/`)).text());
    assert.ok(oldScopedClass.length > 0, `${bundler}: expected initial scoped class on z4-css-box`);

    writeFileWithFreshMtime(
      cssPath,
      `.boxRenamed {\n  color: rgb(12, 34, 56);\n}\n`
    );
    writeFileWithFreshMtime(
      pagePath,
      fs.readFileSync(pagePath, "utf8").replace("styles.box", "styles.boxRenamed")
    );
    await waitForCondition(
      async () => {
        const [htmlRes, cssRes] = await Promise.all([
          fetch(`${baseUrl}/`),
          fetch(`${baseUrl}/styles.css`),
        ]);
        if (!htmlRes.ok || !cssRes.ok) return false;
        const html = await htmlRes.text();
        const css = await cssRes.text();
        const scopedClass = extractCssBoxClass(html);
        if (!scopedClass || scopedClass === oldScopedClass) return false;
        return (
          css.includes(`.${scopedClass}`) &&
          (css.includes("rgb(12, 34, 56)") || css.includes("rgb(12,34,56)"))
        );
      },
      25000,
      250,
      `${bundler} CSS Module class rename sync between SSR HTML and /styles.css`
    );

    // ------------------------------------------------------------------
    // 4. Live `"use server"` edit: (4A) body change + (4B) newly added exported action
    // ------------------------------------------------------------------
    const callSf = async (exportName) => {
      const res = await fetch(`${baseUrl}/____server_function____`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-server-function-call": "1",
        },
        body: JSON.stringify({
          id: `file:///src/hmr-actions.ts#${exportName}`,
          args: [],
        }),
      });
      return { status: res.status, text: await res.text() };
    };

    const initialSf = await callSf("hmrAction");
    assert.equal(initialSf.status, 200);
    assert.ok(initialSf.text.includes("action-v1"));

    // 4A + 4B: Update hmrAction -> "action-v2" AND add brand-new export `hmrActionAdded`!
    writeFileWithFreshMtime(
      actionsPath,
      `"use server";

export async function hmrAction() {
  return "action-v2";
}

export async function hmrActionAdded() {
  return "added-v2";
}
`
    );
    writeFileWithFreshMtime(
      clientPath,
      `"use client";

import { useState } from "react";
import { hmrAction, hmrActionAdded } from "./hmr-actions";

export default function HmrClientCounter() {
  const [count, setCount] = useState(0);
  const [actVal, setActVal] = useState("idle");
  return (
    <div data-testid="z4-client">
      <span data-testid="z4-client-label">CLIENT_LABEL_V2</span>
      <span data-testid="z4-client-count">{count}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>+1</button>
      <button type="button" onClick={async () => setActVal(await hmrAction())}>Run</button>
      <button type="button" onClick={async () => setActVal(await hmrActionAdded())}>RunAdded</button>
      <span data-testid="z4-action-val">{actVal}</span>
    </div>
  );
}
`
    );

    await waitForCondition(
      async () => {
        const r1 = await callSf("hmrAction");
        const r2 = await callSf("hmrActionAdded");
        return (
          r1.status === 200 &&
          r1.text.includes("action-v2") &&
          r2.status === 200 &&
          r2.text.includes("added-v2")
        );
      },
      30000,
      300,
      `${bundler} live 'use server' edit + new export manifest hot reload`
    );

    // ------------------------------------------------------------------
    // 5. Live `page_functions.ts` edit (`getProps`)
    // ------------------------------------------------------------------
    writeFileWithFreshMtime(
      pfPath,
      `export const dynamic = true;\nexport async function getProps() {\n  return { banner: "PF_BANNER_V2" };\n}\n`
    );
    await waitForCondition(
      async () => {
        const res = await fetch(`${baseUrl}/`);
        if (!res.ok) return false;
        return (await res.text()).includes("PF_BANNER_V2");
      },
      25000,
      250,
      `${bundler} live page_functions.ts getProps edit`
    );

    // ------------------------------------------------------------------
    // 6. Syntax error survival + automatic recovery WITHOUT restart
    // ------------------------------------------------------------------
    const validPageBeforeError = fs.readFileSync(pagePath, "utf8");
    writeFileWithFreshMtime(
      pagePath,
      `import styles from "./hmr.module.css";\nexport default function BrokenPage( { return <div><<<SYNTAX_ERROR; }\n`
    );
    // Give dev server time to attempt rebuild on broken syntax
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(
      devProc.exitCode,
      null,
      `${bundler}: dev server MUST stay alive after syntax error in page.tsx`
    );

    // Restore valid code with a fresh token -> dev server MUST recover cleanly to 200 OK!
    writeFileWithFreshMtime(
      pagePath,
      validPageBeforeError.replace("SERVER_TOKEN_V2", "RECOVERED_TOKEN_V3")
    );
    await waitForCondition(
      async () => {
        if (devProc.exitCode !== null) {
          throw new Error(`dev:${bundler} crashed during recovery`);
        }
        const res = await fetch(`${baseUrl}/`);
        if (!res.ok) return false;
        return (await res.text()).includes("RECOVERED_TOKEN_V3");
      },
      30000,
      300,
      `${bundler} automatic recovery after syntax error`
    );
  } finally {
    try {
      ws?.close();
    } catch {}
    killProcessTree(devProc);
    await new Promise((r) => setTimeout(r, 400));
    removeDirSafe(tmpApp);
  }
}

for (const bundler of ["esbuild", "rollup", "webpack"]) {
  test(`1-${bundler}. [#Z4 Part A] Live File-Edit HMR (${bundler}): Server Component, Client Component, CSS Module value & class rename, 'use server' edit + new export, page_functions.ts & syntax-error recovery`, async () => {
    await runLiveHmrSuiteForBundler(bundler);
  });
}
