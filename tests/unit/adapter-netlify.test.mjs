// tests/unit/adapter-netlify.test.mjs
// Series Z — Phase 1 — Stage 5 (Check #Z5 — Part A):
// Comprehensive Netlify Functions v2 Adapter contract suite:
// - Static, Dynamic SSR, 3D PPR + <DinouCacheSlot> + /____rsc_slot____,
//   Server Functions, redirect(), notFound(), cookies/headers, onRequest plugin,
//   Netlify.env forwarding, and `config` export ({ path: "/*", preferStatic: true }).
// - Read-only AWS Lambda filesystem simulation (zero writes permitted in cwd).
// - Fallback from `.dinou/netlify/functions/ssr.mjs` to `.dinou/dist1/server/netlify.js`
//   and graceful 500 when both bundles are missing.
// - Live ESM bundle reload when `ssr.mjs` is rebuilt on disk (mtimeMs cache-busting).

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
const SWC_CACHE_DIR = path.join(REPO_ROOT, ".dinou", ".swc-cache");
fs.mkdirSync(SWC_CACHE_DIR, { recursive: true });

function removeDirSafe(dirPath) {
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 80,
    });
  } catch {}
}

function createFixtureDir(prefix) {
  const base = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(base, { recursive: true });
    return fs.mkdtempSync(path.join(base, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

function writeDinouShim(tmpApp) {
  const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
  const adaptersDir = path.join(dinouShimDir, "adapters");
  fs.mkdirSync(adaptersDir, { recursive: true });
  const relFromRoot = (relPath) => {
    const rel = path
      .relative(dinouShimDir, path.join(DINOU_ROOT, relPath))
      .replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  };
  const relFromAdapters = (relPath) => {
    const rel = path
      .relative(adaptersDir, path.join(DINOU_ROOT, relPath))
      .replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  };

  fs.writeFileSync(
    path.join(dinouShimDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "10.0.7",
        type: "module",
        exports: {
          ".": {
            "react-server": "./server.js",
            default: "./index.js",
          },
          "./server": "./server.js",
          "./config": "./config.js",
          "./adapters/netlify": "./adapters/netlify.js",
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "index.js"),
    `export * from ${JSON.stringify(relFromRoot("index.js"))};\nexport { default } from ${JSON.stringify(relFromRoot("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(relFromRoot("server.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(relFromRoot("core/config.js"))};\nexport { default } from ${JSON.stringify(relFromRoot("core/config.js"))};\n`
  );
  fs.writeFileSync(
    path.join(adaptersDir, "netlify.js"),
    `export * from ${JSON.stringify(relFromAdapters("adapters/netlify.js"))};\nexport { default } from ${JSON.stringify(relFromAdapters("adapters/netlify.js"))};\n`
  );
}

function runDinouCli(cwd, args, extraEnv = {}) {
  const res = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_OPTIONS: "",
      SWC_NATIVE_BINDING_CACHE: SWC_CACHE_DIR,
      ...extraEnv,
    },
  });
  assert.equal(
    res.status,
    0,
    `dinou ${args.join(" ")} failed (exit ${res.status}):\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
  );
  return res;
}

function createNetlifyFixtureApp(tmpApp, versionTag = "V1") {
  fs.mkdirSync(path.join(tmpApp, "src/dynamic"), { recursive: true });
  fs.mkdirSync(path.join(tmpApp, "src/ppr-slot"), { recursive: true });
  fs.mkdirSync(path.join(tmpApp, "src/go-redirect"), { recursive: true });
  writeDinouShim(tmpApp);

  fs.writeFileSync(
    path.join(tmpApp, "package.json"),
    JSON.stringify({ name: "z5-netlify-app", type: "module" }, null, 2)
  );
  fs.writeFileSync(
    path.join(tmpApp, ".env"),
    `NETLIFY_SECRET_KEY=secret-${versionTag}\nDINOU_PUBLIC_STAGE=netlify-${versionTag}\n`
  );
  fs.writeFileSync(
    path.join(tmpApp, "dinou.config.mjs"),
    `export default {
  plugins: [
    {
      name: "netlify-onrequest-plugin",
      async onRequest(req, ctx) {
        const url = new URL(req.url);
        if (url.pathname === "/api/plugin-ping") {
          return new Response(JSON.stringify({ pong: ${JSON.stringify(versionTag)} }), {
            status: 200,
            headers: { "content-type": "application/json", "x-plugin-tag": ${JSON.stringify(versionTag)} },
          });
        }
        ctx.res.setHeader("x-netlify-plugin", ${JSON.stringify("active-" + versionTag)});
      },
    },
  ],
};
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Z5 Netlify ${versionTag}</title></head>
      <body data-version=${JSON.stringify(versionTag)}>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/not_found.tsx"),
    `export default function NotFound() {
  return <main data-testid="z5-404">CUSTOM_NETLIFY_404_${versionTag}</main>;
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/actions.ts"),
    `"use server";
import { getContext } from "dinou";

export async function netlifyAction(input: { text: string; big: bigint }) {
  const ctx = getContext();
  ctx?.res?.cookie?.("nf_action_cookie", "ok_${versionTag}", { path: "/" });
  return {
    echo: input.text.toUpperCase(),
    doubled: input.big * 2n,
    version: ${JSON.stringify(versionTag)},
    hasSecret: Boolean(ctx?.env?.NETLIFY_SECRET_KEY),
  };
}
`
  );

  // Static root route (references netlifyAction so it is registered in server-functions-manifest)
  fs.writeFileSync(
    path.join(tmpApp, "src/page.tsx"),
    `import { netlifyAction } from "./actions";

export default function HomePage() {
  return (
    <main data-route="static-home" data-has-action={String(typeof netlifyAction === "function")}>
      STATIC_HOME_${versionTag}
      <span>{process.env.DINOU_PUBLIC_STAGE}</span>
    </main>
  );
}
`
  );

  // Dynamic SSR route (cookies, headers, Netlify.env, context)
  fs.writeFileSync(
    path.join(tmpApp, "src/dynamic/page_functions.ts"),
    `export const revalidate = 0;
export async function getProps({ query }: { query?: Record<string, string> }) {
  return { page: { user: query?.user || "guest" } };
}
`
  );
  fs.writeFileSync(
    path.join(tmpApp, "src/dynamic/page.tsx"),
    `import { getContext } from "dinou/server";

export default function DynamicPage({ user }: { user?: string }) {
  const ctx = getContext();
  const resolvedUser = user || String(ctx?.req?.query?.user || "guest");
  ctx?.res?.cookie?.("nf_dyn_cookie", "dyn_" + resolvedUser, { path: "/" });
  ctx?.res?.setHeader?.("x-dynamic-route", "hit-${versionTag}");
  const region = String(ctx?.env?.NETLIFY_REGION || "none");
  const secret = String(ctx?.env?.NETLIFY_SECRET_KEY || "missing");
  const reqCookie = String(ctx?.req?.cookies?.incoming_cookie || "none");
  const hasCtx = Boolean(ctx?.ctx?.geo?.country?.code === "ES");
  return (
    <main
      data-route="dynamic"
      data-user={resolvedUser}
      data-region={region}
      data-secret={secret}
      data-incoming-cookie={reqCookie}
      data-has-ctx={String(hasCtx)}
    >
      DYNAMIC_${versionTag}:{resolvedUser}:{region}
    </main>
  );
}
`
  );

  // 3D PPR + <DinouCacheSlot> route
  fs.writeFileSync(
    path.join(tmpApp, "src/ppr-slot/page_functions.ts"),
    `export const ppr = true;
export const revalidate = 60;
`
  );
  fs.writeFileSync(
    path.join(tmpApp, "src/ppr-slot/page.tsx"),
    `import { Suspense } from "react";
import { DinouCacheSlot, getContext } from "dinou/server";

let slotRenderCount = 0;

async function LiveHole() {
  const ctx = getContext();
  const q = ctx?.req?.query?.hole || "default-hole";
  return <span data-testid="ppr-hole">PPR_HOLE_${versionTag}:{q}</span>;
}

export default function PprSlotPage() {
  return (
    <main data-route="ppr-slot">
      <div data-testid="ppr-shell">PPR_SHELL_${versionTag}</div>
      <Suspense fallback={<span>loading-hole</span>}>
        <LiveHole />
      </Suspense>
      <DinouCacheSlot id="z5-netlify-slot" revalidate={60} tags={["z5-slot-tag"]}>
        {async () => {
          slotRenderCount++;
          return (
            <div data-testid="z5-slot-content">
              {${"`NETLIFY_SLOT_" + versionTag + ":seq=${slotRenderCount}`"}}
            </div>
          );
        }}
      </DinouCacheSlot>
    </main>
  );
}
`
  );

  // Redirect route
  fs.writeFileSync(
    path.join(tmpApp, "src/go-redirect/page_functions.ts"),
    `export const revalidate = 0;\n`
  );
  fs.writeFileSync(
    path.join(tmpApp, "src/go-redirect/page.tsx"),
    `import { getContext } from "dinou";

export default function RedirectPage() {
  const ctx = getContext();
  ctx?.res?.cookie?.("nf_redir_cookie", "redirected", { path: "/" });
  ctx?.res?.redirect?.(302, "/dynamic?user=from-redirect");
  return null;
}
`
  );
}

test("1. [#Z5 Part A] Netlify Functions v2 contract: static, dynamic SSR, 3D PPR + <DinouCacheSlot> + /____rsc_slot____, Server Functions, redirect(), notFound(), cookies, onRequest, Netlify.env & read-only Lambda FS", async () => {
  const tmpApp = createFixtureDir("tmp-z5-netlify-contract-");
  try {
    createNetlifyFixtureApp(tmpApp, "V1");
    runDinouCli(tmpApp, ["build:netlify"]);

    // Simulate AWS Lambda deployment: remove src/ and dinou.config.mjs
    removeDirSafe(path.join(tmpApp, "src"));
    fs.rmSync(path.join(tmpApp, "dinou.config.mjs"), { force: true });

    const verifyScript = path.join(tmpApp, "verify-z5-netlify.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import adapterNetlify, { config as adapterConfig } from "dinou/adapters/netlify";
import { config as bundleConfig } from "./.dinou/netlify/functions/ssr.mjs";

const appCwd = process.cwd();

// 1. Verify config exports
assert.deepEqual(adapterConfig, { path: "/*", preferStatic: true });
assert.deepEqual(bundleConfig, { path: "/*", preferStatic: true });

// 2. Simulate strictly read-only AWS Lambda filesystem (/var/task):
//    Any write/mkdir/rm/rename inside appCwd throws EROFS!
const writeAttempts = [];
const assertNotInReadOnlyApp = (targetPath, op) => {
  if (!targetPath) return;
  const resolved = path.resolve(String(targetPath));
  const normApp = path.resolve(appCwd).toLowerCase();
  if (resolved.toLowerCase().startsWith(normApp)) {
    writeAttempts.push({ op, path: resolved });
    const err = new Error(\`EROFS: read-only file system, \${op} '\${resolved}'\`);
    err.code = "EROFS";
    throw err;
  }
};

const origWriteFileSync = fs.writeFileSync;
const origMkdirSync = fs.mkdirSync;
const origRmSync = fs.rmSync;
const origRenameSync = fs.renameSync;
const origPromisesWriteFile = fs.promises.writeFile;
const origPromisesMkdir = fs.promises.mkdir;

fs.writeFileSync = function (p, ...rest) {
  assertNotInReadOnlyApp(p, "writeFileSync");
  return origWriteFileSync.call(this, p, ...rest);
};
fs.mkdirSync = function (p, ...rest) {
  assertNotInReadOnlyApp(p, "mkdirSync");
  return origMkdirSync.call(this, p, ...rest);
};
fs.rmSync = function (p, ...rest) {
  assertNotInReadOnlyApp(p, "rmSync");
  return origRmSync.call(this, p, ...rest);
};
fs.renameSync = function (oldP, newP, ...rest) {
  assertNotInReadOnlyApp(oldP, "renameSync");
  assertNotInReadOnlyApp(newP, "renameSync");
  return origRenameSync.call(this, oldP, newP, ...rest);
};
fs.promises.writeFile = async function (p, ...rest) {
  assertNotInReadOnlyApp(p, "promises.writeFile");
  return origPromisesWriteFile.call(this, p, ...rest);
};
fs.promises.mkdir = async function (p, ...rest) {
  assertNotInReadOnlyApp(p, "promises.mkdir");
  return origPromisesMkdir.call(this, p, ...rest);
};

globalThis.Netlify = {
  env: {
    toObject: () => ({ NETLIFY_REGION: "eu-west-1" }),
  },
};

const waitUntilPromises = [];
const mockContext = {
  geo: { country: { code: "ES" } },
  waitUntil(p) {
    waitUntilPromises.push(p);
  },
};

// 3. onRequest plugin direct interception
const pingRes = await adapterNetlify(
  new Request("https://z5.netlify.app/api/plugin-ping"),
  mockContext
);
assert.equal(pingRes.status, 200);
assert.equal(pingRes.headers.get("x-plugin-tag"), "V1");
assert.deepEqual(await pingRes.json(), { pong: "V1" });

// 4. Static prerendered route
const homeRes = await adapterNetlify(
  new Request("https://z5.netlify.app/"),
  mockContext
);
assert.equal(homeRes.status, 200);
assert.equal(homeRes.headers.get("x-netlify-plugin"), "active-V1");
const homeHtml = await homeRes.text();
assert.ok(homeHtml.includes("STATIC_HOME_V1"));
assert.ok(homeHtml.includes("netlify-V1"));

// 5. Dynamic SSR route with cookies, custom headers, Netlify.env & context
const dynRes = await adapterNetlify(
  new Request("https://z5.netlify.app/dynamic?user=alice", {
    headers: { cookie: "incoming_cookie=hello42" },
  }),
  mockContext
);
assert.equal(dynRes.status, 200);
assert.equal(dynRes.headers.get("x-netlify-plugin"), "active-V1");
assert.equal(dynRes.headers.get("x-dynamic-route"), "hit-V1");
const dynCookies = dynRes.headers.getSetCookie?.() || [dynRes.headers.get("set-cookie") || ""];
assert.ok(
  dynCookies.some((c) => c.includes("nf_dyn_cookie=dyn_alice")),
  "Expected nf_dyn_cookie=dyn_alice in Set-Cookie: " + JSON.stringify(dynCookies)
);
const dynHtml = await dynRes.text();
assert.ok(dynHtml.includes('data-user="alice"'));
assert.ok(dynHtml.includes('data-region="eu-west-1"'));
assert.ok(dynHtml.includes('data-secret="secret-V1"'));
assert.ok(dynHtml.includes('data-incoming-cookie="hello42"'));
assert.ok(dynHtml.includes('data-has-ctx="true"'));

// 6. 3D PPR + <DinouCacheSlot> + /____rsc_slot____ (cached & fresh=1)
const pprRes = await adapterNetlify(
  new Request("https://z5.netlify.app/ppr-slot?hole=alpha"),
  mockContext
);
assert.equal(pprRes.status, 200);
const pprHtml = await pprRes.text();
assert.ok(pprHtml.includes("PPR_SHELL_V1"), "Missing PPR shell");
assert.ok(pprHtml.includes("PPR_HOLE_V1") && pprHtml.includes("alpha"), "Missing PPR live hole");
assert.ok(pprHtml.includes("NETLIFY_SLOT_V1:seq="), "Missing DinouCacheSlot");

const slotRes1 = await adapterNetlify(
  new Request("https://z5.netlify.app/____rsc_slot____/z5-netlify-slot", {
    headers: { "x-dinou-current-path": "/ppr-slot" },
  }),
  mockContext
);
assert.equal(slotRes1.status, 200);
const slotBody1 = await slotRes1.text();
assert.ok(slotBody1.includes("NETLIFY_SLOT_V1:seq="), "Slot endpoint failed: " + slotBody1);

const slotResFresh = await adapterNetlify(
  new Request("https://z5.netlify.app/____rsc_slot____/z5-netlify-slot?fresh=1", {
    headers: { "x-dinou-current-path": "/ppr-slot" },
  }),
  mockContext
);
assert.equal(slotResFresh.status, 200);
const slotBodyFresh = await slotResFresh.text();
assert.ok(slotBodyFresh.includes("NETLIFY_SLOT_V1:seq="), "Fresh slot endpoint failed: " + slotBodyFresh);
assert.notEqual(slotBodyFresh, slotBody1, "fresh=1 slot render should increment sequence");

// 7. Server Function with rich codec args + Set-Cookie + Netlify env
const sfRes = await adapterNetlify(
  new Request("https://z5.netlify.app/____server_function____", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-server-function-call": "1",
      origin: "https://z5.netlify.app",
      host: "z5.netlify.app",
    },
    body: JSON.stringify({
      id: "file:///src/actions.ts#netlifyAction",
      args: [{ text: "hello", big: { $dinou_sf: "bi", v: "21" } }],
      __dinou_codec: 1,
    }),
  }),
  mockContext
);
assert.equal(sfRes.status, 200);
const sfCookies = sfRes.headers.getSetCookie?.() || [sfRes.headers.get("set-cookie") || ""];
assert.ok(
  sfCookies.some((c) => c.includes("nf_action_cookie=ok_V1")),
  "Expected nf_action_cookie=ok_V1 in Set-Cookie"
);
const sfBody = await sfRes.text();
assert.ok(sfBody.includes("HELLO"), "Expected HELLO in SF body: " + sfBody);
assert.ok(sfBody.includes("$n42"), "Expected Flight BigInt $n42 in SF body: " + sfBody);
assert.ok(sfBody.includes('"hasSecret":true'), "Expected hasSecret:true in SF body");

// 8. redirect() route preserving Set-Cookie
const redirRes = await adapterNetlify(
  new Request("https://z5.netlify.app/go-redirect"),
  mockContext
);
assert.equal(redirRes.status, 302);
assert.equal(redirRes.headers.get("location"), "/dynamic?user=from-redirect");
const redirCookies = redirRes.headers.getSetCookie?.() || [redirRes.headers.get("set-cookie") || ""];
assert.ok(
  redirCookies.some((c) => c.includes("nf_redir_cookie=redirected")),
  "Expected nf_redir_cookie=redirected in redirect response"
);

// 9. notFound() route
const nfRes = await adapterNetlify(
  new Request("https://z5.netlify.app/does-not-exist-xyz"),
  mockContext
);
assert.equal(nfRes.status, 404);
const nfHtml = await nfRes.text();
assert.ok(nfHtml.includes("CUSTOM_NETLIFY_404_V1"), "Expected custom 404 page");

await Promise.all(waitUntilPromises);

// 10. Read-only Lambda filesystem invariant: ZERO unhandled crashes; check write attempts
assert.equal(
  writeAttempts.length,
  0,
  "Netlify adapter must never attempt filesystem writes under cwd on read-only Lambda FS, but attempted: " +
    JSON.stringify(writeAttempts)
);

console.log("NETLIFY_CONTRACT_OK");
`
    );

    const run = spawnSync(process.execPath, [verifyScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    assert.equal(
      run.status,
      0,
      `Netlify contract runner failed (exit ${run.status}):\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`
    );
    assert.ok(run.stdout.includes("NETLIFY_CONTRACT_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("2. [#Z5 Part A] Netlify adapter mtimeMs cache-busted ESM reload, dist1 fallback & missing-bundle graceful 500", async () => {
  const tmpApp = createFixtureDir("tmp-z5-netlify-reload-");
  try {
    writeDinouShim(tmpApp);
    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "z5-netlify-reload", type: "module" }, null, 2)
    );

    const netlifyFnDir = path.join(tmpApp, ".dinou/netlify/functions");
    const dist1ServerDir = path.join(tmpApp, ".dinou/dist1/server");
    fs.mkdirSync(netlifyFnDir, { recursive: true });
    fs.mkdirSync(dist1ServerDir, { recursive: true });
    fs.writeFileSync(
      path.join(netlifyFnDir, "package.json"),
      JSON.stringify({ type: "module" })
    );
    fs.writeFileSync(
      path.join(dist1ServerDir, "package.json"),
      JSON.stringify({ type: "module" })
    );

    const verifyReloadScript = path.join(tmpApp, "verify-reload.mjs");
    fs.writeFileSync(
      verifyReloadScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import netlifyHandler from "dinou/adapters/netlify";

const ssrPath = path.resolve(process.cwd(), ".dinou/netlify/functions/ssr.mjs");
const fallbackPath = path.resolve(process.cwd(), ".dinou/dist1/server/netlify.js");

// A. Missing both bundles -> graceful 500 without crashing or poisoning cache
const missRes = await netlifyHandler(new Request("https://z5.netlify.app/"), {});
assert.equal(missRes.status, 500);
const missText = await missRes.text();
assert.ok(
  missText.includes("Dinou Netlify bundle not found"),
  "Unexpected 500 message: " + missText
);

// B. Fallback to .dinou/dist1/server/netlify.js when dedicated ssr.mjs is absent
fs.writeFileSync(
  fallbackPath,
  'export default async function() { return new Response("DIST1_FALLBACK_V1", { status: 200 }); }\\n'
);
const fbRes = await netlifyHandler(new Request("https://z5.netlify.app/"), {});
assert.equal(fbRes.status, 200);
assert.equal(await fbRes.text(), "DIST1_FALLBACK_V1");

// C. Dedicated .dinou/netlify/functions/ssr.mjs takes precedence over dist1 fallback
fs.writeFileSync(
  ssrPath,
  'export default async function() { return new Response("DEDICATED_V1", { status: 200 }); }\\n'
);
const v1Res = await netlifyHandler(new Request("https://z5.netlify.app/"), {});
assert.equal(v1Res.status, 200);
assert.equal(await v1Res.text(), "DEDICATED_V1");

// D. Rebuild ssr.mjs on disk with a new mtimeMs -> adapter MUST bypass Node ESM cache (?v=...) and serve V2!
fs.writeFileSync(
  ssrPath,
  'export default async function() { return new Response("DEDICATED_V2_REBUILT", { status: 200 }); }\\n'
);
const future = new Date(Date.now() + 2000);
fs.utimesSync(ssrPath, future, future);

const v2Res = await netlifyHandler(new Request("https://z5.netlify.app/"), {});
assert.equal(v2Res.status, 200);
const v2Text = await v2Res.text();
assert.equal(
  v2Text,
  "DEDICATED_V2_REBUILT",
  "Expected mtimeMs-busted ESM reload to serve DEDICATED_V2_REBUILT, got: " + v2Text
);

console.log("NETLIFY_RELOAD_OK");
`
    );

    const run = spawnSync(process.execPath, [verifyReloadScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    assert.equal(
      run.status,
      0,
      `Netlify reload runner failed (exit ${run.status}):\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`
    );
    assert.ok(run.stdout.includes("NETLIFY_RELOAD_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});
