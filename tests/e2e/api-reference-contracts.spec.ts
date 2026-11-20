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
  const fixtureRoot = createFixtureDir("tmp-api-ref-contracts-e2e-");

  fs.writeFileSync(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify(
      {
        name: "api-reference-contracts-e2e",
        type: "module",
        private: true,
      },
      null,
      2
    )
  );
  writeDinouShim(fixtureRoot);

  fs.mkdirSync(
    path.join(fixtureRoot, "src", "t-contract-veto", "[tenant]", "items", "[id]"),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(fixtureRoot, "src", "t-contract-veto", "catch", "[...slug]"),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(fixtureRoot, "src", "t-contract-veto", "opt", "[[locale]]", "about"),
    { recursive: true }
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Dinou Contracts E2E</title>
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
    path.join(fixtureRoot, "src", "t-contract-veto", "actions.ts"),
    `"use server";

export async function setContractVetoState(state: {
  tenantActive?: boolean;
  itemActive?: boolean;
  resetLog?: boolean;
}) {
  if (typeof state.tenantActive === "boolean") {
    (globalThis as any).__E2E_CONTRACT_TENANT_ACTIVE__ = state.tenantActive;
  }
  if (typeof state.itemActive === "boolean") {
    (globalThis as any).__E2E_CONTRACT_ITEM_ACTIVE__ = state.itemActive;
  }
  if (state.resetLog) {
    (globalThis as any).__E2E_CONTRACT_LOG__ = [];
  }
  return { ok: true };
}

export async function getContractLog() {
  return Array.isArray((globalThis as any).__E2E_CONTRACT_LOG__)
    ? [...(globalThis as any).__E2E_CONTRACT_LOG__]
    : [];
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-contract-veto", "controls.tsx"),
    `"use client";

import { useState } from "react";
import { getContractLog, setContractVetoState } from "./actions";

export function VetoControls() {
  const [status, setStatus] = useState("ready");
  const [logText, setLogText] = useState("[]");

  return (
    <div>
      <span data-testid="veto-status">{status}</span>
      <span data-testid="veto-log">{logText}</span>
      <button
        type="button"
        data-testid="deactivate-item"
        onClick={async () => {
          await setContractVetoState({ tenantActive: true, itemActive: false, resetLog: true });
          setStatus("item-off");
        }}
      >
        Deactivate Item
      </button>
      <button
        type="button"
        data-testid="deactivate-tenant"
        onClick={async () => {
          await setContractVetoState({ tenantActive: false, itemActive: true, resetLog: true });
          setStatus("tenant-off");
        }}
      >
        Deactivate Tenant
      </button>
      <button
        type="button"
        data-testid="reset-veto"
        onClick={async () => {
          await setContractVetoState({ tenantActive: true, itemActive: true, resetLog: true });
          setStatus("reset");
        }}
      >
        Reset
      </button>
      <button
        type="button"
        data-testid="read-log"
        onClick={async () => {
          const entries = await getContractLog();
          setLogText(JSON.stringify(entries));
        }}
      >
        Read Log
      </button>
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-contract-veto", "page.tsx"),
    `import { Link } from "dinou";
import { VetoControls } from "./controls";

export default function ContractVetoHome() {
  return (
    <main>
      <h1>Contract Veto Hub</h1>
      <Link href="/t-contract-veto/acme/items/1" data-testid="go-acme-item">
        Open Acme Item 1
      </Link>
      <VetoControls />
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-contract-veto", "[tenant]", "layout_functions.ts"),
    `export const getStaticPaths = [{ tenant: "acme" }];
export const allowISG = false;

export function validateParams(params: { tenant: string }) {
  const log = ((globalThis as any).__E2E_CONTRACT_LOG__ =
    (globalThis as any).__E2E_CONTRACT_LOG__ || []);
  log.push("layout:" + params.tenant);
  if ((globalThis as any).__E2E_CONTRACT_TENANT_ACTIVE__ === false) {
    return false;
  }
  return params.tenant === "acme";
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-contract-veto", "[tenant]", "layout.tsx"),
    `import type { ReactNode } from "react";

export default function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenant: string };
}) {
  return (
    <section data-testid="tenant-shell" data-tenant={params.tenant}>
      {children}
    </section>
  );
}
`
  );

  fs.writeFileSync(
    path.join(
      fixtureRoot,
      "src",
      "t-contract-veto",
      "[tenant]",
      "items",
      "[id]",
      "page_functions.ts"
    ),
    `export const getStaticPaths = [{ tenant: "acme", id: 1 }];
export const allowISG = false;

export function validateParams(params: { tenant: string; id: string }) {
  const log = ((globalThis as any).__E2E_CONTRACT_LOG__ =
    (globalThis as any).__E2E_CONTRACT_LOG__ || []);
  log.push("page:" + params.id);
  if ((globalThis as any).__E2E_CONTRACT_ITEM_ACTIVE__ === false) {
    return false;
  }
  return /^[0-9]+$/.test(params.id);
}
`
  );

  fs.writeFileSync(
    path.join(
      fixtureRoot,
      "src",
      "t-contract-veto",
      "[tenant]",
      "items",
      "[id]",
      "page.tsx"
    ),
    `export default function TenantItemPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  return (
    <main data-testid="tenant-item">
      Tenant:{params.tenant}:Item:{params.id}
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(
      fixtureRoot,
      "src",
      "t-contract-veto",
      "catch",
      "[...slug]",
      "page_functions.ts"
    ),
    `export const getStaticPaths = [{ slug: ["docs", "intro"] }];
export const allowISG = false;
`
  );

  fs.writeFileSync(
    path.join(
      fixtureRoot,
      "src",
      "t-contract-veto",
      "catch",
      "[...slug]",
      "page.tsx"
    ),
    `export default function CatchPage({ params }: { params: { slug: string[] } }) {
  return <main data-testid="catch-item">Catch:{params.slug.join("/")}</main>;
}
`
  );

  fs.writeFileSync(
    path.join(
      fixtureRoot,
      "src",
      "t-contract-veto",
      "opt",
      "[[locale]]",
      "layout_functions.ts"
    ),
    `export const getStaticPaths = [undefined, "en", "es"];\n`
  );

  fs.writeFileSync(
    path.join(
      fixtureRoot,
      "src",
      "t-contract-veto",
      "opt",
      "[[locale]]",
      "layout.tsx"
    ),
    `import type { ReactNode } from "react";
export default function OptLayout({ children, params }: { children: ReactNode; params: { locale?: string } }) {
  return <div data-testid="opt-layout" data-locale={params.locale || "default"}>{children}</div>;
}
`
  );

  fs.writeFileSync(
    path.join(
      fixtureRoot,
      "src",
      "t-contract-veto",
      "opt",
      "[[locale]]",
      "page.tsx"
    ),
    `export default function OptIndex({ params }: { params: { locale?: string } }) {
  return <main data-testid="opt-index">OptIndex:{params.locale || "default"}</main>;
}
`
  );

  fs.writeFileSync(
    path.join(
      fixtureRoot,
      "src",
      "t-contract-veto",
      "opt",
      "[[locale]]",
      "about",
      "page.tsx"
    ),
    `export default function OptAbout({ params }: { params: { locale?: string } }) {
  return <main data-testid="opt-about">OptAbout:{params.locale || "default"}</main>;
}
`
  );

  return fixtureRoot;
}

async function runContractVetoSuite(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
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

  // 1. Numeric `{ tenant: "acme", id: 1 }` with allowISG=false must succeed
  const initialRes = await page.goto(`${baseUrl}/t-contract-veto/acme/items/1`);
  expect(initialRes?.status()).toBe(200);
  await page.waitForSelector('body[data-hydrated="true"]', {
    state: "attached",
    timeout: 15_000,
  });
  await expect(page.getByTestId("tenant-item")).toHaveText("Tenant:acme:Item:1");

  // 2. Unlisted numeric id & catch-all allowISG=false enforcement
  const unlistedRes = await request.get(`${baseUrl}/t-contract-veto/acme/items/999`);
  expect(unlistedRes.status()).toBe(404);
  const unlistedRsc = await request.get(
    `${baseUrl}/____rsc_page____/t-contract-veto/acme/items/999`
  );
  expect(unlistedRsc.status()).toBe(404);

  const catchOk = await request.get(`${baseUrl}/t-contract-veto/catch/docs/intro`);
  expect(catchOk.status()).toBe(200);
  const catchBlocked = await request.get(`${baseUrl}/t-contract-veto/catch/docs/unknown`);
  expect(catchBlocked.status()).toBe(404);
  const catchBlockedRsc = await request.get(
    `${baseUrl}/____rsc_page____/t-contract-veto/catch/docs/unknown`
  );
  expect(catchBlockedRsc.status()).toBe(404);

  // 3. Optional [[locale]] layout_functions.ts SSG routes (leaf optional + child static routes)
  for (const [subpath, testId, expectedText] of [
    ["/t-contract-veto/opt", "opt-index", "OptIndex:default"],
    ["/t-contract-veto/opt/en", "opt-index", "OptIndex:en"],
    ["/t-contract-veto/opt/es", "opt-index", "OptIndex:es"],
    ["/t-contract-veto/opt/en/about", "opt-about", "OptAbout:en"],
    ["/t-contract-veto/opt/es/about", "opt-about", "OptAbout:es"],
  ]) {
    const optRes = await page.goto(`${baseUrl}${subpath}`);
    expect(optRes?.status()).toBe(200);
    await expect(page.getByTestId(testId)).toHaveText(expectedText);
  }

  // 4. Item-level veto while route is already cached -> HTML + page RSC 404, layout RSC 200
  await page.goto(`${baseUrl}/t-contract-veto`);
  await page.waitForSelector('body[data-hydrated="true"]', {
    state: "attached",
    timeout: 15_000,
  });
  await page.getByTestId("deactivate-item").click();
  await expect(page.getByTestId("veto-status")).toHaveText("item-off");

  expect(
    (await request.get(`${baseUrl}/t-contract-veto/acme/items/1`)).status()
  ).toBe(404);
  expect(
    (
      await request.get(
        `${baseUrl}/____rsc_page____/t-contract-veto/acme/items/1`
      )
    ).status()
  ).toBe(404);
  expect(
    (
      await request.get(
        `${baseUrl}/____rsc_page_static____/t-contract-veto/acme/items/1`
      )
    ).status()
  ).toBe(404);
  expect(
    (
      await request.get(`${baseUrl}/____rsc_layout____/t-contract-veto/acme`)
    ).status()
  ).toBe(200);

  // 5. Tenant layout veto -> HTML + layout RSC + page RSC ALL 404 & short-circuit before child page validateParams
  await page.getByTestId("deactivate-tenant").click();
  await expect(page.getByTestId("veto-status")).toHaveText("tenant-off");

  expect(
    (await request.get(`${baseUrl}/t-contract-veto/acme/items/1`)).status()
  ).toBe(404);
  expect(
    (
      await request.get(`${baseUrl}/____rsc_layout____/t-contract-veto/acme`)
    ).status()
  ).toBe(404);
  expect(
    (
      await request.get(
        `${baseUrl}/____rsc_page____/t-contract-veto/acme/items/1`
      )
    ).status()
  ).toBe(404);

  await page.getByTestId("read-log").click();
  await expect(page.getByTestId("veto-log")).toHaveText(
    JSON.stringify(["layout:acme", "layout:acme", "layout:acme"])
  );

  // 6. Reset restores 200
  await page.getByTestId("reset-veto").click();
  await expect(page.getByTestId("veto-status")).toHaveText("reset");
  expect(
    (await request.get(`${baseUrl}/t-contract-veto/acme/items/1`)).status()
  ).toBe(200);

  expect(pageErrors).toEqual([]);
  expect(hydrationErrors).toEqual([]);
}

test.describe("API Reference Batch 4 — Route Contracts Perimeter Veto & allowISG Parity", () => {
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

  test("1. Esbuild production E2E: numeric/catch-all allowISG=false, optional layout getStaticPaths, cached HTML+RSC validateParams veto & root-to-child short-circuit", async ({
    page,
    request,
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
    await runContractVetoSuite(page, request, baseUrl);
  });

  test("2. Webpack production E2E parity: route contracts perimeter veto & allowISG normalization", async ({
    page,
    request,
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
    await runContractVetoSuite(page, request, baseUrl);
  });
});
