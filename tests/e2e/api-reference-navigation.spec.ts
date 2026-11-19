import { test, expect } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
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
  const dinouConfigPath = path.join(DINOU_ROOT, "core", "config.js").replace(/\\/g, "/");

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

function setupE2EFixture(externalPort: number): string {
  const fixtureRoot = createFixtureDir("tmp-api-ref-nav-e2e-");

  fs.writeFileSync(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify(
      {
        name: "api-reference-nav-e2e",
        type: "module",
        private: true,
      },
      null,
      2
    )
  );
  writeDinouShim(fixtureRoot);

  fs.mkdirSync(path.join(fixtureRoot, "public"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "public", "report.txt"), "DINOU_REPORT_DATA", "utf8");

  fs.mkdirSync(path.join(fixtureRoot, "src", "guarded"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "src", "layout-guarded"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "src", "login"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "src", "counter-page"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "src", "report"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "src", "search-static"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "src", "ppr-zero-hole"), { recursive: true });

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Dinou Nav E2E</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "nav-controls.tsx"),
    `"use client";
import { useEffect, useRef, useState } from "react";
import { ClientRedirect, Link, useRouter } from "dinou";

export function NavControls() {
  const router = useRouter();
  const [localTick, setLocalTick] = useState(0);
  const [effectRuns, setEffectRuns] = useState(0);
  const [triggerClientRedirect, setTriggerClientRedirect] = useState(false);
  const prevRouterRef = useRef(router);
  const refChangesRef = useRef(0);
  if (prevRouterRef.current !== router) {
    refChangesRef.current += 1;
    prevRouterRef.current = router;
  }

  useEffect(() => {
    setEffectRuns((c) => c + 1);
  }, [router]);

  return (
    <div id="controls">
      <button id="bump-local" type="button" onClick={() => setLocalTick((n) => n + 1)}>
        Local:{localTick}
      </button>
      <span id="effect-runs">EffectRuns:{effectRuns}</span>
      <span id="router-ref-changes">RefChanges:{refChangesRef.current}</span>

      <Link id="link-guarded" href="/guarded">
        Go Guarded
      </Link>
      <Link id="link-layout-guarded" href="/layout-guarded">
        Go Layout Guarded
      </Link>
      <Link id="link-blank" href="/report" target="_blank" rel="noopener noreferrer">
        Report New Tab
      </Link>
      <Link id="link-self" href="/report" target="_self">
        Report Self Tab
      </Link>
      <Link id="link-download" href="/report.txt" download="report.txt">
        Download Report
      </Link>
      <Link id="link-hash-fresh" href="/counter-page#target-sec" fresh>
        Fresh Hash
      </Link>

      <a id="anchor-blank" href="/report" target="_blank" rel="noopener noreferrer">
        Plain Anchor Blank
      </a>
      <a id="anchor-self" href="/report" target="_self">
        Plain Anchor Self
      </a>
      <a id="anchor-download" href="/report.txt" download="anchor-report.txt">
        Plain Anchor Download
      </a>

      <button
        id="btn-external-push"
        type="button"
        onClick={() => router.push("http://127.0.0.1:${externalPort}/external-landing")}
      >
        External Push
      </button>
      <button
        id="btn-external-replace"
        type="button"
        onClick={() => router.replace("http://127.0.0.1:${externalPort}/external-replace")}
      >
        External Replace
      </button>
      <button
        id="btn-external-client-redirect"
        type="button"
        onClick={() => setTriggerClientRedirect(true)}
      >
        External ClientRedirect
      </button>
      {triggerClientRedirect ? (
        <ClientRedirect to="http://127.0.0.1:${externalPort}/external-client-redirect" />
      ) : null}
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "page.tsx"),
    `import { NavControls } from "./nav-controls";
