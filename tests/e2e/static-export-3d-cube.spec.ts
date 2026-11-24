import { test, expect } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function resolveDinouRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "dinou"),
    path.resolve(process.cwd(), "node_modules/dinou/dinou"),
    path.resolve(process.cwd(), "node_modules/dinou"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "cli.js"))) return c;
  }
  throw new Error("Could not locate dinou/cli.js");
}

const dinouRoot = resolveDinouRoot();
const cliPath = path.join(dinouRoot, "cli.js");
const repoRoot = process.cwd();

function createTmpDir(): string {
  const inRepoParent = path.join(repoRoot, ".dinou");
  try {
    fs.mkdirSync(inRepoParent, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoParent, "tmp-e2e-static-3d-"));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), "dinou-e2e-static-3d-"));
  }
}

function createStaticExport3DCubeApp(baseDir: string): string {
  const appDir = path.join(baseDir, "static-3d-app");
  const nmDinou = path.join(appDir, "node_modules", "dinou");
  fs.mkdirSync(nmDinou, { recursive: true });

  const relTo = (subpath: string): string => {
    const rel = path
      .relative(nmDinou, path.join(dinouRoot, subpath))
      .replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  };

  fs.writeFileSync(
    path.join(nmDinou, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "10.0.5",
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
    path.join(nmDinou, "index.js"),
    `export * from ${JSON.stringify(relTo("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "server.js"),
    `export * from ${JSON.stringify(relTo("server.js"))};\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "config.js"),
    `export * from ${JSON.stringify(relTo("core/config.js"))};\nexport { default } from ${JSON.stringify(relTo("core/config.js"))};\n`
  );

  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify({ name: "static-3d-app", private: true, type: "module" }, null, 2)
  );

  const write = (rel: string, content: string) => {
    const full = path.join(appDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  };

  write(
    "src/layout.tsx",
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Static Export 3D Cube</title></head>
      <body>{children}</body>
    </html>
  );
}
`
  );
  write("src/page.tsx", `export default function Home() { return <main id="se-home">home</main>; }\n`);

  write(
    "src/se/probe.tsx",
    `"use client";
import { useEffect, useState } from "react";
import { refreshSlot } from "dinou";

let probeSeq = 0;

export default function OuterProbe() {
  const [mountId, setMountId] = useState("ssr");
  const [count, setCount] = useState(0);
  const [refreshStatus, setRefreshStatus] = useState("idle");

  useEffect(() => {
    probeSeq += 1;
    setMountId("m-" + probeSeq + "-" + Math.random().toString(36).slice(2, 8));
  }, []);

  const handleRefresh = async () => {
    setRefreshStatus("running");
    await refreshSlot("se-alpha-slot", { fresh: true });
    await refreshSlot("*");
    setRefreshStatus("done");
  };

  return (
    <div id="se-outer-probe">
      <span id="se-outer-mount">{mountId}</span>
      <span id="se-outer-count">{count}</span>
      <span id="se-refresh-status">{refreshStatus}</span>
      <button id="se-outer-inc" type="button" onClick={() => setCount((v) => v + 1)}>+1</button>
      <button id="se-slot-refresh-btn" type="button" onClick={handleRefresh}>Refresh Slot</button>
    </div>
  );
}
`
  );

  write(
    "src/se/layout.tsx",
    `import type { ReactNode } from "react";
import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import OuterProbe from "./probe";

export default function SeOuterLayout({ children }: { children: ReactNode }) {
  return (
    <div id="se-outer-shell">
      <OuterProbe />
      <DinouCacheSlot id="se-outer-slot" revalidate={3600} tags={["se-outer-tag"]}>
        {async () => <span id="se-outer-slot-val">outer-baked-101</span>}
      </DinouCacheSlot>
      <nav id="se-outer-nav">
        <Link id="nav-alpha" href="/se/a">Alpha</Link>
        <Link id="nav-beta" href="/se/b">Beta</Link>
        <Link id="nav-docs-0" href="/se/docs">Docs0</Link>
        <Link id="nav-docs-1" href="/se/docs/guide">Docs1</Link>
        <Link id="nav-docs-2" href="/se/docs/guide/intro">Docs2</Link>
        <Link id="nav-reset-own" href="/se/reset-own">ResetOwn</Link>
        <Link id="nav-reset-bare" href="/se/reset-bare">ResetBare</Link>
        <Link id="nav-bare" href="/se/bare">NoLayout</Link>
      </nav>
      {children}
    </div>
  );
}
`
  );

  // Sibling Route Group (alpha) + zero-hole PPR
  write(
    "src/se/(alpha)/layout.tsx",
    `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";

