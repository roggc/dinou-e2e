// scripts/verify-deployment-ci.mjs
// Verifies Dinou v9.4.0 Deployment Targets, Netlify Functions v2 Dual-Bundle & Multi-Runtime Adapter Fixes (x-deployment-fixes.md):
// 1. CLI build:netlify[:esbuild|:rollup|:webpack] commands & strict NodeNext .d.ts cross-imports (dinou/index.d.ts <-> dinou/server.d.ts)
// 2. Netlify Functions v2 (.dinou/netlify/functions/ssr.mjs, dinou/adapters/netlify) & .dinou/dist1/server/{netlify.js,handler.js} AOT Dual-Bundle across Esbuild, Rollup & Webpack (plain Node without src/, dinou.config.ts, or --conditions=react-server; zero .dinou/dist2 writes; Netlify.env unification; Server Functions; custom 404; nested .dinou/ workspace path guard)
// 3. Multi-Bundle React Dispatcher Isolation (concurrent interleaved SSR with useContext/useState across two independent Dual-Bundles in one JS isolate)
// 4. Cloudflare Workers adapter (dinou/adapters/cloudflare.js -> .dinou/cloudflare/worker.js delegation, ASSETS, /__dinou_dist2 404, explicit storage preservation) + optional Bun/Deno AOT builds
// 5. Guaranteed .dinou/dist2 directory on 100%-dynamic apps (0 static routes), Node AOT HTTP 206 Range serving & export-static
// 6. Runtime adapters (dinou/adapters/{bun,deno}.js) HOST hostname propagation, CLI fail-fast exit(1) on missing bundle vs graceful 500 programmatic fallback & Deno.cwd() readDist2Fallback

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const rootRequire = createRequire(path.join(projectRoot, "package.json"));
const ts = rootRequire("typescript");

const guardedManifestRelPaths = [
  ".dinou/dist1/manifest.json",
  ".dinou/dist1/react-client-manifest.json",
  ".dinou/dist1/react-ssr-manifest.json",
  ".dinou/dist1/server-functions-manifest.json",
  ".dinou/node-dev/manifest.json",
  ".dinou/node-dev/react-client-manifest.json",
  ".dinou/node-dev/react-ssr-manifest.json",
  ".dinou/node-dev/server-functions-manifest.json",
];
const manifestSnapshotBefore = new Map(
  guardedManifestRelPaths.map((rel) => {
    const abs = path.join(projectRoot, rel);
    return [rel, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null];
  })
);

const dinouRootCandidates = [
  path.resolve(projectRoot, "dinou"),
  path.resolve(projectRoot, "node_modules/dinou/dinou"),
  path.resolve(projectRoot, "node_modules/dinou"),
];
const dinouRoot =
  dinouRootCandidates.find((dir) => fs.existsSync(path.join(dir, "cli.js"))) ??
  dinouRootCandidates[0];
const cliPath = path.join(dinouRoot, "cli.js");

function hasRuntimeBinary(bin) {
  const res = spawnSync(bin, ["--version"], { encoding: "utf8" });
  return !res.error && res.status === 0;
}

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

