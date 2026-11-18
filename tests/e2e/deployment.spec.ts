import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

function resolveDinouRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "dinou"),
    path.resolve(process.cwd(), "node_modules/dinou/dinou"),
    path.resolve(process.cwd(), "node_modules/dinou"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "cli.js"))) {
      return c;
    }
  }
  throw new Error("Could not locate dinou/cli.js");
}

const dinouRoot = resolveDinouRoot();
const cliPath = path.join(dinouRoot, "cli.js");
const repoRoot = path.resolve(dinouRoot, "..");

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function createTmpDir(): string {
  const inRepoParent = path.join(repoRoot, ".dinou");
  try {
    fs.mkdirSync(inRepoParent, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoParent, "tmp-e2e-deploy-"));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), "dinou-e2e-deploy-"));
  }
}

function createDeploymentE2EApp(baseDir: string): string {
  const appDir = path.join(baseDir, "deploy-e2e-app");
  fs.mkdirSync(path.join(appDir, "src", "dynamic"), { recursive: true });
  fs.mkdirSync(path.join(appDir, "public"), { recursive: true });

  const nmDinou = path.join(appDir, "node_modules", "dinou");
  fs.mkdirSync(path.join(nmDinou, "adapters"), { recursive: true });

  const relToDinou = (subpath: string, fromDir = nmDinou): string => {
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
  fs.writeFileSync(
    path.join(nmDinou, "adapters/netlify.js"),
    `export * from ${JSON.stringify(relToDinou("adapters/netlify.js", path.join(nmDinou, "adapters")))};\nexport { default } from ${JSON.stringify(relToDinou("adapters/netlify.js", path.join(nmDinou, "adapters")))};\n`
  );

  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(
      { name: "deploy-e2e-app", private: true, type: "module" },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(appDir, "tsconfig.json"),
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
    )
  );

  fs.writeFileSync(
    path.join(appDir, ".env.production"),
    "DINOU_PUBLIC_DEPLOY_BADGE=netlify-v2-ready\nSECRET_API_KEY=live-secret-99\n"
  );

  fs.writeFileSync(
    path.join(appDir, "src", "actions.ts"),
    `"use server";
import { getContext } from "dinou/server";

export async function pingServerAction(name: string) {
  const { env } = getContext();
  return \`Pong \${name} (\${env.SECRET_API_KEY})\`;
}
`
  );

  fs.writeFileSync(
    path.join(appDir, "src", "interactive-ping.tsx"),
    `"use client";
import { useState } from "react";
import { pingServerAction } from "@/actions";

export function InteractivePing() {
  const [reply, setReply] = useState("idle");
  return (
    <div>
      <span data-testid="public-badge">{process.env.DINOU_PUBLIC_DEPLOY_BADGE}</span>
      <button
        data-testid="ping-btn"
        onClick={async () => {
          const res = await pingServerAction("Edge");
          setReply(res);
        }}
      >
        Ping Server
      </button>
      <p data-testid="ping-reply">{reply}</p>
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(appDir, "src", "layout.tsx"),
    `import type { ReactNode } from "react";
import { Link } from "dinou";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Deploy E2E</title>
      </head>
      <body>
        <nav>
          <Link href="/" data-testid="nav-home">Home</Link>
          <Link href="/dynamic?visitor=playwright" data-testid="nav-dynamic">Dynamic</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(appDir, "src", "page.tsx"),
    `import { InteractivePing } from "@/interactive-ping";

export default function HomePage() {
  return (
    <main>
      <h1 data-testid="home-heading">Pre-Rendered Static Home</h1>
      <InteractivePing />
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(appDir, "src", "dynamic", "page_functions.ts"),
    `export const revalidate = 0;\n`
  );

  fs.writeFileSync(
    path.join(appDir, "src", "dynamic", "page.tsx"),
    `import { getContext } from "dinou/server";

export default function DynamicPage() {
  const { req, env } = getContext();
  return (
    <main>
      <h1 data-testid="dyn-heading">Visitor: {String(req.query.visitor || "guest")}</h1>
      <p data-testid="dyn-region">Region: {String(env.NETLIFY_REGION || "local")}</p>
    </main>
  );
}
`
  );

  return appDir;
}

test.describe("Deployment Targets E2E (Netlify Functions v2 Simulator & Static Export)", () => {
  let tmpDir: string;
  let appDir: string;
  let serverProcess: ChildProcess | null = null;

  test.beforeAll(() => {
    tmpDir = createTmpDir();
    appDir = createDeploymentE2EApp(tmpDir);
    const buildRes = spawnSync(process.execPath, [cliPath, "build:netlify"], {
      cwd: appDir,
      encoding: "utf8",
    });
    expect(buildRes.status).toBe(0);

    // Delete src/ to simulate serverless deployment with only .dinou/netlify/functions + .dinou/dist2 + .dinou/dist3
    fs.rmSync(path.join(appDir, "src"), { recursive: true, force: true });
  });

  test.afterEach(() => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess = null;
    }
  });

  test.afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 50,
        });
      } catch {}
    }
  });

  test("Netlify Functions v2 ssr.mjs + static CDN simulator hydrates React 19, executes Server Functions, and SPA-navigates to dynamic SSR", async ({
    page,
  }) => {
    const port = await getFreePort();
    const simPath = path.join(appDir, "netlify-cdn-sim.mjs");
    const staticAssetsUrl = pathToFileURL(
      path.join(dinouRoot, "core/static-assets.js")
    ).href;

    fs.writeFileSync(
      simPath,
      `import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import netlifyHandler, { config } from "./.dinou/netlify/functions/ssr.mjs";
import { getStaticContentType, resolveConfinedStaticFile, normalizePublicRequestPath } from ${JSON.stringify(staticAssetsUrl)};

globalThis.Netlify = {
  env: {
    toObject: () => ({ NETLIFY_REGION: "us-east-1" }),
  },
};

const dist3Dir = path.resolve(".dinou/dist3");
const port = Number(process.env.PORT);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", \`http://127.0.0.1:\${port}\`);

  // Simulate Netlify preferStatic: true CDN static asset serving from .dinou/dist3
  if (config.preferStatic && (req.method === "GET" || req.method === "HEAD")) {
    const clean = normalizePublicRequestPath(url.pathname);
    if (clean) {
      const fp = resolveConfinedStaticFile(dist3Dir, clean);
      if (fp && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        res.statusCode = 200;
        res.setHeader("content-type", getStaticContentType(clean));
        res.end(fs.readFileSync(fp));
        return;
      }
    }
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((item) => headers.append(k, item));
    else if (v !== undefined) headers.set(k, v);
  }
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await new Promise((resolve) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
        });

  const webReq = new Request(url.href, { method: req.method, headers, body });
  const webRes = await netlifyHandler(webReq, { waitUntil() {} });

  res.statusCode = webRes.status;
  webRes.headers.forEach((v, k) => res.setHeader(k, v));
  if (webRes.body) {
    Readable.fromWeb(webRes.body).pipe(res);
  } else {
    res.end();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(\`NETLIFY_SIM_READY:\${port}\`);
});
`
    );

    serverProcess = spawn(process.execPath, [simPath], {
      cwd: appDir,
      env: { ...process.env, PORT: String(port), NODE_OPTIONS: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out starting Netlify simulator")),
        10000
      );
      serverProcess!.stdout!.on("data", (chunk) => {
        if (String(chunk).includes(`NETLIFY_SIM_READY:${port}`)) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.getByTestId("home-heading")).toHaveText(
      "Pre-Rendered Static Home"
    );
    await expect(page.getByTestId("public-badge")).toHaveText(
      "netlify-v2-ready"
    );

    // Invoke Server Function on simulated Netlify Function v2
    await page.getByTestId("ping-btn").click();
    await expect(page.getByTestId("ping-reply")).toHaveText(
      "Pong Edge (live-secret-99)"
    );

    // Soft SPA navigation via <Link> to dynamic SSR route
    await page.getByTestId("nav-dynamic").click();
    await expect(page.getByTestId("dyn-heading")).toHaveText(
      "Visitor: playwright"
    );
    await expect(page.getByTestId("dyn-region")).toHaveText("Region: us-east-1");
  });
});

