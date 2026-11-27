// tests/unit/server-functions-advanced.test.mjs
// Series Z — Phase 1 — Stage 3 (Check #Z3):
// Advanced React 19 Server Functions & True Progressive Enhancement
//   1. Rich JS argument & return round-trip (Date, Map, Set, BigInt, Uint8Array with 0x0a/0x80/0xff,
//      undefined, -0, NaN, Infinity, RegExp, URL, literal sentinel collision escaping) across Esbuild, Rollup & Webpack
//   2. Binary multi-file FormData uploads (non-ASCII UTF-8 filenames, 0x00..0xFF SHA-256 byte accuracy),
//      mixed rich prevState (formDataIndex=1), internal key stripping & caller FormData non-mutation
//   3. True No-JS Progressive Enhancement (<form action={serverAction}>, bound actions, useActionState)
//      with 303 PRG / redirect + Set-Cookie + strict production CSRF & manifest validation
//   4. Concurrent Server Functions + res.cookie() / res.clearCookie() isolation & default Path=/

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
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
      maxRetries: 8,
      retryDelay: 60,
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

function buildFixtureApp(tmpApp, bundler = "esbuild") {
  const swcCacheDir = path.join(REPO_ROOT, ".dinou", ".swc-cache");
  fs.mkdirSync(swcCacheDir, { recursive: true });

  const buildRes = spawnSync(
    process.execPath,
    [CLI_PATH, `build:node:${bundler}`],
    {
      cwd: tmpApp,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DINOU_DEV: "",
        DINOU_BUILD_TOOL: bundler,
        SWC_NATIVE_BINDING_CACHE: swcCacheDir,
      },
      encoding: "utf8",
      timeout: 180000,
    }
  );
  if (buildRes.status !== 0) {
    throw new Error(
      `build:node:${bundler} failed (status=${buildRes.status}):\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
    );
  }
}

function createZ3Fixture(tmpApp) {
  fs.mkdirSync(path.join(tmpApp, "src/done"), { recursive: true });
  writeDinouShim(tmpApp);

  fs.writeFileSync(
    path.join(tmpApp, "package.json"),
    JSON.stringify({ name: "z3-sf-app", type: "module" }, null, 2)
  );

  fs.writeFileSync(
    path.join(tmpApp, "dinou.config.mjs"),
    `export default {
  plugins: [],
  security: {
    maxServerFunctionBodyBytes: 65536,
  },
};
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Z3 Server Functions Test</title></head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/page_functions.ts"),
    `export const dynamic = true;\n`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/done/page_functions.ts"),
    `export const dynamic = true;\n`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/done/page.tsx"),
    `import { getContext } from "dinou";
export default function DonePage() {
  const ctx = getContext();
  return <main data-done="true">Done:{ctx.req.cookies?.z3_prog || "none"}</main>;
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/actions.ts"),
    `"use server";

import crypto from "node:crypto";
import { getContext } from "dinou";

const globalState = (globalThis.__Z3_TEST_STATE__ = globalThis.__Z3_TEST_STATE__ || {
  items: [] as string[],
  boundLog: [] as string[],
  actionStateLog: [] as string[],
});

export async function getZ3State() {
  return {
    items: [...globalState.items],
    boundLog: [...globalState.boundLog],
    actionStateLog: [...globalState.actionStateLog],
  };
}

export async function echoRichTypes(payload: any) {
  const checks = {
    isDate: payload.date instanceof Date,
    dateIso: payload.date instanceof Date ? payload.date.toISOString() : null,
    isMap: payload.map instanceof Map,
    mapSize: payload.map instanceof Map ? payload.map.size : -1,
    mapBigVal: payload.map instanceof Map ? payload.map.get(9007199254740995n) : null,
    isSet: payload.set instanceof Set,
    setHasAlpha: payload.set instanceof Set ? payload.set.has("alpha") : false,
    setHasDate:
      payload.set instanceof Set
        ? Array.from(payload.set).some((v) => v instanceof Date && v.getUTCFullYear() === 2030)
        : false,
    isBigInt: typeof payload.big === "bigint",
    bigStr: typeof payload.big === "bigint" ? payload.big.toString() : null,
    isUint8: payload.bytes instanceof Uint8Array,
    bytesHex:
      payload.bytes instanceof Uint8Array
        ? Buffer.from(payload.bytes).toString("hex")
        : null,
    hasUndefKey: Object.prototype.hasOwnProperty.call(payload, "undef"),
    undefIsUndefined: payload.undef === undefined,
    isNegZero: Object.is(payload.negZero, -0),
    isNaNVal: Number.isNaN(payload.nanVal),
    isPosInf: payload.posInf === Infinity,
    isNegInf: payload.negInf === -Infinity,
    isRegExp: payload.regex instanceof RegExp,
    regexStr: payload.regex instanceof RegExp ? payload.regex.toString() : null,
    isURL: payload.url instanceof URL,
    urlHref: payload.url instanceof URL ? payload.url.href : null,
    escapedLiteralOk:
      payload.escapedUserObj &&
      payload.escapedUserObj.$dinou_sf === "not-a-tag" &&
      payload.escapedUserObj.raw === 123,
  };

  return {
    checks,
    echo: {
      date: payload.date,
      map: payload.map,
      set: payload.set,
      big: payload.big,
      bytes: payload.bytes,
      undef: undefined,
    },
  };
}

export async function uploadBinaryWithMeta(prevState: any, formData: FormData) {
  const keys = Array.from(formData.keys());
  const leakedInternalKeys = keys.filter(
    (k) => k.startsWith("__dinou_") || k.startsWith("$ACTION_")
  );

  const fileA = formData.get("fileA") as File | null;
  const fileB = formData.get("fileB") as File | null;
  const note = String(formData.get("note") || "");

  const bufA = fileA ? Buffer.from(await fileA.arrayBuffer()) : Buffer.alloc(0);
  const bufB = fileB ? Buffer.from(await fileB.arrayBuffer()) : Buffer.alloc(0);

  return {
    leakedInternalKeys,
    note,
    fileAName: fileA ? fileA.name : null,
    fileALength: bufA.length,
    fileASha256: crypto.createHash("sha256").update(bufA).digest("hex"),
    fileBName: fileB ? fileB.name : null,
    fileBLength: bufB.length,
    fileBSha256: crypto.createHash("sha256").update(bufB).digest("hex"),
    prevStateChecks: {
      isDate: prevState?.updatedAt instanceof Date,
      dateIso: prevState?.updatedAt instanceof Date ? prevState.updatedAt.toISOString() : null,
      isSet: prevState?.tags instanceof Set,
      tagsList: prevState?.tags instanceof Set ? Array.from(prevState.tags) : [],
      isBigInt: typeof prevState?.seq === "bigint",
      seqStr: typeof prevState?.seq === "bigint" ? prevState.seq.toString() : null,
    },
  };
}

export async function submitProgressiveForm(formData: FormData) {
  const ctx = getContext();
  const keys = Array.from(formData.keys());
  const leaked = keys.filter(
    (k) => k.startsWith("$ACTION_") || k.startsWith("__dinou_")
  );
  const title = String(formData.get("title") || "");
  const goDone = String(formData.get("goDone") || "") === "1";
  globalState.items.push(\`\${title}|leaked=\${leaked.length}\`);
  ctx.res.cookie("z3_prog", title, { path: "/" });
  if (goDone) {
    ctx.res.redirect("/done");
  }
  return { ok: true, title };
}

export async function boundProgressiveAction(prefix: string, formData: FormData) {
  const label = String(formData.get("label") || "");
  globalState.boundLog.push(\`\${prefix}:\${label}\`);
  return { ok: true };
}

export async function submitStateAction(prevState: { count: number }, formData: FormData) {
  const delta = Number(formData.get("delta") || 1);
  const nextCount = Number(prevState?.count || 0) + delta;
  globalState.actionStateLog.push(\`prev=\${prevState?.count}:next=\${nextCount}\`);
  return { count: nextCount };
}

export async function concurrentCookieActionA() {
  const ctx = getContext();
  await new Promise((r) => setTimeout(r, 45));
  ctx.res.cookie("z3_a", "alpha", { path: "/" });
  return { who: "A", seenInit: ctx.req.cookies?.z3_init || "missing" };
}

export async function concurrentCookieActionB() {
  const ctx = getContext();
  await new Promise((r) => setTimeout(r, 10));
  ctx.res.clearCookie("z3_b");
  ctx.res.cookie("z3_c", "gamma", { path: "/" });
  return { who: "B", seenInit: ctx.req.cookies?.z3_init || "missing" };
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/StateFormClient.tsx"),
    `"use client";
import { useActionState } from "react";
import { submitStateAction } from "./actions";

export default function StateFormClient() {
  const [state, formAction] = useActionState(submitStateAction, { count: 7 });
  return (
    <form id="z3-state-form" action={formAction}>
      <input name="delta" defaultValue="3" />
      <span data-state-count={state.count}>{state.count}</span>
      <button type="submit">Add State</button>
    </form>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/page.tsx"),
    `import { getContext } from "dinou";
import {
  submitProgressiveForm,
  boundProgressiveAction,
} from "./actions";
import StateFormClient from "./StateFormClient";

export default function HomePage() {
  const ctx = getContext();
  const state = (globalThis as any).__Z3_TEST_STATE__ || { items: [], boundLog: [], actionStateLog: [] };
  const boundFn = boundProgressiveAction.bind(null, "BOUND_PREFIX");
  return (
    <main>
      <div id="z3-items">{state.items.join(",")}</div>
      <div id="z3-cookies">
        {\`a=\${ctx.req.cookies?.z3_a || ""}|b=\${ctx.req.cookies?.z3_b || ""}|c=\${ctx.req.cookies?.z3_c || ""}\`}
      </div>
      <form id="z3-prog-form" action={submitProgressiveForm}>
        <input name="title" defaultValue="nojs-item" />
        <button type="submit">Submit Progressive</button>
      </form>
      <form id="z3-bound-form" action={boundFn}>
        <input name="label" defaultValue="bound-item" />
        <button type="submit">Submit Bound</button>
      </form>
      <StateFormClient />
    </main>
  );
}
`
  );
}

test("1. [#Z3] Rich JS argument & return round-trip (Date, Map, Set, BigInt, binary Uint8Array with 0x0a/0x80/0xff, undefined, -0, NaN, Infinity, RegExp, URL) + binary FormData non-mutation + No-JS Progressive Enhancement + Concurrent Cookies (Esbuild)", () => {
  const tmpApp = createFixtureDir("tmp-z3-sf-esbuild-");
  try {
    createZ3Fixture(tmpApp);
    buildFixtureApp(tmpApp, "esbuild");

    const probeFile = path.join(tmpApp, "__z3_probe.mjs");
    fs.writeFileSync(
      probeFile,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import module from "node:module";
import { pathToFileURL } from "node:url";

// Bridge react-server-dom-webpack/client's browser-style createFromFetch(resPromise, { callServer })
// onto react-server-dom-webpack/client.edge so server-function-proxy-webpack.js executes unmodified in Node.
const bridgeUrl = pathToFileURL(path.join(${JSON.stringify(tmpApp)}, "__rsdw_bridge.mjs")).href;
const edgeClientUrl = ${JSON.stringify(
        pathToFileURL(
          path.join(
            REPO_ROOT,
            "node_modules/react-server-dom-webpack/client.edge.js"
          )
        ).href
      )};
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react-server-dom-webpack/client") {
      return { url: bridgeUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === bridgeUrl) {
      return {
        format: "module",
        shortCircuit: true,
        source: \`import { createFromReadableStream } from \${JSON.stringify(edgeClientUrl)};
export function createFromFetch(responsePromise, options = {}) {
  return Promise.resolve(responsePromise).then((res) =>
    createFromReadableStream(res.body, {
      ...options,
      serverConsumerManifest: { moduleMap: {}, moduleLoading: null },
    })
  );
}
\`,
      };
    }
    return nextLoad(url, context);
  },
});

const TMP_APP = ${JSON.stringify(tmpApp)};
const DINOU_ROOT = ${JSON.stringify(DINOU_ROOT)};
const serverFile = fs.existsSync(path.join(TMP_APP, ".dinou/node/server.js"))
  ? path.join(TMP_APP, ".dinou/node/server.js")
  : path.join(TMP_APP, ".dinou/node/server.mjs");
const serverMod = await import(pathToFileURL(serverFile).href);
const appFetch = serverMod.fetch;

// Point globalThis.fetch + window.location at our in-process compiled server so we exercise the REAL client proxy!
const origFetch = globalThis.fetch;
const origWindow = globalThis.window;
const fakeClientWindow = { location: { pathname: "/", origin: "http://localhost:3000" } };
const serverFetch = async (req) => {
  const prevWin = globalThis.window;
  delete globalThis.window;
  try {
    return await appFetch(req);
  } finally {
    if (prevWin !== undefined) globalThis.window = prevWin;
  }
};
globalThis.window = fakeClientWindow;
globalThis.fetch = async (input, init = {}) => {
  const reqUrl = typeof input === "string" && input.startsWith("/")
    ? "http://localhost:3000" + input
    : input;
  const headers = new Headers(init.headers || {});
  if (!headers.has("host")) headers.set("host", "localhost:3000");
  if (!headers.has("origin")) headers.set("origin", "http://localhost:3000");
  return serverFetch(new Request(reqUrl, { ...init, headers }));
};

try {
  // Import the REAL Esbuild/Rollup client proxy (using react-server-dom-webpack/client in Node via dynamic hook or real server-function-proxy.js)
  const { createServerFunctionProxy } = await import(
    pathToFileURL(path.join(DINOU_ROOT, "core/server-function-proxy-webpack.js")).href
  );

  // =========================================================================
  // 1A. Rich JS Types Round-Trip (Client -> Server -> Client via Flight!)
  // =========================================================================
  const echoRichTypes = createServerFunctionProxy("file:///src/actions.ts#echoRichTypes");
  const rawBytes = new Uint8Array([0x00, 0x01, 0x0a, 0x44, 0x3a, 0x7b, 0x7f, 0x80, 0xfe, 0xff]);
  const expectedHex = Buffer.from(rawBytes).toString("hex");
  const richInput = {
    date: new Date("2026-06-15T12:34:56.789Z"),
    map: new Map([
      ["k1", "v1"],
      [9007199254740995n, "big-key-hit"],
    ]),
    set: new Set(["alpha", new Date("2030-01-01T00:00:00.000Z")]),
    big: 9007199254740999n,
    bytes: rawBytes,
    undef: undefined,
    negZero: -0,
    nanVal: Number.NaN,
    posInf: Number.POSITIVE_INFINITY,
    negInf: Number.NEGATIVE_INFINITY,
    regex: /dinou-[0-9]+/gi,
    url: new URL("https://dinou.dev/docs?a=1#top"),
    escapedUserObj: { $dinou_sf: "not-a-tag", raw: 123 },
  };

  const richRes = await echoRichTypes(richInput);
  assert.equal(richRes.checks.isDate, true, "Server must receive Date instance");
  assert.equal(richRes.checks.dateIso, "2026-06-15T12:34:56.789Z");
  assert.equal(richRes.checks.isMap, true, "Server must receive Map instance");
  assert.equal(richRes.checks.mapSize, 2);
  assert.equal(richRes.checks.mapBigVal, "big-key-hit");
  assert.equal(richRes.checks.isSet, true, "Server must receive Set instance");
  assert.equal(richRes.checks.setHasAlpha, true);
  assert.equal(richRes.checks.setHasDate, true);
  assert.equal(richRes.checks.isBigInt, true, "Server must receive BigInt");
  assert.equal(richRes.checks.bigStr, "9007199254740999");
  assert.equal(richRes.checks.isUint8, true, "Server must receive Uint8Array");
  assert.equal(richRes.checks.bytesHex, expectedHex, "Server Uint8Array bytes must match exactly");
  assert.equal(richRes.checks.hasUndefKey, true, "undefined property key must be preserved");
  assert.equal(richRes.checks.undefIsUndefined, true);
  assert.equal(richRes.checks.isNegZero, true, "-0 must be preserved");
  assert.equal(richRes.checks.isNaNVal, true, "NaN must be preserved");
  assert.equal(richRes.checks.isPosInf, true, "+Infinity must be preserved");
  assert.equal(richRes.checks.isNegInf, true, "-Infinity must be preserved");
  assert.equal(richRes.checks.isRegExp, true, "RegExp must be preserved");
  assert.equal(richRes.checks.regexStr, "/dinou-[0-9]+/gi");
  assert.equal(richRes.checks.isURL, true, "URL must be preserved");
  assert.equal(richRes.checks.urlHref, "https://dinou.dev/docs?a=1#top");
  assert.equal(richRes.checks.escapedLiteralOk, true, "Literal $dinou_sf user object must not collide");

  // Also verify return values coming BACK from Server Function through binary-safe Flight proxy!
  assert.equal(richRes.echo.date instanceof Date, true, "Client must receive Date back");
  assert.equal(richRes.echo.date.toISOString(), "2026-06-15T12:34:56.789Z");
  assert.equal(richRes.echo.map instanceof Map, true, "Client must receive Map back");
  assert.equal(richRes.echo.map.get(9007199254740995n), "big-key-hit");
  assert.equal(richRes.echo.set instanceof Set, true, "Client must receive Set back");
  assert.equal(richRes.echo.set.has("alpha"), true);
  assert.equal(richRes.echo.big, 9007199254740999n, "Client must receive BigInt back");
  assert.equal(richRes.echo.bytes instanceof Uint8Array, true, "Client must receive Uint8Array back");
  assert.equal(
    Buffer.from(richRes.echo.bytes).toString("hex"),
    expectedHex,
    "Returned Uint8Array must survive binary Flight framing byte-for-byte (incl. 0x0a, 0x80, 0xff)"
  );
  assert.equal(richRes.echo.undef, undefined);

  // =========================================================================
  // 1B. Binary Multi-File FormData + Mixed Rich prevState + Non-Mutation
  // =========================================================================
  const uploadBinaryWithMeta = createServerFunctionProxy("file:///src/actions.ts#uploadBinaryWithMeta");
  const all256 = new Uint8Array(256);
  for (let i = 0; i < 256; i++) all256[i] = i;
  const secondBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x0a, 0xff]);
  const expectedShaA = crypto.createHash("sha256").update(Buffer.from(all256)).digest("hex");
  const expectedShaB = crypto.createHash("sha256").update(Buffer.from(secondBytes)).digest("hex");

  const callerFd = new FormData();
  callerFd.append("fileA", new File([all256], "café-🚀.bin", { type: "application/octet-stream" }));
  callerFd.append("fileB", new File([secondBytes], "second.bin", { type: "application/octet-stream" }));
  callerFd.append("note", "binary-upload-ok");

  const prevState = {
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    tags: new Set(["t1", "t2"]),
    seq: 42n,
  };

  const upRes1 = await uploadBinaryWithMeta(prevState, callerFd);
  // Caller FormData MUST NOT be mutated!
  assert.equal(callerFd.has("__dinou_func_id"), false, "caller FormData must NOT be mutated with __dinou_func_id");
  assert.equal(callerFd.has("__dinou_formData_index"), false, "caller FormData must NOT be mutated with __dinou_formData_index");
  assert.equal(callerFd.has("__dinou_args"), false, "caller FormData must NOT be mutated with __dinou_args");
  assert.equal(callerFd.has("__dinou_args_codec"), false, "caller FormData must NOT be mutated with __dinou_args_codec");

  assert.deepEqual(upRes1.leakedInternalKeys, [], "Server must strip all internal keys from FormData");
  assert.equal(upRes1.note, "binary-upload-ok");
  assert.equal(upRes1.fileAName, "café-🚀.bin");
  assert.equal(upRes1.fileALength, 256);
  assert.equal(upRes1.fileASha256, expectedShaA);
  assert.equal(upRes1.fileBName, "second.bin");
  assert.equal(upRes1.fileBLength, 7);
  assert.equal(upRes1.fileBSha256, expectedShaB);
  assert.equal(upRes1.prevStateChecks.isDate, true);
  assert.equal(upRes1.prevStateChecks.dateIso, "2026-07-01T00:00:00.000Z");
  assert.equal(upRes1.prevStateChecks.isSet, true);
  assert.deepEqual(upRes1.prevStateChecks.tagsList, ["t1", "t2"]);
  assert.equal(upRes1.prevStateChecks.isBigInt, true);
  assert.equal(upRes1.prevStateChecks.seqStr, "42");

  // Re-submitting the SAME callerFd a second time must work cleanly with zero duplicate internal keys!
  const upRes2 = await uploadBinaryWithMeta({ ...prevState, seq: 43n }, callerFd);
  assert.equal(upRes2.fileASha256, expectedShaA);
  assert.equal(upRes2.prevStateChecks.seqStr, "43");
  assert.equal(callerFd.has("__dinou_func_id"), false);

  // =========================================================================
  // 1C. True No-JS Progressive Enhancement (<form action={...}> POST to page)
  // =========================================================================
  delete globalThis.window;
  const ssrRes = await serverFetch(new Request("http://localhost:3000/"));
  assert.equal(ssrRes.status, 200);
  const ssrHtml = await ssrRes.text();
  assert.ok(
    ssrHtml.includes('$ACTION_ID_file:///src/actions.ts#submitProgressiveForm'),
    "SSR HTML must emit React 19 $ACTION_ID_ hidden input for Server Action form, got: " + ssrHtml
  );
  assert.ok(
    ssrHtml.includes('$ACTION_REF_'),
    "SSR HTML must emit React 19 $ACTION_REF_ hidden input for bound/useActionState forms"
  );

  // 1C-i: Native browser POST (NO x-server-function-call header!) for plain Server Action
  const progFd = new FormData();
  progFd.append("$ACTION_ID_file:///src/actions.ts#submitProgressiveForm", "");
  progFd.append("title", "hello-nojs");
  const progPostRes = await appFetch(
    new Request("http://localhost:3000/", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
      body: progFd,
    })
  );
  assert.equal(progPostRes.status, 303, "No-JS progressive form POST must respond 303 See Other (PRG)");
  assert.equal(progPostRes.headers.get("location"), "/");
  const progCookies = progPostRes.headers.getSetCookie ? progPostRes.headers.getSetCookie() : [progPostRes.headers.get("set-cookie") || ""];
  assert.ok(progCookies.some((c) => c.includes("z3_prog=hello-nojs")), "303 response must carry Set-Cookie");

  // 1C-ii: Native browser POST with res.redirect("/done")
  const progRedirFd = new FormData();
  progRedirFd.append("$ACTION_ID_file:///src/actions.ts#submitProgressiveForm", "");
  progRedirFd.append("title", "redirected-nojs");
  progRedirFd.append("goDone", "1");
  const progRedirRes = await appFetch(
    new Request("http://localhost:3000/", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
      body: progRedirFd,
    })
  );
  assert.equal(progRedirRes.status, 303);
  assert.equal(progRedirRes.headers.get("location"), "/done");

  // 1C-iii: Native browser POST for BOUND Server Action ($ACTION_REF_1)
  const boundFd = new FormData();
  boundFd.append("$ACTION_REF_1", "");
  boundFd.append("$ACTION_1:0", JSON.stringify({ id: "file:///src/actions.ts#boundProgressiveAction", bound: "$@1" }));
  boundFd.append("$ACTION_1:1", JSON.stringify(["BOUND_PREFIX"]));
  boundFd.append("label", "from-nojs");
  const boundPostRes = await appFetch(
    new Request("http://localhost:3000/", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
      body: boundFd,
    })
  );
  assert.equal(boundPostRes.status, 303);

  // 1C-iv: Native browser POST for useActionState form ($ACTION_REF_2 with prevState)
  const stateFd = new FormData();
  stateFd.append("$ACTION_REF_2", "");
  stateFd.append("$ACTION_2:0", JSON.stringify({ id: "file:///src/actions.ts#submitStateAction", bound: "$@1" }));
  stateFd.append("$ACTION_2:1", JSON.stringify([{ count: 7 }]));
  stateFd.append("$ACTION_KEY", "k12345");
  stateFd.append("delta", "5");
  const statePostRes = await appFetch(
    new Request("http://localhost:3000/", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
      body: stateFd,
    })
  );
  assert.equal(statePostRes.status, 303);

  // Verify server state mutations from all 3 progressive forms!
  globalThis.window = fakeClientWindow;
  const getZ3State = createServerFunctionProxy("file:///src/actions.ts#getZ3State");
  const stateAfterProg = await getZ3State();
  delete globalThis.window;
  assert.deepEqual(stateAfterProg.items, ["hello-nojs|leaked=0", "redirected-nojs|leaked=0"]);
  assert.deepEqual(stateAfterProg.boundLog, ["BOUND_PREFIX:from-nojs"]);
  assert.deepEqual(stateAfterProg.actionStateLog, ["prev=7:next=12"]);

  // 1C-v: Strict CSRF & Security guards on No-JS form POSTs in production!
  const makeEvilFd = (actionKey = "$ACTION_ID_file:///src/actions.ts#submitProgressiveForm") => {
    const fd = new FormData();
    fd.append(actionKey, "");
    fd.append("title", "csrf-pwned");
    return fd;
  };
  const evilOriginRes = await appFetch(
    new Request("http://localhost:3000/", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "https://evil.example" },
      body: makeEvilFd(),
    })
  );
  assert.equal(evilOriginRes.status, 403, "Cross-origin No-JS form POST must be 403");

  const crossSiteRes = await appFetch(
    new Request("http://localhost:3000/", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "cross-site" },
      body: makeEvilFd(),
    })
  );
  assert.equal(crossSiteRes.status, 403, "Sec-Fetch-Site: cross-site No-JS form POST must be 403");

  const noOriginNoRefRes = await appFetch(
    new Request("http://localhost:3000/", {
      method: "POST",
      headers: { host: "localhost:3000" },
      body: makeEvilFd(),
    })
  );
  assert.equal(noOriginNoRefRes.status, 403, "No-JS form POST with missing Origin and Referer in prod must be 403");

  const badManifestRes = await appFetch(
    new Request("http://localhost:3000/", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
      body: makeEvilFd("$ACTION_ID_file:///src/actions.ts#nonExistentAction"),
    })
  );
  assert.ok([400, 403].includes(badManifestRes.status), "Unlisted action ID in No-JS form must be rejected");

  const hugeFd = new FormData();
  hugeFd.append("$ACTION_ID_file:///src/actions.ts#submitProgressiveForm", "");
  hugeFd.append("title", "X".repeat(70000));
  const hugeRes = await appFetch(
    new Request("http://localhost:3000/", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
      body: hugeFd,
    })
  );
  assert.equal(hugeRes.status, 413, "Oversized No-JS form POST must return 413 Payload Too Large");

  // Confirm ZERO csrf-pwned items were appended!
  globalThis.window = fakeClientWindow;
  const stateAfterCsrf = await getZ3State();
  delete globalThis.window;
  assert.equal(stateAfterCsrf.items.some((s) => s.includes("csrf-pwned")), false);

  // =========================================================================
  // 1D. Concurrent Server Functions + res.cookie() / res.clearCookie() Isolation
  // =========================================================================
  const [resA, resB] = await Promise.all([
    appFetch(
      new Request("http://localhost:3000/____server_function____", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "x-server-function-call": "1",
          "content-type": "application/json",
          cookie: "z3_init=reqA; z3_b=oldval",
        },
        body: JSON.stringify({ id: "file:///src/actions.ts#concurrentCookieActionA", args: [] }),
      })
    ),
    appFetch(
      new Request("http://localhost:3000/____server_function____", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "x-server-function-call": "1",
          "content-type": "application/json",
          cookie: "z3_init=reqB; z3_b=oldval",
        },
        body: JSON.stringify({ id: "file:///src/actions.ts#concurrentCookieActionB", args: [] }),
      })
    ),
  ]);

  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);
  const cookiesA = resA.headers.getSetCookie ? resA.headers.getSetCookie() : [resA.headers.get("set-cookie") || ""];
  const cookiesB = resB.headers.getSetCookie ? resB.headers.getSetCookie() : [resB.headers.get("set-cookie") || ""];
  assert.equal(cookiesA.length, 1, "Action A must emit exactly 1 Set-Cookie without leaking B's cookies");
  assert.ok(cookiesA[0].includes("z3_a=alpha"));
  assert.equal(cookiesB.length, 2, "Action B must emit BOTH clearCookie(z3_b) and cookie(z3_c)");
  assert.ok(
    cookiesB.some((c) => c.startsWith("z3_b=;") && /Max-Age=0/i.test(c) && c.toLowerCase().includes("path=/")),
    "clearCookie(z3_b) must default Path=/ and set Max-Age=0, got: " + JSON.stringify(cookiesB)
  );
  assert.ok(cookiesB.some((c) => c.includes("z3_c=gamma")));

  const bodyA = await resA.text();
  const bodyB = await resB.text();
  assert.ok(bodyA.includes("reqA"), "Action A must see reqA isolated AsyncLocalStorage cookie");
  assert.ok(bodyB.includes("reqB"), "Action B must see reqB isolated AsyncLocalStorage cookie");
} finally {
  globalThis.fetch = origFetch;
  globalThis.window = origWindow;
}
`,
      "utf8"
    );

    const runRes = spawnSync(process.execPath, [probeFile], {
      cwd: tmpApp,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DINOU_DEV: "",
        DINOU_BUILD_TOOL: "esbuild",
      },
      encoding: "utf8",
      timeout: 120000,
    });

    if (runRes.status !== 0) {
      throw new Error(
        `Z3 probe failed (status=${runRes.status}):\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
      );
    }
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("2. [#Z3] Tri-bundler parity (Esbuild, Rollup & Webpack): server-function-codec, binary-safe Flight stream filter & non-mutating FormData cloning", async () => {
  // Verify codec & binary-safe Flight filter are wired into BOTH server-function-proxy.js and server-function-proxy-webpack.js
  for (const rel of [
    "core/server-function-proxy.js",
    "core/server-function-proxy-webpack.js",
  ]) {
    const src = fs.readFileSync(path.join(DINOU_ROOT, rel), "utf8");
    assert.ok(
      src.includes("server-function-codec"),
      `${rel} must import and use server-function-codec.js`
    );
    assert.ok(
      src.includes("createBinarySafeFlightFilterStream") ||
        src.includes("filterDinouFlightStream"),
      `${rel} must use binary-safe Flight stream filtering (never TextDecoder over raw binary Flight chunks)`
    );
    assert.ok(
      !src.includes('formData.append("__dinou_func_id"'),
      `${rel} must clone caller FormData instead of mutating it in place`
    );
  }

  // Verify Rollup and Webpack production builds compile and handle No-JS Progressive Enhancement + Rich Codec cleanly
  for (const bundler of ["rollup", "webpack"]) {
    const tmpApp = createFixtureDir(`tmp-z3-sf-${bundler}-`);
    try {
      createZ3Fixture(tmpApp);
      buildFixtureApp(tmpApp, bundler);

      const probeFile = path.join(tmpApp, `__z3_${bundler}_probe.mjs`);
      fs.writeFileSync(
        probeFile,
        `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TMP_APP = ${JSON.stringify(tmpApp)};
const DINOU_ROOT = ${JSON.stringify(DINOU_ROOT)};
const serverFile = fs.existsSync(path.join(TMP_APP, ".dinou/node/server.js"))
  ? path.join(TMP_APP, ".dinou/node/server.js")
  : path.join(TMP_APP, ".dinou/node/server.mjs");
const serverMod = await import(pathToFileURL(serverFile).href);
const appFetch = serverMod.fetch;

const { encodeServerFunctionArgs } = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core/server-function-codec.js")).href
);

// Rich codec call against compiled ${bundler} server
const rawBytes = new Uint8Array([0, 10, 128, 255]);
const encodedArgs = encodeServerFunctionArgs([
  {
    date: new Date("2026-08-09T10:11:12.000Z"),
    map: new Map([[9007199254740995n, "big-key-hit"]]),
    set: new Set(["alpha", new Date("2030-01-01T00:00:00.000Z")]),
    big: 1234567890123456789012345n,
    bytes: rawBytes,
    undef: undefined,
    negZero: -0,
    nanVal: NaN,
    posInf: Infinity,
    negInf: -Infinity,
    regex: /z3/i,
    url: new URL("https://dinou.dev/z3"),
    escapedUserObj: { $dinou_sf: "not-a-tag", raw: 123 },
  },
]);
const rpcRes = await appFetch(
  new Request("http://localhost:3000/____server_function____", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "x-server-function-call": "1",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: "file:///src/actions.ts#echoRichTypes",
      args: encodedArgs,
      __dinou_codec: 1,
    }),
  })
);
assert.equal(rpcRes.status, 200);
const rpcText = await rpcRes.text();
assert.ok(rpcText.includes('"isDate":true'), "${bundler}: server must receive Date");
assert.ok(rpcText.includes('"isMap":true'), "${bundler}: server must receive Map");
assert.ok(rpcText.includes('"isSet":true'), "${bundler}: server must receive Set");
assert.ok(rpcText.includes('"isBigInt":true'), "${bundler}: server must receive BigInt");
assert.ok(rpcText.includes('"isUint8":true'), "${bundler}: server must receive Uint8Array");
assert.ok(rpcText.includes('"bytesHex":"000a80ff"'), "${bundler}: server must preserve Uint8Array hex");

// No-JS progressive form POST against compiled ${bundler} server
const progFd = new FormData();
progFd.append("$ACTION_ID_file:///src/actions.ts#submitProgressiveForm", "");
progFd.append("title", "prog-${bundler}");
const progRes = await appFetch(
  new Request("http://localhost:3000/", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    body: progFd,
  })
);
assert.equal(progRes.status, 303, "${bundler}: No-JS progressive form POST must return 303");
assert.equal(progRes.headers.get("location"), "/");
`,
        "utf8"
      );

      const runRes = spawnSync(process.execPath, [probeFile], {
        cwd: tmpApp,
        env: {
          ...process.env,
          NODE_ENV: "production",
          DINOU_DEV: "",
          DINOU_BUILD_TOOL: bundler,
        },
        encoding: "utf8",
        timeout: 120000,
      });

      if (runRes.status !== 0) {
        throw new Error(
          `Z3 ${bundler} probe failed (status=${runRes.status}):\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
        );
      }
    } finally {
      removeDirSafe(tmpApp);
    }
  }
});
