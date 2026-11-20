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
  const fixtureRoot = createFixtureDir("tmp-api-ref-cache-storage-e2e-");

  fs.writeFileSync(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify(
      {
        name: "api-reference-cache-storage-e2e",
        type: "module",
        private: true,
      },
      null,
      2
    )
  );
  writeDinouShim(fixtureRoot);

  fs.mkdirSync(path.join(fixtureRoot, "src", "t-slot-combo"), {
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
        <title>Dinou Cache Storage E2E</title>
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
    path.join(fixtureRoot, "src", "t-slot-combo", "actions.ts"),
    `"use server";

import { revalidateTag } from "dinou/server";

export async function bumpIdOnlySlotAndRevalidate(nextValue: string) {
  (globalThis as any).__E2E_ID_ONLY_SLOT_VAL__ = nextValue;
  // Clear in-memory slotRegistry to simulate a cold server restart / sibling pod
  (globalThis as any)[Symbol.for("dinou.slot.registry")]?.clear?.();
  await revalidateTag("e2e-id-only-slot");
  return { ok: true };
}

export async function bumpComboSlotAndRevalidateTagProp(nextValue: string) {
  (globalThis as any).__E2E_COMBO_SLOT_VAL__ = nextValue;
  // Revalidate via the singular \`tag="e2e-combo-primary"\` prop (coexisting with \`tags={["e2e-combo-secondary"]}\`)
  await revalidateTag("e2e-combo-primary");
  return { ok: true };
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-slot-combo", "controls.tsx"),
    `"use client";

import { useState } from "react";
import {
  bumpIdOnlySlotAndRevalidate,
  bumpComboSlotAndRevalidateTagProp,
} from "./actions";

export function SlotComboControls() {
  const [status, setStatus] = useState("idle");

  return (
    <div>
      <span data-testid="slot-action-status">{status}</span>
      <button
        type="button"
        data-testid="reval-id-only"
        onClick={async () => {
          setStatus("pending-id");
          await bumpIdOnlySlotAndRevalidate("id-v2");
          setStatus("done-id");
        }}
      >
        Revalidate ID-Only Slot (Cold)
      </button>
      <button
        type="button"
        data-testid="reval-combo-primary"
        onClick={async () => {
          setStatus("pending-combo");
          await bumpComboSlotAndRevalidateTagProp("combo-v2");
          setStatus("done-combo");
        }}
      >
        Revalidate Combo Slot via tag Prop
      </button>
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "t-slot-combo", "page.tsx"),
    `import { DinouCacheSlot } from "dinou/server";
import { SlotComboControls } from "./controls";

function IdOnlyDisplay() {
  const val = (globalThis as any).__E2E_ID_ONLY_SLOT_VAL__ || "id-v1";
  return <div data-testid="id-only-slot-value">{val}</div>;
}

function ComboTagDisplay() {
  const val = (globalThis as any).__E2E_COMBO_SLOT_VAL__ || "combo-v1";
  return <div data-testid="combo-slot-value">{val}</div>;
}

export default function SlotComboPage() {
  return (
    <main>
      <h1>Slot Tag &amp; Cold ID Revalidation</h1>
      <DinouCacheSlot id="e2e-id-only-slot" revalidate={false}>
        <IdOnlyDisplay />
      </DinouCacheSlot>
      <DinouCacheSlot
        id="e2e-combo-slot"
        tag="e2e-combo-primary"
        tags={["e2e-combo-secondary"]}
        revalidate={false}
      >
        <ComboTagDisplay />
      </DinouCacheSlot>
      <SlotComboControls />
    </main>
  );
}
`
  );

  return fixtureRoot;
}

async function runSlotComboSuite(
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

  await page.goto(`${baseUrl}/t-slot-combo`);
  await page.waitForSelector('body[data-hydrated="true"]', {
    state: "attached",
    timeout: 15_000,
  });

  await expect(page.getByTestId("id-only-slot-value")).toHaveText("id-v1");
  await expect(page.getByTestId("combo-slot-value")).toHaveText("combo-v1");

  // Step 1: Simulate cold pod & revalidate id-only slot by its `id`
  await page.getByTestId("reval-id-only").click();
  await expect(page.getByTestId("slot-action-status")).toHaveText("done-id");

  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]', {
    state: "attached",
    timeout: 15_000,
  });
  await expect(page.getByTestId("id-only-slot-value")).toHaveText("id-v2");
  await expect(page.getByTestId("combo-slot-value")).toHaveText("combo-v1");

  // Step 2: Revalidate combo slot using singular `tag="e2e-combo-primary"` alongside `tags`
  await page.getByTestId("reval-combo-primary").click();
  await expect(page.getByTestId("slot-action-status")).toHaveText("done-combo");

  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]', {
    state: "attached",
    timeout: 15_000,
  });
  await expect(page.getByTestId("id-only-slot-value")).toHaveText("id-v2");
  await expect(page.getByTestId("combo-slot-value")).toHaveText("combo-v2");

  expect(pageErrors).toEqual([]);
  expect(hydrationErrors).toEqual([]);
}

test.describe("API Reference Batch 3 — Cold Slot ID Revalidation & tag+tags Merge", () => {
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

  test("1. Esbuild production E2E: cold-pod revalidateTag(slotId) refreshes id-only slot without disturbing sibling slot, and tag+tags preserves singular tag", async ({
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
    await runSlotComboSuite(page, baseUrl);
  });

  test("2. Webpack production E2E parity: cold-pod revalidateTag(slotId) & combined tag+tags merge", async ({
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
    await runSlotComboSuite(page, baseUrl);
  });
});
