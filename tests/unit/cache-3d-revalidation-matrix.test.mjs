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
