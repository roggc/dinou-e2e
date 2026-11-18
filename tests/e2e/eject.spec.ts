import { test, expect } from "@playwright/test";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const WORKSPACE_ROOT = process.cwd();

function resolveSourceDinouDir(): string {
  const candidates = [
    path.resolve(WORKSPACE_ROOT, "dinou"),
    path.resolve(WORKSPACE_ROOT, "node_modules/dinou/dinou"),
    path.resolve(WORKSPACE_ROOT, "node_modules/dinou"),
  ];
  for (const dinouDir of candidates) {
    if (fs.existsSync(path.join(dinouDir, "cli.js"))) {
      return dinouDir;
    }
  }
  throw new Error(
    "Unable to locate Dinou source directory containing cli.js (checked ./dinou and node_modules/dinou/dinou)."
  );
}

const SOURCE_DINOU_DIR = resolveSourceDinouDir();

const EJECT_WRAPPER_SOURCE = `import path from "node:path";
import { fileURLToPath } from "node:url";
import { runEject } from "./dinou/core/uneject.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function eject(options = {}) {
  return runEject({
    ...options,
    sourceDinouDir: path.resolve(__dirname, "dinou"),
  });
}

export default eject;
`;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Unable to allocate free port")));
      }
    });
    srv.on("error", reject);
  });
}