export default function HomePage() {
  return (
    <main>
      <h1 id="home-title">Home</h1>
      <NavControls />
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "report", "page.tsx"),
    `import { Link } from "dinou";
export default function ReportPage() {
  return (
    <main id="report-page">
      <span>Report Opened</span>
      <Link id="report-back-home" href="/">Back Home</Link>
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "login", "page.tsx"),
    `export default function LoginPage() {
  return <main id="login-page">Please Sign In</main>;
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "guarded", "page_functions.ts"),
    `import { redirect, getContext } from "dinou";
export const revalidate = 0;
export async function getProps() {
  const { req } = getContext();
  if (req.cookies.auth !== "yes") {
    return redirect("/login");
  }
  return { user: { name: "Bob" } };
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "guarded", "page.tsx"),
    `export default function GuardedPage({ user }: { user: { name: string } }) {
  return <main id="guarded-page">Secret {user.name}</main>;
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "layout-guarded", "layout_functions.ts"),
    `import { redirect, getContext } from "dinou";
export const revalidate = 0;
export async function getProps() {
  const { req } = getContext();
  if (req.cookies.tenant !== "acme") {
    return redirect("/login");
  }
  return { tenant: { title: "Acme" } };
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "layout-guarded", "layout.tsx"),
    `import type { ReactNode } from "react";
export default function TenantLayout({ children, tenant }: { children: ReactNode; tenant: { title: string } }) {
  return <section data-tenant={tenant.title}>{children}</section>;
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "layout-guarded", "page_functions.ts"),
    `export const revalidate = 0;\n`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "layout-guarded", "page.tsx"),
    `export default function TenantPage() {
  return <main id="tenant-page">Tenant OK</main>;
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "counter-page", "page_functions.ts"),
    `export const revalidate = 0;\n`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "counter-page", "page.tsx"),
    `import { Link } from "dinou";
let hits = 0;
export default function CounterPage() {
  hits += 1;
  return (
    <main>
      <div id="hit-count">Hits:{hits}</div>
      <Link id="back-home" href="/">Home</Link>
      <div style={{ height: "1200px" }} />
      <section id="target-sec">Target Hash Section</section>
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "search-viewer.tsx"),
    `"use client";
import { useSearchParams } from "dinou";
export function SearchViewer({ label }: { label: string }) {
  const sp = useSearchParams();
  return (
    <div id="search-viewer">
      {label}|q={sp.get("q") || "empty"}|page={sp.get("page") || "0"}
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "search-static", "page.tsx"),
    `import { SearchViewer } from "../search-viewer";
export default function SearchStaticPage() {
  return (
    <main>
      <h1>Static Search</h1>
      <SearchViewer label="ssg" />
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "ppr-zero-hole", "page_functions.ts"),
    `export const ppr = true;\n`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "ppr-zero-hole", "page.tsx"),
    `import { SearchViewer } from "../search-viewer";
export default function PprZeroHolePage() {
  return (
    <main>
      <h1>PPR Zero Hole Search</h1>
      <SearchViewer label="ppr-zero-hole" />
    </main>
  );
}
`
  );

  return fixtureRoot;
}