export default function AlphaLayout({ children }: { children: ReactNode }) {
  return (
    <section id="se-alpha-layout">
      <DinouCacheSlot id="se-alpha-slot" revalidate={3600}>
        {async () => <span id="se-alpha-slot-val">alpha-baked-201</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
`
  );
  write("src/se/(alpha)/a/page_functions.ts", `export const ppr = true;\nexport const revalidate = 3600;\n`);
  write(
    "src/se/(alpha)/a/page.tsx",
    `import { DinouCacheSlot } from "dinou/server";
export default function AlphaPage() {
  return (
    <article id="se-alpha-page">
      <h1>Alpha Page</h1>
      <DinouCacheSlot id="se-alpha-page-slot" revalidate={3600}>
        {async () => <span id="se-alpha-page-slot-val">alpha-page-baked-301</span>}
      </DinouCacheSlot>
    </article>
  );
}
`
  );

  // Sibling Route Group (beta) + zero-hole PPR
  write(
    "src/se/(beta)/layout.tsx",
    `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";

export default function BetaLayout({ children }: { children: ReactNode }) {
  return (
    <section id="se-beta-layout">
      <DinouCacheSlot id="se-beta-slot" revalidate={3600}>
        {async () => <span id="se-beta-slot-val">beta-baked-202</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
`
  );
  write("src/se/(beta)/b/page_functions.ts", `export const ppr = true;\nexport const revalidate = 3600;\n`);
  write(
    "src/se/(beta)/b/page.tsx",
    `export default function BetaPage() {
  return <article id="se-beta-page"><h1>Beta Page</h1></article>;
}
`
  );

  // Optional Catch-All [[...slug]] with 0, 1, 2 pre-rendered segments
  write(
    "src/se/docs/[[...slug]]/layout.tsx",
    `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";

export default function DocsCatchAllLayout({
  children,
  params,
}: {
  children: ReactNode;
  params?: { slug?: string[] };
}) {
  const slugLabel = Array.isArray(params?.slug) && params.slug.length > 0 ? params.slug.join("/") : "root";
  return (
    <section id="se-docs-layout" data-slug={slugLabel}>
      <DinouCacheSlot id="se-docs-slot" revalidate={3600}>
        {async () => <span id="se-docs-slot-val">docs-baked-401</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
`
  );
  write(
    "src/se/docs/[[...slug]]/page_functions.ts",
    `export function getStaticPaths() {
  return [[], ["guide"], ["guide", "intro"]];
}
`
  );
  write(
    "src/se/docs/[[...slug]]/page.tsx",
    `export default function DocsCatchAllPage({ params }: { params?: { slug?: string[] } }) {
  const slugLabel = Array.isArray(params?.slug) && params.slug.length > 0 ? params.slug.join("/") : "root";
  return <article id="se-docs-page">{\`docs-slug:\${slugLabel}\`}</article>;
}
`
  );

  // reset_layout WITH own layout
  write("src/se/reset-own/reset_layout", "");
  write(
    "src/se/reset-own/layout.tsx",
    `import type { ReactNode } from "react";
import { Link } from "dinou";
export default function ResetOwnLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>ResetOwn</title></head>
      <body>
        <div id="se-reset-own-shell">
          <Link id="reset-own-to-bare" href="/se/reset-bare">ResetBare</Link>
          {children}
        </div>
      </body>
    </html>
  );
}
`
  );
  write("src/se/reset-own/page.tsx", `export default function ResetOwnPage() { return <main id="se-reset-own-page">reset-own</main>; }\n`);

  // reset_layout WITHOUT own layout
  write("src/se/reset-bare/reset_layout", "");
  write(
    "src/se/reset-bare/page.tsx",
    `import { Link } from "dinou";
export default function ResetBarePage() {
  return (
    <html lang="en">
      <head><title>ResetBare</title></head>
      <body>
        <main id="se-reset-bare-page">
          reset-bare
          <Link id="reset-bare-to-nolayout" href="/se/bare">NoLayout</Link>
        </main>
      </body>
    </html>
  );
}
`
  );

  // no_layout
  write("src/se/bare/no_layout", "");
  write(
    "src/se/bare/page.tsx",
    `import { Link } from "dinou";
export default function BareNoLayoutPage() {
  return (
    <html lang="en">
      <head><title>Bare</title></head>
      <body>
        <main id="se-bare-page">
          bare-no-layout
          <Link id="bare-back-alpha" href="/se/a">BackAlpha</Link>
        </main>
      </body>
    </html>
  );
}
`
  );

  return appDir;
}

function getMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".rsc")) return "text/x-component; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function startDumbStaticServer(outDir: string): Promise<{ server: http.Server; baseUrl: string }> {
  const rootAbs = path.resolve(outDir);
  const rootPrefix = rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep;
  const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url || "/", "http://127.0.0.1");
    let decoded = "";
    try {
      decoded = decodeURIComponent(urlObj.pathname).replace(/^\/+/, "");
    } catch {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }
    const candidates = decoded
      ? [decoded, `${decoded.replace(/\/+$/, "")}/index.html`]
      : ["index.html"];
    for (const cand of candidates) {
      const segs = cand.split("/").filter(Boolean);
      if (segs.some((s) => s === "." || s === "..")) continue;
      const abs = path.resolve(rootAbs, ...segs);
      if (!abs.startsWith(rootPrefix)) continue;
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        res.statusCode = 200;
        res.setHeader("Content-Type", getMimeType(abs));
        res.end(fs.readFileSync(abs));
        return;
      }
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<!DOCTYPE html><html><body>404 Static Miss</body></html>");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

test.describe.serial(
  "Phase 5 / Stage 2 / Check #74: Static Export (dinou export-static) Under Full 3D Cube Topologies",
  () => {
    let tmpBase = "";
    let outDir = "";
    let server: http.Server | null = null;
    let baseUrl = "";

    test.beforeAll(async () => {
      tmpBase = createTmpDir();
      const appDir = createStaticExport3DCubeApp(tmpBase);
      const buildRes = spawnSync(process.execPath, [cliPath, "build"], {
        cwd: appDir,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
        timeout: 120_000,
      });
      if (buildRes.status !== 0) {
        throw new Error(`build failed:\n${buildRes.stdout}\n${buildRes.stderr}`);
      }
      const expRes = spawnSync(process.execPath, [cliPath, "export-static"], {
        cwd: appDir,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
        timeout: 60_000,
      });
      if (expRes.status !== 0) {
        throw new Error(`export-static failed:\n${expRes.stdout}\n${expRes.stderr}`);
      }
      outDir = path.join(appDir, "out");
      const started = await startDumbStaticServer(outDir);
      server = started.server;
      baseUrl = started.baseUrl;
    });

    test.afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      if (tmpBase) {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    test("Soft navigation across (alpha) <-> (beta) <-> [[...slug]] (0/1/2 segs) <-> reset_layout <-> no_layout with zero 404s, zero hard-reload fallbacks, preserved outer probe & safe refreshSlot no-op", async ({
      page,
    }) => {
      const hydrationErrors: string[] = [];
      const routerWarnings: string[] = [];
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      const rscResponses: Array<{ url: string; status: number }> = [];
      const slotRequests: string[] = [];

      page.on("console", (msg) => {
        const text = msg.text();
        if (msg.type() === "error") consoleErrors.push(text);
        if (
          (msg.type() === "error" || msg.type() === "warning") &&
          /hydrat|didn't match|418|419|422|423|425/i.test(text)
        ) {
          hydrationErrors.push(text);
        }
        if (/navigate called outside Router/i.test(text)) {
          routerWarnings.push(text);
        }
      });
      page.on("pageerror", (err) => {
        pageErrors.push(err.message);
      });
      page.on("response", (res) => {
        const u = res.url();
        if (u.includes(".rsc")) {
          rscResponses.push({ url: u, status: res.status() });
        }
        if (u.includes("____rsc_slot____")) {
          slotRequests.push(u);
        }
      });

      // 1. Direct load on /se/a (sibling route group (alpha) + zero-hole PPR + baked slots)
      await page.goto(`${baseUrl}/se/a`);
      await expect(page.locator("body")).toHaveAttribute("data-hydrated", "true", { timeout: 15000 });
      await expect(page.locator("#se-outer-slot-val")).toHaveText("outer-baked-101");
      await expect(page.locator("#se-alpha-slot-val")).toHaveText("alpha-baked-201");
      await expect(page.locator("#se-alpha-page-slot-val")).toHaveText("alpha-page-baked-301");

      // Stamp document sentinel to guarantee ZERO window.location.replace hard-reload fallbacks!
      const docId = await page.evaluate(() => {
        const id = "doc-" + Math.random().toString(36).slice(2);
        (window as any).__SE_DOC_ID__ = id;
        return id;
      });
      const assertNoHardReload = async () => {
        const cur = await page.evaluate(() => (window as any).__SE_DOC_ID__);
        expect(cur).toBe(docId);
      };

      // Increment shared outer layout client probe
      await expect(page.locator("#se-outer-mount")).toHaveText(/^m-/, { timeout: 10000 });
      await page.click("#se-outer-inc");
      await expect(page.locator("#se-outer-count")).toHaveText("1");
      const outerMountId = await page.locator("#se-outer-mount").textContent();

      // 2. Calling refreshSlot in static-export mode must safely no-op with ZERO /____rsc_slot____ calls!
      await page.click("#se-slot-refresh-btn");
      await expect(page.locator("#se-refresh-status")).toHaveText("done");
      expect(slotRequests).toEqual([]);

      // 3. Soft <Link> (alpha)/a -> (beta)/b: shared outer probe MUST survive without remounting!
      await page.click("#nav-beta");
      await expect(page.locator("#se-beta-page")).toBeVisible({ timeout: 10000 });
      await expect(page.locator("#se-beta-slot-val")).toHaveText("beta-baked-202");
      await expect(page.locator("#se-alpha-layout")).toHaveCount(0);
      await expect(page.locator("#se-outer-mount")).toHaveText(String(outerMountId));
      await expect(page.locator("#se-outer-count")).toHaveText("1");
      await assertNoHardReload();

      // 4. Soft <Link> -> Optional Catch-All [[...slug]] (0, 1, 2 segments): outer probe survives!
      await page.click("#nav-docs-0");
      await expect(page.locator("#se-docs-page")).toHaveText("docs-slug:root", { timeout: 10000 });
      await expect(page.locator("#se-docs-slot-val")).toHaveText("docs-baked-401");
      await expect(page.locator("#se-outer-mount")).toHaveText(String(outerMountId));
      await expect(page.locator("#se-outer-count")).toHaveText("1");
      await assertNoHardReload();

      await page.click("#nav-docs-1");
      await expect(page.locator("#se-docs-page")).toHaveText("docs-slug:guide", { timeout: 10000 });
      await expect(page.locator("#se-docs-slot-val")).toHaveText("docs-baked-401");
      await expect(page.locator("#se-outer-mount")).toHaveText(String(outerMountId));
      await assertNoHardReload();

      await page.click("#nav-docs-2");
      await expect(page.locator("#se-docs-page")).toHaveText("docs-slug:guide/intro", { timeout: 10000 });
      await expect(page.locator("#se-outer-mount")).toHaveText(String(outerMountId));
      await assertNoHardReload();

      // 5. Soft <Link> -> reset_layout (own layout) -> reset_layout (bare, no layout) -> no_layout -> back to /se/a
      await page.click("#nav-reset-own");
      await expect(page.locator("#se-reset-own-page")).toBeVisible({ timeout: 10000 });
      await expect(page.locator("#se-reset-own-shell")).toBeVisible();
      await expect(page.locator("#se-outer-shell")).toHaveCount(0);
      await assertNoHardReload();

      await page.click("#reset-own-to-bare");
      await expect(page.locator("#se-reset-bare-page")).toBeVisible({ timeout: 10000 });
      await expect(page.locator("#se-outer-shell")).toHaveCount(0);
      await expect(page.locator("#se-reset-own-shell")).toHaveCount(0);
      await assertNoHardReload();

      await page.click("#reset-bare-to-nolayout");
      await expect(page.locator("#se-bare-page")).toBeVisible({ timeout: 10000 });
      await expect(page.locator("#se-outer-shell")).toHaveCount(0);
      await assertNoHardReload();

      await page.click("#bare-back-alpha");
      await expect(page.locator("#se-alpha-page")).toBeVisible({ timeout: 10000 });
      await expect(page.locator("#se-alpha-page-slot-val")).toHaveText("alpha-page-baked-301");
      await expect(page.locator("#se-outer-slot-val")).toHaveText("outer-baked-101");
      await assertNoHardReload();

      // 6. Every .rsc request fetched on the dumb static host MUST have returned HTTP 200 (zero 404s!)
      expect(rscResponses.length).toBeGreaterThan(0);
      const non200Rsc = rscResponses.filter((r) => r.status !== 200);
      expect(non200Rsc).toEqual([]);
      expect(slotRequests).toEqual([]);
      expect(hydrationErrors).toEqual([]);
      expect(routerWarnings).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }
);
