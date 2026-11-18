import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDinouRoot() {
  const candidates = [
    path.resolve(__dirname, "../../dinou"),
    path.resolve(process.cwd(), "dinou"),
    path.resolve(process.cwd(), "node_modules/dinou/dinou"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "cli.js"))) {
      return c;
    }
  }
  throw new Error("Unable to locate dinou/cli.js for deployment-adapters.test.mjs");
}

const dinouRoot = resolveDinouRoot();
const cliPath = path.join(dinouRoot, "cli.js");
const repoRoot = path.resolve(dinouRoot, "..");

function createTmpBase() {
  const inRepoParent = path.join(repoRoot, ".dinou");
  try {
    fs.mkdirSync(inRepoParent, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoParent, "tmp-deploy-test-"));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), "dinou-deploy-test-"));
  }
}

const tmpBase = createTmpBase();

test.after(() => {
  try {
    fs.rmSync(tmpBase, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  } catch {}
});

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
    )
  );

  fs.writeFileSync(
    path.join(nmDinou, "index.js"),
    `export * from ${JSON.stringify(relToDinou("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "server.js"),
    `export * from ${JSON.stringify(relToDinou("server.js"))};\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "config.js"),
    `export * from ${JSON.stringify(relToDinou("core/config.js"))};\nexport { default } from ${JSON.stringify(relToDinou("core/config.js"))};\n`
  );

  for (const adp of ["node", "bun", "deno", "cloudflare", "netlify"]) {
    const rel = relToDinou(`adapters/${adp}.js`, path.join(nmDinou, "adapters"));
    fs.writeFileSync(
      path.join(nmDinou, `adapters/${adp}.js`),
      `export * from ${JSON.stringify(rel)};\nexport { default } from ${JSON.stringify(rel)};\n`
    );
  }
}

