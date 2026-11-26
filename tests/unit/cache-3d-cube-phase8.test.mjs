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
