import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

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
        version: "10.0.4",
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
    `export * from ${JSON.stringify(relTo("index.js"))};\n`
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

test("1. [Phase 6 / Stage 1 / Check #79] revalidatePath() Complete Matrix (Route Groups, [[...slug]], Asymmetric L1(S)->L2(D)->L3(S)->Page(PPR), Relative Paths, Deprecation Warning & Monotonic Timestamps)", async () => {
  const tmpApp = createFixtureDir("p6-s1-reval-path-");
  try {
    writeDinouShim(tmpApp);
    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "p6-s1-reval-path", private: true, type: "module" }, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpApp, "p6s1-state.json"),
      JSON.stringify({
        rootShell: 100,
        grpOuter: 100,
        alphaL: 100,
        promoP: 100,
        promoH: 100,
        promo2P: 100,
        subL: 100,
        subP: 100,
        subH: 100,
        betaL: 100,
        settingsP: 100,
        grpHomeOuter: 100,
        grpHomeIndexL: 100,
        grpHomeIndexP: 100,
        caOuter: 100,
        caRootL: 100,
        caRootP: 100,
        caRootH: 100,
        caDocsL: 100,
        caDocsP: 100,
        caV2L: 100,
        caV2P: 100,
        caSpaceL: 100,
        caSpaceP: 100,
        asymL1: 100,
        asymL1H: 100,
        asymDynL2: 100,
        asymL3: 100,
        asymL3H: 100,
        asymPage: 100,
        asymPageH: 100,
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
export function readS() {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "p6s1-state.json"), "utf8"));
}
`
    );

    // Root layout (3600s)
    write("src/layout_functions.ts", `export function revalidate() { return 3600; }\n`);
    write(
      "src/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "./state";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>P6S1</title></head>
      <body>
        <span id="root-s">{readS().rootShell}</span>
        {children}
      </body>
    </html>
  );
}
`
    );
    write("src/page.tsx", `export default function Home() { return <main>home</main>; }\n`);

    // 1. Sibling Route Groups: /grp/(alpha)/promo, /grp/(alpha)/promo2, /grp/(alpha)/sub (with own layout!), /grp/(beta)/settings
    write("src/grp/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/grp/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../state";
export default function GrpOuter({ children }: { children: ReactNode }) {
  return <section id="grp-outer"><span id="grp-outer-s">{readS().grpOuter}</span>{children}</section>;
}
`
    );

    write("src/grp/(alpha)/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/grp/(alpha)/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function AlphaLayout({ children }: { children: ReactNode }) {
  return <div id="grp-alpha"><span id="alpha-l-s">{readS().alphaL}</span>{children}</div>;
}
`
    );

    write("src/grp/(alpha)/promo/page_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/grp/(alpha)/promo/page.tsx",
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { readS } from "../../../state";
async function PromoH() {
  void getContext()?.req?.headers?.["x-p6"];
  await Promise.resolve();
  return <span id="promo-h">{readS().promoH}</span>;
}
export default function PromoPage() {
  return <article id="promo-p"><span id="promo-p-s">{readS().promoP}</span><Suspense fallback={<span>fb</span>}><PromoH /></Suspense></article>;
}
`
    );

    write("src/grp/(alpha)/promo2/page_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/grp/(alpha)/promo2/page.tsx",
      `import { readS } from "../../../state";
export default function Promo2Page() {
  return <article id="promo2-p"><span id="promo2-p-s">{readS().promo2P}</span></article>;
}
`
    );

    // Co-located layout + page inside route group (alpha): src/grp/(alpha)/sub/layout.tsx + page.tsx
    write("src/grp/(alpha)/sub/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/grp/(alpha)/sub/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../../../state";
export default function SubLayout({ children }: { children: ReactNode }) {
  return <div id="sub-l"><span id="sub-l-s">{readS().subL}</span>{children}</div>;
}
`
    );
    write("src/grp/(alpha)/sub/page_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/grp/(alpha)/sub/page.tsx",
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { readS } from "../../../state";
async function SubH() {
  void getContext()?.req?.headers?.["x-p6"];
  await Promise.resolve();
  return <span id="sub-h">{readS().subH}</span>;
}
export default function SubPage() {
  return <article id="sub-p"><span id="sub-p-s">{readS().subP}</span><Suspense fallback={<span>fb</span>}><SubH /></Suspense></article>;
}
`
    );

    write("src/grp/(beta)/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/grp/(beta)/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function BetaLayout({ children }: { children: ReactNode }) {
  return <div id="grp-beta"><span id="beta-l-s">{readS().betaL}</span>{children}</div>;
}
`
    );
    write("src/grp/(beta)/settings/page_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/grp/(beta)/settings/page.tsx",
      `import { readS } from "../../../state";
export default function SettingsPage() {
  return <article id="settings-p"><span id="settings-p-s">{readS().settingsP}</span></article>;
}
`
    );

    // Co-located group layout + page at URL /grp-home: src/grp-home/layout.tsx + src/grp-home/(index)/layout.tsx + page.tsx
    write("src/grp-home/layout_functions.ts", `export function revalidate() { return 3600; }\n`);
    write(
      "src/grp-home/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../state";
export default function GrpHomeOuter({ children }: { children: ReactNode }) {
  return <section id="gh-outer"><span id="gh-outer-s">{readS().grpHomeOuter}</span>{children}</section>;
}
`
    );
    write("src/grp-home/(index)/layout_functions.ts", `export function revalidate() { return 3600; }\n`);
    write(
      "src/grp-home/(index)/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function GrpHomeIndexLayout({ children }: { children: ReactNode }) {
  return <div id="gh-idx-l"><span id="gh-idx-l-s">{readS().grpHomeIndexL}</span>{children}</div>;
}
`
    );
    write("src/grp-home/(index)/page_functions.ts", `export function revalidate() { return 3600; }\n`);
    write(
      "src/grp-home/(index)/page.tsx",
      `import { readS } from "../../state";
export default function GrpHomeIndexPage() {
  return <article id="gh-idx-p"><span id="gh-idx-p-s">{readS().grpHomeIndexP}</span></article>;
}
`
    );

    // 2. Optional Catch-All [[...slug]] under shared outer layout: /ca, /ca/docs, /ca/docs/v2, /ca/hello%20world
    write("src/ca/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/ca/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../state";
export default function CaOuter({ children }: { children: ReactNode }) {
  return <section id="ca-outer"><span id="ca-outer-s">{readS().caOuter}</span>{children}</section>;
}
`
    );
    write(
      "src/ca/[[...slug]]/layout_functions.ts",
      `export const ppr = true;
export function revalidate() { return 3600; }
export function getStaticPaths() { return [[], ["docs"], ["docs", "v2"]]; }
`
    );
    write(
      "src/ca/[[...slug]]/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../../state";
function slugKind(slug?: string[]) {
  const joined = Array.isArray(slug) && slug.length > 0 ? slug.join("/") : "root";
  return joined;
}
export default function CaSlugLayout({ children, params }: { children: ReactNode; params?: { slug?: string[] } }) {
  const kind = slugKind(params?.slug);
  const s = readS();
  const val =
    kind === "docs" ? s.caDocsL :
    kind === "docs/v2" ? s.caV2L :
    kind === "hello world" ? s.caSpaceL :
    s.caRootL;
  return <div id="ca-l2" data-kind={kind}><span id="ca-l2-s">{val}</span>{children}</div>;
}
`
    );
    write(
      "src/ca/[[...slug]]/page_functions.ts",
      `export const ppr = true;
export function revalidate() { return 3600; }
export function getStaticPaths() { return [[], ["docs"], ["docs", "v2"]]; }
`
    );
    write(
      "src/ca/[[...slug]]/page.tsx",
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { readS } from "../../state";
async function CaHole() {
  void getContext()?.req?.headers?.["x-p6"];
  await Promise.resolve();
  return <span id="ca-h">{readS().caRootH}</span>;
}
export default function CaSlugPage({ params }: { params?: { slug?: string[] } }) {
  const kind = Array.isArray(params?.slug) && params.slug.length > 0 ? params.slug.join("/") : "root";
  const s = readS();
  const val =
    kind === "docs" ? s.caDocsP :
    kind === "docs/v2" ? s.caV2P :
    kind === "hello world" ? s.caSpaceP :
    s.caRootP;
  return <article id="ca-p" data-kind={kind}><span id="ca-p-s">{val}</span><Suspense fallback={<span>fb</span>}><CaHole /></Suspense></article>;
}
`
    );

    // 3. Asymmetric L1(S PPR) -> L2(Dynamic 0) -> L3(S PPR) -> Page(S PPR)
    write("src/asym/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/asym/layout.tsx",
      `import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { readS } from "../state";
async function AsymL1H() {
  void getContext()?.req?.headers?.["x-p6"];
  await Promise.resolve();
  return <span id="asym-l1-h">{readS().asymL1H}</span>;
}
export default function AsymL1({ children }: { children: ReactNode }) {
  return <section id="asym-l1"><span id="asym-l1-s">{readS().asymL1}</span><Suspense fallback={<span>fb</span>}><AsymL1H /></Suspense>{children}</section>;
}
`
    );
    write("src/asym/dyn/layout_functions.ts", `export function revalidate() { return 0; }\n`);
    write(
      "src/asym/dyn/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function AsymDynL2({ children }: { children: ReactNode }) {
  return <div id="asym-l2"><span id="asym-l2-s">{readS().asymDynL2}</span>{children}</div>;
}
`
    );
    write("src/asym/dyn/l3/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/asym/dyn/l3/layout.tsx",
      `import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { readS } from "../../../state";
async function AsymL3H() {
  void getContext()?.req?.headers?.["x-p6"];
  await Promise.resolve();
  return <span id="asym-l3-h">{readS().asymL3H}</span>;
}
export default function AsymL3({ children }: { children: ReactNode }) {
  return <div id="asym-l3"><span id="asym-l3-s">{readS().asymL3}</span><Suspense fallback={<span>fb</span>}><AsymL3H /></Suspense>{children}</div>;
}
`
    );
    write("src/asym/dyn/l3/page_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/asym/dyn/l3/page.tsx",
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { readS } from "../../../state";
async function AsymPageH() {
  void getContext()?.req?.headers?.["x-p6"];
  await Promise.resolve();
  return <span id="asym-p-h">{readS().asymPageH}</span>;
}
export default function AsymPage() {
  return <article id="asym-p"><span id="asym-p-s">{readS().asymPage}</span><Suspense fallback={<span>fb</span>}><AsymPageH /></Suspense></article>;
}
`
    );

    const buildRes = spawnSync(process.execPath, [CLI_PATH, "build:node:esbuild"], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      timeout: 120_000,
    });
    assert.equal(
      buildRes.status,
      0,
      `Phase 6 Stage 1 build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    const verifyScript = path.join(tmpApp, "verify-p6-stage1.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const { requestStorage } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/request-context.js")).href
      )});
const dist2 = path.resolve(".dinou/dist2");
setStorageAdapter(new FileSystemStorage(dist2));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const writeS = (patch) => {
  const f = path.resolve("p6s1-state.json");
  const cur = JSON.parse(fs.readFileSync(f, "utf8"));
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const req = async (u) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u), opts);
  return { status: r.status, headers: r.headers, text: await r.text() };
};
const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
};

const POISON = "POISON_999";

