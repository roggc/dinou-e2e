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

test("1. [Phase 7 / Stage 1 / Check #85] Mid-ISR Non-200 Outcome Transitions (200 -> 404/410/302/307/throw-internal/ClientRedirect) Across Node FS, Causal _old Hydration, Layout Transitions & Edge/Multi-Pod KV Storage", async () => {
  const tmpApp = createFixtureDir("p7-s1-mid-isr-status-");
  try {
    writeDinouShim(tmpApp);
    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify(
        { name: "p7-s1-mid-isr-status", private: true, type: "module" },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(tmpApp, "p7s1-state.json"),
      JSON.stringify({
        l1Shell: 100,
        l1Slot: 100,
        nfSeq: 100,
        nfBlocked: false,
        goneSeq: 100,
        gone410: false,
        status404Seq: 100,
        status404: false,
        redirSeq: 100,
        redirMode: "none",
        redirTtlSeq: 100,
        redirTtlOn: false,
        causalStdSeq: 100,
        causalStdMode: "none",
        causalPprSeq: 100,
        causalPprMode: "none",
        layoutMode: "none",
        layoutSeq: 100,
        layoutPageSeq: 100,
        targetSeq: 100,
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
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "p7s1-state.json"), "utf8"));
}
`
    );

    write(
      "src/layout_functions.ts",
      `export const revalidate = 3600;\n`
    );
    write(
      "src/layout.tsx",
      `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>P7S1</title></head>
      <body>{children}</body>
    </html>
  );
}
`
    );
    write(
      "src/page.tsx",
      `export default function Home() { return <main>home</main>; }\n`
    );

    // Shared PPR L1 Layout with DinouCacheSlot + custom not_found.tsx
    write(
      "src/mis/layout_functions.ts",
      `export const ppr = true;
