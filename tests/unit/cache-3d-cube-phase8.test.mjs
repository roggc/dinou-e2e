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

test("3. [Phase 8 / Stage 3 / Check #89] HTTP HEAD Method Semantics (RFC 9110) & Custom HTTP Headers (Cache-Control, Vary, X-*) Preservation Across 3D Cube (Esbuild, Rollup, Webpack)", async () => {
  const bundlers = ["esbuild", "rollup", "webpack"];
  for (const bundler of bundlers) {
    const tmpApp = createFixtureDir(`p8-s3-head-headers-${bundler}-`);
    try {
      writeDinouShim(tmpApp);
      fs.writeFileSync(
        path.join(tmpApp, "package.json"),
        JSON.stringify(
          { name: `p8-s3-head-headers-${bundler}`, private: true, type: "module" },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(tmpApp, "p8s3-state.json"),
        JSON.stringify({
          l1Shell: 100,
          staticSeq: 100,
          staticSlot: 100,
          pprShell: 100,
          pprHole: 100,
          pprHoleExecs: 0,
          asymL2: 100,
          asymShell: 100,
          asymHole: 100,
          dynSeq: 100,
          tombSeq: 100,
          tombMode: "none",
          coldStaticSeq: 100,
          coldPprSeq: 100,
          coldPprRedirect: false,
        })
      );

      const write = (rel, content) => {
        const full = path.join(tmpApp, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      };

      write(
        "dinou.config.mjs",
        `import { defineConfig } from "dinou/config";
export default defineConfig({
  plugins: [
    {
      name: "p8s3-headers-plugin",
      async onRequest(request, context) {
        const url = new URL(request.url);
        if (url.pathname === "/api/hh-webhook") {
          context.res.setHeader("X-Cube-Plugin", "plugin-ok");
          return Response.json(
            { ok: true, method: request.method },
            { headers: { "X-Cube-Webhook": "webhook-ok" } }
          );
        }
        context.res.setHeader("X-Cube-Plugin", "plugin-ok");
        if (url.pathname === "/hh/static-page" || url.pathname === "/hh/static-page/") {
          context.res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
          context.res.setHeader("Vary", "Accept-Encoding");
        } else if (url.pathname === "/hh/pure-ppr" || url.pathname === "/hh/pure-ppr/") {
          context.res.setHeader("Cache-Control", "public, max-age=45, stale-while-revalidate=120");
          context.res.setHeader("X-Cube-Ppr-Plugin", "ppr-plugin-ok");
        }
      },
    },
  ],
});
`
      );

      write(
        "src/state.ts",
        `import fs from "node:fs";
import path from "node:path";
const STATE_PATH = path.resolve(process.cwd(), "p8s3-state.json");
export function readS() {
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}
export function bumpPprHoleExecs() {
  const s = readS();
  s.pprHoleExecs = Number(s.pprHoleExecs || 0) + 1;
  fs.writeFileSync(STATE_PATH, JSON.stringify(s), "utf8");
  return s.pprHoleExecs;
}
`
      );

      write(
        "src/layout.tsx",
        `export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head><title>P8S3 HEAD &amp; Headers</title></head>
      <body>{children}</body>
    </html>
  );
}
`
      );
      write(
        "src/page.tsx",
        `export default function Home() { return <main id="home">home</main>; }\n`
      );
      write(
        "src/not_found.tsx",
        `export default function NotFound() { return <div id="hh-not-found">Custom 404</div>; }\n`
      );

      // L1: Static layout (so static-page tests true non-PPR static cache hit while pure-ppr tests handlePprResume)
      write(
        "src/hh/layout_functions.ts",
        `export const ppr = false;
export const revalidate = 3600;
export function getCacheTags() { return ["hh-l1"]; }
`
      );
      write(
        "src/hh/layout.tsx",
        `import { readS } from "../state";
export default function HhLayout({ children }: { children: any }) {
  const s = readS();
  return (
    <section id="hh-l1">
      <span id="hh-l1-seq">{s.l1Shell}</span>
      {children}
    </section>
  );
}
`
      );

      // 1. Static SSG page + CacheSlot
      write(
        "src/hh/static-page/page_functions.ts",
        `export const ppr = false;
export const revalidate = 3600;
export function getCacheTags() { return ["hh-static"]; }
`
      );
      write(
        "src/hh/static-page/page.tsx",
        `import { DinouCacheSlot } from "dinou/server";
import { readS } from "../../state";
export default function StaticPage() {
  const s = readS();
  return (
    <article id="hh-static">
      <span id="hh-static-seq">{s.staticSeq}</span>
      <DinouCacheSlot id="hh-static-slot" tags={["hh-static-slot-tag"]} revalidate={3600}>
        {async () => {
          const live = readS();
          return <span id="hh-static-slot-seq">{live.staticSlot}</span>;
        }}
      </DinouCacheSlot>
    </article>
  );
}
`
      );

      // 2. Pure PPR page with dynamic hole counter
      write(
        "src/hh/pure-ppr/page_functions.ts",
        `export const ppr = true;
export const revalidate = 3600;
export function getCacheTags() { return ["hh-pure-ppr"]; }
`
      );
      write(
        "src/hh/pure-ppr/page.tsx",
        `import { Suspense } from "react";
import { getContext } from "dinou/server";
import { readS, bumpPprHoleExecs } from "../../state";

async function PprHole() {
  const ctx = getContext();
  const _ua = ctx?.req?.headers?.["user-agent"] || "none";
  const execs = bumpPprHoleExecs();
  const s = readS();
  return (
    <div id="hh-ppr-hole" data-ua={_ua ? "1" : "0"}>
      <span id="hh-ppr-hole-seq">{s.pprHole}</span>
      <span id="hh-ppr-hole-execs">{execs}</span>
    </div>
  );
}

export default function PurePprPage() {
  const s = readS();
  return (
    <article id="hh-pure-ppr">
      <span id="hh-ppr-shell-seq">{s.pprShell}</span>
      <Suspense fallback={<div id="hh-ppr-fb">loading</div>}>
        <PprHole />
      </Suspense>
    </article>
  );
}
`
      );

      // 3. Asymmetric 3D PPR: L1(S PPR) -> L2(D) -> Page(S PPR)
      write(
        "src/hh/asym-l2/layout_functions.ts",
        `import { getContext } from "dinou/server";
import { readS } from "../../state";
export const revalidate = 0;
export async function getProps() {
  const s = readS();
  const ctx = getContext();
  ctx?.res?.setHeader("Vary", "Accept-Language");
  ctx?.res?.setHeader("X-Cube-Asym-L2", \`asym-l2-v\${s.asymL2}\`);
  return { l2Seq: s.asymL2 };
}
`
      );
      write(
        "src/hh/asym-l2/layout.tsx",
        `export default function AsymL2({ children, l2Seq }: any) {
  return <div id="hh-asym-l2"><span id="hh-asym-l2-seq">{l2Seq}</span>{children}</div>;
}
`
      );
      write(
        "src/hh/asym-l2/page_functions.ts",
        `export const ppr = true;
export const revalidate = 3600;
export function getCacheTags() { return ["hh-asym-page"]; }
`
      );
      write(
        "src/hh/asym-l2/page.tsx",
        `import { Suspense } from "react";
import { getContext } from "dinou/server";
import { readS } from "../../state";

async function AsymHole() {
  const ctx = getContext();
  const _lang = ctx?.req?.headers?.["accept-language"] || "en";
  const s = readS();
  ctx?.res?.setHeader("X-Cube-Asym-Hole", \`asym-hole-v\${s.asymHole}\`);
  return <div id="hh-asym-hole" data-lang={_lang}><span id="hh-asym-hole-seq">{s.asymHole}</span></div>;
}

export default function AsymPage() {
  const s = readS();
  return (
    <article id="hh-asym-page">
      <span id="hh-asym-shell-seq">{s.asymShell}</span>
      <Suspense fallback={<div>fb</div>}>
        <AsymHole />
      </Suspense>
    </article>
  );
}
`
      );

      // 4. Dynamic page (revalidate = 0)
      write(
        "src/hh/dyn-page/page_functions.ts",
        `import { getContext } from "dinou/server";
import { readS } from "../../state";
export const revalidate = 0;
export async function getProps() {
  const s = readS();
  const ctx = getContext();
  ctx?.res?.setHeader("Vary", "Accept-Language");
  ctx?.res?.setHeader("X-Cube-Dyn", \`dyn-v\${s.dynSeq}\`);
  ctx?.res?.setHeader("Cache-Control", "private, max-age=30");
  return { dynSeq: s.dynSeq };
}
`
      );
      write(
        "src/hh/dyn-page/page.tsx",
        `export default function DynPage({ dynSeq }: any) {
  return <article id="hh-dyn"><span id="hh-dyn-seq">{dynSeq}</span></article>;
}
`
      );

      // 5. Mid-ISR Tombstone page (200 -> 404 -> 410 -> 302 -> 200)
      write(
        "src/hh/tombstone/page_functions.ts",
        `export const ppr = false;
export const revalidate = 3600;
export function getCacheTags() { return ["hh-tomb"]; }
`
      );
      write(
        "src/hh/tombstone/page.tsx",
        `import { getContext } from "dinou/server";
import { readS } from "../../state";
export default function TombstonePage() {
  const s = readS();
  const ctx = getContext();
  if (s.tombMode === "404") {
    ctx?.res?.status(404);
    ctx?.res?.setHeader("X-Cube-NotFound", "nf-404");
    return <article id="hh-tomb" data-mode="404"><span id="hh-tomb-seq">{s.tombSeq}</span></article>;
  }
  if (s.tombMode === "410") {
    ctx?.res?.status(410);
    ctx?.res?.setHeader("X-Cube-Gone", "gone-410");
    return <article id="hh-tomb" data-mode="410"><span id="hh-tomb-seq">{s.tombSeq}</span></article>;
  }
  if (s.tombMode === "302") {
    ctx?.res?.redirect(302, "/hh/static-page");
    return null;
  }
  return <article id="hh-tomb" data-mode="none"><span id="hh-tomb-seq">{s.tombSeq}</span></article>;
}
`
      );

      // 6. Cold On-Demand Static ISG + Cold On-Demand PPR ISG (including redirect on cold PPR)
      write(
        "src/hh/cold-isg/[slug]/page_functions.ts",
        `export const ppr = false;
export const revalidate = 3600;
export function getStaticPaths() { return ["warm"]; }
`
      );
      write(
        "src/hh/cold-isg/[slug]/page.tsx",
        `import { readS } from "../../../state";
export default function ColdIsg({ params }: any) {
  const s = readS();
  return <article id="hh-cold-isg"><span id="hh-cold-slug">{params?.slug}</span><span id="hh-cold-seq">{s.coldStaticSeq}</span></article>;
}
`
      );
      write(
        "src/hh/cold-ppr/[slug]/page_functions.ts",
        `import { getContext } from "dinou/server";
import { readS } from "../../../state";
export const ppr = true;
export const revalidate = 3600;
export function getStaticPaths() { return ["warm"]; }
export async function getProps(params: any) {
  const s = readS();
  if (params?.slug === "redir" && s.coldPprRedirect) {
    getContext()?.res?.redirect(302, "/hh/static-page");
  }
  return { slug: params?.slug, seq: s.coldPprSeq };
}
`
      );
      write(
        "src/hh/cold-ppr/[slug]/page.tsx",
        `import { Suspense } from "react";
import { getContext } from "dinou/server";
async function ColdHole() {
  const ua = getContext()?.req?.headers?.["user-agent"] || "";
  return <span id="hh-cold-ppr-hole" data-ua={ua ? "1" : "0"}>hole</span>;
}
export default function ColdPpr({ slug, seq }: any) {
  return (
    <article id="hh-cold-ppr">
      <span id="hh-cold-ppr-slug">{slug}</span>
      <span id="hh-cold-ppr-seq">{seq}</span>
      <Suspense fallback={<span>fb</span>}><ColdHole /></Suspense>
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
        `[${bundler}] Phase 8 Stage 3 build failed:\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
      );

      const verifyScript = path.join(tmpApp, "verify-p8s3.mjs");
      fs.writeFileSync(
        verifyScript,
        `import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BUNDLER = ${JSON.stringify(bundler)};
const DINOU_ROOT = ${JSON.stringify(DINOU_ROOT)};
const STATE_PATH = path.resolve(process.cwd(), "p8s3-state.json");
const readS = () => JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const writeS = (patch) => {
  const next = { ...readS(), ...patch };
  fs.writeFileSync(STATE_PATH, JSON.stringify(next), "utf8");
  return next;
};
const textById = (html, id) => {
  const m = String(html).match(new RegExp(\`id="\${id}"[^>]*>([^<]*)<\`));
  return m ? m[1] : null;
};

const { FileSystemStorage, setStorageAdapter, getStorageAdapter } = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
);
setStorageAdapter(new FileSystemStorage(path.resolve(".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
const httpAdapter = await import(pathToFileURL(path.join(DINOU_ROOT, "core/http-adapter.js")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const platformContext = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const unhandled = [];
process.on("unhandledRejection", (e) => unhandled.push(String(e)));

async function req(urlPath, { method = "GET", headers = {} } = {}) {
  const res = await rscMod.handleRequest(
    new Request(\`http://localhost:3000\${urlPath}\`, { method, headers }),
    platformContext
  );
  const buf = await res.arrayBuffer();
  const text = new TextDecoder().decode(buf);
  return { status: res.status, headers: res.headers, text, byteLength: buf.byteLength, hasBodyStream: res.body !== null };
}

const POISON = 999777;

// 1. Warm Static SSG Route: GET vs HEAD parity + custom Cache-Control, Vary, X-Cube-Plugin
const staticGet = await req("/hh/static-page");
assert.equal(staticGet.status, 200);
assert.equal(textById(staticGet.text, "hh-static-seq"), "100");
assert.equal(staticGet.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(staticGet.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
assert.equal(staticGet.headers.get("vary"), "Accept-Encoding");
assert.ok((staticGet.headers.get("content-type") || "").includes("text/html"));

const staticHead = await req("/hh/static-page", { method: "HEAD" });
assert.equal(staticHead.status, 200, \`[\${BUNDLER}] HEAD /hh/static-page must return 200\`);
assert.equal(staticHead.byteLength, 0, \`[\${BUNDLER}] HEAD /hh/static-page MUST have empty body, got \${staticHead.byteLength} bytes\`);
assert.equal(staticHead.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(staticHead.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
assert.equal(staticHead.headers.get("vary"), "Accept-Encoding");
assert.ok((staticHead.headers.get("content-type") || "").includes("text/html"));

// 2. Warm Pure PPR Route: GET vs HEAD parity + custom Cache-Control (+ no-transform) + ZERO hole executions on HEAD!
const pprGet1 = await req("/hh/pure-ppr");
assert.equal(pprGet1.status, 200);
assert.equal(textById(pprGet1.text, "hh-ppr-shell-seq"), "100");
assert.equal(textById(pprGet1.text, "hh-ppr-hole-seq"), "100");
assert.equal(pprGet1.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(pprGet1.headers.get("x-cube-ppr-plugin"), "ppr-plugin-ok");
assert.ok(
  (pprGet1.headers.get("cache-control") || "").includes("public, max-age=45, stale-while-revalidate=120"),
  \`[\${BUNDLER}] Pure PPR must preserve plugin Cache-Control directives, got: \${pprGet1.headers.get("cache-control")}\`
);
assert.ok(
  /\\bno-transform\\b/i.test(pprGet1.headers.get("cache-control") || ""),
  \`[\${BUNDLER}] Pure PPR must append no-transform to Cache-Control, got: \${pprGet1.headers.get("cache-control")}\`
);

const execsBeforeHead = readS().pprHoleExecs;
const pprHead = await req("/hh/pure-ppr", { method: "HEAD" });
await new Promise((r) => setTimeout(r, 80));
const execsAfterHead = readS().pprHoleExecs;
assert.equal(pprHead.status, 200);
assert.equal(pprHead.byteLength, 0, \`[\${BUNDLER}] HEAD /hh/pure-ppr MUST have empty body, got \${pprHead.byteLength} bytes\`);
assert.equal(execsAfterHead, execsBeforeHead, \`[\${BUNDLER}] HEAD on warm Pure PPR MUST NOT execute dynamic PPR holes (before=\${execsBeforeHead}, after=\${execsAfterHead})\`);
assert.equal(pprHead.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(pprHead.headers.get("x-cube-ppr-plugin"), "ppr-plugin-ok");
assert.equal(pprHead.headers.get("cache-control"), pprGet1.headers.get("cache-control"));
assert.ok((pprHead.headers.get("content-type") || "").includes("text/html"));

// 3. Asymmetric 3D PPR (L1 Static PPR -> L2 Dynamic -> Page Static PPR): Custom headers from Plugin + Dynamic L2 + PPR Hole!
writeS({ asymL2: 201, asymHole: 202, l1Shell: POISON, asymShell: POISON });
const asymGet = await req("/hh/asym-l2");
assert.equal(asymGet.status, 200);
assert.equal(textById(asymGet.text, "hh-l1-seq"), "100");
assert.equal(textById(asymGet.text, "hh-asym-l2-seq"), "201");
assert.equal(textById(asymGet.text, "hh-asym-shell-seq"), "100");
assert.equal(textById(asymGet.text, "hh-asym-hole-seq"), "202");
assert.equal(asymGet.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(asymGet.headers.get("vary"), "Accept-Language");
assert.equal(asymGet.headers.get("x-cube-asym-l2"), "asym-l2-v201");
assert.equal(asymGet.headers.get("x-cube-asym-hole"), "asym-hole-v202");

const asymHead = await req("/hh/asym-l2", { method: "HEAD" });
assert.equal(asymHead.status, 200);
assert.equal(asymHead.byteLength, 0, \`[\${BUNDLER}] HEAD /hh/asym-l2 MUST have empty body, got \${asymHead.byteLength} bytes\`);
assert.equal(asymHead.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(asymHead.headers.get("vary"), "Accept-Language");
assert.equal(asymHead.headers.get("x-cube-asym-l2"), "asym-l2-v201");
assert.equal(asymHead.headers.get("x-cube-asym-hole"), "asym-hole-v202");

// 4. Dynamic Route (revalidate = 0): Custom Vary, X-Cube-Dyn, Cache-Control on GET & HEAD!
writeS({ dynSeq: 301 });
const dynGet = await req("/hh/dyn-page");
assert.equal(dynGet.status, 200);
assert.equal(textById(dynGet.text, "hh-dyn-seq"), "301");
assert.equal(dynGet.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(dynGet.headers.get("vary"), "Accept-Language");
assert.equal(dynGet.headers.get("x-cube-dyn"), "dyn-v301");
assert.ok((dynGet.headers.get("cache-control") || "").includes("private, max-age=30"));

const dynHead = await req("/hh/dyn-page", { method: "HEAD" });
assert.equal(dynHead.status, 200);
assert.equal(dynHead.byteLength, 0, \`[\${BUNDLER}] HEAD /hh/dyn-page MUST have empty body, got \${dynHead.byteLength} bytes\`);
assert.equal(dynHead.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(dynHead.headers.get("vary"), "Accept-Language");
assert.equal(dynHead.headers.get("x-cube-dyn"), "dyn-v301");
assert.equal(dynHead.headers.get("cache-control"), dynGet.headers.get("cache-control"));

// 5. Cold On-Demand ISG Routes (Static & PPR): HEAD returns 200 + headers + empty body & MUST NOT pollute disk cache!
writeS({ coldStaticSeq: 401, coldPprSeq: 402 });
const coldStaticHead = await req("/hh/cold-isg/probe-head", { method: "HEAD" });
assert.equal(coldStaticHead.status, 200);
assert.equal(coldStaticHead.byteLength, 0, \`[\${BUNDLER}] HEAD on cold static ISG must return empty body\`);
assert.equal(coldStaticHead.headers.get("x-cube-plugin"), "plugin-ok");
const coldDiskItem = await getStorageAdapter().get("hh/cold-isg/probe-head/index.html");
assert.equal(coldDiskItem, null, \`[\${BUNDLER}] HEAD probe on cold static ISG MUST NOT write cache artifact\`);

const coldPprHead = await req("/hh/cold-ppr/probe-head", { method: "HEAD" });
assert.equal(coldPprHead.status, 200);
assert.equal(coldPprHead.byteLength, 0, \`[\${BUNDLER}] HEAD on cold PPR ISG must return empty body\`);
assert.equal(coldPprHead.headers.get("x-cube-plugin"), "plugin-ok");
const coldPprDiskItem = await getStorageAdapter().get("hh/cold-ppr/probe-head/index.html");
assert.equal(coldPprDiskItem, null, \`[\${BUNDLER}] HEAD probe on cold PPR ISG MUST NOT trigger SSG shell write\`);

// Cold PPR Redirect (ssgRes redirect path): MUST preserve plugin.onRequest X-Cube-Plugin on GET & HEAD!
writeS({ coldPprRedirect: true });
const coldPprRedirGet = await req("/hh/cold-ppr/redir");
assert.equal(coldPprRedirGet.status, 302);
assert.equal(coldPprRedirGet.headers.get("location"), "/hh/static-page");
assert.equal(
  coldPprRedirGet.headers.get("x-cube-plugin"),
  "plugin-ok",
  \`[\${BUNDLER}] Cold PPR redirect MUST preserve plugin.onRequest X-Cube-Plugin header\`
);
const coldPprRedirHead = await req("/hh/cold-ppr/redir", { method: "HEAD" });
assert.equal(coldPprRedirHead.status, 302);
assert.equal(coldPprRedirHead.byteLength, 0);
assert.equal(coldPprRedirHead.headers.get("location"), "/hh/static-page");
assert.equal(coldPprRedirHead.headers.get("x-cube-plugin"), "plugin-ok");

// 6. Mid-ISR Tombstoned Routes (404, 410, 302): HEAD matches GET status + headers with empty body!
writeS({ tombMode: "404" });
await rscMod.revalidatePage("/hh/tombstone");
const t404Get = await req("/hh/tombstone");
const t404Head = await req("/hh/tombstone", { method: "HEAD" });
assert.equal(t404Get.status, 404);
assert.equal(t404Head.status, 404);
assert.equal(t404Head.byteLength, 0, \`[\${BUNDLER}] HEAD tombstoned 404 MUST have empty body\`);
assert.equal(t404Get.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(t404Head.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(t404Head.headers.get("x-cube-notfound"), "nf-404");

// Also verify missing-route not_found.tsx 404 under HEAD!
const miss404Head = await req("/hh/does-not-exist-404", { method: "HEAD" });
assert.equal(miss404Head.status, 404);
assert.equal(miss404Head.byteLength, 0);
assert.equal(miss404Head.headers.get("x-cube-plugin"), "plugin-ok");

writeS({ tombMode: "410" });
await rscMod.revalidatePage("/hh/tombstone");
const t410Get = await req("/hh/tombstone");
const t410Head = await req("/hh/tombstone", { method: "HEAD" });
assert.equal(t410Get.status, 410);
assert.equal(t410Head.status, 410);
assert.equal(t410Head.byteLength, 0, \`[\${BUNDLER}] HEAD tombstoned 410 MUST have empty body\`);
assert.equal(t410Get.headers.get("x-cube-gone"), "gone-410");
assert.equal(t410Head.headers.get("x-cube-gone"), "gone-410");
assert.equal(t410Head.headers.get("x-cube-plugin"), "plugin-ok");

writeS({ tombMode: "302" });
await rscMod.revalidatePage("/hh/tombstone");
const t302Get = await req("/hh/tombstone");
const t302Head = await req("/hh/tombstone", { method: "HEAD" });
assert.equal(t302Get.status, 302);
assert.equal(t302Head.status, 302);
assert.equal(t302Head.byteLength, 0, \`[\${BUNDLER}] HEAD tombstoned 302 MUST have empty body\`);
assert.equal(t302Get.headers.get("location"), "/hh/static-page");
assert.equal(t302Head.headers.get("location"), "/hh/static-page");
assert.equal(t302Head.headers.get("x-cube-plugin"), "plugin-ok");

// 7. RSC Wire Endpoints & Plugin Direct Response: Custom plugin headers + empty body on HEAD!
for (const rscPath of ["/____rsc_page____/hh/static-page", "/____rsc_layout____/hh", "/____rsc_slot____/hh-static-slot"]) {
  const rGet = await req(rscPath, { headers: { "x-dinou-current-path": "/hh/static-page" } });
  const rHead = await req(rscPath, { method: "HEAD", headers: { "x-dinou-current-path": "/hh/static-page" } });
  assert.equal(rGet.status, 200, \`Expected 200 GET \${rscPath}\`);
  assert.equal(rHead.status, 200, \`Expected 200 HEAD \${rscPath}\`);
  assert.equal(rHead.byteLength, 0, \`[\${BUNDLER}] HEAD \${rscPath} MUST have empty body\`);
  assert.equal(rGet.headers.get("x-cube-plugin"), "plugin-ok");
  assert.equal(rHead.headers.get("x-cube-plugin"), "plugin-ok");
}
const whHead = await req("/api/hh-webhook", { method: "HEAD" });
assert.equal(whHead.status, 200);
assert.equal(whHead.byteLength, 0, \`[\${BUNDLER}] HEAD on plugin direct Response MUST have empty body\`);
assert.equal(whHead.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(whHead.headers.get("x-cube-webhook"), "webhook-ok");

// 8. Post-revalidatePage() Header Preservation on Static & Pure PPR!
writeS({ staticSeq: 501, pprShell: 502, pprHole: 503 });
await rscMod.revalidatePage("/hh/static-page");
await rscMod.revalidatePage("/hh/pure-ppr");

const staticAfterRevalGet = await req("/hh/static-page");
const staticAfterRevalHead = await req("/hh/static-page", { method: "HEAD" });
assert.equal(textById(staticAfterRevalGet.text, "hh-static-seq"), "501");
assert.equal(staticAfterRevalHead.byteLength, 0);
assert.equal(staticAfterRevalHead.headers.get("x-cube-plugin"), "plugin-ok");
assert.equal(staticAfterRevalHead.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
assert.equal(staticAfterRevalHead.headers.get("vary"), "Accept-Encoding");

const execsBeforeRevalHead = readS().pprHoleExecs;
const pprAfterRevalHead = await req("/hh/pure-ppr", { method: "HEAD" });
await new Promise((r) => setTimeout(r, 80));
assert.equal(pprAfterRevalHead.status, 200);
assert.equal(pprAfterRevalHead.byteLength, 0);
assert.equal(readS().pprHoleExecs, execsBeforeRevalHead, \`[\${BUNDLER}] Post-revalidatePage HEAD on Pure PPR MUST NOT run holes\`);
assert.equal(pprAfterRevalHead.headers.get("x-cube-ppr-plugin"), "ppr-plugin-ok");
assert.ok((pprAfterRevalHead.headers.get("cache-control") || "").includes("public, max-age=45, stale-while-revalidate=120"));

// 9. Node HTTP Adapter (nodeToWebRequest + sendWebResponseToNode) HEAD & Stream Cancellation Parity!
const { PassThrough } = await import("node:stream");
async function runViaNodeAdapter(method, urlPath, overrideWebRes = null) {
  const mockReq = {
    method,
    url: urlPath,
    headers: { host: "localhost:3000" },
    socket: { encrypted: false },
  };
  const webReq = httpAdapter.nodeToWebRequest(mockReq);
  assert.equal(webReq.method, method);
  const webRes =
    overrideWebRes ||
    (await rscMod.handleRequest(webReq, platformContext));
  const outChunks = [];
  const outHeaders = new Map();
  const mockRes = new PassThrough();
  mockRes.req = mockReq;
  mockRes.statusCode = 200;
  mockRes.statusMessage = "";
  mockRes.headersSent = false;
  mockRes.setHeader = (k, v) => outHeaders.set(String(k).toLowerCase(), v);
  const origWrite = mockRes.write.bind(mockRes);
  const origEnd = mockRes.end.bind(mockRes);
  mockRes.write = (chunk, ...rest) => {
    mockRes.headersSent = true;
    if (chunk) outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return origWrite(chunk, ...rest);
  };
  const ended = new Promise((resolve) => mockRes.once("finish", resolve));
  mockRes.end = (chunk, ...rest) => {
    mockRes.headersSent = true;
    if (chunk) outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return origEnd(chunk, ...rest);
  };
  await httpAdapter.sendWebResponseToNode(webRes, mockRes);
  await ended;
  const buf = Buffer.concat(outChunks);
  return { status: mockRes.statusCode, headers: outHeaders, byteLength: buf.length, text: buf.toString("utf8") };
}

for (const [p, expectedStatus] of [
  ["/hh/static-page", 200],
  ["/hh/pure-ppr", 200],
  ["/hh/asym-l2", 200],
  ["/hh/dyn-page", 200],
  ["/hh/tombstone", 302],
]) {
  const h = await runViaNodeAdapter("HEAD", p);
  assert.equal(h.status, expectedStatus, \`[Node Adapter \${BUNDLER}] HEAD \${p} status\`);
  assert.equal(h.byteLength, 0, \`[Node Adapter \${BUNDLER}] HEAD \${p} must write 0 bytes\`);
  assert.equal(h.headers.get("x-cube-plugin"), "plugin-ok");
}
const adapterGet = await runViaNodeAdapter("GET", "/hh/static-page");
assert.equal(adapterGet.status, 200);
assert.equal(textById(adapterGet.text, "hh-static-seq"), "501");

// Verify sendWebResponseToNode cancels a streaming body cleanly if a raw Response with body reaches a HEAD request!
let streamCancelled = false;
const rawStreamRes = new Response(
  new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("should-not-write")); },
    cancel() { streamCancelled = true; },
  }),
  { status: 200, headers: { "Content-Type": "text/plain", "X-Raw-Head": "ok" } }
);
const rawHeadOut = await runViaNodeAdapter("HEAD", "/raw-stream", rawStreamRes);
assert.equal(rawHeadOut.status, 200);
assert.equal(rawHeadOut.byteLength, 0);
assert.equal(rawHeadOut.headers.get("x-raw-head"), "ok");
assert.equal(streamCancelled, true, \`[Node Adapter \${BUNDLER}] sendWebResponseToNode MUST cancel streaming body on HEAD\`);

await new Promise((r) => setTimeout(r, 80));
assert.deepEqual(unhandled, [], \`[\${BUNDLER}] Unexpected unhandledRejection during HEAD tests: \${unhandled.join("; ")}\`);

console.log(\`PHASE8_STAGE3_HEAD_HEADERS_\${BUNDLER.toUpperCase()}_OK\`);
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
        `[${bundler}] Phase 8 Stage 3 verification failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
      );
      assert.ok(
        runRes.stdout.includes(
          `PHASE8_STAGE3_HEAD_HEADERS_${bundler.toUpperCase()}_OK`
        )
      );
    } finally {
      removeDirSafe(tmpApp);
    }
  }
});

test("4. [Phase 8 / Stage 4 / Check #90] Cross-Primitive Cloudflare Workers Races, Multi-Slot Shared Tag Resolution, <DinouCacheSlot> Edge Placements (revalidate=false/0.5/-1, not_found, error) & React.cache() Isolation (Esbuild, Rollup, Webpack)", async () => {
  const bundlers = ["esbuild", "rollup", "webpack"];
  for (const bundler of bundlers) {
    const tmpApp = createFixtureDir(`p8-s4-edge-races-${bundler}-`);
    try {
      writeDinouShim(tmpApp);
      fs.writeFileSync(
        path.join(tmpApp, "package.json"),
        JSON.stringify(
          { name: `p8-s4-edge-races-${bundler}`, private: true, type: "module" },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(tmpApp, "p8s4-state.json"),
        JSON.stringify({
          cfL1: 100,
          cfL2: 100,
          cfPage: 100,
          cfSlot: 100,
          cfHole: 100,
          multiHost: 100,
          slotA: 100,
          slotB: 100,
          permSlot: 100,
          sub1Slot: 100,
          neg1Slot: 100,
          nfSlot: 100,
          errSlot: 100,
          shouldThrow: false,
          rcPprShell: 100,
          rcAsymL2: 100,
          rcAsymShell: 100,
          rcSlotSeq: 100,
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
const STATE_PATH = path.resolve(process.cwd(), "p8s4-state.json");
export function readS() {
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}
`
      );

      write(
        "src/rc-helper.ts",
        `import { cache } from "react";
import { getContext } from "dinou/server";

const EXEC_KEY = Symbol.for("dinou.p8s4.react.cache.exec.counter");
const CALLS_BY_TENANT_KEY = Symbol.for("dinou.p8s4.react.cache.calls.by.tenant");

export function resetRcMetrics() {
  (globalThis as any)[EXEC_KEY] = 0;
  (globalThis as any)[CALLS_BY_TENANT_KEY] = {};
}

export function getRcMetrics() {
  return {
    total: Number((globalThis as any)[EXEC_KEY] || 0),
    byTenant: { ...((globalThis as any)[CALLS_BY_TENANT_KEY] || {}) },
  };
}

export const getCachedViewer = cache(async (scopeKey: string) => {
  const ctx = getContext();
  const qT = ctx?.req?.query?.tenant;
  const hT = ctx?.req?.headers?.["x-tenant"];
  const tenant = String(Array.isArray(qT) ? qT[0] : qT || hT || "anon");
  const next = Number((globalThis as any)[EXEC_KEY] || 0) + 1;
  (globalThis as any)[EXEC_KEY] = next;
  const map = ((globalThis as any)[CALLS_BY_TENANT_KEY] ||= {});
  map[tenant] = Number(map[tenant] || 0) + 1;
  await new Promise((r) => setTimeout(r, 15));
  return { scopeKey, tenant, id: next, token: \`\${tenant}:\${next}\` };
});
`
      );

      write(
        "src/layout.tsx",
        `export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head><title>P8S4 Edge Races &amp; React.cache</title></head>
      <body>{children}</body>
    </html>
  );
}
`
      );
      write("src/page.tsx", `export default function Home() { return <main id="home">home</main>; }\n`);

      // Pillar 1: 3-Layer PPR + Slot hierarchy for Cloudflare Workers concurrent races
      write(
        "src/cf/layout_functions.ts",
        `import type { LayoutFunctions } from "dinou";
const config: LayoutFunctions = { ppr: true, revalidate: 3600, getCacheTags: () => ["cf-l1"] };
export default config;
`
      );
      write(
        "src/cf/layout.tsx",
        `import { readS } from "../state";
export default function CfL1({ children }: any) {
  const s = readS();
  return <section id="cf-l1"><span id="cf-l1-seq">{s.cfL1}</span>{children}</section>;
}
`
      );
      write(
        "src/cf/sub/layout_functions.ts",
        `import type { LayoutFunctions } from "dinou";
const config: LayoutFunctions = { ppr: true, revalidate: 3600, getCacheTags: () => ["cf-l2"] };
export default config;
`
      );
      write(
        "src/cf/sub/layout.tsx",
        `import { readS } from "../../state";
export default function CfL2({ children }: any) {
  const s = readS();
  return <div id="cf-l2"><span id="cf-l2-seq">{s.cfL2}</span>{children}</div>;
}
`
      );
      write(
        "src/cf/sub/page_functions.ts",
        `import type { PageFunctions } from "dinou";
const config: PageFunctions = { ppr: true, revalidate: 3600, getCacheTags: () => ["cf-page"] };
export default config;
`
      );
      write(
        "src/cf/sub/page.tsx",
        `import { Suspense } from "react";
import { DinouCacheSlot, getContext } from "dinou/server";
import { readS } from "../../state";

async function CfHole() {
  void getContext()?.req?.headers?.["user-agent"];
  return <span id="cf-hole-seq">{readS().cfHole}</span>;
}

export default function CfPage() {
  const s = readS();
  return (
    <article id="cf-page">
      <span id="cf-page-seq">{s.cfPage}</span>
      <DinouCacheSlot id="cf-slot" tags={["cf-slot-tag"]} revalidate={3600}>
        {async () => <span id="cf-slot-seq">{readS().cfSlot}</span>}
      </DinouCacheSlot>
      <Suspense fallback={<span>fb</span>}><CfHole /></Suspense>
    </article>
  );
}
`
      );

      // Pillar 2 & 3: Multi-slot shared tag + revalidate={false}/0.5/-1 + not_found.tsx & error.tsx slots
      write(
        "src/slots-edge/not_found.tsx",
        `import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function EdgeNotFound() {
  return (
    <div id="se-not-found">
      <DinouCacheSlot id="nf-slot" tags={["nf-slot-tag"]} revalidate={3600}>
        {async () => <span id="nf-slot-seq">{readS().nfSlot}</span>}
      </DinouCacheSlot>
    </div>
  );
}
`
      );
      write(
        "src/slots-edge/error.tsx",
        `import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function EdgeError({ error }: any) {
  return (
    <div id="se-error">
      <span id="se-err-msg">{error?.message || "err"}</span>
      <DinouCacheSlot id="err-slot" tags={["err-slot-tag"]} revalidate={3600}>
        {async () => <span id="err-slot-seq">{readS().errSlot}</span>}
      </DinouCacheSlot>
    </div>
  );
}
`
      );
      write(
        "src/slots-edge/multi/page_functions.ts",
        `import type { PageFunctions } from "dinou";
const config: PageFunctions = { ppr: false, revalidate: 3600, getCacheTags: () => ["se-multi"] };
export default config;
`
      );
      write(
        "src/slots-edge/multi/page.tsx",
        `import { DinouCacheSlot } from "dinou/server";
import { readS } from "../../state";
export default function MultiPage() {
  const s = readS();
  return (
    <article id="se-multi">
      <span id="se-multi-host">{s.multiHost}</span>
      <DinouCacheSlot id="slot-a" tag="multi-shared" revalidate={3600}>
        {async () => <span id="slot-a-seq">{readS().slotA}</span>}
      </DinouCacheSlot>
      <DinouCacheSlot id="slot-b" tag="multi-shared" revalidate={1}>
        {async () => <span id="slot-b-seq">{readS().slotB}</span>}
      </DinouCacheSlot>
      <DinouCacheSlot id="perm-slot" tags={["perm-tag"]} revalidate={false}>
        {async () => <span id="perm-slot-seq">{readS().permSlot}</span>}
      </DinouCacheSlot>
    </article>
  );
}
`
      );
      write(
        "src/slots-edge/sub1/page_functions.ts",
        `import type { PageFunctions } from "dinou";
const config: PageFunctions = { ppr: false, revalidate: 3600 };
export default config;
`
      );
      write(
        "src/slots-edge/sub1/page.tsx",
        `import { DinouCacheSlot } from "dinou/server";
import { readS } from "../../state";
export default function Sub1Page() {
  return (
    <article id="se-sub1">
      <DinouCacheSlot id="sub1-slot" revalidate={0.5}>
        {async () => <span id="sub1-slot-seq">{readS().sub1Slot}</span>}
      </DinouCacheSlot>
      <DinouCacheSlot id="neg1-slot" revalidate={-1}>
        {async () => <span id="neg1-slot-seq">{readS().neg1Slot}</span>}
      </DinouCacheSlot>
    </article>
  );
}
`
      );
      write(
        "src/slots-edge/broken/page_functions.ts",
        `import type { PageFunctions } from "dinou";
const config: PageFunctions = { revalidate: 0 };
export default config;
`
      );
      write(
        "src/slots-edge/broken/page.tsx",
        `import { readS } from "../../state";
export default function BrokenPage() {
  if (readS().shouldThrow) throw new Error("SE_BROKEN_BOOM");
  return <div id="se-broken-ok">ok</div>;
}
`
      );

      // Pillar 4: React.cache() across Pure PPR holes, Asymmetric Dynamic L2 + PPR holes, and Cached Slot isolation
      write(
        "src/rc-ppr/page_functions.ts",
        `import type { PageFunctions } from "dinou";
const config: PageFunctions = { ppr: true, revalidate: 3600 };
export default config;
`
      );
      write(
        "src/rc-ppr/page.tsx",
        `import { Suspense } from "react";
import { getContext } from "dinou/server";
import { readS } from "../state";
import { getCachedViewer } from "../rc-helper";

async function HoleA() {
  void getContext()?.req?.headers?.["x-tenant"];
  const v = await getCachedViewer("viewer");
  return <span id="rc-ppr-a">{v.token}</span>;
}

async function HoleB() {
  void getContext()?.req?.headers?.["x-tenant"];
  await new Promise((r) => setTimeout(r, 5));
  const v = await getCachedViewer("viewer");
  return <span id="rc-ppr-b">{v.token}</span>;
}

export default function RcPprPage() {
  return (
    <article id="rc-ppr">
      <span id="rc-ppr-shell">{readS().rcPprShell}</span>
      <Suspense fallback={<span>a</span>}><HoleA /></Suspense>
      <Suspense fallback={<span>b</span>}><HoleB /></Suspense>
    </article>
  );
}
`
      );

      write(
        "src/rc-asym/layout_functions.ts",
        `import type { LayoutFunctions } from "dinou";
const config: LayoutFunctions = { revalidate: 0 };
export default config;
`
      );
      write(
        "src/rc-asym/layout.tsx",
        `import { readS } from "../state";
import { getCachedViewer } from "../rc-helper";
export default async function RcAsymL2({ children }: any) {
  const v = await getCachedViewer("viewer");
  return (
    <section id="rc-asym-l2">
      <span id="rc-asym-l2-seq">{readS().rcAsymL2}</span>
      <span id="rc-asym-l2-token">{v.token}</span>
      {children}
    </section>
  );
}
`
      );
      write(
        "src/rc-asym/page_functions.ts",
        `import type { PageFunctions } from "dinou";
const config: PageFunctions = { ppr: true, revalidate: 3600 };
export default config;
`
      );
      write(
        "src/rc-asym/page.tsx",
        `import { Suspense } from "react";
import { DinouCacheSlot, getContext } from "dinou/server";
import { readS } from "../state";
import { getCachedViewer } from "../rc-helper";

async function AsymHoleA() {
  void getContext()?.req?.headers?.["x-tenant"];
  const v = await getCachedViewer("viewer");
  return <span id="rc-asym-a">{v.token}</span>;
}

async function AsymHoleB() {
  void getContext()?.req?.headers?.["x-tenant"];
  await new Promise((r) => setTimeout(r, 5));
  const v = await getCachedViewer("viewer");
  return <span id="rc-asym-b">{v.token}</span>;
}

export default function RcAsymPage() {
  return (
    <article id="rc-asym-page">
      <span id="rc-asym-shell">{readS().rcAsymShell}</span>
      <DinouCacheSlot id="rc-iso-slot" tags={["rc-iso-slot-tag"]} revalidate={3600}>
        {async () => {
          const sv = await getCachedViewer("viewer");
          return <span id="rc-iso-slot-token">{sv.token}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span>a</span>}><AsymHoleA /></Suspense>
      <Suspense fallback={<span>b</span>}><AsymHoleB /></Suspense>
    </article>
  );
}
`
      );

      // Dynamic page with a cold cached <DinouCacheSlot> calling the SAME React.cache() key ("viewer")!
      write(
        "src/rc-slot-iso/page_functions.ts",
        `import type { PageFunctions } from "dinou";
const config: PageFunctions = { revalidate: 0 };
export default config;
`
      );
      write(
        "src/rc-slot-iso/page.tsx",
        `import { DinouCacheSlot } from "dinou/server";
import { getCachedViewer } from "../rc-helper";

export default async function RcSlotIsoPage() {
  const outer = await getCachedViewer("viewer");
  return (
    <article id="rc-slot-iso">
      <span id="rc-iso-outer">{outer.token}</span>
      <DinouCacheSlot id="rc-dyn-iso-slot" tags={["rc-dyn-iso-slot-tag"]} revalidate={3600}>
        {async () => {
          const inner = await getCachedViewer("viewer");
          return <span id="rc-iso-inner">{inner.token}</span>;
        }}
      </DinouCacheSlot>
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
        `[${bundler}] Phase 8 Stage 4 build failed:\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
      );

      const verifyScript = path.join(tmpApp, "verify-p8s4.mjs");
      fs.writeFileSync(
        verifyScript,
        `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BUNDLER = ${JSON.stringify(bundler)};
const DINOU_ROOT = ${JSON.stringify(DINOU_ROOT)};
const STATE_PATH = path.resolve(process.cwd(), "p8s4-state.json");
const readS = () => JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
const writeS = (patch) => {
  const next = { ...readS(), ...patch };
  fs.writeFileSync(STATE_PATH, JSON.stringify(next), "utf8");
  return next;
};
const textById = (html, id) => {
  const m = String(html).match(new RegExp(\`id="\${id}"[^>]*>([^<]*)<\`));
  return m ? m[1] : null;
};

const storageMod = await import(pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href);
const { FileSystemStorage, CloudflareKVStorage, setStorageAdapter, getStorageAdapter } = storageMod;
const cacheSlotMod = await import(pathToFileURL(path.join(DINOU_ROOT, "core/cache-slot.js")).href);
const reqCtxMod = await import(pathToFileURL(path.join(DINOU_ROOT, "core/request-context.js")).href);

setStorageAdapter(new FileSystemStorage(path.resolve(".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const platformContext = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const POISON = 999777;

async function req(urlPath, { method = "GET", headers = {} } = {}) {
  const res = await rscMod.handleRequest(
    new Request(\`http://localhost:3000\${urlPath}\`, { method, headers }),
    platformContext
  );
  return { status: res.status, headers: res.headers, text: await res.text() };
}

// =========================================================================
// PILLAR 4: React.cache() Request-Scoped Memoization & Multi-Tenant Isolation
// =========================================================================
const EXEC_KEY = Symbol.for("dinou.p8s4.react.cache.exec.counter");
const CALLS_BY_TENANT_KEY = Symbol.for("dinou.p8s4.react.cache.calls.by.tenant");
const resetRc = () => { globalThis[EXEC_KEY] = 0; globalThis[CALLS_BY_TENANT_KEY] = {}; };
const getRc = () => ({ total: Number(globalThis[EXEC_KEY] || 0), byTenant: { ...(globalThis[CALLS_BY_TENANT_KEY] || {}) } });

// 4A. Pure PPR: two sibling PPR dynamic holes deduplicate to 1 React.cache() call!
resetRc();
const pprAlice = await req("/rc-ppr?tenant=alice", { headers: { "x-tenant": "alice" } });
assert.equal(pprAlice.status, 200);
const pprTokA = textById(pprAlice.text, "rc-ppr-a");
const pprTokB = textById(pprAlice.text, "rc-ppr-b");
assert.ok(pprTokA && pprTokA.startsWith("alice:"), \`[\${BUNDLER}] Expected alice token in HoleA, got \${pprTokA}\`);
assert.equal(pprTokB, pprTokA, \`[\${BUNDLER}] Pure PPR sibling holes MUST share React.cache() result (HoleA=\${pprTokA}, HoleB=\${pprTokB})\`);
assert.equal(getRc().byTenant.alice, 1, \`[\${BUNDLER}] Pure PPR sibling holes MUST invoke React.cache() fn exactly once, got \${getRc().byTenant.alice}\`);

// 4B. Asymmetric 3D PPR: Dynamic L2 + two sibling PPR dynamic holes share 1 React.cache() call!
resetRc();
const asymBob = await req("/rc-asym?tenant=bob", { headers: { "x-tenant": "bob" } });
assert.equal(asymBob.status, 200);
const asymL2Tok = textById(asymBob.text, "rc-asym-l2-token");
const asymATok = textById(asymBob.text, "rc-asym-a");
const asymBTok = textById(asymBob.text, "rc-asym-b");
assert.ok(asymL2Tok && asymL2Tok.startsWith("bob:"), \`[\${BUNDLER}] Expected bob token in Dynamic L2, got \${asymL2Tok}\`);
assert.equal(asymATok, asymL2Tok, \`[\${BUNDLER}] Asymmetric L2 & HoleA MUST share React.cache() result (L2=\${asymL2Tok}, HoleA=\${asymATok})\`);
assert.equal(asymBTok, asymL2Tok, \`[\${BUNDLER}] Asymmetric L2 & HoleB MUST share React.cache() result (L2=\${asymL2Tok}, HoleB=\${asymBTok})\`);
assert.equal(getRc().byTenant.bob, 1, \`[\${BUNDLER}] Asymmetric L2 + 2 PPR holes MUST invoke React.cache() fn once, got \${getRc().byTenant.bob}\`);

// 4C. Concurrent Multi-Tenant Isolation (4 interleaved requests -> ZERO cross-tenant leak!)
resetRc();
const [cAlice, cBob, cCarol, cDave] = await Promise.all([
  req("/rc-ppr?tenant=alice", { headers: { "x-tenant": "alice" } }),
  req("/rc-ppr?tenant=bob", { headers: { "x-tenant": "bob" } }),
  req("/rc-asym?tenant=carol", { headers: { "x-tenant": "carol" } }),
  req("/rc-asym?tenant=dave", { headers: { "x-tenant": "dave" } }),
]);
assert.equal(textById(cAlice.text, "rc-ppr-a"), textById(cAlice.text, "rc-ppr-b"));
assert.ok(textById(cAlice.text, "rc-ppr-a")?.startsWith("alice:"));
assert.equal(textById(cBob.text, "rc-ppr-a"), textById(cBob.text, "rc-ppr-b"));
assert.ok(textById(cBob.text, "rc-ppr-a")?.startsWith("bob:"));
assert.equal(textById(cCarol.text, "rc-asym-l2-token"), textById(cCarol.text, "rc-asym-a"));
assert.equal(textById(cCarol.text, "rc-asym-a"), textById(cCarol.text, "rc-asym-b"));
assert.ok(textById(cCarol.text, "rc-asym-l2-token")?.startsWith("carol:"));
assert.equal(textById(cDave.text, "rc-asym-l2-token"), textById(cDave.text, "rc-asym-a"));
assert.equal(textById(cDave.text, "rc-asym-a"), textById(cDave.text, "rc-asym-b"));
assert.ok(textById(cDave.text, "rc-asym-l2-token")?.startsWith("dave:"));
assert.equal(getRc().byTenant.alice, 1);
assert.equal(getRc().byTenant.bob, 1);
assert.equal(getRc().byTenant.carol, 1);
assert.equal(getRc().byTenant.dave, 1);

// 4D. Cached <DinouCacheSlot> isolation from dynamic tenant's React.cache()!
resetRc();
await getStorageAdapter().delete("slots/rc-dyn-iso-slot/slot.json");
const isoRes = await req("/rc-slot-iso?tenant=secret-alice", { headers: { "x-tenant": "secret-alice" } });
assert.equal(isoRes.status, 200);
const isoOuter = textById(isoRes.text, "rc-iso-outer");
const isoInner = textById(isoRes.text, "rc-iso-inner");
assert.ok(isoOuter?.startsWith("secret-alice:"), \`Expected outer dynamic to see secret-alice, got \${isoOuter}\`);
assert.notEqual(
  isoInner,
  isoOuter,
  \`[\${BUNDLER}] Cached <DinouCacheSlot> MUST NOT inherit outer tenant's React.cache() entry (outer=\${isoOuter}, inner=\${isoInner})\`
);

// =========================================================================
// PILLAR 2: Multi-Slot Shared Tag Resolution in inspectSlotsFreshness & revalidateTag
// =========================================================================
const multiInitial = await req("/slots-edge/multi");
assert.equal(multiInitial.status, 200);
assert.equal(textById(multiInitial.text, "slot-a-seq"), "100");
assert.equal(textById(multiInitial.text, "slot-b-seq"), "100");
assert.equal(textById(multiInitial.text, "perm-slot-seq"), "100");

const multiMetaRaw = await getStorageAdapter().get("slots-edge/multi/metadata.json");
const multiHostGen = Number(JSON.parse(multiMetaRaw.content).generatedAt || 0);

// Wait >1.1s so slot-b (revalidate=1) expires while slot-a (revalidate=3600) is still fresh!
await new Promise((r) => setTimeout(r, 1150));
const freshnessExpired = await cacheSlotMod.inspectSlotsFreshness(["multi-shared"], multiHostGen);
assert.equal(
  freshnessExpired.hasExpired,
  true,
  \`[\${BUNDLER}] inspectSlotsFreshness(['multi-shared']) MUST detect slot-b TTL expiry (must NOT be masked by slot-a!)\`
);

// Refresh ONLY slot-b independently -> inspectSlotsFreshness(['multi-shared'], multiHostGen) must report hasNewer=true!
writeS({ slotB: 201, slotA: POISON, multiHost: POISON });
const slotBRefresh = await req("/____rsc_slot____/slot-b?fresh=1", {
  headers: { "x-dinou-current-path": "/slots-edge/multi" },
});
assert.equal(slotBRefresh.status, 200);
assert.ok(slotBRefresh.text.includes("201"));
const freshnessNewer = await cacheSlotMod.inspectSlotsFreshness(["multi-shared"], multiHostGen);
assert.equal(
  freshnessNewer.hasNewer,
  true,
  \`[\${BUNDLER}] inspectSlotsFreshness(['multi-shared']) MUST detect slot-b newer timestamp (not masked by slot-a!)\`
);

// revalidateTag("multi-shared") must update BOTH slot-a AND slot-b while keeping poisoned host & perm-slot frozen!
writeS({ slotA: 301, slotB: 302, multiHost: POISON, permSlot: POISON });
await rscMod.revalidateTag("multi-shared");
const multiAfterTag = await req("/slots-edge/multi");
assert.equal(textById(multiAfterTag.text, "slot-a-seq"), "301");
assert.equal(textById(multiAfterTag.text, "slot-b-seq"), "302");
assert.equal(textById(multiAfterTag.text, "se-multi-host"), "100");
assert.equal(textById(multiAfterTag.text, "perm-slot-seq"), "100");

// =========================================================================
// PILLAR 3: <DinouCacheSlot> Edge Placements (revalidate=false, 0.5/-1, not_found, error)
// =========================================================================
// 3A. revalidate={false}: never expires, stays frozen until revalidateTag("perm-tag")
const permFreshness = await cacheSlotMod.inspectSlotsFreshness(["perm-slot"], multiHostGen);
assert.equal(permFreshness.hasExpired, false, \`[\${BUNDLER}] revalidate=false slot must never expire\`);
writeS({ permSlot: 401, multiHost: POISON });
await rscMod.revalidateTag("perm-tag");
const multiAfterPerm = await req("/slots-edge/multi");
assert.equal(textById(multiAfterPerm.text, "perm-slot-seq"), "401");
assert.equal(textById(multiAfterPerm.text, "se-multi-host"), "100");

// 3B. revalidate={0.5} & revalidate={-1}: never cached to storage, always live!
writeS({ sub1Slot: 501, neg1Slot: 502 });
const sub1Res1 = await req("/slots-edge/sub1");
assert.equal(textById(sub1Res1.text, "sub1-slot-seq"), "501");
assert.equal(textById(sub1Res1.text, "neg1-slot-seq"), "502");
assert.equal(await getStorageAdapter().get("slots/sub1-slot/slot.json"), null, \`[\${BUNDLER}] revalidate=0.5 must NOT cache to storage\`);
assert.equal(await getStorageAdapter().get("slots/neg1-slot/slot.json"), null, \`[\${BUNDLER}] revalidate=-1 must NOT cache to storage\`);
writeS({ sub1Slot: 503, neg1Slot: 504 });
const sub1Res2 = await req("/slots-edge/sub1");
assert.equal(textById(sub1Res2.text, "sub1-slot-seq"), "503");
assert.equal(textById(sub1Res2.text, "neg1-slot-seq"), "504");

// 3C. <DinouCacheSlot> inside not_found.tsx & error.tsx (including COLD server discovery!)
writeS({ nfSlot: 601, errSlot: 701, shouldThrow: true });
const nfRes1 = await req("/slots-edge/does-not-exist");
assert.equal(nfRes1.status, 404);
assert.equal(textById(nfRes1.text, "nf-slot-seq"), "601");

const errRes1 = await req("/slots-edge/broken");
assert.equal(errRes1.status, 500);
assert.equal(textById(errRes1.text, "err-slot-seq"), "701");

// Simulate COLD server restart by clearing slotRegistry!
const slotRegistry = globalThis[Symbol.for("dinou.slot.registry")];
assert.ok(slotRegistry instanceof Map);
slotRegistry.clear();

writeS({ nfSlot: 602, errSlot: 702 });
const nfColdRefresh = await req("/____rsc_slot____/nf-slot?fresh=1", {
  headers: { "x-dinou-current-path": "/slots-edge/does-not-exist" },
});
assert.equal(nfColdRefresh.status, 200, \`[\${BUNDLER}] Cold refreshSlot on not_found.tsx slot must return 200, got \${nfColdRefresh.status}\`);
assert.ok(nfColdRefresh.text.includes("602"));

slotRegistry.clear();
const errColdRefresh = await req("/____rsc_slot____/err-slot?fresh=1", {
  headers: { "x-dinou-current-path": "/slots-edge/broken" },
});
assert.equal(errColdRefresh.status, 200, \`[\${BUNDLER}] Cold refreshSlot on error.tsx slot must return 200 (via getErrorJSX fallback!), got \${errColdRefresh.status}\`);
assert.ok(errColdRefresh.text.includes("702"));

// Verify nf-slot / err-slot tags NEVER leaked into healthy 200 page metadata.json!
const healthyMeta = JSON.parse((await getStorageAdapter().get("slots-edge/multi/metadata.json")).content);
assert.ok(!(healthyMeta.slotTags || []).includes("nf-slot"));
assert.ok(!(healthyMeta.slotTags || []).includes("err-slot"));

// =========================================================================
// PILLAR 1: Cross-Primitive Concurrent Revalidation Races on Cloudflare Workers!
// =========================================================================
if (BUNDLER === "esbuild" || BUNDLER === "rollup" || BUNDLER === "webpack") {
  const origNavDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const prevStorage = getStorageAdapter();
  try {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Cloudflare-Workers" },
      configurable: true,
    });

    const kvData = new Map();
    const kvMeta = new Map();
    let delayHook = null;
    const mockKv = {
      async getWithMetadata(k) {
        if (delayHook) await delayHook("get", k);
        if (!kvData.has(k)) return { value: null, metadata: null };
        return { value: kvData.get(k), metadata: kvMeta.get(k) || null };
      },
      async get(k) {
        if (delayHook) await delayHook("get", k);
        return kvData.has(k) ? kvData.get(k) : null;
      },
      async put(k, v, opts) {
        if (delayHook) await delayHook("put", k);
        kvData.set(k, v);
        if (opts && opts.metadata) kvMeta.set(k, opts.metadata);
        else kvMeta.delete(k);
      },
      async delete(k) {
        if (delayHook) await delayHook("delete", k);
        kvData.delete(k);
        kvMeta.delete(k);
      },
      async list({ prefix = "" } = {}) {
        if (delayHook) await delayHook("list", prefix);
        const keys = Array.from(kvData.keys())
          .filter((k) => k.startsWith(prefix))
          .map((name) => ({ name }));
        return { keys, list_complete: true };
      },
    };
    const cfStorage = new CloudflareKVStorage(mockKv);
    cfStorage.hydrateFromDisk = false;
    setStorageAdapter(cfStorage);

    // Seed V100 into CloudflareKVStorage
    writeS({ cfL1: 100, cfL2: 100, cfPage: 100, cfSlot: 100, cfHole: 100 });
    await rscMod.revalidateLayout("/cf");
    await rscMod.revalidateLayout("/cf/sub");
    await rscMod.revalidatePage("/cf/sub");

    // 1A. Same-request webhook Promise.all burst (with async KV jitter)
    writeS({ cfL1: 200, cfL2: 201, cfPage: 202, cfSlot: 203, cfHole: 204 });
    delayHook = async () => new Promise((r) => setTimeout(r, 3));
    const fakeReqCtx = { req: { path: "/api/webhook" }, res: {}, env: {}, platformContext };
    await reqCtxMod.requestStorage.run(fakeReqCtx, async () => {
      await Promise.all([
        rscMod.revalidateLayout("/cf"),
        rscMod.revalidateLayout("/cf/sub"),
        rscMod.revalidatePage("/cf/sub"),
        rscMod.revalidateTag("cf-slot-tag"),
      ]);
    });
    delayHook = null;

    const afterBurst = await req("/cf/sub");
    assert.equal(afterBurst.status, 200);
    assert.equal(textById(afterBurst.text, "cf-l1-seq"), "200", \`[\${BUNDLER}] CF same-request burst lost L1 update\`);
    assert.equal(textById(afterBurst.text, "cf-l2-seq"), "201", \`[\${BUNDLER}] CF same-request burst lost L2 update\`);
    assert.equal(textById(afterBurst.text, "cf-page-seq"), "202", \`[\${BUNDLER}] CF same-request burst lost Page update\`);
    assert.equal(textById(afterBurst.text, "cf-slot-seq"), "203", \`[\${BUNDLER}] CF same-request burst lost Slot update\`);
    assert.equal(textById(afterBurst.text, "cf-hole-seq"), "204");

    // 1B. Cross-Isolate Concurrent Race (NO shared requestStorage!):
    //     Isolate A starts revalidatePage("/cf/sub") slowly (reading old L2=201 & old slot=203),
    //     while Isolate B concurrently runs revalidateLayout("/cf/sub") -> 301 AND revalidateTag("cf-slot-tag") -> 303!
    //     Final state MUST NOT let Isolate A clobber L2=301 or Slot=303 with stale V201/V203!
    writeS({ cfL1: 200, cfL2: 301, cfPage: 302, cfSlot: 303, cfHole: 304 });
    let slowedFirstPageWrite = false;
    delayHook = async (op, key) => {
      if (op === "put" && key === "cf/sub/metadata.json" && !slowedFirstPageWrite) {
        slowedFirstPageWrite = true;
        await new Promise((r) => setTimeout(r, 45));
      } else {
        await new Promise((r) => setTimeout(r, 2));
      }
    };

    const isoA = reqCtxMod.requestStorage.run({ req: { path: "/iso-a" }, res: {}, env: {}, platformContext }, () =>
      rscMod.revalidatePage("/cf/sub")
    );
    await new Promise((r) => setTimeout(r, 5));
    const isoB = reqCtxMod.requestStorage.run({ req: { path: "/iso-b" }, res: {}, env: {}, platformContext }, async () => {
      await rscMod.revalidateLayout("/cf/sub");
      await rscMod.revalidateTag("cf-slot-tag");
    });
    await Promise.all([isoA, isoB]);
    delayHook = null;

    // Verify zero stale overwrite & zero layout/page version skew on KV!
    const afterCrossIso = await req("/cf/sub");
    const l2RscAfter = await req("/____rsc_layout____/cf/sub");
    const pageRscAfter = await req("/____rsc_page____/cf/sub");
    assert.equal(textById(afterCrossIso.text, "cf-l2-seq"), "301", \`[\${BUNDLER}] CF cross-isolate race baked stale L2 into index.html!\`);
    assert.equal(textById(afterCrossIso.text, "cf-page-seq"), "302", \`[\${BUNDLER}] CF cross-isolate race lost Page update!\`);
    assert.equal(textById(afterCrossIso.text, "cf-slot-seq"), "303", \`[\${BUNDLER}] CF cross-isolate race clobbered Slot update!\`);
    assert.ok(l2RscAfter.text.includes("301"), \`[\${BUNDLER}] layout.rsc must match L2=301\`);
    assert.ok(pageRscAfter.text.includes("302") && pageRscAfter.text.includes("303"), \`[\${BUNDLER}] page.rsc must match Page=302 & Slot=303\`);

    // 1C. Cloudflare Workers Surgical Slot-Only Revalidation Isolation (POISON Guard!):
    //     Calling revalidateTag("cf-slot-tag") while L1/L2/Page are poisoned MUST ONLY update cf-slot
    //     and MUST NEVER self-trigger checkCloudflarePageRace / checkCloudflareLayoutRace into a full re-render!
    writeS({ cfL1: POISON, cfL2: POISON, cfPage: POISON, cfSlot: 404, cfHole: 405 });
    await rscMod.revalidateTag("cf-slot-tag");
    const afterSurgicalSlot = await req("/cf/sub");
    assert.equal(textById(afterSurgicalSlot.text, "cf-slot-seq"), "404", \`[\${BUNDLER}] CF surgical slot revalidateTag must update cf-slot to 404\`);
    assert.equal(textById(afterSurgicalSlot.text, "cf-l1-seq"), "200", \`[\${BUNDLER}] CF surgical slot revalidateTag MUST NOT re-execute poisoned L1\`);
    assert.equal(textById(afterSurgicalSlot.text, "cf-l2-seq"), "301", \`[\${BUNDLER}] CF surgical slot revalidateTag MUST NOT re-execute poisoned L2\`);
    assert.equal(textById(afterSurgicalSlot.text, "cf-page-seq"), "302", \`[\${BUNDLER}] CF surgical slot revalidateTag MUST NOT re-execute poisoned Page\`);
    assert.ok(!afterSurgicalSlot.text.includes(String(POISON)), \`[\${BUNDLER}] CF surgical slot revalidateTag leaked POISON into HTML!\`);
  } finally {
    setStorageAdapter(prevStorage);
    if (origNavDesc) {
      Object.defineProperty(globalThis, "navigator", origNavDesc);
    } else {
      delete globalThis.navigator;
    }
  }
}

console.log(\`PHASE8_STAGE4_EDGE_RACES_CACHE_\${BUNDLER.toUpperCase()}_OK\`);
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
        `[${bundler}] Phase 8 Stage 4 verification failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
      );
      assert.ok(
        runRes.stdout.includes(
          `PHASE8_STAGE4_EDGE_RACES_CACHE_${bundler.toUpperCase()}_OK`
        )
      );
    } finally {
      removeDirSafe(tmpApp);
    }
  }
});