// Warm cold ISG routes that aren't in getStaticPaths (percent-encoded /ca/hello%20world & /asym/dyn/l3)
const warmSpace = await req("/ca/hello%20world");
assert.equal(warmSpace.status, 200);
assert.equal(textById(warmSpace.text, "ca-l2-s"), "100");
assert.equal(textById(warmSpace.text, "ca-p-s"), "100");

const warmAsym = await req("/asym/dyn/l3");
assert.equal(warmAsym.status, 200);
assert.equal(textById(warmAsym.text, "asym-l1-s"), "100");
assert.equal(textById(warmAsym.text, "asym-l3-s"), "100");
assert.equal(textById(warmAsym.text, "asym-p-s"), "100");

// ============================================================================
// 1. Sibling Route Groups: leaf page vs co-located group segment vs explicit group layout
// ============================================================================
// 1a. revalidatePath("/grp/promo") refreshes ONLY promo page (no own layout -> outer, (alpha), promo2, (beta) stay frozen!)
writeS({
  rootShell: POISON,
  grpOuter: POISON,
  alphaL: POISON,
  promoP: 201,
  promoH: 202,
  promo2P: POISON,
  betaL: POISON,
  settingsP: POISON,
});
await rscMod.revalidatePath("/grp/promo");
const promoRes = await req("/grp/promo");
assert.equal(promoRes.status, 200);
assert.equal(textById(promoRes.text, "promo-p-s"), "201", "revalidatePath('/grp/promo') must refresh promo page");
assert.equal(textById(promoRes.text, "promo-h"), "202", "promo PPR hole must stream live 202");
assert.equal(textById(promoRes.text, "alpha-l-s"), "100", "(alpha) shared layout must stay frozen on leaf revalidatePath");
assert.equal(textById(promoRes.text, "grp-outer-s"), "100", "outer shared layout must stay frozen");
assert.ok(!promoRes.text.includes(POISON), "revalidatePath('/grp/promo') must never leak poisoned sentinel");
assert.equal(fs.existsSync(path.join(dist2, "grp/promo/layout.rsc")), false, "Leaf without own layout must NOT create phantom grp/promo/layout.rsc");

const settingsCheck1 = await req("/grp/settings");
assert.equal(textById(settingsCheck1.text, "beta-l-s"), "100", "(beta) layout must stay frozen");
assert.equal(textById(settingsCheck1.text, "settings-p-s"), "100", "(beta)/settings page must stay frozen");

// 1b. revalidatePath("/grp/sub") (co-located layout inside (alpha)!) refreshes BOTH grp/(alpha)/sub layout AND page!
writeS({
  grpOuter: POISON,
  alphaL: POISON,
  betaL: POISON,
  subL: 211,
  subP: 212,
  subH: 213,
});
await rscMod.revalidatePath("/grp/sub");
assert.equal(fs.existsSync(path.join(dist2, "grp/sub/layout.rsc")), false, "Must NOT write phantom grp/sub/layout.rsc outside (alpha)");
assert.ok(fs.existsSync(path.join(dist2, "grp/(alpha)/sub/layout.rsc")), "Must update canonical grp/(alpha)/sub/layout.rsc");
const subRes = await req("/grp/sub");
assert.equal(subRes.status, 200);
assert.equal(textById(subRes.text, "sub-l-s"), "211", "revalidatePath('/grp/sub') must refresh co-located (alpha)/sub layout");
assert.equal(textById(subRes.text, "sub-p-s"), "212", "revalidatePath('/grp/sub') must refresh /grp/sub page");
assert.equal(textById(subRes.text, "sub-h"), "213", "/grp/sub PPR hole must stream live");
assert.equal(textById(subRes.text, "alpha-l-s"), "100", "Parent (alpha) layout must stay frozen");
assert.equal(textById(subRes.text, "grp-outer-s"), "100", "Outer shared layout must stay frozen");
assert.ok(!subRes.text.includes(POISON), "revalidatePath('/grp/sub') must never leak poisoned sentinel");

// 1c. revalidatePath("/grp/(alpha)") refreshes ONLY (alpha) layout; promo & promo2 lazily pick it up while keeping page shells & (beta) frozen!
writeS({
  grpOuter: POISON,
  alphaL: 221,
  promoP: POISON,
  promo2P: POISON,
  betaL: POISON,
  settingsP: POISON,
});
await rscMod.revalidatePath("/grp/(alpha)");
const promoAfterAlpha = await req("/grp/promo");
assert.equal(textById(promoAfterAlpha.text, "alpha-l-s"), "221", "revalidatePath('/grp/(alpha)') must update (alpha) layout");
assert.equal(textById(promoAfterAlpha.text, "promo-p-s"), "201", "promo page shell must stay frozen at 201");
assert.equal(textById(promoAfterAlpha.text, "grp-outer-s"), "100", "outer shared layout must stay frozen");
assert.ok(!promoAfterAlpha.text.includes(POISON));

const betaAfterAlpha = await req("/grp/settings");
assert.equal(textById(betaAfterAlpha.text, "beta-l-s"), "100", "(beta) layout must stay isolated from (alpha)");
assert.equal(textById(betaAfterAlpha.text, "settings-p-s"), "100");
assert.ok(!betaAfterAlpha.text.includes(POISON));

// 1d. Co-located group layout + page at /grp-home (src/grp-home/(index)/layout.tsx + page.tsx under shared src/grp-home/layout.tsx)
writeS({
  grpHomeOuter: POISON,
  grpHomeIndexL: 231,
  grpHomeIndexP: 232,
});
await rscMod.revalidatePath("/grp-home");
const ghRes = await req("/grp-home");
assert.equal(ghRes.status, 200);
assert.equal(textById(ghRes.text, "gh-idx-l-s"), "231", "revalidatePath('/grp-home') must refresh co-located (index) layout");
assert.equal(textById(ghRes.text, "gh-idx-p-s"), "232", "revalidatePath('/grp-home') must refresh co-located (index) page");
assert.equal(textById(ghRes.text, "gh-outer-s"), "100", "Parent grp-home/layout.tsx must stay frozen (NOT re-executed!)");
assert.ok(!ghRes.text.includes(POISON));

// ============================================================================
// 2. Optional Catch-All [[...slug]] (0-seg, 1-seg with query/hash/trailing slash, 2-seg, percent-encoded)
// ============================================================================
// 2a. 0-seg revalidatePath("/ca") MUST refresh BOTH ca/[[...slug]] 0-seg layout AND 0-seg page WITHOUT touching outer ca/layout.tsx, /ca/docs, or /ca/docs/v2!
writeS({
  caOuter: POISON,
  caRootL: 301,
  caRootP: 302,
  caRootH: 303,
  caDocsL: POISON,
  caDocsP: POISON,
  caV2L: POISON,
  caV2P: POISON,
});
await rscMod.revalidatePath("/ca");
const caRootRes = await req("/ca");
assert.equal(caRootRes.status, 200);
assert.equal(textById(caRootRes.text, "ca-l2-s"), "301", "0-seg revalidatePath('/ca') MUST refresh [[...slug]] 0-seg layout!");
assert.equal(textById(caRootRes.text, "ca-p-s"), "302", "0-seg revalidatePath('/ca') MUST refresh 0-seg page!");
assert.equal(textById(caRootRes.text, "ca-h"), "303", "0-seg PPR hole must stream live");
assert.equal(textById(caRootRes.text, "ca-outer-s"), "100", "Shared parent ca/layout.tsx MUST stay frozen!");
assert.ok(!caRootRes.text.includes(POISON));

// Verify /ca/docs & /ca/docs/v2 stayed 100% untouched!
const caDocsUntouched = await req("/ca/docs");
assert.equal(textById(caDocsUntouched.text, "ca-l2-s"), "100", "/ca/docs layout must stay untouched after revalidatePath('/ca')");
assert.equal(textById(caDocsUntouched.text, "ca-p-s"), "100", "/ca/docs page must stay untouched");
assert.equal(textById(caDocsUntouched.text, "ca-outer-s"), "100");
assert.ok(!caDocsUntouched.text.includes(POISON));

// 2b. 2-seg revalidatePath("/ca/docs/v2") refreshes BOTH 2-seg layout & page without touching 0-seg or /ca/docs!
writeS({
  caOuter: POISON,
  caRootL: POISON,
  caRootP: POISON,
  caDocsL: POISON,
  caDocsP: POISON,
  caV2L: 311,
  caV2P: 312,
});
await rscMod.revalidatePath("/ca/docs/v2");
const caV2Res = await req("/ca/docs/v2");
assert.equal(textById(caV2Res.text, "ca-l2-s"), "311", "2-seg revalidatePath('/ca/docs/v2') must refresh 2-seg layout");
assert.equal(textById(caV2Res.text, "ca-p-s"), "312", "2-seg revalidatePath('/ca/docs/v2') must refresh 2-seg page");
assert.equal(textById(caV2Res.text, "ca-outer-s"), "100");
assert.ok(!caV2Res.text.includes(POISON));

const caRootStill301 = await req("/ca");
assert.equal(textById(caRootStill301.text, "ca-l2-s"), "301", "0-seg layout must stay at 301");
assert.equal(textById(caRootStill301.text, "ca-p-s"), "302", "0-seg page must stay at 302");

// 2c. Trailing slash + query string + hash stripping: revalidatePath("/ca/docs/?foo=bar#section")
writeS({ caOuter: POISON, caDocsL: 321, caDocsP: 322 });
await rscMod.revalidatePath("/ca/docs/?foo=bar#section");
const caDocsRefreshed = await req("/ca/docs");
assert.equal(textById(caDocsRefreshed.text, "ca-l2-s"), "321", "Query/hash/slash-stripped revalidatePath must refresh /ca/docs layout");
assert.equal(textById(caDocsRefreshed.text, "ca-p-s"), "322", "Query/hash/slash-stripped revalidatePath must refresh /ca/docs page");
assert.ok(!caDocsRefreshed.text.includes(POISON));

// 2d. Percent-encoded segment: revalidatePath("/ca/hello%20world/?x=1#y")
writeS({ caOuter: POISON, caSpaceL: 331, caSpaceP: 332 });
await rscMod.revalidatePath("/ca/hello%20world/?x=1#y");
const caSpaceRefreshed = await req("/ca/hello%20world");
assert.equal(textById(caSpaceRefreshed.text, "ca-l2-s"), "331", "Percent-encoded revalidatePath must refresh decoded layout key");
assert.equal(textById(caSpaceRefreshed.text, "ca-p-s"), "332", "Percent-encoded revalidatePath must refresh percent-encoded page key");
assert.ok(!caSpaceRefreshed.text.includes(POISON));

// ============================================================================
// 3. Asymmetric Chain: L1(S PPR) -> L2(Dynamic 0) -> L3(S PPR) -> Page(S PPR)
// ============================================================================
writeS({
  asymL1: POISON,
  asymL1H: 401,
  asymDynL2: 402,
  asymL3: 403,
  asymL3H: 404,
  asymPage: 405,
  asymPageH: 406,
});
await rscMod.revalidatePath("/asym/dyn/l3");
assert.equal(fs.existsSync(path.join(dist2, "asym/dyn/layout.rsc")), false, "Dynamic L2 must NEVER be cached");
assert.equal(fs.existsSync(path.join(dist2, "asym/dyn/l3/index.html")), false, "Asymmetric route under Dynamic L2 must NEVER cache index.html");
assert.ok(fs.existsSync(path.join(dist2, "asym/dyn/l3/shell.layout.own.json")), "Static L3 under Dynamic L2 must persist shell.layout.own.json");
assert.ok(fs.existsSync(path.join(dist2, "asym/dyn/l3/shell.page.json")), "PPR Page under Dynamic L2 must persist shell.page.json");