function writePackageShims(appDir) {
  const nmDinou = path.join(appDir, "node_modules", "dinou");
  fs.mkdirSync(path.join(nmDinou, "adapters"), { recursive: true });

  const relToDinou = (subpath, fromDir = nmDinou) => {
    const rel = path
      .relative(fromDir, path.join(dinouRoot, subpath))
      .replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  };

  fs.writeFileSync(
    path.join(nmDinou, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "9.4.0",
        type: "module",
        exports: {
          ".": "./index.js",
          "./server": "./server.js",
          "./config": "./config.js",
          "./adapters/node": "./adapters/node.js",
          "./adapters/bun": "./adapters/bun.js",
          "./adapters/deno": "./adapters/deno.js",
          "./adapters/cloudflare": "./adapters/cloudflare.js",
          "./adapters/netlify": "./adapters/netlify.js",
        },
      },
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    path.join(nmDinou, "index.js"),
    `export * from ${JSON.stringify(relToDinou("index.js"))};\nexport { default } from ${JSON.stringify(relToDinou("index.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(nmDinou, "server.js"),
    `export * from ${JSON.stringify(relToDinou("server.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(nmDinou, "config.js"),
    `export * from ${JSON.stringify(relToDinou("core/config.js"))};\nexport { default } from ${JSON.stringify(relToDinou("core/config.js"))};\n`,
    "utf8"
  );

  for (const adp of ["node", "bun", "deno", "cloudflare", "netlify"]) {
    const rel = relToDinou(`adapters/${adp}.js`, path.join(nmDinou, "adapters"));
    fs.writeFileSync(
      path.join(nmDinou, `adapters/${adp}.js`),
      `export * from ${JSON.stringify(rel)};\nexport { default } from ${JSON.stringify(rel)};\n`,
      "utf8"
    );
  }
}

function createFixtureApp(baseDir, name, { dynamicOnly = false } = {}) {
  const dir = path.join(baseDir, name);
  fs.mkdirSync(path.join(dir, "src", "dynamic"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "posts", "[slug]"), { recursive: true });
  fs.mkdirSync(path.join(dir, "public"), { recursive: true });

  writePackageShims(dir);

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: `deploy-ci-${name}`, private: true, type: "module" },
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          paths: { "@/*": ["./src/*"] },
        },
      },
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, ".env.production"),
    "DINOU_PUBLIC_APP_STAGE=prod-verify\nSERVER_SECRET_TOKEN=top-secret-42\n",
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, "public", "robots.txt"),
    "User-agent: *\nAllow: /\n",
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, "dinou.config.ts"),
    `import { defineConfig } from "dinou";

export default defineConfig({
  plugins: [
    {
      name: "deploy-header-plugin",
      onRequest(_req, ctx) {
        ctx.res.setHeader("x-deploy-plugin", "active");
      },
    },
  ],
});
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, "src", "actions.ts"),
    `"use server";
import { getContext } from "dinou/server";

export async function echoAction(input: string) {
  const { env } = getContext();
  return {
    echoed: input.toUpperCase(),
    hasSecret: Boolean(env.SERVER_SECRET_TOKEN),
  };
}
`,
    "utf8"
  );

  // Uses React createContext + useContext + useState to exercise multi-bundle React dispatcher isolation!
  fs.writeFileSync(
    path.join(dir, "src", "client-badge.tsx"),
    `"use client";
import { createContext, useContext, useState } from "react";
import { echoAction } from "@/actions";

const BadgeCtx = createContext("ctx-ok");

function InnerLabel({ label }: { label: string }) {
  const ctxVal = useContext(BadgeCtx);
  const [step] = useState(1);
  return (
    <span
      data-client-badge={label}
      data-ctx={ctxVal}
      data-step={String(step)}
      data-public-stage={process.env.DINOU_PUBLIC_APP_STAGE}
      data-has-action={String(typeof echoAction === "function")}
    >
      {label}
    </span>
  );
}

export function ClientBadge({ label }: { label: string }) {
  return (
    <BadgeCtx.Provider value={"ctx-" + label}>
      <InnerLabel label={label} />
    </BadgeCtx.Provider>
  );
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, "src", "layout.tsx"),
    `import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Deploy CI Fixture</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, "src", "not_found.tsx"),
    `export default function NotFoundPage() {
  return <main data-not-found="custom-404">Custom 404 Not Found</main>;
}
`,
    "utf8"
  );

  if (dynamicOnly) {
    fs.writeFileSync(
      path.join(dir, "src", "page_functions.ts"),
      `export const revalidate = 0;\n`,
      "utf8"
    );
  }

  fs.writeFileSync(
    path.join(dir, "src", "page.tsx"),
    `import { ClientBadge } from "@/client-badge";

