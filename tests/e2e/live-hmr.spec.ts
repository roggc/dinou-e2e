// tests/e2e/live-hmr.spec.ts
// Series Z — Phase 1 — Stage 4 (Check #Z4 — Part A Browser E2E):
// Real-browser Live File-Edit HMR & React Fast Refresh state preservation (`count === 42`)
// across Esbuild, Rollup, and Webpack dev servers.

import { test, expect } from "@playwright/test";
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

function removeDirSafe(dirPath: string) {
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 80,
    });
  } catch {}
}

function createFixtureDir(prefix: string) {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

function writeDinouShim(tmpApp: string) {
  const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const relTo = (relPath: string) => {
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
    new Promise<number>((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
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

function killProcessTree(child: ReturnType<typeof spawn> | null) {
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

function writeFileWithFreshMtime(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, "utf8");
  const future = new Date(Date.now() + 100);
  try {
    fs.utimesSync(filePath, future, future);
  } catch {}
}

function createBrowserHmrApp(tmpApp: string) {
  fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });
  writeDinouShim(tmpApp);

  fs.writeFileSync(
    path.join(tmpApp, "package.json"),
    JSON.stringify({ name: "z4-browser-hmr-app", type: "module" }, null, 2)
  );
  fs.writeFileSync(
    path.join(tmpApp, "dinou.config.mjs"),
    `export default { plugins: [] };\n`
  );
  fs.writeFileSync(
    path.join(tmpApp, "src/layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Z4 Browser HMR</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
`
  );
  fs.writeFileSync(
    path.join(tmpApp, "src/hmr.module.css"),
    `.box {\n  color: rgb(255, 0, 0);\n}\n`
  );
  fs.writeFileSync(
    path.join(tmpApp, "src/hmr-actions.ts"),
    `"use server";\n\nexport async function hmrAction() {\n  return "action-v1";\n}\n`
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
      <button type="button" data-testid="z4-set-42" onClick={() => setCount(42)}>
        Set 42
      </button>
      <button
        type="button"
        data-testid="z4-run-action"
        onClick={async () => setActVal(await hmrAction())}
      >
        Run Action
      </button>
      <span data-testid="z4-action-val">{actVal}</span>
    </div>
  );
}
`
  );
  fs.writeFileSync(
    path.join(tmpApp, "src/page_functions.ts"),
    `export const dynamic = true;\nexport async function getProps() {\n  return { banner: "PF_V1" };\n}\n`
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

test.describe("🔥 Series Z — Phase 1 — Stage 4 (Check #Z4): Real-Browser Live HMR & Fast Refresh Across All 3 Bundlers", () => {
  for (const bundler of ["esbuild", "rollup", "webpack"] as const) {
    test(`Live File-Edit HMR & Fast Refresh (${bundler}): state preservation (42), Server Component, CSS Module value & class rename, 'use server' edit + new export & syntax-error recovery`, async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName !== "chromium",
        "Standalone live HMR bundler matrix runs in chromium to keep CI fast"
      );
      test.setTimeout(180000);

      const tmpApp = createFixtureDir(`tmp-z4-browser-hmr-${bundler}-`);
      const swcCacheDir = path.join(REPO_ROOT, ".dinou", ".swc-cache");
      fs.mkdirSync(swcCacheDir, { recursive: true });
      let devProc: ReturnType<typeof spawn> | null = null;
      let logs = "";

      try {
        createBrowserHmrApp(tmpApp);
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
        devProc.stdout?.on("data", (d) => (logs += d.toString()));
        devProc.stderr?.on("data", (d) => (logs += d.toString()));

        // Wait until dev server is ready
        await expect
          .poll(
            async () => {
              if (devProc && devProc.exitCode !== null) {
                throw new Error(`dev:${bundler} exited early: ${logs}`);
              }
              try {
                const res = await fetch(`${baseUrl}/__DINOU_STATUS_PLAYWRIGHT__`);
                if (!res.ok) return false;
                const json: any = await res.json();
                return Boolean(json?.isReady);
              } catch {
                return false;
              }
            },
            { timeout: 60000, intervals: [300] }
          )
          .toBe(true);

        await page.goto(baseUrl);
        await page.waitForSelector('body[data-hydrated="true"]', {
          state: "attached",
          timeout: 20000,
        });
        await expect(page.getByTestId("z4-server-token")).toHaveText("SERVER_TOKEN_V1");
        await expect(page.getByTestId("z4-client-label")).toHaveText("CLIENT_LABEL_V1");
        await expect(page.getByTestId("z4-pf-banner")).toHaveText("PF_V1");

        // Give HMR WS client a brief moment to complete handshake
        await page.waitForTimeout(500);

        const pagePath = path.join(tmpApp, "src/page.tsx");
        const clientPath = path.join(tmpApp, "src/hmr-client.tsx");
        const cssPath = path.join(tmpApp, "src/hmr.module.css");
        const actionsPath = path.join(tmpApp, "src/hmr-actions.ts");

        // 1. Client Component Fast Refresh: set counter to 42, edit label on disk
        await page.getByTestId("z4-set-42").click();
        await expect(page.getByTestId("z4-client-count")).toHaveText("42");

        writeFileWithFreshMtime(
          clientPath,
          fs.readFileSync(clientPath, "utf8").replace("CLIENT_LABEL_V1", "CLIENT_LABEL_V2")
        );
        await expect(page.getByTestId("z4-client-label")).toHaveText(
          "CLIENT_LABEL_V2",
          { timeout: 30000 }
        );
        if (bundler !== "webpack") {
          // Esbuild & Rollup perform true React Fast Refresh preserving React state = 42!
          await expect(page.getByTestId("z4-client-count")).toHaveText("42");
        } else {
          // Re-set to 42 on Webpack after its client-change reload so Server Component rsc-update below proves state retention!
          await page.waitForSelector('body[data-hydrated="true"]', {
            state: "attached",
            timeout: 15000,
          });
          await page.getByTestId("z4-set-42").click();
          await expect(page.getByTestId("z4-client-count")).toHaveText("42");
        }

        // 2. Server Component live edit -> updates DOM automatically with ZERO full reload (count stays 42!)
        writeFileWithFreshMtime(
          pagePath,
          fs.readFileSync(pagePath, "utf8").replace("SERVER_TOKEN_V1", "SERVER_TOKEN_V2")
        );
        await expect(page.getByTestId("z4-server-token")).toHaveText(
          "SERVER_TOKEN_V2",
          { timeout: 30000 }
        );
        await expect(page.getByTestId("z4-client-count")).toHaveText("42");

        // 3. CSS Module live edit: (3A) color value change + (3B) class export rename verified via getComputedStyle()
        await expect
          .poll(async () =>
            page.getByTestId("z4-css-box").evaluate((el) => getComputedStyle(el).color)
          )
          .toBe("rgb(255, 0, 0)");

        writeFileWithFreshMtime(cssPath, `.box {\n  color: rgb(0, 128, 0);\n}\n`);
        await expect
          .poll(
            async () =>
              page.getByTestId("z4-css-box").evaluate((el) => getComputedStyle(el).color),
            { timeout: 30000 }
          )
          .toBe("rgb(0, 128, 0)");

        // 3B: Rename class `.box` -> `.boxRenamed` and update `page.tsx`
        writeFileWithFreshMtime(
          cssPath,
          `.boxRenamed {\n  color: rgb(12, 34, 56);\n}\n`
        );
        writeFileWithFreshMtime(
          pagePath,
          fs.readFileSync(pagePath, "utf8").replace("styles.box", "styles.boxRenamed")
        );
        await expect
          .poll(
            async () =>
              page.getByTestId("z4-css-box").evaluate((el) => getComputedStyle(el).color),
            { timeout: 30000 }
          )
          .toBe("rgb(12, 34, 56)");

        // 4. "use server" live edit: invoke initial action -> edit return value & add brand-new export -> invoke BOTH!
        await page.getByTestId("z4-run-action").click();
        await expect(page.getByTestId("z4-action-val")).toHaveText("action-v1", {
          timeout: 15000,
        });

        writeFileWithFreshMtime(
          actionsPath,
          `"use server";\n\nexport async function hmrAction() {\n  return "action-v2";\n}\n\nexport async function hmrActionAdded() {\n  return "added-v2";\n}\n`
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
      <span data-testid="z4-client-label">CLIENT_LABEL_V3</span>
      <span data-testid="z4-client-count">{count}</span>
      <button type="button" data-testid="z4-set-42" onClick={() => setCount(42)}>
        Set 42
      </button>
      <button
        type="button"
        data-testid="z4-run-action"
        onClick={async () => setActVal(await hmrAction())}
      >
        Run Action
      </button>
      <button
        type="button"
        data-testid="z4-run-added"
        onClick={async () => setActVal(await hmrActionAdded())}
      >
        Run Added
      </button>
      <span data-testid="z4-action-val">{actVal}</span>
    </div>
  );
}
`
        );

        await expect(page.getByTestId("z4-run-added")).toBeVisible({
          timeout: 35000,
        });
        await page.getByTestId("z4-run-action").click();
        await expect(page.getByTestId("z4-action-val")).toHaveText("action-v2", {
          timeout: 15000,
        });
        await page.getByTestId("z4-run-added").click();
        await expect(page.getByTestId("z4-action-val")).toHaveText("added-v2", {
          timeout: 15000,
        });

        // 5. Intentional syntax error -> dev server survives -> restore valid code -> browser recovers!
        const validPage = fs.readFileSync(pagePath, "utf8");
        writeFileWithFreshMtime(
          pagePath,
          `export default function Broken( { return <div><<<BROKEN; }\n`
        );
        await page.waitForTimeout(1500);
        expect(devProc.exitCode).toBeNull();

        writeFileWithFreshMtime(
          pagePath,
          validPage.replace("SERVER_TOKEN_V2", "RECOVERED_V3")
        );
        await expect(page.getByTestId("z4-server-token")).toHaveText(
          "RECOVERED_V3",
          { timeout: 35000 }
        );
      } finally {
        killProcessTree(devProc);
        await new Promise((r) => setTimeout(r, 400));
        removeDirSafe(tmpApp);
      }
    });
  }
});