const asymAfter = await req("/asym/dyn/l3");
assert.equal(asymAfter.status, 200);
assert.equal(textById(asymAfter.text, "asym-l1-s"), "100", "Asymmetric L1 static shell must stay frozen at 100");
assert.equal(textById(asymAfter.text, "asym-l1-h"), "401", "Asymmetric L1 PPR hole must stream live 401");
assert.equal(textById(asymAfter.text, "asym-l2-s"), "402", "Asymmetric Dynamic L2 must render live 402");
assert.equal(textById(asymAfter.text, "asym-l3-s"), "403", "revalidatePath must refresh co-located L3 static shell to 403");
assert.equal(textById(asymAfter.text, "asym-l3-h"), "404", "Asymmetric L3 PPR hole must stream live 404");
assert.equal(textById(asymAfter.text, "asym-p-s"), "405", "revalidatePath must refresh PPR page shell to 405");
assert.equal(textById(asymAfter.text, "asym-p-h"), "406", "Asymmetric Page PPR hole must stream live 406");
assert.ok(!asymAfter.text.includes(POISON), "Asymmetric revalidatePath must never leak poisoned sentinel");

// Bump Dynamic L2 again -> proves L2 was NOT frozen!
writeS({ asymDynL2: 407, asymL3: POISON, asymPage: POISON });
const asymLiveCheck = await req("/asym/dyn/l3");
assert.equal(textById(asymLiveCheck.text, "asym-l2-s"), "407", "Dynamic L2 must remain live after revalidatePath");
assert.equal(textById(asymLiveCheck.text, "asym-l3-s"), "403", "L3 shell must stay cached at 403");
assert.equal(textById(asymLiveCheck.text, "asym-p-s"), "405", "Page shell must stay cached at 405");
assert.ok(!asymLiveCheck.text.includes(POISON));

// ============================================================================
// 4. Relative Path Resolution, Deprecated 2nd-Arg Warning & Same-ms Monotonic Timestamps
// ============================================================================
// 4a. Relative "../promo2" via x-dinou-current-path header
writeS({ grpOuter: POISON, alphaL: POISON, promo2P: 501 });
await requestStorage.run(
  {
    req: {
      path: "/____server_function____",
      headers: { "x-dinou-current-path": "/grp/promo" },
    },
  },
  async () => {
    await rscMod.revalidatePath("../promo2");
  }
);
const promo2AfterRel = await req("/grp/promo2");
assert.equal(textById(promo2AfterRel.text, "promo2-p-s"), "501", "Relative '../promo2' via x-dinou-current-path must refresh /grp/promo2");
assert.equal(textById(promo2AfterRel.text, "alpha-l-s"), "221", "(alpha) layout must stay frozen at 221");
assert.ok(!promo2AfterRel.text.includes(POISON));

// 4b. Relative "./" via Referer (Web Headers instance!)
writeS({ grpOuter: POISON, alphaL: POISON, promoP: 502 });
await requestStorage.run(
  {
    req: {
      path: "/____server_function____",
      headers: new Headers({ Referer: "http://localhost:3000/grp/promo?foo=1#top" }),
    },
  },
  async () => {
    await rscMod.revalidatePath("./");
  }
);
const promoAfterReferer = await req("/grp/promo");
assert.equal(textById(promoAfterReferer.text, "promo-p-s"), "502", "Relative './' via Web Headers Referer must refresh /grp/promo");
assert.ok(!promoAfterReferer.text.includes(POISON));

// 4c. Relative "./sub" from "/grp" refreshes BOTH co-located (alpha)/sub layout AND page!
writeS({ grpOuter: POISON, alphaL: POISON, subL: 503, subP: 504 });
await requestStorage.run(
  {
    req: {
      path: "/____server_function____",
      headers: { "x-dinou-current-path": "/grp" },
    },
  },
  async () => {
    await rscMod.revalidatePath("./sub");
  }
);
const subAfterRel = await req("/grp/sub");
assert.equal(textById(subAfterRel.text, "sub-l-s"), "503", "Relative './sub' from '/grp' must refresh co-located sub layout");
assert.equal(textById(subAfterRel.text, "sub-p-s"), "504", "Relative './sub' from '/grp' must refresh sub page");
assert.ok(!subAfterRel.text.includes(POISON));

// 4d. Deprecated 2nd-arg warning emits once and still revalidates cleanly
const origWarn = console.warn;
const warnLogs = [];
console.warn = (...args) => warnLogs.push(args.join(" "));
try {
  writeS({ promoP: 505 });
  await rscMod.revalidatePath("/grp/promo", { cascade: true });
} finally {
  console.warn = origWarn;
}
assert.equal(
  warnLogs.filter((w) => w.includes("deprecated") && w.includes("revalidatePath")).length,
  1,
  "Passing 2nd arg to revalidatePath must emit deprecation warning exactly once"
);
const promoAfterDep = await req("/grp/promo");
assert.equal(textById(promoAfterDep.text, "promo-p-s"), "505", "revalidatePath with deprecated 2nd arg must still revalidate");

// 4e. Back-to-back same-millisecond revalidatePath calls advance generatedAt strictly monotonically!
const origDateNow = Date.now;
const frozenMs = origDateNow() + 5000;
Date.now = () => frozenMs;
try {
  const layoutGens = [];
  const pageGens = [];
  const htmlBuildIds = [];
  for (let i = 0; i < 3; i++) {
    writeS({ caRootL: 601 + i, caRootP: 701 + i });
    await rscMod.revalidatePath("/ca");
    const lMeta = JSON.parse(fs.readFileSync(path.join(dist2, "ca/[[...slug]]/layout.metadata.json"), "utf8"));
    const pMeta = JSON.parse(fs.readFileSync(path.join(dist2, "ca/metadata.json"), "utf8"));
    const html = fs.readFileSync(path.join(dist2, "ca/index.html"), "utf8");
    const m = html.match(/window\\.__DINOU_BUILD_ID__\\s*=\\s*"(\\d+)"/);
    layoutGens.push(Number(lMeta.generatedAt));
    pageGens.push(Number(pMeta.generatedAt));
    htmlBuildIds.push(m ? Number(m[1]) : 0);
  }
  assert.ok(layoutGens[0] < layoutGens[1] && layoutGens[1] < layoutGens[2], "Layout generatedAt must advance strictly monotonically in same ms: " + JSON.stringify(layoutGens));
  assert.ok(pageGens[0] < pageGens[1] && pageGens[1] < pageGens[2], "Page generatedAt must advance strictly monotonically in same ms: " + JSON.stringify(pageGens));
  for (let i = 0; i < 3; i++) {
    assert.equal(htmlBuildIds[i], pageGens[i], "HTML __DINOU_BUILD_ID__ must match metadata.json generatedAt on iteration " + i);
    assert.ok(pageGens[i] > layoutGens[i], "Page generatedAt must be > layout generatedAt after revalidatePath");
  }
} finally {
  Date.now = origDateNow;
}

console.log("PHASE6_STAGE1_REVALIDATE_PATH_MATRIX_OK");
`
    );

    const runRes = spawnSync(process.execPath, [verifyScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
      timeout: 60_000,
    });
    assert.equal(
      runRes.status,
      0,
      `Phase 6 Stage 1 revalidatePath matrix failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("PHASE6_STAGE1_REVALIDATE_PATH_MATRIX_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("2. [Phase 6 / Stage 2 / Check #80] revalidateTag() Complete Matrix (All 5 Placements Shared Tag, Raw Slot ID vs Tag, Nested Slots, Parameterized Tags, Partial-Failure slotBackups Metadata Rollback & Cloudflare Workers Ancestor Ordering)", async () => {
  const tmpApp = createFixtureDir("p6-s2-reval-tag-");
  try {
    writeDinouShim(tmpApp);
    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "p6-s2-reval-tag", private: true, type: "module" }, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpApp, "p6s2-state.json"),
      JSON.stringify({
        l1Shell: 100,
        l1Slot: 100,
        l2Host: 100,
        l2Slot: 100,
        l3Shell: 100,
        l3Slot: 100,
        pageShell: 100,
        pageSlot: 100,
        holeSlot: 100,
        holeHost: 100,
        outerSlot: 100,
        innerSlot: 100,
        pfSlotA: 100,
        pfSlotB: 100,
        throwSlotB: false,
        cfL1: 100,
        cfL1DelayMs: 0,
        cfL2: 100,
        cfPage: 100,
        cfSlot: 100,
        grpOuter: 100,
        alphaL: 100,
        betaL: 100,
        caRootL: 100,
        caDocsL: 100,
        caV2L: 100,
        item42: 100,
        item99: 100,
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
export function readS() {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "p6s2-state.json"), "utf8"));
}
export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
`
    );

    write(
      "src/layout.tsx",
      `import type { ReactNode } from "react";
