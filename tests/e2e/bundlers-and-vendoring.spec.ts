import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const REPO_ROOT = process.cwd();

function resolveDinouLayout(): { dinouDir: string; dinouPkgDir: string } {
  const ejectedDir = path.resolve(REPO_ROOT, "dinou");
  if (fs.existsSync(path.join(ejectedDir, "cli.js"))) {
    return { dinouDir: ejectedDir, dinouPkgDir: ejectedDir };
  }
  const nestedDir = path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou");
  const flatPkgDir = path.resolve(REPO_ROOT, "node_modules", "dinou");
  if (fs.existsSync(path.join(nestedDir, "cli.js"))) {
    return { dinouDir: nestedDir, dinouPkgDir: flatPkgDir };
  }
  if (fs.existsSync(path.join(flatPkgDir, "cli.js"))) {
    return { dinouDir: flatPkgDir, dinouPkgDir: flatPkgDir };
  }
  throw new Error("Could not locate dinou/cli.js from " + REPO_ROOT);
}

const { dinouDir: DINOU_DIR, dinouPkgDir: DINOU_PKG_DIR } = resolveDinouLayout();
const CLI_PATH = path.join(DINOU_DIR, "cli.js");

function writeDinouShim(fixtureDir: string): void {
  const dinouShimDir = path.join(fixtureDir, "node_modules", "dinou");
  fs.mkdirSync(path.join(dinouShimDir, "adapters"), { recursive: true });
  const relToDinou = (sub: string) =>
    path.relative(dinouShimDir, path.join(DINOU_DIR, sub)).replace(/\\/g, "/");
  const relFromAdapters = (sub: string) =>
    path
      .relative(path.join(dinouShimDir, "adapters"), path.join(DINOU_DIR, sub))
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
    )
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "index.js"),
    `export * from ${JSON.stringify(relToDinou("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(relToDinou("server.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(relToDinou("core/config.js"))};\nexport { default } from ${JSON.stringify(relToDinou("core/config.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "adapters", "node.js"),
    `export * from ${JSON.stringify(relFromAdapters("adapters/node.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "adapters", "netlify.js"),
    `export * from ${JSON.stringify(relFromAdapters("adapters/netlify.js"))};\nexport { default } from ${JSON.stringify(relFromAdapters("adapters/netlify.js"))};\n`
  );
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for server at ${url}`);
}

function createE2EFixture(): string {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou", "tmp-bundlers-e2e");
  fs.mkdirSync(inRepoTmpBase, { recursive: true });
  const dir = fs.mkdtempSync(path.join(inRepoTmpBase, "app-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "public"), { recursive: true });

  writeDinouShim(dir);

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "dinou-bundlers-e2e-app", private: true, type: "module" },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          paths: { "@/*": ["./src/*"] },
        },
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dir, "src", "box.module.css"),
    ".badge { background-color: rgb(16, 185, 129); padding: 4px 8px; }\n"
  );

  fs.writeFileSync(
    path.join(dir, "src", "actions.ts"),
    `"use server";
export async function doubleOnServer(value: number): Promise<number> {
  return value * 2;
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "interactive.tsx"),
    `"use client";
import { useState } from "react";
import styles from "@/box.module.css";
import { doubleOnServer } from "@/actions";

export default function InteractiveWidget() {
  const [val, setVal] = useState(3);
  return (
    <div>
      <span data-testid="val" className={styles.badge}>{val}</span>
      <button
        data-testid="double-btn"
        onClick={async () => {
          const next = await doubleOnServer(val);
          setVal(next);
        }}
      >
        Double via Server Function
      </button>
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "layout.tsx"),
    `import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "page.tsx"),
    `import InteractiveWidget from "@/interactive";

export default function Page() {
  return (
    <main>
      <h1 data-testid="heading">Bundler Parity E2E</h1>
      <InteractiveWidget />
    </main>
  );
}
`
  );

  return dir;
}

test.describe("Dinou Multi-Bundler & Dual-Mode Vendoring E2E", () => {
  for (const [bundler, extraArgs] of [
    ["esbuild", []],
    ["rollup", ["-u"]],
    ["webpack", []],
  ] as const) {
    test(`builds, hydrates, applies CSS Modules, and executes Server Functions with ${bundler} ${extraArgs.join(" ")}`, async ({
      page,
    }) => {
      const fixtureDir = createE2EFixture();
      let serverProc: ChildProcess | null = null;

      try {
        const buildRes = spawnSync(
          process.execPath,
          [CLI_PATH, `build:node:${bundler}`, ...extraArgs],
          { cwd: fixtureDir, encoding: "utf8" }
        );
        expect(buildRes.status, buildRes.stderr).toBe(0);

        const port = await getFreePort();
        serverProc = spawn(
          process.execPath,
          [CLI_PATH, `start:node:${bundler}`, ...extraArgs],
          {
            cwd: fixtureDir,
            env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
            stdio: "pipe",
          }
        );

        const baseUrl = `http://127.0.0.1:${port}`;
        await waitForServer(baseUrl);

        await page.goto(baseUrl);
        await expect(page.getByTestId("heading")).toHaveText(
          "Bundler Parity E2E"
        );
        const valBadge = page.getByTestId("val");
        await expect(valBadge).toHaveText("3");

        const bgColor = await valBadge.evaluate(
          (el) => getComputedStyle(el).backgroundColor
        );
        expect(bgColor).toBe("rgb(16, 185, 129)");

        await page.getByTestId("double-btn").click();
        await expect(valBadge).toHaveText("6");
      } finally {
        if (serverProc && serverProc.exitCode === null) {
          try {
            if (process.platform === "win32" && serverProc.pid) {
              spawnSync(
                "taskkill",
                ["/pid", String(serverProc.pid), "/f", "/t"],
                { stdio: "ignore", timeout: 5000 }
              );
            } else {
              serverProc.kill("SIGTERM");
            }
          } catch {}
        }
        try {
          fs.rmSync(fixtureDir, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 60,
          });
        } catch {}
      }
    });
  }
});
