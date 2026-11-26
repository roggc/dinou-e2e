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

test("2. [Phase 8 / Stage 2 / Check #88] Unicode, Spaces & Percent-Encoded Dynamic Parameters Across 3D Cube SSG/ISG, RSC Endpoints, <DinouCacheSlot>, revalidate*() & Distributed Storage (Esbuild, Rollup, Webpack)", async () => {
  const bundlers = ["esbuild", "rollup", "webpack"];
  for (const bundler of bundlers) {
    const tmpApp = createFixtureDir(`p8-s2-encoded-${bundler}-`);
    try {
      writeDinouShim(tmpApp);
      fs.writeFileSync(
        path.join(tmpApp, "package.json"),
        JSON.stringify(
          { name: `p8-s2-encoded-${bundler}`, private: true, type: "module" },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(tmpApp, "p8s2-state.json"),
        JSON.stringify({
          l1Shell: 100,
          catCafe: 100,
          catHello: 100,
          catTokyo: 100,
          cremeShell: 100,
          cremeHole: 100,
          cremeSlot: 100,
          cppShell: 100,
          cppHole: 100,
          cppSlot: 100,
          ramenShell: 100,
          ramenHole: 100,
          ramenSlot: 100,
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
const FILE = path.resolve(process.cwd(), "p8s2-state.json");
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
      <head><meta charSet="UTF-8" /><title>P8S2</title></head>
      <body>{children}</body>
    </html>
  );
}
`
      );
      write("src/page.tsx", `export default function Home() { return <main>home</main>; }\n`);

      write(
        "src/enc/actions.ts",
        `"use server";
import { revalidateLayout, revalidatePage, revalidatePath, revalidateTag } from "dinou/server";
import { writeS } from "../state";

export async function revalRelativePage(patch: Record<string, any>) {
  writeS(patch);
  await revalidatePage("./");
  return { ok: true };
}

export async function revalRelativeParentLayout(patch: Record<string, any>) {
  writeS(patch);
  await revalidateLayout("..");
  return { ok: true };
}

export async function revalPageExplicit(target: string, patch: Record<string, any>) {
  writeS(patch);
  await revalidatePage(target);
  return { ok: true, target };
}

export async function revalPathExplicit(target: string, patch: Record<string, any>) {
  writeS(patch);
  await revalidatePath(target);
  return { ok: true, target };
}

export async function revalTagExplicit(tag: string, patch: Record<string, any>) {
  writeS(patch);
  await revalidateTag(tag);
  return { ok: true, tag };
}
`
      );
      write(
        "src/enc/anchors.tsx",
        `"use client";
import {
  revalRelativePage,
  revalRelativeParentLayout,
  revalPageExplicit,
  revalPathExplicit,
  revalTagExplicit,
} from "./actions";
export function EncAnchors() {
  void revalRelativePage;
  void revalRelativeParentLayout;
  void revalPageExplicit;
  void revalPathExplicit;
  void revalTagExplicit;
  return <span id="enc-anchors">ok</span>;
}
`
      );

      write(
        "src/enc/layout_functions.ts",
        `export const ppr = true;
export const revalidate = 3600;
export function getCacheTags() { return ["enc-l1"]; }
`
      );
      write(
        "src/enc/layout.tsx",
        `import type { ReactNode } from "react";
import { readS } from "../state";
import { EncAnchors } from "./anchors";
export default function EncL1({ children }: { children: ReactNode }) {
  const s = readS();
  return <section id="enc-l1"><span id="enc-l1-seq">{s.l1Shell}</span><EncAnchors /><div>{children}</div></section>;
}
`
      );

      write(
        "src/enc/[category]/layout_functions.ts",
        `export const ppr = true;
export const revalidate = 3600;
export function getStaticPaths() { return ["café", "hello world"]; }
export function getCacheTags(params: { category: string }) { return [\`enc-cat-\${params.category}\`]; }
`
      );
      write(
        "src/enc/[category]/layout.tsx",
        `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function EncCatL2({ children, params }: { children: ReactNode; params: { category: string } }) {
  const s = readS();
  const cat = params?.category || "";
  const seq = cat === "café" ? s.catCafe : cat === "hello world" ? s.catHello : s.catTokyo;
  return <section id="enc-cat"><span id="enc-cat-param">{cat}</span><span id="enc-cat-seq">{seq}</span><div>{children}</div></section>;
}
`
      );

      write(
        "src/enc/[category]/[slug]/page_functions.ts",
        `export const ppr = true;
export const revalidate = 3600;
export function getStaticPaths() {
  return [
    { category: "café", slug: "crème brûlée" },
    { category: "hello world", slug: "c++ guide" },
  ];
}
export function getCacheTags(params: { category: string; slug: string }) {
  return [\`enc-page-\${params.category}-\${params.slug}\`];
}
`
      );
      write(
        "src/enc/[category]/[slug]/page.tsx",
        `import { Suspense } from "react";
import { DinouCacheSlot, getContext } from "dinou/server";
import { readS } from "../../../state";

function pick(slug: string) {
  const s = readS();
  if (slug === "crème brûlée") return { shell: s.cremeShell, hole: s.cremeHole, slot: s.cremeSlot };
  if (slug === "c++ guide") return { shell: s.cppShell, hole: s.cppHole, slot: s.cppSlot };
  return { shell: s.ramenShell, hole: s.ramenHole, slot: s.ramenSlot };
}

async function Hole({ category, slug }: { category: string; slug: string }) {
  const reqTag = String(getContext()?.req?.headers?.["x-enc"] || "live");
  const p = pick(slug);
  return (
    <div id="enc-hole" data-tag={reqTag}>
      <span id="enc-hole-cat">{category}</span>
      <span id="enc-hole-slug">{slug}</span>
      <span id="enc-hole-seq">{p.hole}</span>
    </div>
  );
}

export default function EncPage({ params }: { params: { category: string; slug: string } }) {
  const cat = params?.category || "";
  const slug = params?.slug || "";
  const p = pick(slug);
  const slotId = \`enc-slot-\${cat}-\${slug}\`;
  const slotTag = \`enc-slot-tag-\${slug}\`;
  return (
    <article id="enc-page">
      <span id="enc-page-cat">{cat}</span>
      <span id="enc-page-slug">{slug}</span>
      <span id="enc-page-shell-seq">{p.shell}</span>
      <DinouCacheSlot id={slotId} tags={[slotTag]} revalidate={3600}>
        {async () => <div id="enc-slot"><span id="enc-slot-seq">{pick(slug).slot}</span></div>}
      </DinouCacheSlot>
      <Suspense fallback={<div>fb</div>}><Hole category={cat} slug={slug} /></Suspense>
    </article>
  );
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

      const verifyScript = path.join(tmpApp, "_verify_p8s2.mjs");
      fs.writeFileSync(
        verifyScript,
        `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BUNDLER = ${JSON.stringify(bundler)};
const DINOU_ROOT = ${JSON.stringify(DINOU_ROOT)};
const STATE_FILE = path.resolve(process.cwd(), "p8s2-state.json");
const POISON = 999777;

function writeS(patch) {
  const cur = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...cur, ...patch }), "utf8");
}
function textById(html, id) {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
}

const storageMod = await import(pathToFileURL(path.join(DINOU_ROOT, "core", "storage-adapter.js")).href);
const { FileSystemStorage, RedisStorage, setStorageAdapter } = storageMod;
const dist2Dir = path.resolve(process.cwd(), ".dinou/dist2");
setStorageAdapter(new FileSystemStorage(dist2Dir));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(process.cwd(), ".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(process.cwd(), ".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const platformContext = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const sfManifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), ".dinou/dist1/server-functions-manifest.json"), "utf8"));
const actionKey = Object.keys(sfManifest).find((k) => k.replace(/\\\\/g, "/").endsWith("src/enc/actions.ts"));
assert.ok(actionKey, \`[\${BUNDLER}] actions.ts missing from manifest\`);

async function req(urlPath, init = {}) {
  const res = await rscMod.handleRequest(new Request(\`http://localhost:3000\${urlPath}\`, init), platformContext);
  return { status: res.status, headers: res.headers, text: await res.text() };
}

async function callSf(exportName, args, currentPath) {
  return req("/____server_function____", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "x-server-function-call": "1",
      "x-dinou-current-path": currentPath,
    },
    body: JSON.stringify({ id: \`file:///\${actionKey.replace(/\\\\/g, "/").replace(/^\\/+/, "")}#\${exportName}\`, args }),
  });
}

// 1. SSG Canonical Hit on Percent-Encoded, Spaces, Plus Signs & Trailing Slashes (with poisoned state!)
writeS({ l1Shell: POISON, catCafe: POISON, catHello: POISON, cremeShell: POISON, cppShell: POISON, cremeHole: 111, cppHole: 112 });

const ssrCafe = await req("/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e");
assert.equal(ssrCafe.status, 200);
assert.equal(textById(ssrCafe.text, "enc-l1-seq"), "100", \`[\${BUNDLER}] Direct SSR /enc/caf%C3%A9/... MUST hit SSG L1 (no POISON!)\`);
assert.equal(textById(ssrCafe.text, "enc-cat-param"), "café");
assert.equal(textById(ssrCafe.text, "enc-cat-seq"), "100", \`[\${BUNDLER}] Direct SSR /enc/caf%C3%A9/... MUST hit SSG L2 (no POISON!)\`);
assert.equal(textById(ssrCafe.text, "enc-page-slug"), "crème brûlée");
assert.equal(textById(ssrCafe.text, "enc-page-shell-seq"), "100", \`[\${BUNDLER}] Direct SSR /enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e MUST hit SSG Page shell (no shadow ISG rebuild!)\`);
assert.equal(textById(ssrCafe.text, "enc-hole-slug"), "crème brûlée");
assert.equal(textById(ssrCafe.text, "enc-hole-seq"), "111");
assert.ok(!ssrCafe.text.includes(String(POISON)));

// Trailing slash hits the EXACT same canonical SSG artifact!
const ssrCafeTrail = await req("/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e/");
assert.equal(ssrCafeTrail.status, 200);
assert.equal(textById(ssrCafeTrail.text, "enc-page-shell-seq"), "100");
assert.ok(!ssrCafeTrail.text.includes(String(POISON)));

// Plus sign & space route hits SSG!
const ssrCpp = await req("/enc/hello%20world/c%2B%2B%20guide");
assert.equal(ssrCpp.status, 200);
assert.equal(textById(ssrCpp.text, "enc-cat-param"), "hello world");
assert.equal(textById(ssrCpp.text, "enc-page-slug"), "c++ guide");
assert.equal(textById(ssrCpp.text, "enc-page-shell-seq"), "100");
assert.ok(!ssrCpp.text.includes(String(POISON)));

// ZERO percent-encoded shadow folders created inside .dinou/dist2/enc!
const encDist2Entries = fs.readdirSync(path.join(dist2Dir, "enc"));
assert.ok(
  !encDist2Entries.some((name) => name.includes("%")),
  \`[\${BUNDLER}] Must NOT create percent-encoded shadow folders in .dinou/dist2/enc: \${JSON.stringify(encDist2Entries)}\`
);

// 2. /____rsc_page____ & /____rsc_layout____ parity on percent-encoded URLs!
const rscPageCafe = await req("/____rsc_page____/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e");
assert.equal(rscPageCafe.status, 200);
assert.ok(rscPageCafe.text.includes("crème brûlée"), \`[\${BUNDLER}] /____rsc_page____ must emit decoded slug 'crème brûlée'\`);
assert.ok(!rscPageCafe.text.includes("cr%C3%A8me"), \`[\${BUNDLER}] /____rsc_page____ must NOT leak percent-encoded slug\`);
assert.ok(!rscPageCafe.text.includes(String(POISON)), \`[\${BUNDLER}] /____rsc_page____ must hit cached SSG shell (no POISON!)\`);

const rscLayoutCafe = await req("/____rsc_layout____/enc/caf%C3%A9");
assert.equal(rscLayoutCafe.status, 200);
assert.ok(rscLayoutCafe.text.includes("café"));
assert.ok(!rscLayoutCafe.text.includes(String(POISON)));

// 3. On-Demand ISG with Non-Latin-1 CJK Unicode (東京 / ramen bowl)!
writeS({ catTokyo: 120, ramenShell: 121, ramenHole: 122, ramenSlot: 123, l1Shell: POISON });
const ssrTokyo1 = await req("/enc/%E6%9D%B1%E4%BA%AC/ramen%20bowl");
assert.equal(ssrTokyo1.status, 200);
assert.equal(textById(ssrTokyo1.text, "enc-cat-param"), "東京");
assert.equal(textById(ssrTokyo1.text, "enc-page-slug"), "ramen bowl");
assert.equal(textById(ssrTokyo1.text, "enc-page-shell-seq"), "121");
assert.equal(textById(ssrTokyo1.text, "enc-slot-seq"), "123");
assert.equal(textById(ssrTokyo1.text, "enc-hole-seq"), "122");
assert.equal(textById(ssrTokyo1.text, "enc-l1-seq"), "100");

// Second request with poisoned state hits canonical decoded ISG cache!
writeS({ catTokyo: POISON, ramenShell: POISON, ramenHole: 125 });
const ssrTokyo2 = await req("/enc/%E6%9D%B1%E4%BA%AC/ramen%20bowl");
assert.equal(ssrTokyo2.status, 200);
assert.equal(textById(ssrTokyo2.text, "enc-page-shell-seq"), "121");
assert.equal(textById(ssrTokyo2.text, "enc-hole-seq"), "125");
assert.ok(!ssrTokyo2.text.includes(String(POISON)));

// 4. Parameterized <DinouCacheSlot> with Accented & CJK Unicode IDs (NO 404, NO ByteString TypeError!)
writeS({ cremeSlot: 200, ramenSlot: 201, cremeShell: POISON, ramenShell: POISON, l1Shell: POISON });

const slotCafeRes = await req(
  \`/____rsc_slot____/\${encodeURIComponent("enc-slot-café-crème brûlée")}?fresh=1\`,
  { headers: { "x-dinou-current-path": "/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e" } }
);
assert.equal(slotCafeRes.status, 200, \`[\${BUNDLER}] /____rsc_slot____ must decode Unicode/space slotId, got \${slotCafeRes.status}: \${slotCafeRes.text}\`);
assert.ok(slotCafeRes.text.includes("200"));

const slotTokyoRes = await req(
  \`/____rsc_slot____/\${encodeURIComponent("enc-slot-東京-ramen bowl")}?fresh=1\`,
  { headers: { "x-dinou-current-path": "/enc/%E6%9D%B1%E4%BA%AC/ramen%20bowl" } }
);
assert.equal(slotTokyoRes.status, 200, \`[\${BUNDLER}] /____rsc_slot____ with CJK Unicode slotId must return 200 without ByteString header error, got \${slotTokyoRes.status}\`);
assert.ok(slotTokyoRes.text.includes("201"));

const ssrCafeAfterSlot = await req("/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e");
assert.equal(textById(ssrCafeAfterSlot.text, "enc-slot-seq"), "200");
assert.equal(textById(ssrCafeAfterSlot.text, "enc-page-shell-seq"), "100");
assert.ok(!ssrCafeAfterSlot.text.includes(String(POISON)));

// 5. Revalidation Parity: Encoded vs Decoded vs Trailing Slash vs Relative "./" & ".." (with ByteString-safe X-Dinou-Revalidated!)
writeS({ cremeShell: 300, l1Shell: POISON, catCafe: POISON, cppShell: POISON });
await rscMod.revalidatePage("/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e");
const afterEncReval = await req("/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e");
assert.equal(textById(afterEncReval.text, "enc-page-shell-seq"), "300", \`[\${BUNDLER}] Encoded revalidatePage() must update canonical decoded entry\`);
assert.equal(textById(afterEncReval.text, "enc-l1-seq"), "100");
assert.equal(textById(afterEncReval.text, "enc-cat-seq"), "100");

writeS({ cremeShell: 301 });
await rscMod.revalidatePage("/enc/café/crème brûlée/");
const afterDecTrailReval = await req("/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e");
assert.equal(textById(afterDecTrailReval.text, "enc-page-shell-seq"), "301");

// Server Function relative revalidatePage("./") on CJK percent-encoded current path!
const sfRelTokyo = await callSf(
  "revalRelativePage",
  [{ ramenShell: 302, l1Shell: POISON, catTokyo: POISON }],
  "/enc/%E6%9D%B1%E4%BA%AC/ramen%20bowl"
);
assert.equal(sfRelTokyo.status, 200, \`[\${BUNDLER}] Server Function revalidatePage('./') on CJK path must succeed without ByteString error, got \${sfRelTokyo.status}: \${sfRelTokyo.text}\`);
const tokyoHintRaw = sfRelTokyo.headers.get("x-dinou-revalidated");
assert.ok(tokyoHintRaw, \`[\${BUNDLER}] Expected X-Dinou-Revalidated header for CJK route\`);
assert.ok(JSON.parse(tokyoHintRaw).pages.includes("/enc/東京/ramen bowl"));

const afterSfTokyo = await req("/enc/%E6%9D%B1%E4%BA%AC/ramen%20bowl");
assert.equal(textById(afterSfTokyo.text, "enc-page-shell-seq"), "302");
assert.equal(textById(afterSfTokyo.text, "enc-cat-seq"), "120");
assert.equal(textById(afterSfTokyo.text, "enc-l1-seq"), "100");

// Server Function relative revalidateLayout("..") on accented percent-encoded current path!
const sfRelLayoutCafe = await callSf(
  "revalRelativeParentLayout",
  [{ catCafe: 303, l1Shell: POISON, cremeShell: POISON, catHello: POISON }],
  "/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e"
);
assert.equal(sfRelLayoutCafe.status, 200);
const afterSfLayoutCafe = await req("/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e");
assert.equal(textById(afterSfLayoutCafe.text, "enc-cat-seq"), "303");
assert.equal(textById(afterSfLayoutCafe.text, "enc-page-shell-seq"), "301");
assert.equal(textById(afterSfLayoutCafe.text, "enc-l1-seq"), "100");

// 6. Security: Percent-encoded path traversal (%2e%2e / %2f) MUST be rejected!
const travSsr = await req("/enc/%2e%2e/secret");
assert.ok(travSsr.status === 400 || travSsr.status === 403 || travSsr.status === 404, \`Expected traversal rejection, got \${travSsr.status}\`);
const travRsc = await req("/____rsc_page____/enc/%2e%2e/secret");
assert.ok(travRsc.status === 400 || travRsc.status === 403 || travRsc.status === 404);
const travSlot = await req("/____rsc_slot____/%2e%2e%2fsecret");
assert.ok(travSlot.status === 400 || travSlot.status === 403 || travSlot.status === 404);

// 7. Distributed RedisStorage Multi-Pod Parity on Encoded Routes!
if (BUNDLER === "esbuild") {
  const kvStore = new Map();
  const mockRedis = {
    async get(k) { return kvStore.has(k) ? kvStore.get(k) : null; },
    async set(k, v) { kvStore.set(k, v); return "OK"; },
    async del(...ks) { let n = 0; for (const k of ks.flat()) { if (kvStore.delete(k)) n++; } return n; },
    async exists(k) { return kvStore.has(k) ? 1 : 0; },
    async keys(pattern) {
      const prefix = String(pattern || "*").replace(/\\*$/, "");
      return Array.from(kvStore.keys()).filter((k) => k.startsWith(prefix));
    },
  };
  const podA = new RedisStorage(mockRedis, { prefix: "p8s2:", hydrateFromDisk: false });
  setStorageAdapter(podA);
  writeS({ l1Shell: 400, catCafe: 401, cremeShell: 402, cremeHole: 403, cremeSlot: 404 });
  await rscMod.revalidateLayout("/enc");
  await rscMod.revalidateLayout("/enc/caf%C3%A9");
  await rscMod.revalidatePage("/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e");

  // Cold Pod B reads from Redis with poisoned local state -> must hit Pod A's canonical decoded Redis key!
  const podB = new RedisStorage(mockRedis, { prefix: "p8s2:", hydrateFromDisk: false });
  setStorageAdapter(podB);
  writeS({ l1Shell: POISON, catCafe: POISON, cremeShell: POISON, cremeHole: 405 });
  const podBRes = await req("/enc/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e");
  assert.equal(podBRes.status, 200);
  assert.equal(textById(podBRes.text, "enc-l1-seq"), "400");
  assert.equal(textById(podBRes.text, "enc-cat-seq"), "401");
  assert.equal(textById(podBRes.text, "enc-page-shell-seq"), "402");
  assert.equal(textById(podBRes.text, "enc-hole-seq"), "405");
  assert.ok(!podBRes.text.includes(String(POISON)));
}

console.log(\`PHASE8_STAGE2_ENCODED_PARAMS_\${BUNDLER.toUpperCase()}_OK\`);
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
        `[${bundler}] Phase 8 Stage 2 verification failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
      );
      assert.ok(
        runRes.stdout.includes(
          `PHASE8_STAGE2_ENCODED_PARAMS_${bundler.toUpperCase()}_OK`
        )
      );
    } finally {
      removeDirSafe(tmpApp);
    }
  }
});