export default function Root({ children }: { children: ReactNode }) {
  return <html lang="en"><head><title>P6S2</title></head><body>{children}</body></html>;
}
`
    );
    write("src/page.tsx", `export default function Home() { return <main>home</main>; }\n`);

    // 1. Asymmetric 3D PPR Matrix: L1(S PPR + slot) -> L2(Dyn + slot) -> L3(S PPR + slot) -> Page(S PPR + page slot + hole slot + nested outer->inner + partial-fail slots)
    write("src/tm/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/tm/layout.tsx",
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function TmL1({ children }: { children: ReactNode }) {
  return (
    <section id="tm-l1">
      <span id="tm-l1-shell">{readS().l1Shell}</span>
      <DinouCacheSlot id="tm-l1-slot" revalidate={3600} tags={["shared-matrix-tag", "tm-l1-only"]}>
        {async () => <span id="tm-l1-slot-v">{readS().l1Slot}</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
`
    );

    write("src/tm/dyn/layout_functions.ts", `export function revalidate() { return 0; }\n`);
    write(
      "src/tm/dyn/layout.tsx",
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../../state";
export default function TmL2Dyn({ children }: { children: ReactNode }) {
  return (
    <div id="tm-l2">
      <span id="tm-l2-host">{readS().l2Host}</span>
      <DinouCacheSlot id="tm-l2-slot" revalidate={3600} tags={["shared-matrix-tag", "tm-l2-only"]}>
        {async () => <span id="tm-l2-slot-v">{readS().l2Slot}</span>}
      </DinouCacheSlot>
      {children}
    </div>
  );
}
`
    );

    write("src/tm/dyn/l3/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/tm/dyn/l3/layout.tsx",
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../../../state";
export default function TmL3({ children }: { children: ReactNode }) {
  return (
    <div id="tm-l3">
      <span id="tm-l3-shell">{readS().l3Shell}</span>
      <DinouCacheSlot id="tm-l3-slot" revalidate={3600} tags={["shared-matrix-tag", "tm-l3-only"]}>
        {async () => <span id="tm-l3-slot-v">{readS().l3Slot}</span>}
      </DinouCacheSlot>
      {children}
    </div>
  );
}
`
    );

    write("src/tm/dyn/l3/page_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/tm/dyn/l3/page.tsx",
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../../../state";

async function TmHole() {
  void getContext()?.req?.headers?.["x-tm-hole"];
  await Promise.resolve();
  return (
    <div id="tm-hole">
      <span id="tm-hole-host">{readS().holeHost}</span>
      <DinouCacheSlot id="tm-hole-slot" revalidate={3600} tags={["shared-matrix-tag", "tm-hole-only"]}>
        {async () => <span id="tm-hole-slot-v">{readS().holeSlot}</span>}
      </DinouCacheSlot>
    </div>
  );
}

export default function TmPage() {
  return (
    <article id="tm-page">
      <span id="tm-page-shell">{readS().pageShell}</span>
      <DinouCacheSlot id="tm-page-slot" revalidate={3600} tags={["shared-matrix-tag", "tm-page-only"]}>
        {async () => <span id="tm-page-slot-v">{readS().pageSlot}</span>}
      </DinouCacheSlot>
      <DinouCacheSlot id="tm-outer-slot" revalidate={3600} tags={["tm-outer-tag"]}>
        {async () => (
          <div id="tm-outer-wrap">
            <span id="tm-outer-v">{readS().outerSlot}</span>
            <DinouCacheSlot id="tm-inner-slot" revalidate={3600} tags={["tm-inner-tag"]}>
              {async () => <span id="tm-inner-v">{readS().innerSlot}</span>}
            </DinouCacheSlot>
          </div>
        )}
      </DinouCacheSlot>
      <DinouCacheSlot id="tm-pf-a" revalidate={3600} tags={["partial-fail-tag", "tm-pf-a-only"]}>
        {async () => <span id="tm-pf-a-v">{readS().pfSlotA}</span>}
      </DinouCacheSlot>
      <DinouCacheSlot id="tm-pf-b" revalidate={3600} tags={["partial-fail-tag", "tm-pf-b-only"]}>
        {async () => {
          const st = readS();
          if (st.throwSlotB) throw new Error("Simulated Partial-Fail Slot B Crash");
          return <span id="tm-pf-b-v">{st.pfSlotB}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span>fb-tm</span>}><TmHole /></Suspense>
    </article>
  );
}
`
    );

    // 2. Cloudflare Workers Ancestor-First Cascade Chain: /cf/child (L1 slow 120ms -> L2 fast 0ms -> Page + Slot, ALL tagged "cascade-all")
    write(
      "src/cf/layout_functions.ts",
      `export function revalidate() { return 3600; }
export function getCacheTags() { return ["cascade-all"]; }
`
    );
    write(
      "src/cf/layout.tsx",
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../state";
export default async function CfL1({ children }: { children: ReactNode }) {
  const s = readS();
  if (s.cfL1DelayMs > 0) await sleep(s.cfL1DelayMs);
  return (
    <section id="cf-l1">
      <span id="cf-l1-v">{readS().cfL1}</span>
      <DinouCacheSlot id="cf-shared-slot" revalidate={3600} tags={["cascade-all"]}>
        {async () => <span id="cf-slot-v">{readS().cfSlot}</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
`
    );
    write(
      "src/cf/child/layout_functions.ts",
      `export function revalidate() { return 3600; }
export function getCacheTags() { return ["cascade-all"]; }
`
    );
    write(
      "src/cf/child/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function CfL2({ children }: { children: ReactNode }) {
  return <div id="cf-l2"><span id="cf-l2-v">{readS().cfL2}</span>{children}</div>;
}
`
    );
    write(
      "src/cf/child/page_functions.ts",
      `export function revalidate() { return 3600; }
export function getCacheTags() { return ["cascade-all"]; }
`
    );
    write(
      "src/cf/child/page.tsx",
      `import { readS } from "../../state";
export default function CfPage() {
  return <article id="cf-p"><span id="cf-p-v">{readS().cfPage}</span></article>;
}
`
    );

    // 3. Parameterized getCacheTags(params) on (alpha)/(beta), [[...slug]], and [id]
    write("src/pg/layout_functions.ts", `export function revalidate() { return 3600; }\n`);
    write(
      "src/pg/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../state";
export default function PgOuter({ children }: { children: ReactNode }) {
  return <section><span id="pg-outer">{readS().grpOuter}</span>{children}</section>;
}
`
    );
    write(
      "src/pg/(alpha)/layout_functions.ts",
      `export function revalidate() { return 3600; }
export function getCacheTags() { return ["grp-alpha-only"]; }
`
    );
    write(
      "src/pg/(alpha)/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function PgAlpha({ children }: { children: ReactNode }) {
  return <div><span id="pg-alpha">{readS().alphaL}</span>{children}</div>;
}
`
    );
    write("src/pg/(alpha)/a/page_functions.ts", `export function revalidate() { return 3600; }\n`);
    write("src/pg/(alpha)/a/page.tsx", `export default function PgA() { return <p id="pg-a">a</p>; }\n`);

    write(
      "src/pg/(beta)/layout_functions.ts",
      `export function revalidate() { return 3600; }
export function getCacheTags() { return ["grp-beta-only"]; }
`
    );
    write(
      "src/pg/(beta)/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function PgBeta({ children }: { children: ReactNode }) {
  return <div><span id="pg-beta">{readS().betaL}</span>{children}</div>;
}
`
    );
    write("src/pg/(beta)/b/page_functions.ts", `export function revalidate() { return 3600; }\n`);
    write("src/pg/(beta)/b/page.tsx", `export default function PgB() { return <p id="pg-b">b</p>; }\n`);

    write(
      "src/slugs/[[...slug]]/layout_functions.ts",
      `export function revalidate() { return 3600; }
export function getStaticPaths() { return [[], ["docs"], ["docs", "v2"]]; }
export function getCacheTags(params: { slug?: string[] }) {
  const k = Array.isArray(params?.slug) && params.slug.length > 0 ? params.slug.join("-") : "root";
  return ["slug-" + k];
}
`
    );
    write(
      "src/slugs/[[...slug]]/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function SlugL({ children, params }: { children: ReactNode; params?: { slug?: string[] } }) {
  const k = Array.isArray(params?.slug) && params.slug.length > 0 ? params.slug.join("-") : "root";
  const s = readS();
  const v = k === "docs" ? s.caDocsL : k === "docs-v2" ? s.caV2L : s.caRootL;
  return <div><span id="slug-l">{v}</span>{children}</div>;
}
`
    );
    write(
      "src/slugs/[[...slug]]/page_functions.ts",
      `export function revalidate() { return 3600; }
export function getStaticPaths() { return [[], ["docs"], ["docs", "v2"]]; }
`
    );
    write("src/slugs/[[...slug]]/page.tsx", `export default function SlugP() { return <p id="slug-p">ok</p>; }\n`);

    write(
      "src/items/[id]/page_functions.ts",
      `export function revalidate() { return 3600; }
export function getStaticPaths() { return ["42", "99"]; }
export function getCacheTags(params: { id?: string }) { return ["item-" + String(params?.id || "")]; }
`
    );
    write(
      "src/items/[id]/page.tsx",
      `import { readS } from "../../state";
export default function ItemP({ params }: { params?: { id?: string } }) {
  const s = readS();
  return <article><span id="item-v">{params?.id === "42" ? s.item42 : s.item99}</span></article>;
}
`
    );

    const buildRes = spawnSync(process.execPath, [CLI_PATH, "build:node:esbuild"], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      timeout: 120_000,
    });
    assert.equal(
      buildRes.status,
      0,
      `Phase 6 Stage 2 build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    const verifyScript = path.join(tmpApp, "verify-p6-stage2.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const dist2 = path.resolve(".dinou/dist2");
setStorageAdapter(new FileSystemStorage(dist2));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const writeS = (patch) => {
  const f = path.resolve("p6s2-state.json");
  const cur = JSON.parse(fs.readFileSync(f, "utf8"));
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const req = async (u) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u), opts);
  return { status: r.status, headers: r.headers, text: await r.text() };
};
const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
};
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(dist2, rel), "utf8"));

const POISON = "POISON_999";

// Warm asymmetric /tm/dyn/l3 so L2 dynamic slot, L3 own fragment, Page shell, and Hole slot are all cached!
const warmTm = await req("/tm/dyn/l3");
assert.equal(warmTm.status, 200);
assert.equal(textById(warmTm.text, "tm-l1-slot-v"), "100");
assert.equal(textById(warmTm.text, "tm-l2-slot-v"), "100");
assert.equal(textById(warmTm.text, "tm-l3-slot-v"), "100");
assert.equal(textById(warmTm.text, "tm-page-slot-v"), "100");
assert.equal(textById(warmTm.text, "tm-hole-slot-v"), "100");
assert.equal(textById(warmTm.text, "tm-outer-v"), "100");
assert.equal(textById(warmTm.text, "tm-inner-v"), "100");
assert.equal(textById(warmTm.text, "tm-pf-a-v"), "100");
assert.equal(textById(warmTm.text, "tm-pf-b-v"), "100");

const l1OwnGenBefore = readJson("tm/layout.metadata.json").ownGeneratedAt || readJson("tm/layout.metadata.json").layoutGeneratedAt;
const l3OwnGenBefore = readJson("tm/dyn/l3/layout.metadata.json").ownGeneratedAt || readJson("tm/dyn/l3/layout.metadata.json").layoutGeneratedAt;
const pageOwnGenBefore = readJson("tm/dyn/l3/metadata.json").pageGeneratedAt || readJson("tm/dyn/l3/metadata.json").generatedAt;

// ============================================================================
// 1. Shared Multi-Slot Tag Fan-Out across ALL 5 placements (L1, Dyn L2, L3, Page shell, PPR hole)
// ============================================================================
writeS({
  l1Shell: POISON,
  l3Shell: POISON,
  pageShell: POISON,
  outerSlot: POISON,
  innerSlot: POISON,
  pfSlotA: POISON,
  pfSlotB: POISON,
  l2Host: 200,
  holeHost: 200,
  l1Slot: 201,
  l2Slot: 202,
  l3Slot: 203,
  pageSlot: 204,
  holeSlot: 205,
});
await rscMod.revalidateTag("shared-matrix-tag");
const afterShared = await req("/tm/dyn/l3");
assert.equal(afterShared.status, 200);
assert.equal(textById(afterShared.text, "tm-l1-slot-v"), "201", "L1 shell slot must refresh on shared-matrix-tag");
assert.equal(textById(afterShared.text, "tm-l2-slot-v"), "202", "Dynamic L2 slot must refresh on shared-matrix-tag");
assert.equal(textById(afterShared.text, "tm-l3-slot-v"), "203", "Static L3 slot under Dynamic L2 must refresh on shared-matrix-tag");
assert.equal(textById(afterShared.text, "tm-page-slot-v"), "204", "Page shell slot must refresh on shared-matrix-tag");
assert.equal(textById(afterShared.text, "tm-hole-slot-v"), "205", "Page PPR hole slot must refresh on shared-matrix-tag");
assert.equal(textById(afterShared.text, "tm-l1-shell"), "100", "L1 shell must stay 100% frozen");
assert.equal(textById(afterShared.text, "tm-l3-shell"), "100", "L3 shell must stay 100% frozen");
assert.equal(textById(afterShared.text, "tm-page-shell"), "100", "Page shell must stay 100% frozen");
assert.equal(textById(afterShared.text, "tm-outer-v"), "100", "Unrelated outer slot must stay frozen");
assert.equal(textById(afterShared.text, "tm-inner-v"), "100", "Unrelated inner slot must stay frozen");
assert.ok(!afterShared.text.includes(POISON), "Shared multi-slot revalidateTag must never leak poisoned shells");