export const revalidate = 3600;
export function getCacheTags() { return ["p7-l1"]; }
`
    );
    write(
      "src/mis/layout.tsx",
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function MisLayout({ children }: { children: ReactNode }) {
  return (
    <section id="p7-l1">
      <span id="p7-l1-shell">{readS().l1Shell}</span>
      <DinouCacheSlot id="p7-l1-slot" revalidate={3600} tags={["p7-l1-slot-tag"]}>
        {async () => <span id="p7-l1-slot-v">{readS().l1Slot}</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
`
    );
    write(
      "src/mis/not_found.tsx",
      `export default function MisNotFound() {
  return <div id="p7-custom-404" data-not-found="true">Custom Mid-ISR 404</div>;
}
`
    );

    // 1. 200 PPR -> validateParams() false (404 not_found.tsx) + recovery
    write(
      "src/mis/to-nf/[slug]/page_functions.ts",
      `import { readS } from "../../../state";
export const ppr = true;
export const revalidate = 3600;
export function getStaticPaths() { return ["promo"]; }
export function getCacheTags() { return ["p7-nf"]; }
export function validateParams({ slug }: { slug?: string }) {
  if (slug !== "promo") return false;
  return !readS().nfBlocked;
}
`
    );
    write(
      "src/mis/to-nf/[slug]/page.tsx",
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { readS } from "../../../state";
async function NfHole() {
  const h = String(getContext()?.req?.headers?.["x-hole"] || "h0");
  await Promise.resolve();
  return <span id="p7-nf-hole">{h}</span>;
}
export default function ToNfPage({ params }: { params: { slug: string } }) {
  return (
    <article id="p7-nf-ok">
      <span id="p7-nf-seq">{readS().nfSeq}</span>
      <span id="p7-nf-slug">{params.slug}</span>
      <Suspense fallback={<span>fb</span>}><NfHole /></Suspense>
    </article>
  );
}
`
    );

    // 2. 200 PPR -> res.status(410) + recovery (explicit revalidatePage & revalidateTag)
    write(
      "src/mis/to-410/page_functions.ts",
      `export const ppr = true;
export const revalidate = 3600;
export function getCacheTags() { return ["p7-410"]; }
`
    );
    write(
      "src/mis/to-410/page.tsx",
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { readS } from "../../state";
async function GoneHole() {
  const h = String(getContext()?.req?.headers?.["x-hole"] || "h0");
  await Promise.resolve();
  return <span id="p7-410-hole">{h}</span>;
}
export default function To410Page() {
  const s = readS();
  if (s.gone410) {
    getContext()?.res?.status?.(410);
    return (
      <article id="p7-410-retired">
        <span id="p7-410-msg">Product Retired</span>
        <span id="p7-410-seq">{s.goneSeq}</span>
      </article>
    );
  }
  return (
    <article id="p7-410-ok">
      <span id="p7-410-seq">{s.goneSeq}</span>
      <Suspense fallback={<span>fb</span>}><GoneHole /></Suspense>
    </article>
  );
}
`
    );

    // 3. 200 Static (revalidate=1 TTL!) -> res.status(404)
    write(
      "src/mis/to-404-ttl/page_functions.ts",
      `export const ppr = false;
export const revalidate = 1;
export function getCacheTags() { return ["p7-404-ttl"]; }
`
    );
    write(
      "src/mis/to-404-ttl/page.tsx",
      `import { getContext } from "dinou";
import { readS } from "../../state";
export default function To404TtlPage() {
  const s = readS();
  if (s.status404) {
    getContext()?.res?.status?.(404);
    return <article id="p7-404-custom"><span id="p7-404-seq">{s.status404Seq}</span></article>;
  }
  return <article id="p7-404-ok"><span id="p7-404-seq">{s.status404Seq}</span></article>;
}
`
    );

    // 4. 200 PPR -> redirect() (302) / res.redirect(307) / throw dinou-internal-redirect / <ClientRedirect>
    write(
      "src/mis/to-redir/page_functions.ts",
      `export const ppr = true;
export const revalidate = 3600;
export function getCacheTags() { return ["p7-redir"]; }
`
    );
    write(
      "src/mis/to-redir/page.tsx",
      `import { Suspense } from "react";
import { ClientRedirect, getContext, redirect } from "dinou";
import { readS } from "../../state";
async function RedirHole() {
  const h = String(getContext()?.req?.headers?.["x-hole"] || "h0");
  await Promise.resolve();
  return <span id="p7-redir-hole">{h}</span>;
}
export default function ToRedirPage() {
  const s = readS();
  if (s.redirMode === "redirect") {
    return redirect("/mis/target");
  }
  if (s.redirMode === "res-redirect-307") {
    getContext()?.res?.redirect?.(307, "/mis/target");
    return null;
  }
  if (s.redirMode === "throw-internal") {
    throw { $$type: "dinou-internal-redirect", url: "/mis/target" };
  }
  if (s.redirMode === "client-redirect") {
    return <ClientRedirect to="/mis/target" />;
  }
  return (
    <article id="p7-redir-ok">
      <span id="p7-redir-seq">{s.redirSeq}</span>
      <Suspense fallback={<span>fb</span>}><RedirHole /></Suspense>
    </article>
  );
}
`
    );

    // 5. 200 Static (revalidate=1 TTL!) -> redirect()
    write(
      "src/mis/to-redir-ttl/page_functions.ts",
      `export const ppr = false;
export const revalidate = 1;
export function getCacheTags() { return ["p7-redir-ttl"]; }
`
    );
    write(
      "src/mis/to-redir-ttl/page.tsx",
      `import { redirect } from "dinou";
import { readS } from "../../state";
export default function ToRedirTtlPage() {
  const s = readS();
  if (s.redirTtlOn) {
    return redirect("/mis/target");
  }
  return <article id="p7-redir-ttl-ok"><span id="p7-redir-ttl-seq">{s.redirTtlSeq}</span></article>;
}
`
    );

    // 6. Target destination
    write(
      "src/mis/target/page_functions.ts",
      `export const ppr = true; export const revalidate = 3600;\n`
    );
    write(
      "src/mis/target/page.tsx",
      `import { readS } from "../../state";
export default function TargetPage() {
  return <article id="p7-target"><span id="p7-target-seq">{readS().targetSeq}</span></article>;
}
`
    );

    // 7. Causal _old hydration routes (Non-PPR static & PPR static) outside PPR L1
    write(
      "src/causal-std/page_functions.ts",
      `export const ppr = false; export const revalidate = 3600;\n`
    );
    write(
      "src/causal-std/page.tsx",
      `import { getContext, redirect } from "dinou";
import { readS } from "../state";
export default function CausalStdPage() {
  const s = readS();
  if (s.causalStdMode === "gone410") {
    getContext()?.res?.status?.(410);
    return <article id="p7-cstd-410">Gone {s.causalStdSeq}</article>;
  }
  if (s.causalStdMode === "redirect") {
    return redirect("/mis/target");
  }
  if (s.causalStdMode === "throw-internal") {
    throw { $$type: "dinou-internal-redirect", url: "/mis/target" };
  }
  return <article id="p7-cstd-ok"><span id="p7-cstd-seq">{s.causalStdSeq}</span></article>;
}
`
    );

    write(
      "src/causal-ppr/page_functions.ts",
      `export const ppr = true; export const revalidate = 3600;\n`
    );
    write(
      "src/causal-ppr/page.tsx",
      `import { Suspense } from "react";
import { getContext, redirect } from "dinou";
import { readS } from "../state";
async function CausalPprHole() {
  const h = String(getContext()?.req?.headers?.["x-hole"] || "h0");
  await Promise.resolve();
  return <span id="p7-cppr-hole">{h}</span>;
}
export default function CausalPprPage() {
  const s = readS();
  if (s.causalPprMode === "gone410") {
    getContext()?.res?.status?.(410);
    return <article id="p7-cppr-410">Gone {s.causalPprSeq}</article>;
  }
  if (s.causalPprMode === "redirect") {
    return redirect("/mis/target");
  }
  return (
    <article id="p7-cppr-ok">
      <span id="p7-cppr-seq">{s.causalPprSeq}</span>
      <Suspense fallback={<span>fb</span>}><CausalPprHole /></Suspense>
    </article>
  );
}
`
    );

    // 8. Layout-level Mid-ISR non-200 transition & recovery
    write(
      "src/layout-non200/layout_functions.ts",
      `export const ppr = false; export const revalidate = 3600;\n`
    );
    write(
      "src/layout-non200/layout.tsx",
      `import type { ReactNode } from "react";
import { getContext, redirect } from "dinou";
import { readS } from "../state";
export default function LayoutNon200({ children }: { children: ReactNode }) {
  const s = readS();
  if (s.layoutMode === "redirect") {
    return redirect("/mis/target");
  }
  if (s.layoutMode === "gone410") {
    getContext()?.res?.status?.(410);
    return <section id="p7-ln-410">{\`Layout Gone \${s.layoutSeq}\`}</section>;
  }
  return <section id="p7-ln-ok"><span id="p7-ln-seq">{s.layoutSeq}</span>{children}</section>;
}
`
    );
    write(
      "src/layout-non200/page_functions.ts",
      `export const ppr = false; export const revalidate = 3600;\n`
    );
    write(
      "src/layout-non200/page.tsx",
      `import { readS } from "../state";
export default function LayoutNon200Page() {
  return <article id="p7-ln-page"><span id="p7-ln-pseq">{readS().layoutPageSeq}</span></article>;
}
`
    );

    const buildRes = spawnSync(
      process.execPath,
      [CLI_PATH, "build:node:esbuild"],
      {
        cwd: tmpApp,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "" },
        timeout: 120_000,
      }
    );
    assert.equal(
      buildRes.status,
      0,
      `Phase 7 Stage 1 build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    const verifyScript = path.join(tmpApp, "verify-p7-stage1.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const storageMod = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const {
  FileSystemStorage,
  RedisStorage,
  DenoKVStorage,
  CloudflareKVStorage,
  setStorageAdapter,
} = storageMod;

const dist2 = path.resolve(".dinou/dist2");
setStorageAdapter(new FileSystemStorage(dist2));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;

const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };
const writeS = (patch) => {
  const f = path.resolve("p7s1-state.json");
  const cur = JSON.parse(fs.readFileSync(f, "utf8"));
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const req = async (u, init = {}, customOpts = opts) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u, init), customOpts);
  return { status: r.status, headers: r.headers, text: await r.text() };
};
const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
};
const extractBuildId = (html) => {
  const m = html.match(/window\\.__DINOU_BUILD_ID__\\s*=\\s*"(\\d+)"/);
  return m ? m[1] : null;
};
const clearPodLocalCaches = () => {
  globalThis[Symbol.for("dinou.slot.registry")]?.clear?.();
  globalThis[Symbol.for("dinou.slot.recent.fresh")]?.clear?.();
  globalThis[Symbol.for("dinou.isDynamic.map")]?.clear?.();
};
const POISON = "POISON_999";

// Snapshot pristine initial SSG dist2 (all 200 OK / 100) for Multi-Pod & Edge stale-dist2 tests!
const dist2SnapDir = path.resolve(".dinou/dist2-p7s1-snap");
fs.cpSync(dist2, dist2SnapDir, { recursive: true });

// ============================================================================
// PART A: FileSystemStorage / Node Dual-Engine Mid-ISR Non-200 Transitions
// ============================================================================

// A1. Warm baseline 200 OK on all routes
const warmNf = await req("/mis/to-nf/promo", { headers: { "x-hole": "w1" } });
assert.equal(warmNf.status, 200);
assert.equal(textById(warmNf.text, "p7-l1-shell"), "100");
assert.equal(textById(warmNf.text, "p7-nf-seq"), "100");
const nfBuildIdT1 = extractBuildId(warmNf.text);
assert.ok(nfBuildIdT1, "to-nf/promo must expose __DINOU_BUILD_ID__");

const warm410 = await req("/mis/to-410", { headers: { "x-hole": "w2" } });
assert.equal(warm410.status, 200);
assert.equal(textById(warm410.text, "p7-410-seq"), "100");

const warmRedir = await req("/mis/to-redir", { headers: { "x-hole": "w3" } });
assert.equal(warmRedir.status, 200);
assert.equal(textById(warmRedir.text, "p7-redir-seq"), "100");

// A2. 200 PPR -> validateParams() false (404 not_found.tsx) Mid-ISR + Poisoned L1 + Causal _old + Recovery
writeS({ l1Shell: POISON, l1Slot: POISON, nfBlocked: true });
await rscMod.revalidatePage("/mis/to-nf/promo");

const nfDirect404 = await req("/mis/to-nf/promo");
assert.equal(nfDirect404.status, 404, "Direct SSR after validateParams=false MUST return 404, got " + nfDirect404.status);
assert.ok(nfDirect404.text.includes("Custom Mid-ISR 404"), "Direct SSR 404 must render not_found.tsx");
assert.equal(textById(nfDirect404.text, "p7-l1-shell"), "100", "Poisoned L1 must stay frozen at 100 during 404 SSR!");
assert.ok(!nfDirect404.text.includes(POISON), "Poisoned L1 must NOT re-execute during 404 SSR!");

const nfRsc404 = await req("/____rsc_page____/mis/to-nf/promo");
assert.equal(nfRsc404.status, 404, "Soft-nav RSC after validateParams=false MUST return 404");
assert.ok(nfRsc404.text.includes("Custom Mid-ISR 404"), "Soft-nav RSC 404 must render not_found.tsx");

// Causal _old hydration for Tab A paused at T1 before validateParams flipped!
const nfCausalOld = await req("/____rsc_page____/mis/to-nf/promo?____build_id____=" + nfBuildIdT1);
assert.equal(nfCausalOld.status, 200, "Causal _old hydration at T1 after validateParams flip MUST return 200 V1, got " + nfCausalOld.status);
assert.ok(nfCausalOld.text.includes("promo") && !nfCausalOld.text.includes("Custom Mid-ISR 404"), "Causal _old payload must contain V1 page shell");

// Recover back to 200 OK V2!
writeS({ nfBlocked: false, nfSeq: 201 });
await rscMod.revalidatePage("/mis/to-nf/promo");
writeS({ nfSeq: POISON }); // Prove V2 is genuinely cached static PPR again!
const nfRecovered = await req("/mis/to-nf/promo", { headers: { "x-hole": "rec-nf" } });
assert.equal(nfRecovered.status, 200, "Recovered route must return 200");
assert.equal(textById(nfRecovered.text, "p7-nf-seq"), "201", "Recovered route must serve cached V2 (201), not live POISON!");
assert.equal(textById(nfRecovered.text, "p7-l1-shell"), "100", "L1 must remain frozen at 100");
assert.ok(!nfRecovered.text.includes(POISON));

// A3. 200 PPR -> res.status(410) Mid-ISR + Cold Pod B + Poisoned L1 + Recovery via revalidateTag!
writeS({ l1Shell: POISON, l1Slot: POISON, gone410: true, goneSeq: 410 });
await rscMod.revalidatePage("/mis/to-410");

const ssr410 = await req("/mis/to-410");
assert.equal(ssr410.status, 410, "Direct SSR after mid-ISR res.status(410) MUST return 410, got " + ssr410.status);
assert.ok(ssr410.text.includes("Product Retired"), "410 body must be rendered");
assert.equal(textById(ssr410.text, "p7-l1-shell"), "100", "Poisoned L1 MUST stay frozen at 100 during 410 SSR!");
assert.ok(!ssr410.text.includes(POISON), "Poisoned L1 must NOT re-execute during 410 SSR!");

const rsc410 = await req("/____rsc_page____/mis/to-410");
assert.equal(rsc410.status, 410, "Soft-nav RSC after mid-ISR res.status(410) MUST return 410, got " + rsc410.status);
assert.ok(rsc410.text.includes("Product Retired"));

// Clear in-memory isDynamic map (Cold Pod B on FS) -> MUST STILL return 410!
clearPodLocalCaches();
const ssr410Cold = await req("/mis/to-410");
assert.equal(ssr410Cold.status, 410, "Cold Pod B must honor metadata.json dynamic tombstone and return 410!");
assert.equal(textById(ssr410Cold.text, "p7-l1-shell"), "100");
assert.ok(!ssr410Cold.text.includes(POISON));

// Recover back to 200 OK V2 via revalidateTag("p7-410")!
writeS({ gone410: false, goneSeq: 202 });
await rscMod.revalidateTag("p7-410");
const meta410AfterRec = JSON.parse(fs.readFileSync(path.join(dist2, "mis/to-410/metadata.json"), "utf8"));
assert.ok(!meta410AfterRec.dynamic, "Recovered metadata.json MUST clear dynamic:true flag!");
writeS({ goneSeq: POISON }); // Prove V2 is genuinely cached static PPR again!
const rec410 = await req("/mis/to-410", { headers: { "x-hole": "rec-410" } });
assert.equal(rec410.status, 200);
assert.equal(textById(rec410.text, "p7-410-seq"), "202", "Recovered 410 route must serve cached 202, not dynamic POISON!");
assert.equal(textById(rec410.text, "p7-l1-shell"), "100");
assert.ok(!rec410.text.includes(POISON));

// A4. 200 PPR -> Imperative redirect() (302), res.redirect(307), throw dinou-internal-redirect, <ClientRedirect> + Recovery
// A4a. redirect() -> 302 Location + x-rsc-redirect
writeS({ l1Shell: POISON, l1Slot: POISON, redirMode: "redirect" });
await rscMod.revalidatePage("/mis/to-redir");
const redir302 = await req("/mis/to-redir");
assert.equal(redir302.status, 302, "Direct SSR after mid-ISR redirect() MUST return 302, got " + redir302.status);
assert.equal(redir302.headers.get("location"), "/mis/target");
const rscRedir302 = await req("/____rsc_page____/mis/to-redir");
assert.equal(rscRedir302.status, 200);
assert.equal(rscRedir302.headers.get("x-rsc-redirect"), "/mis/target");

// Clear pod-local caches -> Cold Pod B MUST STILL redirect!
clearPodLocalCaches();
const redir302Cold = await req("/mis/to-redir");
assert.equal(redir302Cold.status, 302, "Cold Pod B must still return 302 after mid-ISR redirect()!");
assert.equal(redir302Cold.headers.get("location"), "/mis/target");

// A4b. res.redirect(307, "/mis/target") -> 307 Location + x-rsc-redirect
writeS({ redirMode: "res-redirect-307" });
await rscMod.revalidatePage("/mis/to-redir");
const redir307 = await req("/mis/to-redir");
assert.equal(redir307.status, 307, "Direct SSR after res.redirect(307) MUST return 307, got " + redir307.status);
assert.equal(redir307.headers.get("location"), "/mis/target");
const rscRedir307 = await req("/____rsc_page____/mis/to-redir");
assert.equal(rscRedir307.headers.get("x-rsc-redirect"), "/mis/target");

// A4c. Thrown { $$type: "dinou-internal-redirect", url: "/mis/target" } -> 302 Location + x-rsc-redirect (NOT 500!)
writeS({ redirMode: "throw-internal" });
await rscMod.revalidatePage("/mis/to-redir");
const redirThrow = await req("/mis/to-redir");
assert.equal(redirThrow.status, 302, "Direct SSR after thrown dinou-internal-redirect MUST return 302, got " + redirThrow.status);
assert.equal(redirThrow.headers.get("location"), "/mis/target");
const rscRedirThrow = await req("/____rsc_page____/mis/to-redir");
assert.equal(rscRedirThrow.status, 200);
assert.equal(rscRedirThrow.headers.get("x-rsc-redirect"), "/mis/target");

// A4d. Declarative <ClientRedirect to="/mis/target" /> -> 200 HTML/RSC containing ClientRedirect reference
writeS({ redirMode: "client-redirect" });
await rscMod.revalidatePage("/mis/to-redir");
const redirClientSsr = await req("/mis/to-redir");
assert.equal(redirClientSsr.status, 200);
assert.equal(textById(redirClientSsr.text, "p7-l1-shell"), "100");
const redirClientRsc = await req("/____rsc_page____/mis/to-redir");
assert.equal(redirClientRsc.status, 200);
assert.ok(redirClientRsc.text.includes("ClientRedirect") && redirClientRsc.text.includes("/mis/target"), "ClientRedirect RSC must reference ClientRedirect -> /mis/target");

// A4e. Recover back to 200 OK V2 cached!
writeS({ redirMode: "none", redirSeq: 203 });
await rscMod.revalidatePage("/mis/to-redir");
writeS({ redirSeq: POISON });
const recRedir = await req("/mis/to-redir", { headers: { "x-hole": "rec-r" } });
assert.equal(recRedir.status, 200);
assert.equal(textById(recRedir.text, "p7-redir-seq"), "203", "Recovered redirect route must serve cached 203!");
assert.ok(!recRedir.text.includes(POISON));

// A5. Clock-Based 1s TTL Expiration: 200 Static -> res.status(404) & 200 Static -> redirect()
// Refresh baseline timestamps to now so the warm reads do not immediately trigger build-time TTL SWR
await rscMod.revalidatePage("/mis/to-404-ttl");
await rscMod.revalidatePage("/mis/to-redir-ttl");
const warm404Ttl = await req("/mis/to-404-ttl");
assert.equal(warm404Ttl.status, 200);
assert.equal(textById(warm404Ttl.text, "p7-404-seq"), "100");
const warmRedirTtl = await req("/mis/to-redir-ttl");
assert.equal(warmRedirTtl.status, 200);
assert.equal(textById(warmRedirTtl.text, "p7-redir-ttl-seq"), "100");

writeS({ l1Shell: POISON, status404: true, status404Seq: 404, redirTtlOn: true });
await sleep(1150);
// Trigger SWR background revalidation on both 1s TTL routes
const swrTrig404 = await req("/mis/to-404-ttl");
assert.equal(swrTrig404.status, 200, "SWR trigger serves stale 200 while regenerating in background");
const swrTrigRedir = await req("/mis/to-redir-ttl");
assert.equal(swrTrigRedir.status, 200);
await sleep(450);

const afterTtl404 = await req("/mis/to-404-ttl");
assert.equal(afterTtl404.status, 404, "After 1s TTL mid-ISR res.status(404), Direct SSR MUST return 404, got " + afterTtl404.status);
assert.equal(textById(afterTtl404.text, "p7-404-seq"), "404");
assert.equal(textById(afterTtl404.text, "p7-l1-shell"), "100");
assert.ok(!afterTtl404.text.includes(POISON));

const afterTtlRedir = await req("/mis/to-redir-ttl");
assert.equal(afterTtlRedir.status, 302, "After 1s TTL mid-ISR redirect(), Direct SSR MUST return 302, got " + afterTtlRedir.status);
assert.equal(afterTtlRedir.headers.get("location"), "/mis/target");

// A6. Causal _old Hydration Protection on BOTH Non-PPR Static & PPR Routes!
// A6a. Non-PPR static: 200 T1 -> throw-internal redirect -> Tab A ?____build_id____=T1 hydrates V1 cleanly!
const cstdWarm = await req("/causal-std");
assert.equal(cstdWarm.status, 200);
const cstdBuildId1 = extractBuildId(cstdWarm.text);
assert.ok(cstdBuildId1);
writeS({ causalStdMode: "throw-internal", causalStdSeq: 301 });
await rscMod.revalidatePage("/causal-std");
const cstdTabA = await req("/____rsc_page_static____/causal-std?____build_id____=" + cstdBuildId1);
assert.equal(cstdTabA.status, 200, "Tab A causal hydration after throw-internal MUST return 200 V1, got " + cstdTabA.status);
assert.ok(cstdTabA.text.includes("100") && !cstdTabA.headers.get("x-rsc-redirect"), "Tab A must receive preserved V1 page._old.rsc");
const cstdTabB = await req("/causal-std");
assert.equal(cstdTabB.status, 302, "Tab B must immediately get 302 redirect");

// Recover causal-std to V2 (200), then transition to 410 and check causal _old again!
writeS({ causalStdMode: "none", causalStdSeq: 302 });
await rscMod.revalidatePage("/causal-std");
const cstdWarm2 = await req("/causal-std");
const cstdBuildId2 = extractBuildId(cstdWarm2.text);
writeS({ causalStdMode: "gone410", causalStdSeq: 410 });
await rscMod.revalidatePage("/causal-std");
const cstdTabA2 = await req("/____rsc_page_static____/causal-std?____build_id____=" + cstdBuildId2);
assert.equal(cstdTabA2.status, 200);
assert.ok(cstdTabA2.text.includes("302") && !cstdTabA2.text.includes("Gone"), "Tab A must hydrate V2 from page._old.rsc during 200->410 transition");
const cstdTabB2 = await req("/causal-std");
assert.equal(cstdTabB2.status, 410);

// A6b. PPR route: 200 T1 -> redirect() -> Tab A ?____build_id____=T1 hydrates V1 from shell.page._old.json!
const cpprWarm = await req("/causal-ppr", { headers: { "x-hole": "cp1" } });
assert.equal(cpprWarm.status, 200);
const cpprBuildId1 = extractBuildId(cpprWarm.text);
assert.ok(cpprBuildId1);
writeS({ causalPprMode: "redirect", causalPprSeq: 501 });
await rscMod.revalidatePage("/causal-ppr");
const cpprTabA = await req("/____rsc_page____/causal-ppr?____build_id____=" + cpprBuildId1);
assert.equal(cpprTabA.status, 200, "PPR Tab A causal hydration at T1 after mid-ISR redirect MUST return 200 V1, got " + cpprTabA.status);
assert.ok(!cpprTabA.headers.get("x-rsc-redirect"), "PPR Tab A causal hydration MUST NOT redirect!");
assert.ok(cpprTabA.text.includes("100"), "PPR Tab A causal hydration MUST serve preserved V1 shell.page._old.json!");
const cpprTabB = await req("/causal-ppr");
assert.equal(cpprTabB.status, 302);

// A7. Layout-Level Mid-ISR Non-200 Transition (res.redirect & res.status(410)) & Recovery
const lnWarm = await req("/layout-non200");
assert.equal(lnWarm.status, 200);
assert.equal(textById(lnWarm.text, "p7-ln-seq"), "100");

writeS({ layoutMode: "redirect" });
await rscMod.revalidateLayout("/layout-non200");
const lnRedir = await req("/layout-non200");
assert.equal(lnRedir.status, 302, "Layout mid-ISR redirect() MUST cause 302, got " + lnRedir.status);
assert.equal(lnRedir.headers.get("location"), "/mis/target");

writeS({ layoutMode: "gone410", layoutSeq: 410 });
await rscMod.revalidateLayout("/layout-non200");
const ln410 = await req("/layout-non200");
assert.equal(ln410.status, 410, "Layout mid-ISR res.status(410) MUST cause 410, got " + ln410.status);
assert.ok(ln410.text.includes("Layout Gone 410"));

writeS({ layoutMode: "none", layoutSeq: 205 });
await rscMod.revalidateLayout("/layout-non200");
writeS({ layoutSeq: POISON });
const lnRec = await req("/layout-non200");
assert.equal(lnRec.status, 200);
assert.equal(textById(lnRec.text, "p7-ln-seq"), "205", "Recovered layout MUST clear dynamic:true and serve cached 205!");
assert.ok(!lnRec.text.includes(POISON));

// ============================================================================
// PART B: Edge Runtimes (isEdgeRuntime() === true) & Multi-Pod Stale dist2/ASSETS
// ============================================================================
// Restore pristine SSG 100 .dinou/dist2 on disk so Cold Pod B / Isolate B has STALE 200 V1 files!
fs.rmSync(dist2, { recursive: true, force: true });
fs.cpSync(dist2SnapDir, dist2, { recursive: true });
writeS({
  l1Shell: 100, l1Slot: 100,
  nfSeq: 100, nfBlocked: false,
  goneSeq: 100, gone410: false,
  redirSeq: 100, redirMode: "none",
  redirTtlSeq: 100, redirTtlOn: false,
});

// ---- B1: RedisStorage (Pod A -> Cold Pod B with stale 200 V1 .dinou/dist2!) ----
const redisData = new Map();
const mockRedis = {
  async get(k) { return redisData.has(k) ? redisData.get(k) : null; },
  async set(k, v) { redisData.set(k, String(v)); return "OK"; },
  async del(k) { return redisData.delete(k) ? 1 : 0; },
  async exists(k) { return redisData.has(k) ? 1 : 0; },
  async keys(pattern) {
    const prefix = String(pattern || "").replace(/\\*$/, "");
    return Array.from(redisData.keys()).filter((k) => k.startsWith(prefix));
  },
};

clearPodLocalCaches();
setStorageAdapter(new RedisStorage(mockRedis, "p7s1:"));
// Hydrate 200 V1 into Redis on Pod A first (simulating warm Redis entries with inline metadata!)
assert.equal((await req("/mis/to-410")).status, 200);
assert.equal((await req("/mis/to-redir")).status, 200);
assert.equal((await req("/mis/to-nf/promo")).status, 200);
// Seed a ghost cached route whose page.tsx no longer exists (simulating !pagePath / isNotFound mid-ISR!)
const redisPodA = new RedisStorage(mockRedis, "p7s1:");
await redisPodA.set("mis/ghost-removed/index.html", "<html><body>STALE_GHOST_200</body></html>", { status: 200, generatedAt: Date.now() - 5000 });
await redisPodA.set("mis/ghost-removed/metadata.json", JSON.stringify({ status: 200, generatedAt: Date.now() - 5000 }));
await redisPodA.set("mis/ghost-removed/page.rsc", "0:\\"STALE_GHOST_RSC\\"\\n");
// Also put stale dist2 on disk for ghost-removed to prove Cold Pod B won't resurrect it!
fs.mkdirSync(path.join(dist2, "mis/ghost-removed"), { recursive: true });
fs.writeFileSync(path.join(dist2, "mis/ghost-removed/index.html"), "<html><body>STALE_DISK_GHOST_200</body></html>");
fs.writeFileSync(path.join(dist2, "mis/ghost-removed/metadata.json"), JSON.stringify({ status: 200, generatedAt: Date.now() - 5000 }));

// Pod A transitions all 4 routes to non-200!
writeS({ l1Shell: POISON, l1Slot: POISON, gone410: true, goneSeq: 610, redirMode: "res-redirect-307", nfBlocked: true });
await rscMod.revalidatePage("/mis/to-410");
await rscMod.revalidatePage("/mis/to-redir");
await rscMod.revalidatePage("/mis/to-nf/promo");
await rscMod.revalidatePage("/mis/ghost-removed");

// Cold Pod B: brand-new RedisStorage + cleared local registries, stale 200 V1 .dinou/dist2 on disk!
clearPodLocalCaches();
setStorageAdapter(new RedisStorage(mockRedis, "p7s1:"));
const rb410 = await req("/mis/to-410");
assert.equal(rb410.status, 410, "Redis Cold Pod B MUST serve 410 (not stale 200 inline/dist2!), got " + rb410.status);
assert.equal(textById(rb410.text, "p7-l1-shell"), "100");
assert.ok(!rb410.text.includes(POISON));
assert.equal((await req("/____rsc_page____/mis/to-410")).status, 410);

const rbRedir = await req("/mis/to-redir");
assert.equal(rbRedir.status, 307, "Redis Cold Pod B MUST serve 307 (not stale 200!), got " + rbRedir.status);
assert.equal(rbRedir.headers.get("location"), "/mis/target");
assert.equal((await req("/____rsc_page____/mis/to-redir")).headers.get("x-rsc-redirect"), "/mis/target");

const rbNf = await req("/mis/to-nf/promo");
assert.equal(rbNf.status, 404, "Redis Cold Pod B MUST serve 404 (not stale 200!), got " + rbNf.status);
assert.ok(rbNf.text.includes("Custom Mid-ISR 404"));
assert.equal((await req("/____rsc_page____/mis/to-nf/promo")).status, 404);

const rbGhost = await req("/mis/ghost-removed");
assert.equal(rbGhost.status, 404, "Redis Cold Pod B MUST serve 404 for removed route (not STALE_DISK_GHOST_200!), got " + rbGhost.status);
assert.ok(!rbGhost.text.includes("STALE_GHOST") && !rbGhost.text.includes("STALE_DISK_GHOST"));

// Recovery on Redis Pod A -> Cold Pod C sees cached 200 V2!
writeS({ gone410: false, goneSeq: 620, redirMode: "none", redirSeq: 621, nfBlocked: false, nfSeq: 622 });
await rscMod.revalidatePage("/mis/to-410");
await rscMod.revalidatePage("/mis/to-redir");
await rscMod.revalidatePage("/mis/to-nf/promo");
clearPodLocalCaches();
setStorageAdapter(new RedisStorage(mockRedis, "p7s1:"));
writeS({ goneSeq: POISON, redirSeq: POISON, nfSeq: POISON });
const rc410 = await req("/mis/to-410", { headers: { "x-hole": "rc1" } });
assert.equal(rc410.status, 200);
assert.equal(textById(rc410.text, "p7-410-seq"), "620");
assert.ok(!rc410.text.includes(POISON));
const rcRedir = await req("/mis/to-redir", { headers: { "x-hole": "rc2" } });
assert.equal(rcRedir.status, 200);
assert.equal(textById(rcRedir.text, "p7-redir-seq"), "621");
assert.ok(!rcRedir.text.includes(POISON));
const rcNf = await req("/mis/to-nf/promo", { headers: { "x-hole": "rc3" } });
assert.equal(rcNf.status, 200);
assert.equal(textById(rcNf.text, "p7-nf-seq"), "622");
assert.ok(!rcNf.text.includes(POISON));

// ---- B2: DenoKVStorage with isEdgeRuntime() === true (Isolate A -> Cold Isolate B!) ----
const denoStore = new Map();
const dkKey = (arr) => JSON.stringify(arr);
const mockDenoKv = {
  async get(k) {
    const sk = dkKey(k);
    return denoStore.has(sk) ? { key: k, value: denoStore.get(sk) } : { key: k, value: null };
  },
  async set(k, v) { denoStore.set(dkKey(k), v); return { ok: true }; },
  async delete(k) { denoStore.delete(dkKey(k)); },
  atomic() {
    const ops = [];
    return {
      set(k, v) { ops.push({ type: "set", k, v }); return this; },
      delete(k) { ops.push({ type: "del", k }); return this; },
      async commit() {
        for (const op of ops) {
          if (op.type === "set") denoStore.set(dkKey(op.k), op.v);
          else denoStore.delete(dkKey(op.k));
        }
        return { ok: true };
      },
    };
  },
  async *list({ prefix }) {
    for (const [sk, value] of denoStore.entries()) {
      const k = JSON.parse(sk);
      if (prefix.every((seg, i) => k[i] === seg)) {
        yield { key: k, value };
      }
    }
  },
};

const prevRuntime = globalThis.__DINOU_RUNTIME__;
globalThis.__DINOU_RUNTIME__ = "deno-edge";
const denoEdgeOpts = { runtime: "deno-edge", renderHtmlStream: ssrMod.renderHtml };
try {
  clearPodLocalCaches();
  const dkIsoA = new DenoKVStorage(mockDenoKv);
  setStorageAdapter(dkIsoA);
  writeS({ l1Shell: 100, l1Slot: 100, gone410: false, goneSeq: 100, redirMode: "none", redirSeq: 100, nfBlocked: false, nfSeq: 100 });
  assert.equal((await req("/mis/to-410", {}, denoEdgeOpts)).status, 200);
  assert.equal((await req("/mis/to-redir", {}, denoEdgeOpts)).status, 200);
  assert.equal((await req("/mis/to-nf/promo", {}, denoEdgeOpts)).status, 200);
  await dkIsoA.set("mis/ghost-removed/index.html", "<html><body>STALE_DK_GHOST</body></html>", { status: 200, generatedAt: Date.now() - 5000 });
  await dkIsoA.set("mis/ghost-removed/metadata.json", JSON.stringify({ status: 200, generatedAt: Date.now() - 5000 }));
  await dkIsoA.set("mis/ghost-removed/page.rsc", "0:\\"STALE_DK_GHOST_RSC\\"\\n");

  // Isolate A transitions routes while isEdgeRuntime() === true!
  writeS({ l1Shell: POISON, l1Slot: POISON, gone410: true, goneSeq: 710, redirMode: "throw-internal", nfBlocked: true });
  await rscMod.revalidatePage("/mis/to-410");
  await rscMod.revalidatePage("/mis/to-redir");
  await rscMod.revalidatePage("/mis/to-nf/promo");
  await rscMod.revalidatePage("/mis/ghost-removed");

  // Cold Isolate B (brand-new DenoKVStorage + cleared local registries, stale 200 dist2 on disk!)
  clearPodLocalCaches();
  setStorageAdapter(new DenoKVStorage(mockDenoKv));
  assert.equal((await req("/mis/to-410", {}, denoEdgeOpts)).status, 410, "Deno Edge Cold Isolate B MUST return 410!");
  const dkRedir = await req("/mis/to-redir", {}, denoEdgeOpts);
  assert.equal(dkRedir.status, 302, "Deno Edge Cold Isolate B MUST return 302 for thrown dinou-internal-redirect!");
  assert.equal(dkRedir.headers.get("location"), "/mis/target");
  assert.equal((await req("/mis/to-nf/promo", {}, denoEdgeOpts)).status, 404, "Deno Edge Cold Isolate B MUST return 404!");
  const dkGhost = await req("/mis/ghost-removed", {}, denoEdgeOpts);
  assert.equal(dkGhost.status, 404, "Deno Edge Cold Isolate B MUST return 404 for removed route (NOT re-stamped 200!)");
  assert.ok(!dkGhost.text.includes("STALE_DK_GHOST") && !dkGhost.text.includes("STALE_DISK_GHOST"));
} finally {
  globalThis.__DINOU_RUNTIME__ = prevRuntime;
}

// ---- B3: CloudflareKVStorage + env.ASSETS (stale 200 V1) + Cloudflare-Workers UA + ctx.waitUntil ----
const origNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "Cloudflare-Workers" },
  configurable: true,
});
globalThis.__DINOU_RUNTIME__ = "edge";
try {
  const cfKvMap = new Map();
  const mockCfKv = {
    async get(k) { return cfKvMap.has(k) ? cfKvMap.get(k).value : null; },
    async getWithMetadata(k) {
      if (!cfKvMap.has(k)) return { value: null, metadata: null };
      const e = cfKvMap.get(k);
      return { value: e.value, metadata: e.metadata || null };
    },
    async put(k, v, o = {}) { cfKvMap.set(k, { value: String(v), metadata: o?.metadata || null }); },
    async delete(k) { cfKvMap.delete(k); },
    async list({ prefix } = {}) {
      const keys = Array.from(cfKvMap.keys())
        .filter((k) => !prefix || k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
  const mockAssets = {
    async fetch(reqOrUrl) {
      const u = new URL(typeof reqOrUrl === "string" ? reqOrUrl : reqOrUrl.url);
      const rel = u.pathname.replace(/^\\/+/, "").replace(/^__dinou_dist2(?:__)?\\//, "");
      const diskFile = path.join(dist2, rel);
      if (fs.existsSync(diskFile) && fs.statSync(diskFile).isFile()) {
        const body = fs.readFileSync(diskFile, "utf8");
        const ct = diskFile.endsWith(".json")
          ? "application/json"
          : diskFile.endsWith(".html")
          ? "text/html; charset=utf-8"
          : "text/x-component";
        return new Response(body, { status: 200, headers: { "content-type": ct } });
      }
      return new Response("Not Found", { status: 404 });
    },
  };
  const cfWaitUntil = [];
  const makeCfOpts = () => ({
    runtime: "edge",
    renderHtmlStream: ssrMod.renderHtml,
    env: { DINOU_CACHE: mockCfKv, ASSETS: mockAssets },
    ctx: { waitUntil: (p) => { cfWaitUntil.push(Promise.resolve(p)); } },
  });

  // Isolate A: Transition routes BEFORE OR AFTER KV hydration with stale 200 env.ASSETS!
  clearPodLocalCaches();
  const cfStorageA = new CloudflareKVStorage(mockCfKv);
  cfStorageA.hydrateFromDisk = false;
  setStorageAdapter(cfStorageA);
  writeS({
    l1Shell: 100, l1Slot: 100,
    gone410: false, goneSeq: 100,
    redirMode: "none", redirSeq: 100,
    redirTtlOn: false, redirTtlSeq: 100,
    nfBlocked: false, nfSeq: 100,
  });
  // Hydrate /mis/to-redir-ttl into KV at T1 (200 OK)
  assert.equal((await req("/mis/to-redir-ttl", {}, makeCfOpts())).status, 200);
  // Hydrate /mis/to-410 & /mis/ghost-removed into KV at T1 (200 OK from env.ASSETS),
  // while leaving /mis/to-redir UNHYDRATED in KV (only in env.ASSETS!)
  assert.equal((await req("/mis/to-410", {}, makeCfOpts())).status, 200);
  assert.equal((await req("/mis/ghost-removed", {}, makeCfOpts())).status, 200);

  // Flip all flags on Isolate A!
  writeS({ l1Shell: POISON, l1Slot: POISON, gone410: true, goneSeq: 810, redirMode: "redirect", redirTtlOn: true, nfBlocked: true });
  await rscMod.revalidatePage("/mis/to-410");
  await rscMod.revalidatePage("/mis/to-redir");
  await rscMod.revalidatePage("/mis/to-nf/promo");
  await rscMod.revalidatePage("/mis/ghost-removed");

  // Trigger 1s TTL SWR transition on /mis/to-redir-ttl via ctx.waitUntil!
  await sleep(1150);
  cfWaitUntil.length = 0;
  const cfTtlSwr = await req("/mis/to-redir-ttl", {}, makeCfOpts());
  assert.equal(cfTtlSwr.status, 200);
  assert.ok(cfWaitUntil.length > 0, "Cloudflare 1s TTL SWR must schedule waitUntil");
  await Promise.all(cfWaitUntil.splice(0, cfWaitUntil.length));

  // Cold Isolate B: brand-new CloudflareKVStorage + cleared local caches + stale 200 env.ASSETS!
  clearPodLocalCaches();
  const cfStorageB = new CloudflareKVStorage(mockCfKv);
  cfStorageB.hydrateFromDisk = false;
  setStorageAdapter(cfStorageB);

  const cf410 = await req("/mis/to-410", {}, makeCfOpts());
  assert.equal(cf410.status, 410, "CF Cold Isolate B MUST serve 410 (zero env.ASSETS resurrection!), got " + cf410.status);
  assert.equal((await req("/____rsc_page____/mis/to-410", {}, makeCfOpts())).status, 410);

  const cfRedir = await req("/mis/to-redir", {}, makeCfOpts());
  assert.equal(cfRedir.status, 302, "CF Cold Isolate B MUST serve 302 even when /mis/to-redir was never hydrated into KV before revalidatePage!, got " + cfRedir.status);
  assert.equal(cfRedir.headers.get("location"), "/mis/target");
  assert.equal((await req("/____rsc_page____/mis/to-redir", {}, makeCfOpts())).headers.get("x-rsc-redirect"), "/mis/target");

  const cfRedirTtl = await req("/mis/to-redir-ttl", {}, makeCfOpts());
  assert.equal(cfRedirTtl.status, 302, "CF Cold Isolate B MUST serve 302 after ctx.waitUntil TTL mid-ISR redirect!");
  assert.equal(cfRedirTtl.headers.get("location"), "/mis/target");

  const cfNf = await req("/mis/to-nf/promo", {}, makeCfOpts());
  assert.equal(cfNf.status, 404, "CF Cold Isolate B MUST serve 404 (zero env.ASSETS resurrection!)");
  assert.ok(cfNf.text.includes("Custom Mid-ISR 404"));

  const cfGhost = await req("/mis/ghost-removed", {}, makeCfOpts());
  assert.equal(cfGhost.status, 404, "CF Cold Isolate B MUST serve 404 for removed route (zero env.ASSETS resurrection!)");
  assert.ok(!cfGhost.text.includes("STALE_DISK_GHOST"));

  // Recover on Isolate B -> Cold Isolate C serves cached 200 V2!
  writeS({ gone410: false, goneSeq: 820, redirMode: "none", redirSeq: 821, nfBlocked: false, nfSeq: 822 });
  await rscMod.revalidatePage("/mis/to-410");
  await rscMod.revalidatePage("/mis/to-redir");
  await rscMod.revalidatePage("/mis/to-nf/promo");

  clearPodLocalCaches();
  const cfStorageC = new CloudflareKVStorage(mockCfKv);
  cfStorageC.hydrateFromDisk = false;
  setStorageAdapter(cfStorageC);
  writeS({ goneSeq: POISON, redirSeq: POISON, nfSeq: POISON });
  const cfRec410 = await req("/mis/to-410", { headers: { "x-hole": "cfc1" } }, makeCfOpts());
  assert.equal(cfRec410.status, 200);
  assert.equal(textById(cfRec410.text, "p7-410-seq"), "820");
  assert.ok(!cfRec410.text.includes(POISON));
  const cfRecRedir = await req("/mis/to-redir", { headers: { "x-hole": "cfc2" } }, makeCfOpts());
  assert.equal(cfRecRedir.status, 200);
  assert.equal(textById(cfRecRedir.text, "p7-redir-seq"), "821");
  assert.ok(!cfRecRedir.text.includes(POISON));
} finally {
  globalThis.__DINOU_RUNTIME__ = prevRuntime;
  if (origNavigatorDesc) {
    Object.defineProperty(globalThis, "navigator", origNavigatorDesc);
  }
}

console.log("PHASE7_STAGE1_MID_ISR_STATUS_OK");
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
      `Phase 7 Stage 1 verification failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("PHASE7_STAGE1_MID_ISR_STATUS_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});