export default function HomePage() {
  return (
    <main data-route="home" data-build-tool={process.env.DINOU_BUILD_TOOL}>
      <h1>Static Home</h1>
      <ClientBadge label="hydrated-ok" />
    </main>
  );
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, "src", "dynamic", "page_functions.ts"),
    `export const revalidate = 0;\n`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, "src", "dynamic", "page.tsx"),
    `import { getContext } from "dinou/server";
import { ClientBadge } from "@/client-badge";

export default function DynamicPage() {
  const { req, env } = getContext();
  const user = String(req.query.user || "anon");
  const netlifyFlag = String(env.NETLIFY_REGION || "none");
  const secret = String(env.SERVER_SECRET_TOKEN || "missing");
  return (
    <main
      data-route="dynamic"
      data-user={user}
      data-region={netlifyFlag}
      data-secret={secret}
    >
      <ClientBadge label={user} />
    </main>
  );
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(dir, "src", "posts", "[slug]", "page.tsx"),
    `export default function PostPage({ params }: { params: { slug: string } }) {
  return <article data-post-slug={params.slug}>Post: {params.slug}</article>;
}
`,
    "utf8"
  );

  return dir;
}

function runDinouCli(cwd, args, extraEnv = {}) {
  const nodePathEntries = [
    path.join(cwd, "node_modules"),
    path.join(projectRoot, "node_modules"),
    path.join(dinouRoot, "node_modules"),
  ].filter((p) => fs.existsSync(p));

  const cleanEnv = { ...process.env };
  delete cleanEnv.DINOU_UNVENDORIZED;
  delete cleanEnv.DINOU_WRITE_TO_DISK;
  cleanEnv.NODE_OPTIONS = "";

  const res = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...cleanEnv,
      NODE_PATH: nodePathEntries.join(path.delimiter),
      ...extraEnv,
    },
  });
  assert.equal(
    res.status,
    0,
    `dinou ${args.join(" ")} failed (status ${res.status}):\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
  );
  return res;
}

// Nested under projectRoot/.dinou/ so Esbuild serverFunctionsPlugin & babelReactCompilerPlugin relative .dinou/ guards are tested!
const fixturesParent = path.join(projectRoot, ".dinou", "tmp-deploy-ci-fixtures");
fs.mkdirSync(fixturesParent, { recursive: true });
const tmpBase = fs.mkdtempSync(path.join(fixturesParent, "run-"));