assert.equal(
  readJson("tm/layout.metadata.json").ownGeneratedAt || readJson("tm/layout.metadata.json").layoutGeneratedAt,
  l1OwnGenBefore,
  "L1 ownGeneratedAt must stay unchanged on slot-only revalidateTag"
);
assert.equal(
  readJson("tm/dyn/l3/layout.metadata.json").ownGeneratedAt || readJson("tm/dyn/l3/layout.metadata.json").layoutGeneratedAt,
  l3OwnGenBefore,
  "L3 ownGeneratedAt must stay unchanged on slot-only revalidateTag"
);
assert.equal(
  readJson("tm/dyn/l3/metadata.json").pageGeneratedAt,
  pageOwnGenBefore,
  "Page pageGeneratedAt must stay unchanged on slot-only revalidateTag"
);

// ============================================================================
// 2. Raw Slot ID vs Declared Tag (surgical single-slot invalidation)
// ============================================================================
writeS({
  l1Shell: POISON, l3Shell: POISON, pageShell: POISON,
  l1Slot: 301, l2Slot: POISON, l3Slot: POISON, pageSlot: POISON, holeSlot: POISON,
});
await rscMod.revalidateTag("tm-l1-slot"); // RAW SLOT ID!
const afterRawId = await req("/tm/dyn/l3");
assert.equal(textById(afterRawId.text, "tm-l1-slot-v"), "301", "Raw slot ID revalidateTag('tm-l1-slot') must refresh L1 slot");
assert.equal(textById(afterRawId.text, "tm-l2-slot-v"), "202", "Sibling L2 slot must stay frozen");
assert.equal(textById(afterRawId.text, "tm-l3-slot-v"), "203", "Sibling L3 slot must stay frozen");
assert.equal(textById(afterRawId.text, "tm-page-slot-v"), "204", "Sibling Page slot must stay frozen");
assert.equal(textById(afterRawId.text, "tm-hole-slot-v"), "205", "Sibling Hole slot must stay frozen");
assert.ok(!afterRawId.text.includes(POISON));

writeS({ l1Slot: POISON, pageSlot: 302 });
await rscMod.revalidateTag("tm-page-only"); // DECLARED TAG!
const afterDeclTag = await req("/tm/dyn/l3");
assert.equal(textById(afterDeclTag.text, "tm-page-slot-v"), "302", "Declared tag revalidateTag('tm-page-only') must refresh Page slot");
assert.equal(textById(afterDeclTag.text, "tm-l1-slot-v"), "301", "L1 slot must stay at 301");
assert.ok(!afterDeclTag.text.includes(POISON));

// ============================================================================
// 3. Nested Slots (Outer -> Inner): Inner-only vs Outer-only isolation
// ============================================================================
writeS({ pageShell: POISON, outerSlot: POISON, innerSlot: 401 });
await rscMod.revalidateTag("tm-inner-tag");
const afterInner = await req("/tm/dyn/l3");
assert.equal(textById(afterInner.text, "tm-inner-v"), "401", "Inner slot must update to 401");
assert.equal(textById(afterInner.text, "tm-outer-v"), "100", "Outer slot must stay frozen at 100");
assert.ok(!afterInner.text.includes(POISON));

writeS({ pageShell: POISON, outerSlot: 402, innerSlot: POISON });
await rscMod.revalidateTag("tm-outer-tag");
const afterOuter = await req("/tm/dyn/l3");
assert.equal(textById(afterOuter.text, "tm-outer-v"), "402", "Outer slot must update to 402");
assert.equal(textById(afterOuter.text, "tm-inner-v"), "401", "Inner slot must stay frozen at 401");
assert.ok(!afterOuter.text.includes(POISON));

// ============================================================================
// 4. Partial-Failure Rollback (slotBackups) + Full slot.metadata.json Preservation + Cold Recovery
// ============================================================================
writeS({ pageShell: POISON, pfSlotA: 501, pfSlotB: 502, throwSlotB: true });
await rscMod.revalidateTag("partial-fail-tag");
const afterPartialFail = await req("/tm/dyn/l3");
assert.equal(afterPartialFail.status, 200);
assert.equal(textById(afterPartialFail.text, "tm-pf-a-v"), "501", "Healthy Slot A must commit 501 during partial failure");
assert.equal(textById(afterPartialFail.text, "tm-pf-b-v"), "100", "Throwing Slot B must preserve last-known-good 100");
assert.ok(!afterPartialFail.text.includes(POISON));

// Verify slots/tm-pf-b/slot.json AND slots/tm-pf-b/slot.metadata.json were BOTH restored intact with full tags & revalidate!
assert.ok(fs.existsSync(path.join(dist2, "slots/tm-pf-b/slot.json")), "Failed Slot B slot.json must be restored");
const restoredSlotBMeta = readJson("slots/tm-pf-b/slot.metadata.json");
assert.ok(
  Array.isArray(restoredSlotBMeta.tags) && restoredSlotBMeta.tags.includes("partial-fail-tag"),
  "Restored Slot B slot.metadata.json MUST preserve tags: ['partial-fail-tag'], got " + JSON.stringify(restoredSlotBMeta)
);
assert.equal(restoredSlotBMeta.revalidate, 3600, "Restored Slot B slot.metadata.json MUST preserve revalidate: 3600");

// Now clear fault AND wipe slotRegistry (cold pod simulation!) -> re-running revalidateTag('partial-fail-tag') MUST still find & update Slot B!
globalThis[Symbol.for("dinou.slot.registry")]?.clear?.();
writeS({ pageShell: POISON, pfSlotA: 503, pfSlotB: 504, throwSlotB: false });
await rscMod.revalidateTag("partial-fail-tag");
const afterRecovery = await req("/tm/dyn/l3");
assert.equal(afterRecovery.status, 200);
assert.equal(textById(afterRecovery.text, "tm-pf-a-v"), "503", "Slot A must update to 503 after recovery");
assert.equal(textById(afterRecovery.text, "tm-pf-b-v"), "504", "Slot B must recover & update to 504 even after cold slotRegistry clear!");
assert.equal(textById(afterRecovery.text, "tm-page-shell"), "100", "Page shell must stay frozen at 100");
assert.ok(!afterRecovery.text.includes(POISON));

// ============================================================================
// 5. Cloudflare Workers Ancestor-First Ordering (navigator.userAgent === "Cloudflare-Workers")
//    L1 takes 140ms while L2 takes 0ms -> sequential loop guarantees L1 finishes BEFORE L2 starts!
// ============================================================================
const origNavDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "Cloudflare-Workers" },
  configurable: true,
  writable: true,
});
try {
  writeS({ cfL1: 601, cfL1DelayMs: 140, cfL2: 602, cfPage: 603, cfSlot: 604 });
  await rscMod.revalidateTag("cascade-all");
} finally {
  if (origNavDesc) {
    Object.defineProperty(globalThis, "navigator", origNavDesc);
  } else {
    delete globalThis.navigator;
  }
}
const cfL1Meta = readJson("cf/layout.metadata.json");
const cfL2Meta = readJson("cf/child/layout.metadata.json");
const cfPageMeta = readJson("cf/child/metadata.json");
assert.ok(
  Number(cfL1Meta.generatedAt) < Number(cfL2Meta.generatedAt),
  "Cloudflare Workers revalidateTag MUST commit L1 strictly before L2! L1=" + cfL1Meta.generatedAt + " L2=" + cfL2Meta.generatedAt
);
assert.ok(
  Number(cfL2Meta.generatedAt) < Number(cfPageMeta.generatedAt),
  "Cloudflare Workers revalidateTag MUST commit L2 strictly before Page! L2=" + cfL2Meta.generatedAt + " Page=" + cfPageMeta.generatedAt
);
const cfL2Rsc = fs.readFileSync(path.join(dist2, "cf/child/layout.rsc"), "utf8");
assert.ok(cfL2Rsc.includes("601"), "L2 layout.rsc MUST compose FRESH L1 (601) under Cloudflare Workers mode!");
assert.ok(cfL2Rsc.includes("602"), "L2 layout.rsc MUST contain fresh L2 (602)");
assert.ok(cfL2Rsc.includes("604"), "L2 layout.rsc MUST contain fresh L1 slot (604)");
const cfHtml = await req("/cf/child");
assert.equal(textById(cfHtml.text, "cf-l1-v"), "601");
assert.equal(textById(cfHtml.text, "cf-slot-v"), "604");
assert.equal(textById(cfHtml.text, "cf-l2-v"), "602");
assert.equal(textById(cfHtml.text, "cf-p-v"), "603");

// ============================================================================
// 6. Parameterized getCacheTags(params) on (alpha)/(beta), [[...slug]], and [id] + Deprecation Warning
// ============================================================================
writeS({ grpOuter: POISON, alphaL: 701, betaL: POISON });
await rscMod.revalidateTag("grp-alpha-only");
const pgA = await req("/pg/a");
const pgB = await req("/pg/b");
assert.equal(textById(pgA.text, "pg-alpha"), "701", "(alpha) layout must update on grp-alpha-only");
assert.equal(textById(pgA.text, "pg-outer"), "100", "Outer layout must stay frozen");
assert.equal(textById(pgB.text, "pg-beta"), "100", "(beta) layout must stay frozen");
assert.ok(!pgA.text.includes(POISON) && !pgB.text.includes(POISON));

writeS({ caRootL: POISON, caDocsL: POISON, caV2L: 711 });
await rscMod.revalidateTag("slug-docs-v2");
assert.equal(textById((await req("/slugs/docs/v2")).text, "slug-l"), "711", "2-seg [[...slug]] must update on slug-docs-v2");
assert.equal(textById((await req("/slugs")).text, "slug-l"), "100", "0-seg [[...slug]] must stay frozen");
assert.equal(textById((await req("/slugs/docs")).text, "slug-l"), "100", "1-seg [[...slug]] must stay frozen");

const origWarn = console.warn;
const warnLogs = [];
console.warn = (...args) => warnLogs.push(args.join(" "));
try {
  writeS({ item42: 721, item99: POISON });
  await rscMod.revalidateTag("item-42", { cascade: true });
} finally {
  console.warn = origWarn;
}
assert.equal(warnLogs.filter((w) => w.includes("deprecated") && w.includes("revalidateTag")).length, 1);
assert.equal(textById((await req("/items/42")).text, "item-v"), "721", "[id] item-42 must update");
assert.equal(textById((await req("/items/99")).text, "item-v"), "100", "[id] item-99 must stay frozen");