function createStaticFileServer(rootDir: string): http.Server {
  const mimeTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".rsc": "text/x-component; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
  };

  return http.createServer((req, res) => {
    const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
    let relPath = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, "");
    let filePath = path.join(rootDir, relPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const idx = path.join(filePath, "index.html");
      if (fs.existsSync(idx)) {
        filePath = idx;
      } else {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
}

test.describe("API Reference Batch 1: Navigation, <Link>, redirect(), useRouter() & useSearchParams()", () => {
  let fixtureRoot = "";
  let serverProc: ChildProcess | null = null;
  let auxServer: http.Server | null = null;

  test.afterEach(async () => {
    await stopChildServer(serverProc);
    serverProc = null;
    if (auxServer) {
      await new Promise<void>((resolve) => auxServer!.close(() => resolve()));
      auxServer = null;
    }
    if (fixtureRoot && fs.existsSync(fixtureRoot)) {
      removeDirSafe(fixtureRoot);
      fixtureRoot = "";
    }
  });

  test("1. Esbuild production E2E: getProps/layout redirect (SSR + SPA), <Link> & <a> target/download, hash+fresh, useRouter stability & external navigation", async ({
    page,
    context,
  }) => {
    const externalPort = await getFreePort();
    auxServer = http.createServer((req, res) => {
      const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<html><body><h1 id="external-ok">External:${pathname}</h1></body></html>`
      );
    });
    await new Promise<void>((resolve) =>
      auxServer!.listen(externalPort, "127.0.0.1", resolve)
    );

    fixtureRoot = setupE2EFixture(externalPort);

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

    const pageErrors: string[] = [];
    const hydrationErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        if (HYDRATION_ERROR_REGEX.test(msg.text())) {
          hydrationErrors.push(msg.text());
        }
      }
    });

    // 1A. Hard SSR redirect from page_functions.ts getProps() without crashing GuardedPage
    const directRes = await page.goto(`${baseUrl}/guarded`);
    expect(directRes?.status()).toBe(200);
    await expect(page).toHaveURL(`${baseUrl}/login`);
    await expect(page.locator("#login-page")).toHaveText("Please Sign In");

    // 1B. Hard SSR redirect from layout_functions.ts getProps() without crashing TenantLayout
    const directLayoutRes = await page.goto(`${baseUrl}/layout-guarded`);
    expect(directLayoutRes?.status()).toBe(200);
    await expect(page).toHaveURL(`${baseUrl}/login`);
    await expect(page.locator("#login-page")).toHaveText("Please Sign In");

    // 2. Navigate to Home and verify useRouter() referential stability across local state changes
    await page.goto(baseUrl);
    await page.waitForSelector('body[data-hydrated="true"]', { state: "attached" });
    await expect(page.locator("#home-title")).toHaveText("Home");
    await expect(page.locator("#effect-runs")).toHaveText("EffectRuns:1");
    await expect(page.locator("#router-ref-changes")).toHaveText("RefChanges:0");
    await page.locator("#bump-local").click();
    await page.locator("#bump-local").click();
    await expect(page.locator("#bump-local")).toHaveText("Local:2");
    await expect(page.locator("#effect-runs")).toHaveText("EffectRuns:1");
    await expect(page.locator("#router-ref-changes")).toHaveText("RefChanges:0");

    // 3. <Link target="_blank"> skips hover prefetch and opens a new tab without hijacking current tab
    const rscPrefetchUrls: string[] = [];
    const prefetchListener = (req: { url: () => string }) => {
      if (/\/____rsc_page(?:_old)?(?:_static)?____\//.test(req.url())) {
        rscPrefetchUrls.push(req.url());
      }
    };
    page.on("request", prefetchListener);
    await page.locator("#link-blank").hover();
    await page.locator("#link-download").hover();
    await page.waitForTimeout(150);
    expect(
      rscPrefetchUrls.some((u) => u.includes("/report") || u.includes("/report.txt"))
    ).toBe(false);
    page.off("request", prefetchListener);

    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.locator("#link-blank").click(),
    ]);
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(`${baseUrl}/report`);
    await expect(popup.locator("#report-page")).toContainText("Report Opened");
    await expect(page).toHaveURL(`${baseUrl}/`);
    await popup.close();

    // 4. <Link target="_self"> performs normal SPA navigation in current tab
    await page.locator("#link-self").click();
    await expect(page).toHaveURL(`${baseUrl}/report`);
    await expect(page.locator("#report-page")).toContainText("Report Opened");
    await page.locator("#report-back-home").click();
    await expect(page).toHaveURL(`${baseUrl}/`);

    // 5. <Link download> triggers browser file download instead of SPA navigation
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#link-download").click(),
    ]);
    expect(download.suggestedFilename()).toBe("report.txt");
    await expect(page).toHaveURL(`${baseUrl}/`);

    // 6. Plain <a> global listener respects target="_blank", target="_self", and download
    const [anchorPopup] = await Promise.all([
      context.waitForEvent("page"),
      page.locator("#anchor-blank").click(),
    ]);
    await anchorPopup.waitForLoadState();
    await expect(anchorPopup).toHaveURL(`${baseUrl}/report`);
    await expect(page).toHaveURL(`${baseUrl}/`);
    await anchorPopup.close();

    const [anchorDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#anchor-download").click(),
    ]);
    expect(anchorDownload.suggestedFilename()).toBe("anchor-report.txt");
    await expect(page).toHaveURL(`${baseUrl}/`);

    // Plain <a target="_self"> should SPA-navigate (not trigger full reload)
    await page.evaluate(() => {
      (window as any).__DINOU_SPA_MARKER__ = "alive";
    });
    await page.locator("#anchor-self").click();
    await expect(page).toHaveURL(`${baseUrl}/report`);
    const spaAliveAfterAnchorSelf = await page.evaluate(
      () => (window as any).__DINOU_SPA_MARKER__
    );
    expect(spaAliveAfterAnchorSelf).toBe("alive");
    await page.locator("#report-back-home").click();
    await expect(page).toHaveURL(`${baseUrl}/`);

    // 7. Hash + fresh navigation sends ?____v____ in query string (not after #hash) and busts cache
    const rscRequests: string[] = [];
    page.on("request", (req) => {
      if (/\/____rsc_page(?:_old)?(?:_static)?____\/counter-page/.test(req.url())) {
        rscRequests.push(req.url());
      }
    });
    await page.locator("#link-hash-fresh").click();
    await expect(page).toHaveURL(`${baseUrl}/counter-page#target-sec`);
    await expect(page.locator("#hit-count")).toHaveText("Hits:1");

    await page.locator("#back-home").click();
    await expect(page).toHaveURL(`${baseUrl}/`);

    await page.locator("#link-hash-fresh").click();
    await expect(page).toHaveURL(`${baseUrl}/counter-page#target-sec`);
    await expect(page.locator("#hit-count")).toHaveText("Hits:2");
    expect(rscRequests.length).toBeGreaterThanOrEqual(2);
    expect(rscRequests.every((u) => !u.includes("#target-sec"))).toBe(true);
    expect(
      rscRequests.some((u) => u.includes("____v____=") && !u.includes("#target-sec"))
    ).toBe(true);

    // 8A. SPA navigation to /guarded redirects cleanly via x-rsc-redirect without 500 error
    await page.locator("#back-home").click();
    await expect(page).toHaveURL(`${baseUrl}/`);
    await page.locator("#link-guarded").click();
    await expect(page).toHaveURL(`${baseUrl}/login`);
    await expect(page.locator("#login-page")).toHaveText("Please Sign In");

    // 8B. SPA navigation to /layout-guarded redirects cleanly via x-rsc-redirect without 500 error
    await page.goto(baseUrl);
    await page.waitForSelector('body[data-hydrated="true"]', { state: "attached" });
    await page.locator("#link-layout-guarded").click();
    await expect(page).toHaveURL(`${baseUrl}/login`);
    await expect(page.locator("#login-page")).toHaveText("Please Sign In");

    // 9A. router.push("http://...") navigates externally without SecurityError
    await page.goto(baseUrl);
    await page.waitForSelector('body[data-hydrated="true"]', { state: "attached" });
    await page.locator("#btn-external-push").click();
    await expect(page).toHaveURL(`http://127.0.0.1:${externalPort}/external-landing`);
    await expect(page.locator("#external-ok")).toHaveText("External:/external-landing");

    // 9B. router.replace("http://...") navigates externally without SecurityError
    await page.goto(baseUrl);
    await page.waitForSelector('body[data-hydrated="true"]', { state: "attached" });
    await page.locator("#btn-external-replace").click();
    await expect(page).toHaveURL(`http://127.0.0.1:${externalPort}/external-replace`);
    await expect(page.locator("#external-ok")).toHaveText("External:/external-replace");

    // 9C. <ClientRedirect to="http://..." /> navigates externally without SecurityError
    await page.goto(baseUrl);
    await page.waitForSelector('body[data-hydrated="true"]', { state: "attached" });
    await page.locator("#btn-external-client-redirect").click();
    await expect(page).toHaveURL(
      `http://127.0.0.1:${externalPort}/external-client-redirect`
    );
    await expect(page.locator("#external-ok")).toHaveText(
      "External:/external-client-redirect"
    );

    expect(pageErrors).toEqual([]);
    expect(hydrationErrors).toEqual([]);
  });

  test("2. dinou export-static: useSearchParams() hydrates with zero #418 errors on both SSG and ppr=true zero-hole pages", async ({
    page,
  }) => {
    fixtureRoot = setupE2EFixture(0);

    const exportRun = spawnSync(
      process.execPath,
      [path.join(DINOU_ROOT, "cli.js"), "export-static"],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(exportRun.status, `${exportRun.stdout}\n${exportRun.stderr}`).toBe(0);

    const outDir = path.join(fixtureRoot, "out");
    expect(fs.existsSync(path.join(outDir, "search-static", "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "ppr-zero-hole", "index.html"))).toBe(true);

    const staticPort = await getFreePort();
    auxServer = createStaticFileServer(outDir);
    await new Promise<void>((resolve) =>
      auxServer!.listen(staticPort, "127.0.0.1", resolve)
    );

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

    const staticBase = `http://127.0.0.1:${staticPort}`;

    // Static SSG page with query params
    await page.goto(`${staticBase}/search-static?q=dinou&page=2`);
    await page.waitForSelector('body[data-hydrated="true"]', { state: "attached" });
    const isStaticFlag1 = await page.evaluate(
      () => Boolean((window as any).__DINOU_STATIC_EXPORT__)
    );
    expect(isStaticFlag1).toBe(true);
    await expect(page.locator("#search-viewer")).toHaveText("ssg|q=dinou|page=2");

    // Exported ppr = true zero-hole page with query params
    await page.goto(`${staticBase}/ppr-zero-hole?q=ppr-ok&page=7`);
    await page.waitForSelector('body[data-hydrated="true"]', { state: "attached" });
    const isStaticFlag2 = await page.evaluate(
      () => Boolean((window as any).__DINOU_STATIC_EXPORT__)
    );
    expect(isStaticFlag2).toBe(true);
    await expect(page.locator("#search-viewer")).toHaveText(
      "ppr-zero-hole|q=ppr-ok|page=7"
    );

    expect(pageErrors).toEqual([]);
    expect(hydrationErrors).toEqual([]);
  });

  test("3. Webpack client-webpack.jsx browser parity: <Link target/download>, hash+fresh, SPA redirect & external router.push()", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Webpack client-webpack.jsx parity check runs once in chromium; cross-browser behavior is covered by Test 1 & 2"
    );

    const externalPort = await getFreePort();
    auxServer = http.createServer((req, res) => {
      const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<html><body><h1 id="external-ok">External:${pathname}</h1></body></html>`);
    });
    await new Promise<void>((resolve) =>
      auxServer!.listen(externalPort, "127.0.0.1", resolve)
    );

    fixtureRoot = setupE2EFixture(externalPort);

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

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(baseUrl);
    await page.waitForSelector('body[data-hydrated="true"]', { state: "attached" });

    // target="_blank" popup
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.locator("#link-blank").click(),
    ]);
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(`${baseUrl}/report`);
    await popup.close();

    // download
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#link-download").click(),
    ]);
    expect(download.suggestedFilename()).toBe("report.txt");

    // hash + fresh
    const rscRequests: string[] = [];
    page.on("request", (req) => {
      if (/\/____rsc_page(?:_old)?(?:_static)?____\/counter-page/.test(req.url())) {
        rscRequests.push(req.url());
      }
    });
    await page.locator("#link-hash-fresh").click();
    await expect(page).toHaveURL(`${baseUrl}/counter-page#target-sec`);
    await expect(page.locator("#hit-count")).toHaveText("Hits:1");
    await page.locator("#back-home").click();
    await page.locator("#link-hash-fresh").click();
    await expect(page.locator("#hit-count")).toHaveText("Hits:2");
    expect(rscRequests.length).toBeGreaterThanOrEqual(2);
    expect(rscRequests.every((u) => !u.includes("#target-sec"))).toBe(true);
    expect(
      rscRequests.some((u) => u.includes("____v____=") && !u.includes("#target-sec"))
    ).toBe(true);

    // SPA redirect from getProps()
    await page.locator("#back-home").click();
    await page.locator("#link-guarded").click();
    await expect(page).toHaveURL(`${baseUrl}/login`);

    // External push
    await page.goto(baseUrl);
    await page.waitForSelector('body[data-hydrated="true"]', { state: "attached" });
    await page.locator("#btn-external-push").click();
    await expect(page).toHaveURL(`http://127.0.0.1:${externalPort}/external-landing`);

    expect(pageErrors).toEqual([]);
  });
});