try {
  // =========================================================================
  // 1️⃣ CLI build:netlify* Commands & NodeNext .d.ts Specifier Verification
  // =========================================================================
  console.log(
    "1️⃣ Verifying dinou build:netlify* CLI commands & strict NodeNext .d.ts cross-imports..."
  );
  {
    const helpRes = spawnSync(process.execPath, [cliPath, "--help"], {
      cwd: projectRoot,
      encoding: "utf8",
    });
    assert.equal(helpRes.status, 0, helpRes.stderr);
    for (const cmd of [
      "build:netlify",
      "build:netlify:esbuild",
      "build:netlify:rollup",
      "build:netlify:webpack",
    ]) {
      assert.ok(
        helpRes.stdout.includes(cmd),
        `Expected dinou --help to expose "${cmd}"`
      );
    }

    const indexDtsPath = path.join(dinouRoot, "index.d.ts");
    const serverDtsPath = path.join(dinouRoot, "server.d.ts");
    assert.match(
      fs.readFileSync(indexDtsPath, "utf8"),
      /from\s+["']\.\/server\.js["']/,
      'Expected dinou/index.d.ts to use explicit "./server.js" specifier'
    );
    assert.match(
      fs.readFileSync(serverDtsPath, "utf8"),
      /from\s+["']\.\/index\.js["']/,
      'Expected dinou/server.d.ts to use explicit "./index.js" specifier'
    );

    const dtsProg = ts.createProgram({
      rootNames: [indexDtsPath, serverDtsPath],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: ["node"],
      },
    });
    const dtsDiags = ts
      .getPreEmitDiagnostics(dtsProg)
      .filter(
        (d) =>
          d.file &&
          (path.resolve(d.file.fileName) === path.resolve(indexDtsPath) ||
            path.resolve(d.file.fileName) === path.resolve(serverDtsPath))
      );
    assert.equal(
      dtsDiags.length,
      0,
      `Expected 0 NodeNext diagnostics on dinou/{index,server}.d.ts, got: ${dtsDiags
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
        .join("; ")}`
    );
  }
  console.log("   ✅ Section 1 passed!");

  // =========================================================================
  // 2️⃣ Netlify Functions v2 & .dinou/dist1/server Tri-Bundler AOT Dual-Bundle
  // =========================================================================
  console.log(
    "2️⃣ Verifying Netlify Functions v2 (.dinou/netlify/functions/ssr.mjs) & .dinou/dist1/server/{netlify.js,handler.js} across Esbuild, Rollup & Webpack..."
  );
  const builtNetlifyDirs = {};
  {
    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      const dir = createFixtureApp(tmpBase, `netlify-${bundler}`);
      builtNetlifyDirs[bundler] = dir;
      const cmd =
        bundler === "esbuild" ? "build:netlify" : `build:netlify:${bundler}`;
      runDinouCli(dir, [cmd]);

      const fnFiles = fs
        .readdirSync(path.join(dir, ".dinou/netlify/functions"))
        .sort();
      assert.deepEqual(
        fnFiles,
        ["package.json", "ssr.mjs"],
        `[${bundler}] .dinou/netlify/functions must contain ONLY package.json and ssr.mjs`
      );

      for (const expectedDist1File of ["handler.js", "netlify.js", "package.json"]) {
        assert.equal(
          fs.existsSync(path.join(dir, ".dinou/dist1/server", expectedDist1File)),
          true,
          `[${bundler}] Missing .dinou/dist1/server/${expectedDist1File}`
        );
      }

      // Delete src/ & dinou.config.ts to simulate AWS Lambda /var/task bundle
      fs.rmSync(path.join(dir, "src"), { recursive: true, force: true });
      fs.rmSync(path.join(dir, "dinou.config.ts"), { force: true });

      const beforeDist2Entries = fs
        .readdirSync(path.join(dir, ".dinou/dist2"))
        .sort();

      const runnerScript = path.join(dir, "verify-lambda.mjs");
      fs.writeFileSync(
        runnerScript,
        `import assert from "node:assert/strict";
import netlifySsr, { config } from "./.dinou/netlify/functions/ssr.mjs";
import dist1Netlify, { config as dist1Config } from "./.dinou/dist1/server/netlify.js";
import adapterNetlify, { config as adapterConfig } from "dinou/adapters/netlify";
import dist1Handler from "./.dinou/dist1/server/handler.js";

assert.deepEqual(config, { path: "/*", preferStatic: true });
assert.deepEqual(dist1Config, { path: "/*", preferStatic: true });
assert.deepEqual(adapterConfig, { path: "/*", preferStatic: true });

globalThis.Netlify = {
  env: {
    toObject: () => ({ NETLIFY_REGION: "eu-central-1" }),
  },
};

const waitUntilPromises = [];
const mockContext = {
  waitUntil(p) {
    waitUntilPromises.push(p);
  },
};

const homeRes = await netlifySsr(new Request("https://example.netlify.app/"), mockContext);
assert.equal(homeRes.status, 200);
assert.equal(homeRes.headers.get("x-deploy-plugin"), "active");
const homeHtml = await homeRes.text();
assert.equal(homeHtml.includes('data-route="home"'), true);
assert.equal(homeHtml.includes('data-build-tool="${bundler}"'), true);
assert.equal(homeHtml.includes('data-public-stage="prod-verify"'), true);
assert.equal(homeHtml.includes('data-ctx="ctx-hydrated-ok"'), true);
assert.equal(homeHtml.includes('data-has-action="true"'), true);

const dynRes = await adapterNetlify(
  new Request("https://example.netlify.app/dynamic?user=alice"),
  mockContext
);
assert.equal(dynRes.status, 200);
assert.equal(dynRes.headers.get("x-deploy-plugin"), "active");
const dynHtml = await dynRes.text();
assert.equal(dynHtml.includes('data-route="dynamic"'), true);
assert.equal(dynHtml.includes('data-user="alice"'), true);
assert.equal(dynHtml.includes('data-ctx="ctx-alice"'), true);
assert.equal(dynHtml.includes('data-region="eu-central-1"'), true);
assert.equal(dynHtml.includes('data-secret="top-secret-42"'), true);

const dist1NetlifyRes = await dist1Netlify(
  new Request("https://example.netlify.app/dynamic?user=legacy-entry"),
  mockContext
);
assert.equal(dist1NetlifyRes.status, 200);
assert.equal((await dist1NetlifyRes.text()).includes('data-user="legacy-entry"'), true);

const isgRes = await netlifySsr(
  new Request("https://example.netlify.app/posts/serverless-post"),
  mockContext
);
assert.equal(isgRes.status, 200);
assert.equal((await isgRes.text()).includes('data-post-slug="serverless-post"'), true);

const sfRes = await netlifySsr(
  new Request("https://example.netlify.app/____server_function____", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-server-function-call": "1",
      origin: "https://example.netlify.app",
      host: "example.netlify.app",
    },
    body: JSON.stringify({
      id: "file:///src/actions.ts#echoAction",
      args: ["hello netlify"],
    }),
  }),
  mockContext
);
assert.equal(sfRes.status, 200);
const sfBody = await sfRes.text();
assert.equal(sfBody.includes("HELLO NETLIFY"), true);
assert.equal(sfBody.includes('"hasSecret":true'), true);

const nfRes = await netlifySsr(
  new Request("https://example.netlify.app/missing-route"),
  mockContext
);
assert.equal(nfRes.status, 404);
assert.equal((await nfRes.text()).includes('data-not-found="custom-404"'), true);

const hRes = await dist1Handler(new Request("https://example.com/dynamic?user=bob"));
assert.equal(hRes.status, 200);
const hHtml = await hRes.text();
assert.equal(hHtml.includes('data-user="bob"'), true);
assert.equal(hHtml.includes('data-ctx="ctx-bob"'), true);

await Promise.all(waitUntilPromises);
console.log("LAMBDA_OK_${bundler}");
`,
        "utf8"
      );

      const lambdaRun = spawnSync(process.execPath, [runnerScript], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "" },
      });
      assert.equal(
        lambdaRun.status,
        0,
        `[${bundler}] Plain Node Lambda verification failed:\nSTDOUT:\n${lambdaRun.stdout}\nSTDERR:\n${lambdaRun.stderr}`
      );
      assert.ok(lambdaRun.stdout.includes(`LAMBDA_OK_${bundler}`));

      const afterDist2Entries = fs
        .readdirSync(path.join(dir, ".dinou/dist2"))
        .sort();
      assert.deepEqual(
        afterDist2Entries,
        beforeDist2Entries,
        `[${bundler}] Netlify MemoryStorage({ hydrateFromDisk: true }) must never write new files into read-only .dinou/dist2`
      );
    }
  }
  console.log("   ✅ Section 2 passed!");

  // =========================================================================
  // 3️⃣ Multi-Bundle React Dispatcher Isolation Across Coexisting Self-Contained Bundles
  // =========================================================================
  console.log(
    "3️⃣ Verifying Multi-Bundle React Dispatcher Isolation across 4 coexisting self-contained Dual-Bundles (.dinou/node/server.mjs, .dinou/netlify/functions/ssr.mjs, .dinou/dist1/server/{handler,netlify}.js) in one process..."
  );
  {
    const isoDir = createFixtureApp(tmpBase, "multi-bundle-iso");
    runDinouCli(isoDir, ["build:node"]);
    fs.rmSync(path.join(isoDir, "src"), { recursive: true, force: true });
    fs.rmSync(path.join(isoDir, "dinou.config.ts"), { force: true });

    const multiBundleProbe = path.join(isoDir, "multi-bundle-isolation.mjs");
    fs.writeFileSync(
      multiBundleProbe,
      `import assert from "node:assert/strict";
import { fetch as nodeServerFetch } from "./.dinou/node/server.mjs";
import netlifySsr from "./.dinou/netlify/functions/ssr.mjs";
import dist1Handler from "./.dinou/dist1/server/handler.js";
import dist1Netlify from "./.dinou/dist1/server/netlify.js";

const ctx = { waitUntil() {} };
const sequence = [
  ["iso-node-1", () => nodeServerFetch(new Request("http://127.0.0.1:3000/dynamic?user=iso-node-1"))],
  ["iso-netlify-ssr-1", () => netlifySsr(new Request("https://example.netlify.app/dynamic?user=iso-netlify-ssr-1"), ctx)],
  ["iso-dist1-handler-1", () => dist1Handler(new Request("https://example.com/dynamic?user=iso-dist1-handler-1"))],
  ["iso-dist1-netlify-1", () => dist1Netlify(new Request("https://example.netlify.app/dynamic?user=iso-dist1-netlify-1"), ctx)],
  ["iso-netlify-ssr-2", () => netlifySsr(new Request("https://example.netlify.app/dynamic?user=iso-netlify-ssr-2"), ctx)],
  ["iso-node-2", () => nodeServerFetch(new Request("http://127.0.0.1:3000/dynamic?user=iso-node-2"))],
];

for (const [expectedUser, invoke] of sequence) {
  const res = await invoke();
  assert.equal(res.status, 200, \`Bundle call for \${expectedUser} returned \${res.status}\`);
  const html = await res.text();
  assert.equal(
    html.includes(\`data-ctx="ctx-\${expectedUser}"\`),
    true,
    \`Missing useContext output for \${expectedUser} (React dispatcher collision!)\`
  );
  assert.equal(html.includes('data-step="1"'), true);
}
console.log("MULTI_BUNDLE_ISOLATION_OK");
`,
      "utf8"
    );

    const isoRun = spawnSync(process.execPath, [multiBundleProbe], {
      cwd: isoDir,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    assert.equal(
      isoRun.status,
      0,
      `Multi-bundle React isolation failed:\nSTDOUT:\n${isoRun.stdout}\nSTDERR:\n${isoRun.stderr}`
    );
    assert.ok(isoRun.stdout.includes("MULTI_BUNDLE_ISOLATION_OK"));
  }
  console.log("   ✅ Section 3 passed!");

  // =========================================================================
  // 4️⃣ Cloudflare Workers Adapter Delegation & Explicit Storage Preservation
  // =========================================================================
  console.log(
    "4️⃣ Verifying Cloudflare Workers build & dinou/adapters/cloudflare delegation, ASSETS, /__dinou_dist2 404 & explicit storage preservation..."
  );
  {
    const cfDir = createFixtureApp(tmpBase, "cloudflare-verify");
    runDinouCli(cfDir, ["build:cloudflare"]);

    assert.equal(
      fs.existsSync(path.join(cfDir, ".dinou/cloudflare/worker.js")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(cfDir, ".dinou/cloudflare/assets/robots.txt")),
      true
    );
    assert.equal(
      fs.existsSync(
        path.join(cfDir, ".dinou/cloudflare/assets/__dinou_dist2/index.html")
      ),
      true
    );

    fs.rmSync(path.join(cfDir, "src"), { recursive: true, force: true });
    fs.rmSync(path.join(cfDir, "dinou.config.ts"), { force: true });

    const cfTestScript = path.join(cfDir, "verify-cf.mjs");
    fs.writeFileSync(
      cfTestScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import cfAdapter from "dinou/adapters/cloudflare";

const assetsRoot = path.resolve(".dinou/cloudflare/assets");
const mockEnv = {
  SERVER_SECRET_TOKEN: "cf-edge-secret",
  NETLIFY_REGION: "cf-pop-mad",
  ASSETS: {
    async fetch(req) {
      const u = new URL(req.url);
      const rel = u.pathname.replace(/^\\/+/, "");
      const fp = path.join(assetsRoot, rel);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        return new Response(fs.readFileSync(fp), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    },
  },
};
const mockCtx = { waitUntil() {} };

const robotsRes = await cfAdapter.fetch(new Request("https://workers.dev/robots.txt"), mockEnv, mockCtx);
assert.equal(robotsRes.status, 200);
assert.equal((await robotsRes.text()).includes("User-agent: *"), true);

const blockedDist2 = await cfAdapter.fetch(new Request("https://workers.dev/__dinou_dist2/index.html"), mockEnv, mockCtx);
assert.equal(blockedDist2.status, 404);
const blockedCdnCgi = await cfAdapter.fetch(new Request("https://workers.dev/cdn-cgi/rum"), mockEnv, mockCtx);
assert.equal(blockedCdnCgi.status, 404);

const homeRes = await cfAdapter.fetch(new Request("https://workers.dev/"), mockEnv, mockCtx);
assert.equal(homeRes.status, 200);
assert.equal(homeRes.headers.get("x-deploy-plugin"), "active");
assert.equal((await homeRes.text()).includes('data-route="home"'), true);

const dynRes = await cfAdapter.fetch(new Request("https://workers.dev/dynamic?user=edge"), mockEnv, mockCtx);
assert.equal(dynRes.status, 200);
const dynHtml = await dynRes.text();
assert.equal(dynHtml.includes('data-user="edge"'), true);
assert.equal(dynHtml.includes('data-ctx="ctx-edge"'), true);
assert.equal(dynHtml.includes('data-secret="cf-edge-secret"'), true);
console.log("CF_DELEGATION_OK");
`,
      "utf8"
    );

    const cfRun = spawnSync(process.execPath, [cfTestScript], {
      cwd: cfDir,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    assert.equal(
      cfRun.status,
      0,
      `Cloudflare adapter verification failed:\nSTDOUT:\n${cfRun.stdout}\nSTDERR:\n${cfRun.stderr}`
    );
    assert.ok(cfRun.stdout.includes("CF_DELEGATION_OK"));
  }
  console.log("   ✅ Section 4 passed!");

  // =========================================================================
  // 5️⃣ 100%-Dynamic App .dinou/dist2 Guarantee, Node AOT Range & export-static
  // =========================================================================
  console.log(
    "5️⃣ Verifying 100%-dynamic .dinou/dist2 directory guarantee, Node AOT HTTP 206 Range & export-static..."
  );
  {
    const dynDir = createFixtureApp(tmpBase, "dynamic-only", {
      dynamicOnly: true,
    });
    runDinouCli(dynDir, ["build:node"]);
    assert.equal(
      fs.existsSync(path.join(dynDir, ".dinou/dist2")),
      true,
      "Expected .dinou/dist2 directory to exist even when 100% of routes are dynamic"
    );
    assert.equal(
      fs.existsSync(path.join(dynDir, ".dinou/netlify/functions/ssr.mjs")),
      true,
      "Expected build:node to also emit .dinou/netlify/functions/ssr.mjs"
    );

    fs.rmSync(path.join(dynDir, "src"), { recursive: true, force: true });
    const nodeVerifyScript = path.join(dynDir, "verify-node.mjs");
    fs.writeFileSync(
      nodeVerifyScript,
      `import assert from "node:assert/strict";
import { fetch as nodeFetch } from "./.dinou/node/server.mjs";

const dynRes = await nodeFetch(new Request("http://127.0.0.1:3000/dynamic?user=node-aot"));
assert.equal(dynRes.status, 200);
assert.equal(dynRes.headers.get("x-deploy-plugin"), "active");
const dynHtml = await dynRes.text();
assert.equal(dynHtml.includes('data-user="node-aot"'), true);
assert.equal(dynHtml.includes('data-ctx="ctx-node-aot"'), true);

const rangeRes = await nodeFetch(new Request("http://127.0.0.1:3000/robots.txt", {
  headers: { Range: "bytes=0-10" },
}));
assert.equal(rangeRes.status, 206);
assert.equal(await rangeRes.text(), "User-agent:");
console.log("NODE_AOT_DYNAMIC_OK");
`,
      "utf8"
    );
    const nodeRun = spawnSync(process.execPath, [nodeVerifyScript], {
      cwd: dynDir,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    assert.equal(nodeRun.status, 0, nodeRun.stderr);
    assert.ok(nodeRun.stdout.includes("NODE_AOT_DYNAMIC_OK"));

    const staticDir = createFixtureApp(tmpBase, "static-export");
    runDinouCli(staticDir, ["export-static"]);
    assert.equal(fs.existsSync(path.join(staticDir, "out/index.html")), true);
    assert.equal(fs.existsSync(path.join(staticDir, "out/page.rsc")), true);
    assert.equal(fs.existsSync(path.join(staticDir, "out/robots.txt")), true);
    const exportedHtml = fs.readFileSync(
      path.join(staticDir, "out/index.html"),
      "utf8"
    );
    assert.equal(
      exportedHtml.includes("window.__DINOU_STATIC_EXPORT__=true"),
      true
    );
  }
  console.log("   ✅ Section 5 passed!");

  // =========================================================================
  // 6️⃣ Runtime Adapters HOST Propagation, CLI Fail-Fast Exit & Deno.cwd() Fallback
  // =========================================================================
  console.log(
    "6️⃣ Verifying dinou/adapters/{bun,deno,netlify}.js HOST propagation, CLI fail-fast exit(1) vs programmatic 500 fallback & Deno.cwd() readDist2Fallback..."
  );
  {
    const unbuiltDir = path.join(tmpBase, "unbuilt-adapters");
    fs.mkdirSync(unbuiltDir, { recursive: true });
    writePackageShims(unbuiltDir);
    fs.writeFileSync(
      path.join(unbuiltDir, "package.json"),
      JSON.stringify({ name: "unbuilt-adapters", type: "module" }, null, 2),
      "utf8"
    );

    // 6A. Programmatic import in unbuilt directory returns graceful 500 Response & propagates HOST -> hostname
    const progCheckPath = path.join(unbuiltDir, "check-programmatic.mjs");
    fs.writeFileSync(
      progCheckPath,
      `import assert from "node:assert/strict";
import bunDefault, { fetch as bunFetch } from "dinou/adapters/bun";
import denoDefault, { fetch as denoFetch } from "dinou/adapters/deno";
import netlifyDefault, { config as netlifyCfg } from "dinou/adapters/netlify";

assert.equal(bunDefault.hostname, "0.0.0.0");
assert.equal(bunDefault.port, 4321);
assert.equal(denoDefault.hostname, "0.0.0.0");
assert.equal(denoDefault.port, 4321);
assert.deepEqual(netlifyCfg, { path: "/*", preferStatic: true });

const bRes = await bunFetch(new Request("http://localhost:4321/"));
assert.equal(bRes.status, 500);
assert.match(await bRes.text(), /build:bun/);

const dRes = await denoFetch(new Request("http://localhost:4321/"));
assert.equal(dRes.status, 500);
assert.match(await dRes.text(), /build:deno/);

const nRes = await netlifyDefault(new Request("http://localhost:4321/"), {});
assert.equal(nRes.status, 500);
assert.match(await nRes.text(), /build:netlify/);

console.log("PROGRAMMATIC_ADAPTERS_OK");
`,
      "utf8"
    );

    const progRun = spawnSync(process.execPath, [progCheckPath], {
      cwd: unbuiltDir,
      encoding: "utf8",
      env: { ...process.env, HOST: "0.0.0.0", PORT: "4321", NODE_OPTIONS: "" },
    });
    assert.equal(
      progRun.status,
      0,
      `Programmatic adapter fallback failed:\nSTDOUT:\n${progRun.stdout}\nSTDERR:\n${progRun.stderr}`
    );
    assert.ok(progRun.stdout.includes("PROGRAMMATIC_ADAPTERS_OK"));

    // 6B. Direct CLI execution (import.meta.main === true) in unbuilt directory MUST fail fast with non-zero exit status!
    const bunAdapterPath = path.join(dinouRoot, "adapters/bun.js");
    const denoAdapterPath = path.join(dinouRoot, "adapters/deno.js");

    const nodeFailFastBun = spawnSync(process.execPath, [bunAdapterPath], {
      cwd: unbuiltDir,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    assert.notEqual(
      nodeFailFastBun.status,
      0,
      "Expected direct execution of adapters/bun.js without .dinou/bun/server.js to exit non-zero"
    );

    const nodeFailFastDeno = spawnSync(process.execPath, [denoAdapterPath], {
      cwd: unbuiltDir,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    assert.notEqual(
      nodeFailFastDeno.status,
      0,
      "Expected direct execution of adapters/deno.js without .dinou/deno/main.js to exit non-zero"
    );

    if (hasRuntimeBinary("bun")) {
      const bunCliFail = spawnSync("bun", ["run", bunAdapterPath], {
        cwd: unbuiltDir,
        encoding: "utf8",
      });
      assert.notEqual(
        bunCliFail.status,
        0,
        "Expected `bun run dinou/adapters/bun.js` without prior build to exit non-zero"
      );
    }

    if (hasRuntimeBinary("deno")) {
      const denoCliFail = spawnSync("deno", ["run", "-A", denoAdapterPath], {
        cwd: unbuiltDir,
        encoding: "utf8",
      });
      assert.notEqual(
        denoCliFail.status,
        0,
        "Expected `deno run -A dinou/adapters/deno.js` without prior build to exit non-zero"
      );
    }

    // 6C. Verify Deno.cwd() fallback in storage-adapter.js readDist2Fallback
    const storageAdapterSrc = fs.readFileSync(
      path.join(dinouRoot, "core/storage-adapter.js"),
      "utf8"
    );
    assert.match(
      storageAdapterSrc,
      /typeof\s+Deno\s*!==\s*["']undefined["']\s*&&\s*typeof\s+Deno\.cwd\s*===\s*["']function["']\s*\?\s*Deno\.cwd\(\)/,
      "Expected readDist2Fallback in dinou/core/storage-adapter.js to fall back to Deno.cwd()"
    );
  }
  console.log("   ✅ Section 6 passed!");
} finally {
  removeDirSafe(tmpBase);
  try {
    if (
      fs.existsSync(fixturesParent) &&
      fs.readdirSync(fixturesParent).length === 0
    ) {
      fs.rmdirSync(fixturesParent);
    }
  } catch {}
}

for (const [rel, beforeContent] of manifestSnapshotBefore.entries()) {
  const abs = path.join(projectRoot, rel);
  const afterContent = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  assert.equal(
    afterContent,
    beforeContent,
    `verify-deployment-ci.mjs must not mutate host workspace ${rel}`
  );
}

console.log(
  "\n🎉 All 6 Dinou v9.4.0 Deployment Targets, Netlify Functions v2 Dual-Bundle & Multi-Runtime Adapter verification suites PASSED!"
);