console.log("PHASE6_STAGE2_REVALIDATE_TAG_MATRIX_OK");
`
    );

    const runRes = spawnSync(process.execPath, [verifyScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
      timeout: 60_000,
    });
    assert.equal(
      runRes.status,
      0,
      `Phase 6 Stage 2 revalidateTag matrix failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("PHASE6_STAGE2_REVALIDATE_TAG_MATRIX_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("3. [Phase 6 / Stage 3 / Check #81] revalidateLayout() & revalidatePage() Surgical Contracts, No-Op Guards, Concurrent Stampede Deduplication & Causal _old Hydration Snapshots", async () => {
  const tmpApp = createFixtureDir("p6-s3-surgical-old-");
  try {
    writeDinouShim(tmpApp);
    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "p6-s3-surgical-old", private: true, type: "module" }, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpApp, "p6s3-state.json"),
      JSON.stringify({
        rootShell: 100,
        nestedL1: 100,
        nestedSlot: 100,
        nestedPage: 100,
        nestedHole: 100,
        nestedDelayMs: 0,
        staticDocL: 100,
        staticDocP: 100,
        asymL1: 100,
        asymDynL2: 100,
        asymL3: 100,
        asymPage: 100,
        dynPageVal: 100,
        alphaL: 100,
        betaL: 100,
        caRootL: 100,
        caV2L: 100,
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
const EXEC_KEY = Symbol.for("dinou.p6s3.execs");
export function readS() {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "p6s3-state.json"), "utf8"));
}
export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
export function bumpExec(name: string) {
  const m = ((globalThis as any)[EXEC_KEY] ||= {});
  m[name] = (m[name] || 0) + 1;
}
`
    );

    // Root static layout (3600s)
    write("src/layout_functions.ts", `export function revalidate() { return 3600; }\n`);
    write(
      "src/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "./state";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>P6S3</title></head>
      <body>
        <span id="s3-root">{readS().rootShell}</span>
        {children}
      </body>
    </html>
  );
}
`
    );
    write("src/page.tsx", `export default function Home() { return <main>home</main>; }\n`);

    // 1. Nested 3D PPR route: /nested/ppr (L1 PPR + Slot -> Page PPR + Hole; NO own layout on /nested/ppr!)
    write("src/nested/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/nested/layout.tsx",
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep, bumpExec } from "../state";
export default async function NestedL1({ children }: { children: ReactNode }) {
  bumpExec("nestedL1");
  const s = readS();
  if (s.nestedDelayMs > 0) await sleep(s.nestedDelayMs);
  return (
    <section id="s3-l1">
      <span id="s3-l1-v">{readS().nestedL1}</span>
      <DinouCacheSlot id="s3-nested-slot" revalidate={3600} tags={["s3-nested-slot-tag"]}>
        {async () => <span id="s3-slot-v">{readS().nestedSlot}</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
`
    );
    write("src/nested/ppr/page_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/nested/ppr/page.tsx",
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { readS, sleep, bumpExec } from "../../state";
async function NestedHole() {
  void getContext()?.req?.headers?.["x-s3-h"];
  await Promise.resolve();
  return <span id="s3-hole-v">{readS().nestedHole}</span>;
}
export default async function NestedPprPage() {
  bumpExec("nestedPage");
  const s = readS();
  if (s.nestedDelayMs > 0) await sleep(s.nestedDelayMs);
  return (
    <article id="s3-page">
      <span id="s3-page-v">{readS().nestedPage}</span>
      <Suspense fallback={<span>fb-s3</span>}><NestedHole /></Suspense>
    </article>
  );
}
`
    );

    // 2. Non-PPR static route for causal _old RSC verification: /static-doc
    write("src/static-doc/layout_functions.ts", `export function revalidate() { return 3600; }\n`);
    write(
      "src/static-doc/layout.tsx",
      `import type { ReactNode } from "react";
import { readS } from "../state";
export default function StaticDocL({ children }: { children: ReactNode }) {
  return <section><span id="sd-l">{readS().staticDocL}</span>{children}</section>;
}
`
    );
    write("src/static-doc/page_functions.ts", `export function revalidate() { return 3600; }\n`);
    write(
      "src/static-doc/page.tsx",
      `import { readS } from "../state";
export default function StaticDocP() {
  return <article><span id="sd-p">{readS().staticDocP}</span></article>;
}
`
    );

    // 3. Asymmetric S -> D -> S + Dynamic page
    write("src/asym/layout_functions.ts", `export function revalidate() { return 3600; }\n`);
    write("src/asym/layout.tsx", `import type { ReactNode } from "react"; import { readS } from "../state"; export default function AL1({ children }: { children: ReactNode }) { return <div><span id="a-l1">{readS().asymL1}</span>{children}</div>; }\n`);
    write("src/asym/dyn/layout_functions.ts", `export function revalidate() { return 0; }\n`);
    write("src/asym/dyn/layout.tsx", `import type { ReactNode } from "react"; import { readS } from "../../state"; export default function AL2({ children }: { children: ReactNode }) { return <div><span id="a-l2">{readS().asymDynL2}</span>{children}</div>; }\n`);
    write("src/asym/dyn/l3/layout_functions.ts", `export function revalidate() { return 3600; }\n`);
    write("src/asym/dyn/l3/layout.tsx", `import type { ReactNode } from "react"; import { readS } from "../../../state"; export default function AL3({ children }: { children: ReactNode }) { return <div><span id="a-l3">{readS().asymL3}</span>{children}</div>; }\n`);
    write("src/asym/dyn/l3/page_functions.ts", `export function revalidate() { return 3600; }\n`);
    write("src/asym/dyn/l3/page.tsx", `import { readS } from "../../../state"; export default function AP() { return <p id="a-p">{readS().asymPage}</p>; }\n`);

    write("src/dyn-page/page_functions.ts", `export function revalidate() { return 0; }\n`);
    write("src/dyn-page/page.tsx", `import { readS } from "../state"; export default function DynP() { return <p id="dp-v">{readS().dynPageVal}</p>; }\n`);

    // 4. Route groups & optional catch-all
    write("src/grp/(alpha)/layout_functions.ts", `export function revalidate() { return 3600; }\n`);
    write("src/grp/(alpha)/layout.tsx", `import type { ReactNode } from "react"; import { readS } from "../../state"; export default function GA({ children }: { children: ReactNode }) { return <div><span id="ga-l">{readS().alphaL}</span>{children}</div>; }\n`);
    write("src/grp/(alpha)/a/page_functions.ts", `export function revalidate() { return 3600; }\n`);
    write("src/grp/(alpha)/a/page.tsx", `export default function GAP() { return <p>a</p>; }\n`);
    write("src/grp/(beta)/layout_functions.ts", `export function revalidate() { return 3600; }\n`);
    write("src/grp/(beta)/layout.tsx", `import type { ReactNode } from "react"; import { readS } from "../../state"; export default function GB({ children }: { children: ReactNode }) { return <div><span id="gb-l">{readS().betaL}</span>{children}</div>; }\n`);
    write("src/grp/(beta)/b/page_functions.ts", `export function revalidate() { return 3600; }\n`);
    write("src/grp/(beta)/b/page.tsx", `export default function GBP() { return <p>b</p>; }\n`);

    write("src/ca/[[...slug]]/layout_functions.ts", `export function revalidate() { return 3600; } export function getStaticPaths() { return [[], ["docs", "v2"]]; }\n`);
    write("src/ca/[[...slug]]/layout.tsx", `import type { ReactNode } from "react"; import { readS } from "../../state"; export default function CAL({ children, params }: { children: ReactNode; params?: { slug?: string[] } }) { const k = Array.isArray(params?.slug) && params.slug.length > 0 ? params.slug.join("/") : "root"; return <div><span id="ca-l">{k === "docs/v2" ? readS().caV2L : readS().caRootL}</span>{children}</div>; }\n`);
    write("src/ca/[[...slug]]/page_functions.ts", `export function revalidate() { return 3600; } export function getStaticPaths() { return [[], ["docs", "v2"]]; }\n`);
    write("src/ca/[[...slug]]/page.tsx", `export default function CAP() { return <p>ca</p>; }\n`);

    const buildRes = spawnSync(process.execPath, [CLI_PATH, "build:node:esbuild"], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      timeout: 120_000,
    });
    assert.equal(buildRes.status, 0, `Phase 6 Stage 3 build failed:\n${buildRes.stdout}\n${buildRes.stderr}`);

    const verifyScript = path.join(tmpApp, "verify-p6-stage3.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const dist2 = path.resolve(".dinou/dist2");
setStorageAdapter(new FileSystemStorage(dist2));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const writeS = (patch) => {
  const f = path.resolve("p6s3-state.json");
  const cur = JSON.parse(fs.readFileSync(f, "utf8"));
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const req = async (u) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u), opts);
  return { status: r.status, headers: r.headers, text: await r.text() };
};
const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
};
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(dist2, rel), "utf8"));
const getBuildId = (html) => {
  const m = html.match(/window\\.__DINOU_BUILD_ID__\\s*=\\s*"(\\d+)"/);
  return m ? m[1] : null;
};
const POISON = "POISON_999";

// Warm asymmetric route so L3 own fragment is materialized
const warmAsym = await req("/asym/dyn/l3");
assert.equal(warmAsym.status, 200);
assert.equal(textById(warmAsym.text, "a-l3"), "100");

// ============================================================================
// 1. revalidateLayout("/") cascades recomposeOnly to nested 3D PPR pages without executing poisoned child layouts/pages!
// ============================================================================
writeS({ rootShell: 201, nestedL1: POISON, nestedSlot: POISON, nestedPage: POISON, nestedHole: 202 });
const rootRevalOk = await rscMod.revalidateLayout("/");
assert.equal(rootRevalOk, true, "revalidateLayout('/') must return true");
const nestedAfterRoot = await req("/nested/ppr");
assert.equal(nestedAfterRoot.status, 200);
assert.equal(textById(nestedAfterRoot.text, "s3-root"), "201", "Root layout must update to 201 on /nested/ppr");
assert.equal(textById(nestedAfterRoot.text, "s3-l1-v"), "100", "Child L1 must stay frozen via recomposeOnly");
assert.equal(textById(nestedAfterRoot.text, "s3-slot-v"), "100", "Child L1 slot must stay frozen");
assert.equal(textById(nestedAfterRoot.text, "s3-page-v"), "100", "Nested PPR page shell must stay frozen");
assert.equal(textById(nestedAfterRoot.text, "s3-hole-v"), "202", "Nested PPR hole must stream live 202");
assert.ok(!nestedAfterRoot.text.includes(POISON), "revalidateLayout('/') cascade must NEVER execute poisoned children");

// ============================================================================
// 2. Surgical targeting: (alpha) vs (beta), [[...slug]] 0-seg vs 2-seg, Static L3 under Dynamic L2
// ============================================================================
writeS({ alphaL: 301, betaL: POISON });
assert.equal(await rscMod.revalidateLayout("/grp/(alpha)"), true);
assert.equal(textById((await req("/grp/a")).text, "ga-l"), "301");
assert.equal(textById((await req("/grp/b")).text, "gb-l"), "100");

writeS({ caRootL: 311, caV2L: POISON });
assert.equal(await rscMod.revalidateLayout("/ca/[[...slug]]"), true);
assert.equal(textById((await req("/ca")).text, "ca-l"), "311");
assert.equal(textById((await req("/ca/docs/v2")).text, "ca-l"), "100");

writeS({ caRootL: POISON, caV2L: 312 });
assert.equal(await rscMod.revalidateLayout("/ca/docs/v2"), true);
assert.equal(textById((await req("/ca/docs/v2")).text, "ca-l"), "312");
assert.equal(textById((await req("/ca")).text, "ca-l"), "311");

writeS({ asymL1: POISON, asymDynL2: 321, asymL3: 322, asymPage: POISON });
assert.equal(await rscMod.revalidateLayout("/asym/dyn/l3"), true);
const asymAfterL3 = await req("/asym/dyn/l3");
assert.equal(textById(asymAfterL3.text, "a-l1"), "100", "L1 must stay frozen");
assert.equal(textById(asymAfterL3.text, "a-l2"), "321", "Dynamic L2 stays live");
assert.equal(textById(asymAfterL3.text, "a-l3"), "322", "Static L3 under Dynamic L2 updates to 322");
assert.equal(textById(asymAfterL3.text, "a-p"), "100", "Page stays frozen");
assert.ok(!asymAfterL3.text.includes(POISON));

