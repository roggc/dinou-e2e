import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
      maxRetries: 5,
      retryDelay: 50,
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
        version: "10.0.6",
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

test("1. [Phase 8 / Stage 1 / Check #87] Client Router Cache Coherence Across Server Function revalidate*(), redirect(), <Link prefetch> & PPR/Dynamic Route Re-Visits (Esbuild, Rollup, Webpack)", async () => {
  // Verify client & server-function-proxy parity across Esbuild/Rollup and Webpack core files
  for (const rel of ["core/client.jsx", "core/client-webpack.jsx"]) {
    const src = fs.readFileSync(path.join(DINOU_ROOT, rel), "utf8");
    assert.ok(
      src.includes("__DINOU_INVALIDATE_CLIENT_CACHE__"),
      `${rel} must expose window.__DINOU_INVALIDATE_CLIENT_CACHE__`
    );
    assert.ok(
      src.includes("volatilePageCacheKeys"),
      `${rel} must track volatile (PPR/dynamic) pageCache keys`
    );
    assert.ok(
      src.includes("x-dinou-cache-mode"),
      `${rel} must read x-dinou-cache-mode header on /____rsc_page____`
    );
  }
  for (const rel of [
    "core/server-function-proxy.js",
    "core/server-function-proxy-webpack.js",
  ]) {
    const src = fs.readFileSync(path.join(DINOU_ROOT, rel), "utf8");
    assert.ok(
      src.includes("X-Dinou-Revalidated") || src.includes("x-dinou-revalidated"),
      `${rel} must process X-Dinou-Revalidated header from Server Functions`
    );
    assert.ok(
      src.includes("__DINOU_INVALIDATE_CLIENT_CACHE__"),
      `${rel} must invoke window.__DINOU_INVALIDATE_CLIENT_CACHE__`
    );
    assert.match(
      src,
      /window\.__DINOU_ROUTER_NAVIGATE__\(safeUrl,\s*\{\s*fresh:\s*true\s*\}\)/,
      `${rel} executeRedirect() must navigate with { fresh: true }`
    );
  }

  const bundlers = ["esbuild", "rollup", "webpack"];
  for (const bundler of bundlers) {
    const tmpApp = createFixtureDir(`p8-s1-router-coh-${bundler}-`);
    try {
      writeDinouShim(tmpApp);
      fs.writeFileSync(
        path.join(tmpApp, "package.json"),
        JSON.stringify(
          { name: `p8-s1-router-coh-${bundler}`, private: true, type: "module" },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(tmpApp, "p8s1-state.json"),
        JSON.stringify({
          l1Shell: 100,
          pprAShell: 100,
          pprAHole: 100,
          staticB: 100,
          dynC: 100,
          subL2: 100,
          subPage: 100,
        })
      );

      const write = (rel, content) => {
        const full = path.join(tmpApp, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      };

      write(
        "src/state.ts",
        `import fs from "node:fs";
import path from "node:path";
const FILE = path.resolve(process.cwd(), "p8s1-state.json");
export function readS() {
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}
export function writeS(patch: Record<string, any>) {
  const cur = readS();
  const next = { ...cur, ...patch };
  fs.writeFileSync(FILE, JSON.stringify(next), "utf8");
  return next;
}
`
      );

      write("src/layout_functions.ts", `export const revalidate = 3600;\n`);
      write(
        "src/layout.tsx",
        `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><meta charSet="UTF-8" /><title>P8S1</title></head>
      <body>{children}</body>
    </html>
  );
}
`
      );
      write("src/page.tsx", `export default function Home() { return <main>home</main>; }\n`);

      write(
        "src/rc/actions.ts",
        `"use server";
import { getContext, revalidateLayout, revalidatePage, revalidatePath, revalidateTag } from "dinou/server";
import { writeS } from "../state";

export async function revalPageAction(target: string, patch: Record<string, any>) {
  writeS(patch);
  await revalidatePage(target);
  return { ok: true, target };
}

export async function revalPageAndRedirectAction(target: string, patch: Record<string, any>) {
  writeS(patch);
  await revalidatePage(target);
  getContext()?.res?.redirect(target);
  return { ok: true, target };
}

export async function revalLayoutAction(target: string, patch: Record<string, any>) {
  writeS(patch);
  await revalidateLayout(target);
  return { ok: true, target };
}

export async function revalTagAction(tag: string, patch: Record<string, any>) {
  writeS(patch);
  await revalidateTag(tag);
  return { ok: true, tag };
}

export async function revalPathAction(target: string, patch: Record<string, any>) {
  writeS(patch);
  await revalidatePath(target);
  return { ok: true, target };
}
`
      );

      write(
        "src/rc/client-ref.tsx",
        `"use client";
import {
  revalPageAction,
  revalPageAndRedirectAction,
  revalLayoutAction,
  revalTagAction,
  revalPathAction,
} from "./actions";
export function ActionAnchors() {
  void revalPageAction;
  void revalPageAndRedirectAction;
  void revalLayoutAction;
  void revalTagAction;
  void revalPathAction;
  return <span id="rc-anchors">ok</span>;
}
`
      );

      write(
        "src/rc/layout_functions.ts",
        `export const ppr = true;
export const revalidate = 3600;
export function getCacheTags() { return ["rc-l1"]; }
`
      );
      write(
        "src/rc/layout.tsx",
        `import type { ReactNode } from "react";
import { readS } from "../state";
import { ActionAnchors } from "./client-ref";

export default function RcLayout({ children }: { children: ReactNode }) {
  const s = readS();
  return (
    <section id="rc-l1">
      <span id="rc-l1-seq">{s.l1Shell}</span>
      <ActionAnchors />
      <div>{children}</div>
    </section>
  );
}
`
      );

      write(
        "src/rc/ppr-a/page_functions.ts",
        `export const ppr = true;
export const revalidate = 3600;
export function getCacheTags() { return ["rc-ppr-a"]; }
`
      );
      write(
        "src/rc/ppr-a/page.tsx",
        `import { Suspense } from "react";
import { getContext } from "dinou/server";
import { readS } from "../../state";

async function HoleA() {
  const reqTag = String(getContext()?.req?.headers?.["x-rc"] || "live");
  const s = readS();
  return <div id="rc-ppr-a-hole" data-tag={reqTag}><span id="rc-ppr-a-hole-seq">{s.pprAHole}</span></div>;
}

export default function PprAPage() {
  const s = readS();
  return (
    <article id="rc-ppr-a">
      <span id="rc-ppr-a-shell-seq">{s.pprAShell}</span>
      <Suspense fallback={<div>fb-a</div>}><HoleA /></Suspense>
    </article>
  );
}
`
      );

      write(
        "src/rc/static-b/page_functions.ts",
        `export const revalidate = 3600;
export function getCacheTags() { return ["rc-static-b"]; }
`
      );
      write(
        "src/rc/static-b/page.tsx",
        `import { readS } from "../../state";
export default function StaticBPage() {
  const s = readS();
  return <article id="rc-static-b"><span id="rc-static-b-seq">{s.staticB}</span></article>;
}
`
      );

      write("src/rc/dyn-c/page_functions.ts", `export const revalidate = 0;\n`);
      write(
        "src/rc/dyn-c/page.tsx",
        `import { getContext } from "dinou/server";
import { readS } from "../../state";
export default function DynCPage() {
  const reqTag = String(getContext()?.req?.headers?.["x-rc"] || "live");
  const s = readS();
  return <article id="rc-dyn-c" data-tag={reqTag}><span id="rc-dyn-c-seq">{s.dynC}</span></article>;
}
`
      );

      write(
        "src/rc/sub-layout/layout_functions.ts",
        `export const ppr = true;
export const revalidate = 3600;
export function getCacheTags() { return ["rc-sub-l2"]; }
`
      );
      write(
        "src/rc/sub-layout/layout.tsx",
        `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function SubLayout({ children }: { children: ReactNode }) {
  const s = readS();
  return <section id="rc-sub-l2"><span id="rc-sub-l2-seq">{s.subL2}</span>{children}</section>;
}
`
      );
      write("src/rc/sub-layout/page_functions.ts", `export const revalidate = 3600;\n`);
      write(
        "src/rc/sub-layout/page.tsx",
        `import { readS } from "../../state";
export default function SubPage() {
  const s = readS();
  return <article id="rc-sub-page"><span id="rc-sub-page-seq">{s.subPage}</span></article>;
}
`
      );

      const buildRes = spawnSync(
        process.execPath,
        [CLI_PATH, `build:node:${bundler}`],
        {
          cwd: tmpApp,
          encoding: "utf8",
          env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
          timeout: 120_000,
        }
      );
      assert.equal(
        buildRes.status,
        0,
        `[${bundler}] build:node:${bundler} failed:\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
      );

      const verifyScript = path.join(tmpApp, "_verify_p8s1.mjs");
      fs.writeFileSync(
        verifyScript,
        `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BUNDLER = ${JSON.stringify(bundler)};
const DINOU_ROOT = ${JSON.stringify(DINOU_ROOT)};
const { FileSystemStorage, setStorageAdapter } = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core", "storage-adapter.js")).href
);
setStorageAdapter(new FileSystemStorage(path.resolve(process.cwd(), ".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(process.cwd(), ".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(process.cwd(), ".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const platformContext = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

// Locate action file key in server-functions-manifest.json
const sfManifestPath = path.resolve(process.cwd(), ".dinou/dist1/server-functions-manifest.json");
const sfManifest = JSON.parse(fs.readFileSync(sfManifestPath, "utf8"));
const actionFileKey = Object.keys(sfManifest).find((k) => k.replace(/\\\\/g, "/").endsWith("src/rc/actions.ts"));
assert.ok(actionFileKey, \`[\${BUNDLER}] actions.ts must exist in server-functions-manifest.json\`);

async function callSf(exportName, args, currentPath = "/rc/ppr-a") {
  const res = await rscMod.handleRequest(
    new Request("http://localhost:3000/____server_function____", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
        "x-server-function-call": "1",
        "x-dinou-current-path": currentPath,
      },
      body: JSON.stringify({ id: \`file:///\${actionFileKey.replace(/\\\\/g, "/").replace(/^\\/+/, "")}#\${exportName}\`, args }),
    }),
    platformContext
  );
  return { status: res.status, headers: res.headers, text: await res.text() };
}

async function getReq(urlPath, headers = {}) {
  const res = await rscMod.handleRequest(
    new Request(\`http://localhost:3000\${urlPath}\`, { headers }),
    platformContext
  );
  return { status: res.status, headers: res.headers, text: await res.text() };
}

// 1. X-Dinou-Cache-Mode headers on /____rsc_page____ & inline SSR markers!
const rscStaticB = await getReq("/____rsc_page____/rc/static-b");
assert.equal(rscStaticB.status, 200);
assert.equal(
  rscStaticB.headers.get("x-dinou-cache-mode"),
  "static",
  \`[\${BUNDLER}] /____rsc_page____/rc/static-b must emit X-Dinou-Cache-Mode: static\`
);

const rscPprA = await getReq("/____rsc_page____/rc/ppr-a");
assert.equal(rscPprA.status, 200);
assert.equal(
  rscPprA.headers.get("x-dinou-cache-mode"),
  "ppr",
  \`[\${BUNDLER}] /____rsc_page____/rc/ppr-a must emit X-Dinou-Cache-Mode: ppr\`
);

const rscDynC = await getReq("/____rsc_page____/rc/dyn-c");
assert.equal(rscDynC.status, 200);
assert.equal(
  rscDynC.headers.get("x-dinou-cache-mode"),
  "dynamic",
  \`[\${BUNDLER}] /____rsc_page____/rc/dyn-c must emit X-Dinou-Cache-Mode: dynamic\`
);

const ssrPprA = await getReq("/rc/ppr-a");
assert.equal(ssrPprA.status, 200);
assert.ok(
  ssrPprA.text.includes('__DINOU_PAGE_CACHE_MODE__="ppr"'),
  \`[\${BUNDLER}] Pure PPR SSR must embed window.__DINOU_PAGE_CACHE_MODE__="ppr" for initial inline RSC hydration\`
);

const ssrDynC = await getReq("/rc/dyn-c");
assert.equal(ssrDynC.status, 200);
assert.ok(
  ssrDynC.text.includes('__DINOU_PAGE_CACHE_MODE__="dynamic"'),
  \`[\${BUNDLER}] Dynamic SSR must embed window.__DINOU_PAGE_CACHE_MODE__="dynamic" for initial inline RSC hydration\`
);

// 2. Server Function revalidatePage() emits X-Dinou-Revalidated header targeting /rc/static-b!
const sfPageRes = await callSf("revalPageAction", ["/rc/static-b", { staticB: 200, l1Shell: 999 }]);
assert.equal(sfPageRes.status, 200);
const rawRevalPage = sfPageRes.headers.get("x-dinou-revalidated");
assert.ok(rawRevalPage, \`[\${BUNDLER}] Server Function calling revalidatePage() must emit X-Dinou-Revalidated header\`);
const parsedPageHint = JSON.parse(rawRevalPage);
assert.ok(
  Array.isArray(parsedPageHint.pages) && parsedPageHint.pages.includes("/rc/static-b"),
  \`[\${BUNDLER}] X-Dinou-Revalidated must include /rc/static-b, got: \${rawRevalPage}\`
);

// 3. Server Function revalidatePage() + redirect() emits BOTH X-Dinou-Redirect AND X-Dinou-Revalidated!
const sfRedirRes = await callSf("revalPageAndRedirectAction", ["/rc/static-b", { staticB: 201 }]);
assert.equal(sfRedirRes.headers.get("x-dinou-redirect"), "/rc/static-b");
const rawRevalRedir = sfRedirRes.headers.get("x-dinou-revalidated");
assert.ok(rawRevalRedir, \`[\${BUNDLER}] Redirecting Server Function calling revalidatePage() must also emit X-Dinou-Revalidated\`);
assert.ok(JSON.parse(rawRevalRedir).pages.includes("/rc/static-b"));

// 4. Server Function revalidateLayout() emits X-Dinou-Revalidated with layouts: ["/rc/sub-layout"]!
const sfLayoutRes = await callSf("revalLayoutAction", ["/rc/sub-layout", { subL2: 202, l1Shell: 999, subPage: 999 }]);
assert.equal(sfLayoutRes.status, 200);
const rawRevalLayout = sfLayoutRes.headers.get("x-dinou-revalidated");
assert.ok(rawRevalLayout, \`[\${BUNDLER}] Server Function calling revalidateLayout() must emit X-Dinou-Revalidated\`);
assert.ok(
  Array.isArray(JSON.parse(rawRevalLayout).layouts) &&
    JSON.parse(rawRevalLayout).layouts.includes("/rc/sub-layout"),
  \`[\${BUNDLER}] X-Dinou-Revalidated must include layouts: ["/rc/sub-layout"], got: \${rawRevalLayout}\`
);

// 5. Server Function revalidateTag() emits X-Dinou-Revalidated covering affected pages/layouts!
const sfTagRes = await callSf("revalTagAction", ["rc-static-b", { staticB: 203 }]);
assert.equal(sfTagRes.status, 200);
const rawRevalTag = sfTagRes.headers.get("x-dinou-revalidated");
assert.ok(rawRevalTag, \`[\${BUNDLER}] Server Function calling revalidateTag() must emit X-Dinou-Revalidated\`);
const parsedTagHint = JSON.parse(rawRevalTag);
assert.ok(
  parsedTagHint.allPages ||
    (Array.isArray(parsedTagHint.pages) && parsedTagHint.pages.includes("/rc/static-b")),
  \`[\${BUNDLER}] X-Dinou-Revalidated for revalidateTag("rc-static-b") must invalidate /rc/static-b, got: \${rawRevalTag}\`
);

// 6. Server Function revalidatePath() emits X-Dinou-Revalidated covering both page & layout!
const sfPathRes = await callSf("revalPathAction", ["/rc/sub-layout", { subL2: 204, subPage: 204 }]);
assert.equal(sfPathRes.status, 200);
const rawRevalPath = sfPathRes.headers.get("x-dinou-revalidated");
assert.ok(rawRevalPath, \`[\${BUNDLER}] Server Function calling revalidatePath() must emit X-Dinou-Revalidated\`);
const parsedPathHint = JSON.parse(rawRevalPath);
assert.ok(parsedPathHint.pages?.includes("/rc/sub-layout"));
assert.ok(parsedPathHint.layouts?.includes("/rc/sub-layout"));

console.log(\`PHASE8_STAGE1_ROUTER_COHERENCE_\${BUNDLER.toUpperCase()}_OK\`);
`,
        "utf8"
      );

      const runRes = spawnSync(process.execPath, [verifyScript], {
        cwd: tmpApp,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
        timeout: 90_000,
      });
      assert.equal(
        runRes.status,
        0,
        `[${bundler}] Phase 8 Stage 1 verification failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
      );
      assert.ok(
        runRes.stdout.includes(
          `PHASE8_STAGE1_ROUTER_COHERENCE_${bundler.toUpperCase()}_OK`
        )
      );
    } finally {
      removeDirSafe(tmpApp);
    }
  }
});