async function waitForHttpReady(url: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
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

test.describe("Dinou Eject & Uneject E2E Sovereignty Flow", () => {
  let fixtureRoot: string | null = null;
  let serverProc: ChildProcess | null = null;

  test.afterEach(async () => {
    await stopChildServer(serverProc);
    serverProc = null;
    if (fixtureRoot && fs.existsSync(fixtureRoot)) {
      try {
        fs.rmSync(fixtureRoot, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 50,
        });
      } catch {}
      fixtureRoot = null;
    }
  });

  test("ejects framework, reflects live ./dinou edits in SSR + hydrated client even over stale node_modules/dinou, and unejects cleanly", async ({
    page,
  }) => {
    const tmpParent = path.join(WORKSPACE_ROOT, ".dinou");
    fs.mkdirSync(tmpParent, { recursive: true });
    fixtureRoot = fs.mkdtempSync(path.join(tmpParent, "tmp-e2e-eject-"));
    fs.mkdirSync(path.join(fixtureRoot, "src"), { recursive: true });

    const pkgPath = path.join(fixtureRoot, "package.json");
    fs.writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: "e2e-eject-app",
          version: "1.0.0",
          type: "module",
          scripts: {
            dev: "dinou dev",
            build: "dinou build",
            start: "dinou start",
            eject: "dinou eject",
          },
          dependencies: {
            dinou: "^9.4.0",
            react: "^19.3.1",
            "react-dom": "^19.3.1",
          },
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    // 1. Stage a simulated npm package layout (<simPkg>/eject.js + <simPkg>/dinou)
    const simPkgDir = path.join(fixtureRoot, ".sim-dinou-pkg");
    fs.mkdirSync(simPkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(simPkgDir, "package.json"),
      JSON.stringify({ name: "dinou", version: "9.4.0", type: "module" }, null, 2),
      "utf8"
    );
    fs.writeFileSync(path.join(simPkgDir, "eject.js"), EJECT_WRAPPER_SOURCE, "utf8");
    fs.cpSync(SOURCE_DINOU_DIR, path.join(simPkgDir, "dinou"), { recursive: true });

    const ejectRun = spawnSync(
      process.execPath,
      [path.join(simPkgDir, "dinou", "cli.js"), "eject", "--skip-install"],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(ejectRun.status).toBe(0);
    fs.rmSync(simPkgDir, { recursive: true, force: true });

    const ejectedPkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    expect(ejectedPkg.scripts.dev).toBe("node dinou/cli.js dev");
    expect(ejectedPkg.scripts.uneject).toBe("node dinou/cli.js uneject");
    expect(ejectedPkg.scripts["build:vendors"]).toBe(
      "node dinou/cli.js build:vendors"
    );
    expect(ejectedPkg.scripts.eject).toBeUndefined();

    // 2. Place a stale snapshot in fixtureRoot/node_modules/dinou (simulating pnpm/yarn static copy)
    const staleDir = path.join(fixtureRoot, "node_modules", "dinou");
    fs.mkdirSync(path.join(staleDir, "core"), { recursive: true });
    fs.copyFileSync(
      path.join(SOURCE_DINOU_DIR, "package.json"),
      path.join(staleDir, "package.json")
    );
    fs.writeFileSync(
      path.join(staleDir, "index.js"),
      'export const EJECTED_BANNER = "STALE_NODE_MODULES";\n',
      "utf8"
    );

    // 3. Apply live customizations inside ./dinou/index.js and dinou.config.ts ("dinou/config")
    const localIndex = path.join(fixtureRoot, "dinou", "index.js");
    fs.writeFileSync(
      localIndex,
      fs.readFileSync(localIndex, "utf8") +
        '\nexport const EJECTED_BANNER = "LIVE_EJECTED_SOVEREIGNTY";\n',
      "utf8"
    );

    fs.writeFileSync(
      path.join(fixtureRoot, "dinou.config.ts"),
      `import { defineConfig } from "dinou/config";
export default defineConfig({
  plugins: [
    {
      name: "ejected-header-plugin",
      onRequest(_req, ctx) {
        ctx.res.setHeader("x-dinou-mode", "ejected");
      },
    },
  ],
});
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(fixtureRoot, "src", "counter.tsx"),
      `"use client";
import { useState } from "react";
import { EJECTED_BANNER } from "dinou";

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button
      id="eject-btn"
      type="button"
      onClick={() => setCount((c) => c + 1)}
    >
      {EJECTED_BANNER}:{count}
    </button>
  );
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(fixtureRoot, "src", "page.tsx"),
      `import Counter from "./counter";
import { EJECTED_BANNER } from "dinou";

export default function Page() {
  return (
    <html>
      <head>
        <title>Ejected E2E</title>
      </head>
      <body>
        <h1 id="ssr-banner">{EJECTED_BANNER}</h1>
        <Counter />
      </body>
    </html>
  );
}
`,
      "utf8"
    );

    // 4. Build production bundle using ejected CLI
    const buildRun = spawnSync(
      process.execPath,
      [path.join(fixtureRoot, "dinou", "cli.js"), "build"],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(buildRun.status).toBe(0);

    // 5. Boot production server and verify SSR + client hydration in Playwright
    const port = await getFreePort();
    serverProc = spawn(
      process.execPath,
      [path.join(fixtureRoot, "dinou", "cli.js"), "start"],
      {
        cwd: fixtureRoot,
        env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
        stdio: "ignore",
      }
    );

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHttpReady(baseUrl);

    const response = await page.goto(baseUrl);
    expect(response?.headers()["x-dinou-mode"]).toBe("ejected");

    await expect(page.locator("#ssr-banner")).toHaveText(
      "LIVE_EJECTED_SOVEREIGNTY"
    );
    const btn = page.locator("#eject-btn");
    await expect(btn).toHaveText("LIVE_EJECTED_SOVEREIGNTY:0");
    await btn.click();
    await expect(btn).toHaveText("LIVE_EJECTED_SOVEREIGNTY:1");

    await stopChildServer(serverProc);
    serverProc = null;

    // 6. Run `node dinou/cli.js uneject ^9.4.0 -y --skip-install` and verify clean reversal
    const unejectRun = spawnSync(
      process.execPath,
      [
        path.join(fixtureRoot, "dinou", "cli.js"),
        "uneject",
        "^9.4.0",
        "-y",
        "--skip-install",
      ],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(unejectRun.status).toBe(0);
    expect(fs.existsSync(path.join(fixtureRoot, "dinou"))).toBe(false);

    const restoredPkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    expect(restoredPkg.scripts).toEqual({
      dev: "dinou dev",
      build: "dinou build",
      start: "dinou start",
      eject: "dinou eject",
    });
    expect(restoredPkg.dependencies.dinou).toBe("^9.4.0");
  });
});