function createFixtureApp(name, { dynamicOnly = false } = {}) {
  const dir = path.join(tmpBase, name);
  fs.mkdirSync(path.join(dir, "src", "dynamic"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "posts", "[slug]"), { recursive: true });
  fs.mkdirSync(path.join(dir, "public"), { recursive: true });

  writePackageShims(dir);

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: `fixture-${name}`,
        private: true,
        type: "module",
      },
      null,
      2
    )
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
          paths: {
            "@/*": ["./src/*"],
          },
        },
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dir, ".env.production"),
    "DINOU_PUBLIC_APP_STAGE=prod-verify\nSERVER_SECRET_TOKEN=top-secret-42\n"
  );

  fs.writeFileSync(
    path.join(dir, "public", "robots.txt"),
    "User-agent: *\nAllow: /\n"
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
`
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
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "client-badge.tsx"),
    `"use client";
import { echoAction } from "@/actions";

export function ClientBadge({ label }: { label: string }) {
  return (
    <span
      data-client-badge={label}
      data-public-stage={process.env.DINOU_PUBLIC_APP_STAGE}
      data-has-action={String(typeof echoAction === "function")}
    >
      {label}
    </span>
  );
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "layout.tsx"),
    `import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Deploy Fixture</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "not_found.tsx"),
    `export default function NotFoundPage() {
  return <main data-not-found="custom-404">Custom 404 Not Found</main>;
}
`
  );

  if (dynamicOnly) {
    fs.writeFileSync(
      path.join(dir, "src", "page_functions.ts"),
      `export const revalidate = 0;\n`
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
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "dynamic", "page_functions.ts"),
    `export const revalidate = 0;\n`
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
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "posts", "[slug]", "page.tsx"),
    `export default function PostPage({ params }: { params: { slug: string } }) {
  return <article data-post-slug={params.slug}>Post: {params.slug}</article>;
}
`
  );

  return dir;
}

function runDinouCli(cwd, args, extraEnv = {}) {
  const nodePathEntries = [
    path.join(cwd, "node_modules"),
    path.join(repoRoot, "node_modules"),
    path.join(dinouRoot, "node_modules"),
  ].filter((p) => fs.existsSync(p));

  const res = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
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

test("Netlify Functions v2 & .dinou/dist1/server AOT Dual-Bundle work in plain Node without src/ or --conditions=react-server across Esbuild, Rollup, and Webpack", async () => {
  for (const bundler of ["esbuild", "rollup", "webpack"]) {
    const dir = createFixtureApp(`netlify-${bundler}`);
    const cmd =
      bundler === "esbuild" ? "build:netlify" : `build:netlify:${bundler}`;
    runDinouCli(dir, [cmd]);

    const fnFiles = fs
      .readdirSync(path.join(dir, ".dinou/netlify/functions"))
      .sort();
    assert.deepEqual(fnFiles, ["package.json", "ssr.mjs"]);

    assert.equal(
      fs.existsSync(path.join(dir, ".dinou/dist1/server/handler.js")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(dir, ".dinou/dist1/server/netlify.js")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(dir, ".dinou/dist1/server/package.json")),
      true
    );

    // Delete src/ and dinou.config.ts to simulate AWS Lambda deployed bundle
    fs.rmSync(path.join(dir, "src"), { recursive: true, force: true });
    fs.rmSync(path.join(dir, "dinou.config.ts"), { force: true });

    const beforeDist2Entries = fs.readdirSync(path.join(dir, ".dinou/dist2"));

    const runnerScript = path.join(dir, "verify-lambda.mjs");
    fs.writeFileSync(
      runnerScript,
      `import assert from "node:assert/strict";
import netlifySsr, { config } from "./.dinou/netlify/functions/ssr.mjs";
import adapterNetlify, { config as adapterConfig } from "dinou/adapters/netlify";
import dist1Handler from "./.dinou/dist1/server/handler.js";

assert.deepEqual(config, { path: "/*", preferStatic: true });
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

const dynRes = await adapterNetlify(
  new Request("https://example.netlify.app/dynamic?user=alice"),
  mockContext
);
assert.equal(dynRes.status, 200);
assert.equal(dynRes.headers.get("x-deploy-plugin"), "active");
const dynHtml = await dynRes.text();
assert.equal(dynHtml.includes('data-route="dynamic"'), true);
assert.equal(dynHtml.includes('data-user="alice"'), true);
assert.equal(dynHtml.includes('data-region="eu-central-1"'), true);
assert.equal(dynHtml.includes('data-secret="top-secret-42"'), true);

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
assert.equal((await hRes.text()).includes('data-user="bob"'), true);

await Promise.all(waitUntilPromises);
console.log("LAMBDA_OK_${bundler}");
`
    );

    const lambdaRun = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    assert.equal(
      lambdaRun.status,
      0,
      `Plain Node Lambda test failed for ${bundler}:\nSTDOUT:\n${lambdaRun.stdout}\nSTDERR:\n${lambdaRun.stderr}`
    );
    assert.equal(lambdaRun.stdout.includes(`LAMBDA_OK_${bundler}`), true);

    const afterDist2Entries = fs.readdirSync(path.join(dir, ".dinou/dist2"));
    assert.deepEqual(afterDist2Entries, beforeDist2Entries);
  }
});

test("Cloudflare Workers build & dinou/adapters/cloudflare delegate cleanly with ASSETS & reserved namespace isolation", async () => {
  const dir = createFixtureApp("cloudflare-verify");
  runDinouCli(dir, ["build:cloudflare"]);

  assert.equal(
    fs.existsSync(path.join(dir, ".dinou/cloudflare/worker.js")),
    true
  );
  assert.equal(
    fs.existsSync(path.join(dir, ".dinou/cloudflare/assets/robots.txt")),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(dir, ".dinou/cloudflare/assets/__dinou_dist2/index.html")
    ),
    true
  );

  fs.rmSync(path.join(dir, "src"), { recursive: true, force: true });

  const cfTestScript = path.join(dir, "verify-cf.mjs");
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

const blockedRes = await cfAdapter.fetch(new Request("https://workers.dev/__dinou_dist2/index.html"), mockEnv, mockCtx);
assert.equal(blockedRes.status, 404);

const homeRes = await cfAdapter.fetch(new Request("https://workers.dev/"), mockEnv, mockCtx);
assert.equal(homeRes.status, 200);
assert.equal(homeRes.headers.get("x-deploy-plugin"), "active");
assert.equal((await homeRes.text()).includes('data-route="home"'), true);

const dynRes = await cfAdapter.fetch(new Request("https://workers.dev/dynamic?user=edge"), mockEnv, mockCtx);
assert.equal(dynRes.status, 200);
const dynHtml = await dynRes.text();
assert.equal(dynHtml.includes('data-user="edge"'), true);
assert.equal(dynHtml.includes('data-secret="cf-edge-secret"'), true);
console.log("CF_OK");
`
  );

  const cfRun = spawnSync(process.execPath, [cfTestScript], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  assert.equal(
    cfRun.status,
    0,
    `Cloudflare adapter test failed:\nSTDOUT:\n${cfRun.stdout}\nSTDERR:\n${cfRun.stderr}`
  );
  assert.equal(cfRun.stdout.includes("CF_OK"), true);
});

test("Node AOT orchestrator, Dynamic-only .dinou/dist2 guarantee, and export-static work end-to-end", async () => {
  const dynDir = createFixtureApp("dynamic-only", { dynamicOnly: true });
  runDinouCli(dynDir, ["build:node"]);
  assert.equal(fs.existsSync(path.join(dynDir, ".dinou/dist2")), true);

  fs.rmSync(path.join(dynDir, "src"), { recursive: true, force: true });
  const nodeVerifyScript = path.join(dynDir, "verify-node.mjs");
  fs.writeFileSync(
    nodeVerifyScript,
    `import assert from "node:assert/strict";
import { fetch as nodeFetch } from "./.dinou/node/server.mjs";

const dynRes = await nodeFetch(new Request("http://127.0.0.1:3000/dynamic?user=node-aot"));
assert.equal(dynRes.status, 200);
assert.equal(dynRes.headers.get("x-deploy-plugin"), "active");
assert.equal((await dynRes.text()).includes('data-user="node-aot"'), true);

const rangeRes = await nodeFetch(new Request("http://127.0.0.1:3000/robots.txt", {
  headers: { Range: "bytes=0-10" },
}));
assert.equal(rangeRes.status, 206);
assert.equal(await rangeRes.text(), "User-agent:");
console.log("NODE_AOT_OK");
`
  );
  const nodeRun = spawnSync(process.execPath, [nodeVerifyScript], {
    cwd: dynDir,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  assert.equal(nodeRun.status, 0, nodeRun.stderr);
  assert.equal(nodeRun.stdout.includes("NODE_AOT_OK"), true);

  const staticDir = createFixtureApp("static-export");
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
});

