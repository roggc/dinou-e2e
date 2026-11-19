import { test, expect } from "@playwright/test";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const REPO_ROOT = process.cwd();
const DINOU_ROOT = fs.existsSync(path.resolve(REPO_ROOT, "dinou", "cli.js"))
  ? path.resolve(REPO_ROOT, "dinou")
  : path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou");

const HYDRATION_ERROR_REGEX =
  /hydration failed|server-rendered HTML|expected server HTML|did not match|didn't match|Minified React error #(418|419|422|423|425)/i;

function removeDirSafe(dirPath: string): void {
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  } catch {}
}

function createFixtureDir(prefix: string): string {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not allocate free port")));
      }
    });
    srv.on("error", reject);
  });
}

async function waitForHttpReady(url: string, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopChildServer(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 4000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      if (process.platform === "win32" && proc.pid) {
        spawnSync("taskkill", ["/pid", String(proc.pid), "/f", "/t"], {
          stdio: "ignore",
        });
      } else {
        proc.kill("SIGTERM");
      }
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

function writeDinouShim(fixtureRoot: string): void {
  const dinouShimDir = path.join(fixtureRoot, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouIndexPath = path.join(DINOU_ROOT, "index.js").replace(/\\/g, "/");
  const dinouServerPath = path.join(DINOU_ROOT, "server.js").replace(/\\/g, "/");
  const dinouConfigPath = path
    .join(DINOU_ROOT, "core", "config.js")
    .replace(/\\/g, "/");

  fs.writeFileSync(
    path.join(dinouShimDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "9.4.0",
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
    `export * from ${JSON.stringify(dinouIndexPath)};\nexport { default } from ${JSON.stringify(dinouIndexPath)};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(dinouServerPath)};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(dinouConfigPath)};\nexport { default } from ${JSON.stringify(dinouConfigPath)};\n`
  );
}

function setupE2EFixture(): string {
  const fixtureRoot = createFixtureDir("tmp-api-ref-ctx-types-e2e-");

  fs.writeFileSync(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify(
      {
        name: "api-reference-context-types-e2e",
        type: "module",
        private: true,
      },
      null,
      2
    )
  );
  writeDinouShim(fixtureRoot);

  fs.writeFileSync(
    path.join(fixtureRoot, "dinou.config.ts"),
    `import { defineConfig } from "dinou/config";

export default defineConfig({
  plugins: [
    {
      name: "tenant-context",
      onRequest(_req, ctx) {
        ctx.tenant = "acme-corp";
        ctx.req.customFlag = "plugin-req-ok";
      },
    },
  ],
});
`
  );

  fs.mkdirSync(path.join(fixtureRoot, "src", "t-ctx-router", "child"), {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Dinou Context Types E2E</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "page.tsx"),
    `export default function HomePage() {
  return <main id="home">Home</main>;
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-ctx-router", "actions.ts"),
    `"use server";

import { getContext } from "dinou/server";

export async function inspectServerFunctionContextAction() {
  const ctx = getContext();
  return {
    tenant: ctx.tenant ?? "missing",
    customFlag: ctx.req.customFlag ?? "missing",
    path: ctx.req.path,
    rawPath: ctx.req.rawPath ?? "missing",
    isRscRequest: Boolean(ctx.req.isRscRequest),
  };
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-ctx-router", "client-probe.tsx"),
    `"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "./dinou";
import { inspectServerFunctionContextAction } from "./actions";

export function ContextualRouterStabilityProbe() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const effectRunsRef = useRef(0);
  const [effectRuns, setEffectRuns] = useState(0);
  const [sfResult, setSfResult] = useState("idle");

  const prevRouterRef = useRef(router);
  const refChangesRef = useRef(0);
  if (prevRouterRef.current !== router) {
    refChangesRef.current += 1;
    prevRouterRef.current = router;
  }

  useEffect(() => {
    effectRunsRef.current += 1;
    setEffectRuns(effectRunsRef.current);
  }, [router]);

  return (
    <section data-testid="ctx-router-probe">
      <div data-testid="local-count">{count}</div>
      <div data-testid="router-effect-runs">{effectRuns}</div>
      <div data-testid="router-ref-changes">{refChangesRef.current}</div>
      <button
        type="button"
        data-testid="bump-local-state"
        onClick={() => setCount((c) => c + 1)}
      >
        Bump State
      </button>
      <button
        type="button"
        data-testid="push-relative-child"
        onClick={() => router.push("child")}
      >
        Go To Relative Child
      </button>
      <button
        type="button"
        data-testid="invoke-sf-context-probe"
        onClick={async () => {
          const res = await inspectServerFunctionContextAction();
          setSfResult(
            \`tenant=\${res.tenant}|flag=\${res.customFlag}|path=\${res.path}|raw=\${res.rawPath}|rsc=\${String(res.isRscRequest)}\`
          );
        }}
      >
        Probe SF Context
      </button>
      <div data-testid="sf-context-result">{sfResult}</div>
    </section>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-ctx-router", "page.tsx"),
    `import { ROUTE } from "./dinou";
import { ContextualRouterStabilityProbe } from "./client-probe";

export default function ContextualRouterHomePage() {
  return (
    <main data-testid="ctx-router-home" data-route={ROUTE}>
      <h1>Contextual Router Probe</h1>
      <ContextualRouterStabilityProbe />
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-ctx-router", "child", "page_functions.ts"),
    `export const revalidate = 0;\n`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-ctx-router", "child", "child-nav.tsx"),
    `"use client";

import { useRouter } from "./dinou";

export function ChildContextualNav() {
  const router = useRouter();
  return (
    <button
      type="button"
      data-testid="replace-relative-parent"
      onClick={() => router.replace("..")}
    >
      Replace Back To Parent
    </button>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-ctx-router", "child", "page.tsx"),
    `import { getContext } from "./dinou";
import { ChildContextualNav } from "./child-nav";

export default function ContextualRouterChildPage() {
  const ctx = getContext();
  return (
    <main data-testid="ctx-router-child">
      <h1>Contextual Child</h1>
      <div data-testid="ctx-path">{ctx.req.path}</div>
      <div data-testid="ctx-raw-path">{ctx.req.rawPath ?? "missing"}</div>
      <div data-testid="ctx-is-rsc">{String(ctx.req.isRscRequest)}</div>
      <div data-testid="ctx-tenant">{ctx.tenant ?? "missing"}</div>
      <div data-testid="ctx-req-flag">{ctx.req.customFlag ?? "missing"}</div>
      <ChildContextualNav />
    </main>
  );
}
`
  );

  return fixtureRoot;
}

async function runContextualRouterAndContextSuite(
  page: import("@playwright/test").Page,
  baseUrl: string
): Promise<void> {
  const pageErrors: string[] = [];
  const hydrationErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      if (HYDRATION_ERROR_REGEX.test(msg.text())) {
        hydrationErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    }
  });

  // 1. Contextual ./dinou useRouter() stays referentially stable across unrelated local state updates
  await page.goto(`${baseUrl}/t-ctx-router`);
  await page.waitForSelector('body[data-hydrated="true"]', {
    state: "attached",
    timeout: 15_000,
  });

  await expect(page.getByTestId("local-count")).toHaveText("0");
  await expect(page.getByTestId("router-ref-changes")).toHaveText("0");
  const initialEffectRuns = Number(
    await page.getByTestId("router-effect-runs").textContent()
  );
  expect(initialEffectRuns).toBeGreaterThanOrEqual(1);

  await page.getByTestId("bump-local-state").click();
  await page.getByTestId("bump-local-state").click();
  await page.getByTestId("bump-local-state").click();

  await expect(page.getByTestId("local-count")).toHaveText("3");
  await expect(page.getByTestId("router-effect-runs")).toHaveText(
    String(initialEffectRuns)
  );
  await expect(page.getByTestId("router-ref-changes")).toHaveText("0");

  // 2. Server Function RPC populates req.rawPath & req.isRscRequest=false while preserving plugin context
  await page.getByTestId("invoke-sf-context-probe").click();
  await expect(page.getByTestId("sf-context-result")).toHaveText(
    "tenant=acme-corp|flag=plugin-req-ok|path=/____server_function____|raw=/____server_function____|rsc=false"
  );

  // 3. Relative SPA push("child") resolves from="/t-ctx-router" and exposes RSC wire rawPath + isRscRequest=true
  await page.getByTestId("push-relative-child").click();
  await expect(page).toHaveURL(/\/t-ctx-router\/child\/?$/);

  await expect(page.getByTestId("ctx-path")).toHaveText(
    /^\/t-ctx-router\/child\/?$/
  );
  await expect(page.getByTestId("ctx-raw-path")).toHaveText(
    /^\/____rsc_page(?:_old)?(?:_static)?____\/t-ctx-router\/child\/?$/
  );
  await expect(page.getByTestId("ctx-is-rsc")).toHaveText("true");
  await expect(page.getByTestId("ctx-tenant")).toHaveText("acme-corp");
  await expect(page.getByTestId("ctx-req-flag")).toHaveText("plugin-req-ok");

  // 4. Relative SPA replace("..") resolves back to /t-ctx-router
  await page.getByTestId("replace-relative-parent").click();
  await expect(page).toHaveURL(/\/t-ctx-router\/?$/);
  await expect(page.getByTestId("ctx-router-home")).toBeVisible();

  // 5. Direct SSR navigation reports rawPath equal to logical pathname and isRscRequest=false
  await page.goto(`${baseUrl}/t-ctx-router/child`);
  await page.waitForSelector('body[data-hydrated="true"]', {
    state: "attached",
    timeout: 15_000,
  });
  await expect(page.getByTestId("ctx-path")).toHaveText(
    /^\/t-ctx-router\/child\/?$/
  );
  await expect(page.getByTestId("ctx-raw-path")).toHaveText(
    /^\/t-ctx-router\/child\/?$/
  );
  await expect(page.getByTestId("ctx-is-rsc")).toHaveText("false");
  await expect(page.getByTestId("ctx-tenant")).toHaveText("acme-corp");
  await expect(page.getByTestId("ctx-req-flag")).toHaveText("plugin-req-ok");

  expect(pageErrors).toEqual([]);
  expect(hydrationErrors).toEqual([]);
}

test.describe("API Reference Batch 2 — Contextual ./dinou useRouter() & getContext() Parity", () => {
  let fixtureRoot = "";
  let serverProc: ChildProcess | null = null;

  test.afterEach(async () => {
    await stopChildServer(serverProc);
    serverProc = null;
    if (fixtureRoot && fs.existsSync(fixtureRoot)) {
      removeDirSafe(fixtureRoot);
      fixtureRoot = "";
    }
  });

  test("1. Esbuild production E2E: contextual ./dinou useRouter() stability, relative push/replace, SF RPC & SSR/RSC getContext() parity", async ({
    page,
  }) => {
    fixtureRoot = setupE2EFixture();

    const buildRun = spawnSync(
      process.execPath,
      [path.join(DINOU_ROOT, "cli.js"), "build"],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(buildRun.status, `${buildRun.stdout}\n${buildRun.stderr}`).toBe(0);

    const port = await getFreePort();
    serverProc = spawn(
      process.execPath,
      [path.join(DINOU_ROOT, "cli.js"), "start"],
      {
        cwd: fixtureRoot,
        env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
        stdio: "ignore",
      }
    );

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHttpReady(baseUrl);
    await runContextualRouterAndContextSuite(page, baseUrl);
  });

  test("2. Webpack production E2E parity: contextual ./dinou useRouter() stability & getContext() isolation", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Webpack parity check runs once in chromium; cross-browser behavior is covered by Test 1"
    );

    fixtureRoot = setupE2EFixture();

    const buildRun = spawnSync(
      process.execPath,
      [path.join(DINOU_ROOT, "cli.js"), "build:node:webpack"],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(buildRun.status, `${buildRun.stdout}\n${buildRun.stderr}`).toBe(0);

    const port = await getFreePort();
    serverProc = spawn(
      process.execPath,
      [path.join(DINOU_ROOT, "cli.js"), "start:node:webpack"],
      {
        cwd: fixtureRoot,
        env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
        stdio: "ignore",
      }
    );

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHttpReady(baseUrl);
    await runContextualRouterAndContextSuite(page, baseUrl);
  });
});