// ============================================================================
// 3. No-Op & Dynamic Guards (ZERO phantom files written to .dinou/dist2!)
// ============================================================================
assert.equal(await rscMod.revalidateLayout("/asym/dyn"), false, "Dynamic L2 revalidateLayout must safely return false");
assert.equal(fs.existsSync(path.join(dist2, "asym/dyn/layout.rsc")), false, "Dynamic L2 must NEVER cache layout.rsc");

await rscMod.revalidatePage("/dyn-page");
assert.equal(fs.existsSync(path.join(dist2, "dyn-page/index.html")), false, "Dynamic revalidate=0 page must NEVER cache index.html");
assert.equal(fs.existsSync(path.join(dist2, "dyn-page/page.rsc")), false, "Dynamic revalidate=0 page must NEVER cache page.rsc");

assert.equal(await rscMod.revalidateLayout("/does-not-exist"), false, "Non-existent revalidateLayout must return false");
assert.equal(fs.existsSync(path.join(dist2, "does-not-exist")), false, "Non-existent revalidateLayout must write ZERO phantom files!");

await rscMod.revalidatePage("/does-not-exist");
assert.equal(fs.existsSync(path.join(dist2, "does-not-exist")), false, "Non-existent revalidatePage must write ZERO phantom files!");

assert.equal(await rscMod.revalidateLayout("/nested/ppr"), false, "Leaf page without own layout must return false");
assert.equal(fs.existsSync(path.join(dist2, "nested/ppr/layout.rsc")), false, "Leaf without own layout must NOT write phantom layout.rsc");

// ============================================================================
// 4. Causal _old Hydration Snapshots (____build_id____=T1) on BOTH PPR & Non-PPR Static Routes!
// ============================================================================
// Capture T1 HTML snapshots BEFORE advancing server to T2
const pprHtmlT1 = await req("/nested/ppr");
const pprT1 = getBuildId(pprHtmlT1.text);
assert.ok(pprT1, "Expected __DINOU_BUILD_ID__ on PPR HTML");
assert.equal(textById(pprHtmlT1.text, "s3-l1-v"), "100");
assert.equal(textById(pprHtmlT1.text, "s3-slot-v"), "100");
assert.equal(textById(pprHtmlT1.text, "s3-page-v"), "100");

const sdHtmlT1 = await req("/static-doc");
const sdT1 = getBuildId(sdHtmlT1.text);
assert.ok(sdT1, "Expected __DINOU_BUILD_ID__ on Static Doc HTML");
assert.equal(textById(sdHtmlT1.text, "sd-l"), "100");
assert.equal(textById(sdHtmlT1.text, "sd-p"), "100");

// Advance both routes to V2 (T2 > T1)
writeS({ nestedL1: 501, nestedSlot: 502, nestedPage: 503, staticDocL: 511, staticDocP: 512 });
await rscMod.revalidateLayout("/nested");
await rscMod.revalidatePage("/nested/ppr");
await rscMod.revalidateLayout("/static-doc");
await rscMod.revalidatePage("/static-doc");

// Browser A hydrating with stale T1 MUST receive V1 causal _old snapshots (zero #418 mismatch!)
const pprOldLayRsc = await req("/____rsc_layout____/nested?____build_id____=" + pprT1);
assert.equal(pprOldLayRsc.status, 200);
assert.ok(pprOldLayRsc.text.includes('"s3-l1-v","children":100'), "PPR T1 layout RSC must serve V1 (100) from shell.layout._old.json, got: " + pprOldLayRsc.text.slice(0, 400));
assert.ok(!pprOldLayRsc.text.includes("501"), "PPR T1 layout RSC must NOT leak V2 (501)");

const pprOldPageRsc = await req("/____rsc_page____/nested/ppr?____build_id____=" + pprT1);
assert.equal(pprOldPageRsc.status, 200);
assert.ok(pprOldPageRsc.text.includes('"s3-page-v","children":100'), "PPR T1 page RSC must serve V1 (100) from shell.page._old.json, got: " + pprOldPageRsc.text.slice(0, 400));
assert.ok(!pprOldPageRsc.text.includes("503"), "PPR T1 page RSC must NOT leak V2 (503)");

const sdOldLayRsc = await req("/____rsc_layout____/static-doc?____build_id____=" + sdT1);
assert.ok(sdOldLayRsc.text.includes('"sd-l","children":100') && !sdOldLayRsc.text.includes("511"), "Non-PPR T1 layout RSC must serve V1 from layout._old.rsc");
const sdOldPageRsc = await req("/____rsc_page____/static-doc?____build_id____=" + sdT1);
assert.ok(sdOldPageRsc.text.includes('"sd-p","children":100') && !sdOldPageRsc.text.includes("512"), "Non-PPR T1 page RSC must serve V1 from page._old.rsc");

// Browser B arriving fresh at T2 receives V2 immediately!
const pprHtmlT2 = await req("/nested/ppr");
assert.equal(textById(pprHtmlT2.text, "s3-l1-v"), "501");
assert.equal(textById(pprHtmlT2.text, "s3-page-v"), "503");
const pprT2 = getBuildId(pprHtmlT2.text);
assert.ok(Number(pprT2) > Number(pprT1), "T2 buildId must be > T1");
const pprFreshLayRsc = await req("/____rsc_layout____/nested?____build_id____=" + pprT2);
assert.ok(pprFreshLayRsc.text.includes('"s3-l1-v","children":501'), "Fresh T2 layout RSC must serve V2 (501)");

// ============================================================================
// 5. Concurrent Stampede Deduplication (inflightLayoutRevalidations & inflightPageRevalidations)
// ============================================================================
const execMap = (globalThis[Symbol.for("dinou.p6s3.execs")] ||= {});
execMap.nestedL1 = 0;
execMap.nestedPage = 0;
writeS({ nestedL1: 601, nestedSlot: 602, nestedPage: 603, nestedDelayMs: 60 });
const genBeforeStampede = Number(readJson("nested/ppr/metadata.json").generatedAt);

await Promise.all([
  rscMod.revalidateLayout("/nested"),
  rscMod.revalidateLayout("/nested"),
  rscMod.revalidateLayout("/nested"),
  rscMod.revalidatePage("/nested/ppr"),
  rscMod.revalidatePage("/nested/ppr"),
  rscMod.revalidateTag("s3-nested-slot-tag"),
]);

assert.equal(execMap.nestedL1, 1, "3 concurrent revalidateLayout('/nested') must deduplicate to 1 execution! got " + execMap.nestedL1);
assert.equal(execMap.nestedPage, 1, "2 concurrent revalidatePage('/nested/ppr') must deduplicate to 1 execution! got " + execMap.nestedPage);

// Verify zero torn JSON & monotonic generatedAt after stampede!
const lMetaAfter = readJson("nested/layout.metadata.json");
const pMetaAfter = readJson("nested/ppr/metadata.json");
assert.ok(readJson("nested/shell.layout.json"), "shell.layout.json must be valid JSON");
assert.ok(readJson("nested/ppr/shell.page.json"), "shell.page.json must be valid JSON");
assert.ok(Number(pMetaAfter.generatedAt) > genBeforeStampede, "Page generatedAt must advance monotonically after stampede");
assert.ok(Number(lMetaAfter.generatedAt) > 0);

const afterStampedeHtml = await req("/nested/ppr");
assert.equal(textById(afterStampedeHtml.text, "s3-l1-v"), "601");
assert.equal(textById(afterStampedeHtml.text, "s3-slot-v"), "602");
assert.equal(textById(afterStampedeHtml.text, "s3-page-v"), "603");

console.log("PHASE6_STAGE3_SURGICAL_OLD_STAMPEDE_OK");
`
    );

    const runRes = spawnSync(process.execPath, [verifyScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
      timeout: 60_000,
    });
    assert.equal(
      runRes.status,
      0,
      `Phase 6 Stage 3 surgical/causal _old/stampede failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("PHASE6_STAGE3_SURGICAL_OLD_STAMPEDE_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("4. [Phase 6 / Stage 4 / Check #82] refreshSlot({ fresh: false | true }) & refreshSlot('*') Complete Matrix (<500ms Fresh Race, revalidate=0 Cross-Tenant Stampede, Nested Slots & Cross-Route Shared Slot Propagation)", async () => {
  const tmpApp = createFixtureDir("p6-s4-refresh-slot-");
  try {
    writeDinouShim(tmpApp);
    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "p6-s4-refresh-slot", private: true, type: "module" }, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpApp, "p6s4-state.json"),
      JSON.stringify({
        l1Shell: 100,
        l1Shared: 100,
        ttl1Slot: 100,
        pageAShell: 100,
        pageAShared: 100,
        sharedCart: 100,
        outerSlot: 100,
        innerSlot: 100,
        pageBShell: 100,
        noCacheDelayMs: 60,
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
export function readS() {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "p6s4-state.json"), "utf8"));
}
export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
`
    );
    write(
      "src/layout.tsx",
      `import type { ReactNode } from "react";
export default function Root({ children }: { children: ReactNode }) {
  return <html lang="en"><head><title>P6S4</title></head><body>{children}</body></html>;
}
`
    );
    write("src/page.tsx", `export default function Home() { return <main>home</main>; }\n`);

    write("src/rsm/layout_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/rsm/layout.tsx",
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function RsmLayout({ children }: { children: ReactNode }) {
  return (
    <section id="rsm-l1">
      <span id="rsm-l1-shell">{readS().l1Shell}</span>
      <DinouCacheSlot id="rsm-l1-shared" revalidate={3600} tags={["rsm-shared"]}>
        {async () => <span id="rsm-l1-shared-v">{readS().l1Shared}</span>}
      </DinouCacheSlot>
      <DinouCacheSlot id="rsm-ttl1" revalidate={1} tags={["rsm-ttl1-tag"]}>
        {async () => <span id="rsm-ttl1-v">{readS().ttl1Slot}</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
`
    );

    write("src/rsm/page-a/page_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/rsm/page-a/page.tsx",
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../../state";

async function NoCacheHole() {
  const ctx = getContext();
  const tenant = String(ctx?.req?.headers?.["x-tenant"] || "anon");
  return (
    <div id="rsm-hole">
      <DinouCacheSlot id="rsm-nocache" revalidate={0} tags={["rsm-nocache-tag"]}>
        {async () => {
          const liveCtx = getContext();
          const liveTenant = String(liveCtx?.req?.headers?.["x-tenant"] || tenant);
          const delay = readS().noCacheDelayMs || 0;
          if (delay > 0) await sleep(delay);
          return <span id="rsm-nocache-v">{liveTenant}</span>;
        }}
      </DinouCacheSlot>
    </div>
  );
}

export default function RsmPageA() {
  return (
    <article id="rsm-page-a">
      <span id="rsm-pa-shell">{readS().pageAShell}</span>
      <DinouCacheSlot id="rsm-cart" revalidate={3600} tags={["rsm-cart-tag"]}>
        {async () => <span id="rsm-cart-v">{readS().sharedCart}</span>}
      </DinouCacheSlot>
      <DinouCacheSlot id="rsm-pa-shared" revalidate={3600} tags={["rsm-shared"]}>
        {async () => <span id="rsm-pa-shared-v">{readS().pageAShared}</span>}
      </DinouCacheSlot>
      <DinouCacheSlot id="rsm-outer" revalidate={3600} tags={["rsm-outer-tag"]}>
        {async () => (
          <div id="rsm-outer-box">
            <span id="rsm-outer-v">{readS().outerSlot}</span>
            <DinouCacheSlot id="rsm-inner" revalidate={3600} tags={["rsm-inner-tag"]}>
              {async () => <span id="rsm-inner-v">{readS().innerSlot}</span>}
            </DinouCacheSlot>
          </div>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span>fb-nc</span>}><NoCacheHole /></Suspense>
    </article>
  );
}
`
    );

    write("src/rsm/page-b/page_functions.ts", `export const ppr = true; export function revalidate() { return 3600; }\n`);
    write(
      "src/rsm/page-b/page.tsx",
      `import { DinouCacheSlot } from "dinou/server";
import { readS } from "../../state";
export default function RsmPageB() {
  return (
    <article id="rsm-page-b">
      <span id="rsm-pb-shell">{readS().pageBShell}</span>
      <DinouCacheSlot id="rsm-cart" revalidate={3600} tags={["rsm-cart-tag"]}>
        {async () => <span id="rsm-cart-v">{readS().sharedCart}</span>}
      </DinouCacheSlot>
    </article>
  );
}
`
    );

    const buildRes = spawnSync(process.execPath, [CLI_PATH, "build:node:esbuild"], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      timeout: 120_000,
    });
    assert.equal(buildRes.status, 0, `Phase 6 Stage 4 build failed:\n${buildRes.stdout}\n${buildRes.stderr}`);

    const verifyScript = path.join(tmpApp, "verify-p6-stage4.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const dist2 = path.resolve(".dinou/dist2");
setStorageAdapter(new FileSystemStorage(dist2));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const writeS = (patch) => {
  const f = path.resolve("p6s4-state.json");
  const cur = JSON.parse(fs.readFileSync(f, "utf8"));
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const req = async (u, headers = {}) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u, { headers }), opts);
  return { status: r.status, headers: r.headers, text: await r.text() };
};
const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
};
const POISON = "POISON_999";

// Warm Page A & Page B so slots register
const warmA = await req("/rsm/page-a", { "x-tenant": "warm-t" });
assert.equal(warmA.status, 200);
assert.equal(textById(warmA.text, "rsm-cart-v"), "100");
assert.equal(textById(warmA.text, "rsm-nocache-v"), "warm-t");
const warmB = await req("/rsm/page-b");
assert.equal(warmB.status, 200);
assert.equal(textById(warmB.text, "rsm-pb-shell"), "100");
assert.equal(textById(warmB.text, "rsm-cart-v"), "100");

// ============================================================================
// 1. Explicit { fresh: false } (?fresh=0, ?fresh=false, omitted) MUST return frozen cached V1 until TTL or revalidateTag!
// ============================================================================
writeS({ l1Shell: POISON, pageAShell: POISON, pageBShell: POISON, sharedCart: 201, ttl1Slot: 202 });
const f0 = await req("/____rsc_slot____/rsm-cart?fresh=0", { "x-dinou-current-path": "/rsm/page-a" });
assert.equal(f0.status, 200);
assert.ok(f0.text.includes("100") && !f0.text.includes("201"), "?fresh=0 MUST return cached 100 (NOT 201!), got: " + f0.text);

const fFalse = await req("/____rsc_slot____/rsm-cart?fresh=false", { "x-dinou-current-path": "/rsm/page-a" });
assert.equal(fFalse.status, 200);
assert.ok(fFalse.text.includes("100") && !fFalse.text.includes("201"), "?fresh=false MUST return cached 100!");

const fOmitted = await req("/____rsc_slot____/rsm-cart", { "x-dinou-current-path": "/rsm/page-a" });
assert.equal(fOmitted.status, 200);
assert.ok(fOmitted.text.includes("100") && !fOmitted.text.includes("201"), "omitted ?fresh MUST return cached 100!");

// After revalidateTag('rsm-cart-tag'), ?fresh=false immediately fetches V2 (201)!
await rscMod.revalidateTag("rsm-cart-tag");
const afterTagF0 = await req("/____rsc_slot____/rsm-cart?fresh=false", { "x-dinou-current-path": "/rsm/page-a" });
assert.ok(afterTagF0.text.includes("201"), "After revalidateTag, ?fresh=false must return fresh 201");

// After 1s TTL expires on rsm-ttl1, ?fresh=false immediately re-renders & returns fresh 202!
await sleep(1150);
const afterTtlF0 = await req("/____rsc_slot____/rsm-ttl1?fresh=false", { "x-dinou-current-path": "/rsm/page-a" });
assert.equal(afterTtlF0.status, 200);
assert.ok(afterTtlF0.text.includes("202"), "After 1s TTL expiry, ?fresh=false must regenerate & return 202, got: " + afterTtlF0.text);

// ============================================================================
// 2. Rapid <500ms sequential { fresh: true } calls WITHOUT ?t= nonce MUST NOT return stale recentFreshSlotRenders!
// ============================================================================
writeS({ sharedCart: 301 });
const rapid1 = await req("/____rsc_slot____/rsm-cart?fresh=1", { "x-dinou-current-path": "/rsm/page-a" });
assert.ok(rapid1.text.includes("301"), "First rapid ?fresh=1 must return 301");

// Mutate 2ms later (well inside 500ms window!) and call ?fresh=1 again WITHOUT distinct ?t= param!
writeS({ sharedCart: 302 });
const rapid2 = await req("/____rsc_slot____/rsm-cart?fresh=1", { "x-dinou-current-path": "/rsm/page-a" });
assert.ok(rapid2.text.includes("302") && !rapid2.text.includes("301"), "Second rapid (<500ms) ?fresh=1 MUST return fresh 302 (zero stale recentFreshSlotRenders leak!), got: " + rapid2.text);

writeS({ sharedCart: 303 });
const rapid3 = await req("/____rsc_slot____/rsm-cart?fresh=true", { "x-dinou-current-path": "/rsm/page-a" });
assert.ok(rapid3.text.includes("303"), "Third rapid (<500ms) ?fresh=true MUST return fresh 303");

// Verify identical ?t=nonce duplicate read within 500ms STILL deduplicates cleanly!
writeS({ sharedCart: 304 });
const nonce1 = await req("/____rsc_slot____/rsm-cart?t=same-nonce-1&fresh=1", { "x-dinou-current-path": "/rsm/page-a" });
assert.ok(nonce1.text.includes("304"));
writeS({ sharedCart: 305 });
const nonceDup = await req("/____rsc_slot____/rsm-cart?t=same-nonce-1&fresh=1", { "x-dinou-current-path": "/rsm/page-a" });
assert.ok(nonceDup.text.includes("304"), "Duplicate read with identical ?t=nonce within 500ms should coalesce cleanly");
const nonceNew = await req("/____rsc_slot____/rsm-cart?t=new-nonce-2&fresh=1", { "x-dinou-current-path": "/rsm/page-a" });
assert.ok(nonceNew.text.includes("305"), "Distinct ?t=nonce must render fresh 305");

// ============================================================================
// 3. Concurrent revalidate=0 (isNoCache) slot refreshes under 2 distinct tenants MUST NEVER coalesce!
// ============================================================================
const [resTenantA, resTenantB] = await Promise.all([
  req("/____rsc_slot____/rsm-nocache?t=nc-same&fresh=1", {
    "x-dinou-current-path": "/rsm/page-a",
    "x-tenant": "tenant-ALPHA",
  }),
  req("/____rsc_slot____/rsm-nocache?t=nc-same&fresh=1", {
    "x-dinou-current-path": "/rsm/page-a",
    "x-tenant": "tenant-BETA",
  }),
]);
assert.equal(resTenantA.status, 200);
assert.equal(resTenantB.status, 200);
assert.ok(resTenantA.text.includes("tenant-ALPHA") && !resTenantA.text.includes("tenant-BETA"), "Tenant A must NEVER receive Tenant B on revalidate=0 slot: " + resTenantA.text);
assert.ok(resTenantB.text.includes("tenant-BETA") && !resTenantB.text.includes("tenant-ALPHA"), "Tenant B must NEVER receive Tenant A on revalidate=0 slot: " + resTenantB.text);

// ============================================================================
// 4. Nested Outer -> Inner slot refresh isolation
// ============================================================================
writeS({ pageAShell: POISON, outerSlot: POISON, innerSlot: 401 });
const innerFresh = await req("/____rsc_slot____/rsm-inner?fresh=1", { "x-dinou-current-path": "/rsm/page-a" });
assert.equal(innerFresh.status, 200);
assert.ok(innerFresh.text.includes("401") && !innerFresh.text.includes(POISON));
const paAfterInner = await req("/rsm/page-a", { "x-tenant": "t1" });
assert.equal(textById(paAfterInner.text, "rsm-outer-v"), "100", "Outer slot must stay frozen at 100");
assert.equal(textById(paAfterInner.text, "rsm-inner-v"), "401", "Inner slot must persist 401");
assert.equal(textById(paAfterInner.text, "rsm-pa-shell"), "100");
assert.ok(!paAfterInner.text.includes(POISON));

writeS({ pageAShell: POISON, outerSlot: 402, innerSlot: POISON });
const outerFresh = await req("/____rsc_slot____/rsm-outer?fresh=1", { "x-dinou-current-path": "/rsm/page-a" });
assert.equal(outerFresh.status, 200);
assert.ok(outerFresh.text.includes("402") && outerFresh.text.includes("401") && !outerFresh.text.includes(POISON));
const paAfterOuter = await req("/rsm/page-a", { "x-tenant": "t2" });
assert.equal(textById(paAfterOuter.text, "rsm-outer-v"), "402");
assert.equal(textById(paAfterOuter.text, "rsm-inner-v"), "401");
assert.ok(!paAfterOuter.text.includes(POISON));

// ============================================================================
// 5. Cross-Route Shared Slot Propagation (Page A -> Page B, direct SSR & soft-nav RSC, Page B shell frozen!)
// ============================================================================
writeS({ pageBShell: POISON, sharedCart: 501 });
const cartOnA = await req("/____rsc_slot____/rsm-cart?fresh=1", { "x-dinou-current-path": "/rsm/page-a" });
assert.equal(cartOnA.status, 200);
assert.ok(cartOnA.text.includes("501"));

const pbSoftNav = await req("/____rsc_page____/rsm/page-b");
assert.equal(pbSoftNav.status, 200);
assert.ok(pbSoftNav.text.includes("501") && !pbSoftNav.text.includes(POISON), "Page B soft-nav RSC must pick up 501 from Page A without executing poisoned Page B shell");

const pbSsr = await req("/rsm/page-b");
assert.equal(pbSsr.status, 200);
assert.equal(textById(pbSsr.text, "rsm-cart-v"), "501", "Page B direct SSR must pick up 501 via inspectSlotsFreshness().hasNewer!");
assert.equal(textById(pbSsr.text, "rsm-pb-shell"), "100", "Page B static shell must stay 100% frozen at 100!");
assert.ok(!pbSsr.text.includes(POISON));

console.log("PHASE6_STAGE4_REFRESH_SLOT_MATRIX_OK");
`
    );

    const runRes = spawnSync(process.execPath, [verifyScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
      timeout: 60_000,
    });
    assert.equal(
      runRes.status,
      0,
      `Phase 6 Stage 4 refreshSlot matrix failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("PHASE6_STAGE4_REFRESH_SLOT_MATRIX_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});
