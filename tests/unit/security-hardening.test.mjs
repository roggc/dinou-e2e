// tests/unit/security-hardening.test.mjs
// Series Z — Phase 1 — Stage 2 (Check #Z2):
// HTTP Security & Hardening Contract Suite (NODE_ENV=production):
//   1. Server Function CSRF Origin/Host validation, X-Forwarded-Host spoofing,
//      Sec-Fetch-Site: cross-site, and JSON/multipart Body Size DoS caps (413)
//   2. Production error sanitization across Server Functions, SSR (with & without error.tsx),
//      @slot/error.tsx, RSC soft-nav, PPR dynamic holes, <DinouCacheSlot>, and fallback HTML titles
//   3. Open Redirect & XSS-via-Redirect prevention across handler.js, server-function-proxy(.js / -webpack.js),
//      client-redirect.jsx, client(.jsx / -webpack.jsx), and ppr-runtime.js
//   4. Path traversal, real symlink escape confinement, FileSystemStorage._resolve confinement,
//      Server Function ID spoofing, /____rsc_slot____ & /____rsc_payload_error____ traversal,
//      /.well-known/security.txt, and RFC 9110 Range (206 / 416)

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

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

/**
 * Builds a compact production Node Dual-Bundle mini-app covering all #Z2 security surfaces
 * and runs a verification probe inside a clean production child process (`NODE_ENV=production`).
 */
function runInCompiledSecurityApp(probeScriptBody, options = {}) {
  const tmpApp = createFixtureDir("tmp-z2-sec-");
  const outsideSecretDir = createFixtureDir("tmp-z2-outside-");
  const outsideSecretFile = path.join(outsideSecretDir, "secret-outside.txt");
  fs.writeFileSync(outsideSecretFile, "TOP_SECRET_OUTSIDE_DIST3_CANARY", "utf8");

  try {
    fs.mkdirSync(path.join(tmpApp, "src/actions"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/_private"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/crash-no-boundary"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/crash-with-boundary"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/crash-slot-boundary/@sidebar"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/ppr-crash"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/cache-slot-crash"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/redir-test"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "public/.well-known"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "public"), { recursive: true });

    writeDinouShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "z2-security-app", type: "module" }, null, 2)
    );

    if (options.dinouConfigCode) {
      fs.writeFileSync(
        path.join(tmpApp, "dinou.config.mjs"),
        options.dinouConfigCode,
        "utf8"
      );
    }

    // Public assets for static confinement & Range tests
    fs.writeFileSync(
      path.join(tmpApp, "public/.well-known/security.txt"),
      "Contact: mailto:security@dinou.example\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "public/range-sample.txt"),
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "utf8"
    );
    fs.writeFileSync(path.join(tmpApp, ".env"), "DB_SECRET=ENV_SECRET_CANARY\n", "utf8");

    // Root layout
    fs.writeFileSync(
      path.join(tmpApp, "src/layout.tsx"),
      `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Z2 Security App</title></head>
      <body>{children}</body>
    </html>
  );
}
`
    );

    // Client trigger referencing sec-actions so bundler registers all exports in server-functions-manifest.json
    fs.writeFileSync(
      path.join(tmpApp, "src/SecActionsClient.tsx"),
      `"use client";
import {
  pingOk,
  uploadCheck,
  throwSecretError,
  throwIntentionalDigest,
  redirectTo,
} from "./actions/sec-actions";

export function SecActionsClient() {
  void pingOk;
  void uploadCheck;
  void throwSecretError;
  void throwIntentionalDigest;
  void redirectTo;
  return <div data-testid="z2-actions-wired">wired</div>;
}
`
    );

    // Home page
    fs.writeFileSync(
      path.join(tmpApp, "src/page.tsx"),
      `import { SecActionsClient } from "./SecActionsClient";
export default function HomePage() {
  return (
    <main data-testid="z2-home">
      Z2 Security Home
      <SecActionsClient />
    </main>
  );
}
`
    );

    // Escaped private module (never allowed via Server Functions)
    fs.writeFileSync(
      path.join(tmpApp, "src/_private/secret.ts"),
      `export async function leak() { return "PRIVATE_DIR_LEAK"; }\n`
    );

    // Unregistered non-action module under src/
    fs.writeFileSync(
      path.join(tmpApp, "src/unregistered.ts"),
      `export async function leak() { return "UNREGISTERED_MODULE_LEAK"; }\n`
    );

    // Server Actions
    fs.writeFileSync(
      path.join(tmpApp, "src/actions/sec-actions.ts"),
      `"use server";
import { getContext } from "dinou";

export async function pingOk(msg: string) {
  return "PONG:" + String(msg || "");
}

export async function uploadCheck(formData: FormData) {
  const note = String(formData.get("note") || "");
  return "UPLOAD_OK:" + note.length;
}

export async function throwSecretError() {
  throw new Error("SECRET_DB_PASSWORD_LEAK: postgres://admin:p4ss@10.0.0.5/prod");
}

export async function throwIntentionalDigest() {
  const err = new Error("Validation failed: title required") as Error & { digest?: string };
  err.digest = "Z2_VALIDATION_ERR";
  throw err;
}

export async function redirectTo(target: string) {
  const { res } = getContext();
  res.redirect(target);
}
`
    );

    // Route (b): SSR page throwing uncaught error WITHOUT error.tsx
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-no-boundary/page_functions.ts"),
      `export const dynamic = true;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-no-boundary/page.tsx"),
      `export default function CrashNoBoundary() {
  throw new Error("SECRET_DB_PASSWORD_LEAK_NO_BOUNDARY");
}
`
    );

    // Route (c): SSR page throwing uncaught error WITH error.tsx (supports ?with_digest=1)
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-with-boundary/page_functions.ts"),
      `export const dynamic = true;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-with-boundary/page.tsx"),
      `import { getContext } from "dinou";
export default function CrashWithBoundary() {
  const { req } = getContext();
  const err = new Error("SECRET_DB_PASSWORD_LEAK_WITH_BOUNDARY") as Error & { digest?: string };
  if (req.query?.with_digest === "1") {
    err.digest = "DIGEST_Z2_BOUNDARY_OK";
  }
  throw err;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-with-boundary/error.tsx"),
      `export default function BoundaryError({ error }: { error: { message?: string; digest?: string; stack?: string } }) {
  return (
    <section data-testid="z2-error-boundary">
      <p data-testid="z2-err-msg">{error?.message || "no-msg"}</p>
      <p data-testid="z2-err-digest">{error?.digest || "no-digest"}</p>
      <p data-testid="z2-err-stack">{error?.stack || "no-stack"}</p>
    </section>
  );
}
`
    );

    // Route (c2): Parallel @sidebar slot throwing with @sidebar/error.tsx
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-slot-boundary/layout_functions.ts"),
      `export const dynamic = true;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-slot-boundary/layout.tsx"),
      `import type { ReactNode } from "react";
export default function SlotBoundaryLayout({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  return <div data-testid="z2-slot-layout">{sidebar}{children}</div>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-slot-boundary/@sidebar/page.tsx"),
      `export default function BrokenSidebar() {
  throw new Error("SECRET_PARALLEL_SLOT_LEAK");
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-slot-boundary/@sidebar/error.tsx"),
      `export default function SidebarError({ error }: { error: { message?: string; digest?: string; stack?: string } }) {
  return <aside data-testid="z2-sidebar-err">{error?.message}|{error?.stack || "no-stack"}</aside>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-slot-boundary/page_functions.ts"),
      `export const dynamic = true;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/crash-slot-boundary/page.tsx"),
      `export default function SlotBoundaryPage() {
  throw new Error("SECRET_PAGE_WITH_BROKEN_SIDEBAR");
}
`
    );

    // Route (e): Pure PPR dynamic hole throwing uncaught error
    fs.writeFileSync(
      path.join(tmpApp, "src/ppr-crash/page_functions.ts"),
      `export const ppr = true;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/ppr-crash/page.tsx"),
      `import { Suspense } from "react";
import { getContext } from "dinou";

async function BrokenHole() {
  const { req } = getContext();
  if (req.query?.redir) {
    getContext().res.redirect(String(req.query.redir));
    return null;
  }
  if (req.query?.boom === "1") {
    throw new Error("SECRET_DB_PASSWORD_LEAK_PPR_HOLE");
  }
  return <span data-testid="ppr-ok">PPR_OK</span>;
}

export default function PprCrashPage() {
  return (
    <main>
      <h1>PPR Shell</h1>
      <Suspense fallback={<span>Loading hole...</span>}>
        <BrokenHole />
      </Suspense>
    </main>
  );
}
`
    );

    // Route (f): <DinouCacheSlot> throwing uncaught error on fresh refresh
    fs.writeFileSync(
      path.join(tmpApp, "src/cache-slot-crash/page_functions.ts"),
      `export const dynamic = true;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/cache-slot-crash/page.tsx"),
      `import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";

async function FragileSlotContent() {
  const { req } = getContext();
  if (req.query?.boom === "1" || req.headers["x-z2-boom"] === "1") {
    throw new Error("SECRET_DB_PASSWORD_LEAK_CACHE_SLOT");
  }
  return <div data-testid="z2-slot-ok">SLOT_OK</div>;
}

export default function CacheSlotCrashPage() {
  return (
    <main>
      <DinouCacheSlot id="z2-fragile-slot" revalidate={60}>
        <FragileSlotContent />
      </DinouCacheSlot>
    </main>
  );
}
`
    );

    // Route for SSR & RSC redirect sanitization checks
    fs.writeFileSync(
      path.join(tmpApp, "src/redir-test/page_functions.ts"),
      `export const dynamic = true;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/redir-test/page.tsx"),
      `import { getContext } from "dinou";

export default function RedirTestPage() {
  const { req, res } = getContext();
  if (req.query?.to) {
    res.redirect(String(req.query.to));
    return null;
  }
  return <main>REDIR_IDLE</main>;
}
`
    );

    // Build production Node Dual-Bundle with esbuild
    const buildRes = spawnSync(process.execPath, [CLI_PATH, "build:node:esbuild"], {
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

    if (buildRes.status !== 0) {
      throw new Error(
        `build:node:esbuild failed (status=${buildRes.status}):\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
      );
    }

    // Create a real symlink inside .dinou/dist3 pointing to outsideSecretFile (to verify symlink confinement)
    const dist3Dir = path.join(tmpApp, ".dinou/dist3");
    const symlinkPath = path.join(dist3Dir, "escape-link.txt");
    let symlinkCreated = false;
    try {
      fs.symlinkSync(outsideSecretFile, symlinkPath, "file");
      symlinkCreated = true;
    } catch {
      // On Windows without Developer Mode / SeCreateSymbolicLinkPrivilege, try directory junction fallback
      try {
        fs.symlinkSync(outsideSecretDir, path.join(dist3Dir, "escape-dir"), "junction");
        symlinkCreated = true;
      } catch {}
    }

    const probeFile = path.join(tmpApp, "__z2_probe.mjs");
    fs.writeFileSync(
      probeFile,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TMP_APP = ${JSON.stringify(tmpApp)};
const OUTSIDE_SECRET_FILE = ${JSON.stringify(outsideSecretFile)};
const SYMLINK_CREATED = ${JSON.stringify(symlinkCreated)};
const DINOU_ROOT = ${JSON.stringify(DINOU_ROOT)};

const serverFile = fs.existsSync(path.join(TMP_APP, ".dinou/node/server.js"))
  ? path.join(TMP_APP, ".dinou/node/server.js")
  : path.join(TMP_APP, ".dinou/node/server.mjs");
const serverMod = await import(pathToFileURL(serverFile).href);
const rscMod = await import(pathToFileURL(path.join(TMP_APP, ".dinou/node/rsc-engine.mjs")).href);

const appFetch = serverMod.fetch;
const handleRequest = rscMod.handleRequest;

${probeScriptBody}
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
      timeout: 60000,
    });

    if (runRes.status !== 0) {
      throw new Error(
        `Probe failed (status=${runRes.status}):\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
      );
    }
  } finally {
    removeDirSafe(tmpApp);
    removeDirSafe(outsideSecretDir);
  }
}

test("1. [#Z2] Server Function CSRF Origin/Host validation, X-Forwarded-Host spoofing, Sec-Fetch-Site: cross-site & Body Size DoS caps (413) in NODE_ENV=production", () => {
  runInCompiledSecurityApp(
    `
    const validPayload = JSON.stringify({
      id: "file:///src/actions/sec-actions.ts#pingOk",
      args: ["hello"],
    });

    // 1A. Substring bypass: Origin https://localhost:3000.evil.com with Host: localhost:3000 -> MUST be 403
    {
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "https://localhost:3000.evil.com",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: validPayload,
        })
      );
      assert.equal(res.status, 403, "Origin suffix bypass (localhost:3000.evil.com) MUST return 403");
      const json = await res.json();
      assert.equal(json.error, "Invalid Origin");
    }

    // 1B. Path substring bypass: Origin https://evil.com/localhost:3000 -> MUST be 403
    {
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "https://evil.com/localhost:3000",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: validPayload,
        })
      );
      assert.equal(res.status, 403, "Origin path substring bypass MUST return 403");
    }

    // 1C. Spoofed X-Forwarded-Host: evil.com + Origin: https://evil.com (without trustProxy) -> MUST be 403
    {
      const res = await handleRequest(
        new Request("https://app.example.com/____server_function____", {
          method: "POST",
          headers: {
            host: "app.example.com",
            "x-forwarded-host": "evil.com",
            origin: "https://evil.com",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: validPayload,
        })
      );
      assert.equal(res.status, 403, "Spoofed X-Forwarded-Host without trustProxy MUST return 403");
    }

    // 1D. Sec-Fetch-Site: cross-site -> MUST be 403 even if Origin is omitted
    {
      const res = await handleRequest(
        new Request("https://app.example.com/____server_function____", {
          method: "POST",
          headers: {
            host: "app.example.com",
            "sec-fetch-site": "cross-site",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: validPayload,
        })
      );
      assert.equal(res.status, 403, "Sec-Fetch-Site: cross-site MUST return 403");
    }

    // 1E. Missing x-server-function-call header -> 403
    {
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          body: validPayload,
        })
      );
      assert.equal(res.status, 403);
    }

    // 1F. Legitimate same-origin request -> 200 OK
    {
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "sec-fetch-site": "same-origin",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: validPayload,
        })
      );
      assert.equal(res.status, 200, "Valid same-origin Server Function call MUST return 200");
      const text = await res.text();
      assert.ok(text.includes("PONG:hello"), "Expected PONG:hello in Flight response, got: " + text);
    }

    // 1G. Oversized JSON payload (configured cap = 1024 bytes) WITH Content-Length -> 413 Payload Too Large
    {
      const hugeJson = JSON.stringify({
        id: "file:///src/actions/sec-actions.ts#pingOk",
        args: ["A".repeat(4096)],
      });
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-server-function-call": "1",
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(hugeJson)),
          },
          body: hugeJson,
        })
      );
      assert.equal(res.status, 413, "Oversized JSON with Content-Length MUST return 413");
    }

    // 1H. Oversized chunked JSON stream WITHOUT Content-Length -> 413 Payload Too Large (no OOM)
    {
      const chunks = [
        new TextEncoder().encode('{"id":"file:///src/actions/sec-actions.ts#pingOk","args":["'),
        new TextEncoder().encode("B".repeat(2048)),
        new TextEncoder().encode('"]}'),
      ];
      const stream = new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
          controller.close();
        },
      });
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          duplex: "half",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: stream,
        })
      );
      assert.equal(res.status, 413, "Oversized chunked JSON stream without Content-Length MUST return 413");
    }

    // 1I. Oversized multipart/form-data payload -> 413 Payload Too Large
    {
      const fd = new FormData();
      fd.append("__dinou_func_id", "file:///src/actions/sec-actions.ts#uploadCheck");
      fd.append("__dinou_formData_index", "0");
      fd.append("note", "C".repeat(4096));
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-server-function-call": "1",
          },
          body: fd,
        })
      );
      assert.equal(res.status, 413, "Oversized multipart FormData MUST return 413");
    }

    // 1J. Small valid multipart/form-data payload under cap -> 200 OK
    {
      const fd = new FormData();
      fd.append("__dinou_func_id", "file:///src/actions/sec-actions.ts#uploadCheck");
      fd.append("__dinou_formData_index", "0");
      fd.append("note", "tiny");
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-server-function-call": "1",
          },
          body: fd,
        })
      );
      assert.equal(res.status, 200, "Valid small multipart FormData MUST return 200");
      const text = await res.text();
      assert.ok(text.includes("UPLOAD_OK:4"), "Expected UPLOAD_OK:4, got: " + text);
    }
    `,
    {
      dinouConfigCode: `export default {
  plugins: [],
  security: {
    maxServerFunctionBodyBytes: 1024,
  },
};\n`,
    }
  );

  // 1K. Opt-in trustProxy: true + allowedOrigins allows legitimate reverse-proxy X-Forwarded-Host & allowlisted origins
  runInCompiledSecurityApp(
    `
    const validPayload = JSON.stringify({
      id: "file:///src/actions/sec-actions.ts#pingOk",
      args: ["proxy-ok"],
    });

    const resForwarded = await handleRequest(
      new Request("http://internal-pod:3000/____server_function____", {
        method: "POST",
        headers: {
          host: "internal-pod:3000",
          "x-forwarded-host": "public.example.com",
          origin: "https://public.example.com",
          "x-server-function-call": "1",
          "content-type": "application/json",
        },
        body: validPayload,
      })
    );
    assert.equal(resForwarded.status, 200, "trustProxy: true must accept matching X-Forwarded-Host Origin");
    assert.ok((await resForwarded.text()).includes("PONG:proxy-ok"));

    const resAllowlisted = await handleRequest(
      new Request("http://internal-pod:3000/____server_function____", {
        method: "POST",
        headers: {
          host: "internal-pod:3000",
          origin: "https://partner.example.com",
          "sec-fetch-site": "cross-site",
          "x-server-function-call": "1",
          "content-type": "application/json",
        },
        body: validPayload,
      })
    );
    assert.equal(resAllowlisted.status, 200, "allowedOrigins must permit explicitly allowlisted origin");

    const resUnlisted = await handleRequest(
      new Request("http://internal-pod:3000/____server_function____", {
        method: "POST",
        headers: {
          host: "internal-pod:3000",
          "x-forwarded-host": "public.example.com",
          origin: "https://public.example.com.evil.com",
          "x-server-function-call": "1",
          "content-type": "application/json",
        },
        body: validPayload,
      })
    );
    assert.equal(resUnlisted.status, 403, "Suffix bypass must STILL be blocked even when trustProxy: true");
    `,
    {
      dinouConfigCode: `export default {
  plugins: [],
  security: {
    trustProxy: true,
    allowedOrigins: ["https://partner.example.com"],
  },
};\n`,
    }
  );
});

test("2. [#Z2] Production error sanitization across Server Functions, SSR, error.tsx, @slot/error.tsx, RSC, PPR holes, <DinouCacheSlot> & fallback HTML titles (NODE_ENV=production)", () => {
  // Static check on emergency fallback HTML titles in handler.js, client.jsx, and client-webpack.jsx
  for (const rel of ["core/handler.js", "core/client.jsx", "core/client-webpack.jsx"]) {
    const src = fs.readFileSync(path.join(DINOU_ROOT, rel), "utf8");
    assert.ok(
      !src.includes("<title>Dinou Dev Error</title>"),
      `${rel} must NOT hardcode <title>Dinou Dev Error</title> for production fallback HTML`
    );
    assert.ok(
      !src.includes("Dinou Dev Error from client.jsx ErrorBoundary"),
      `${rel} must NOT hardcode dev ErrorBoundary <title> in production`
    );
  }

  runInCompiledSecurityApp(
    `
    const assertNoLeak = (label, text, secretToken) => {
      assert.ok(
        !text.includes(secretToken),
        label + " leaked secret error message (" + secretToken + "):\\n" + text.slice(0, 600)
      );
      assert.ok(
        !text.includes("Dinou Dev Error"),
        label + " leaked 'Dinou Dev Error' in production:\\n" + text.slice(0, 600)
      );
      // Strip ESM importmap script (bundler client chunk map) before scanning for error path/stack leaks
      const withoutImportMap = text.replace(/<script[^>]*type=["']importmap["'][^>]*>[\\s\\S]*?<\\/script>/gi, "");
      const slashTmp = TMP_APP.replace(/\\\\/g, "/");
      const leakIdx =
        withoutImportMap.indexOf(slashTmp) !== -1
          ? withoutImportMap.indexOf(slashTmp)
          : withoutImportMap.indexOf(TMP_APP);
      assert.equal(
        leakIdx,
        -1,
        label +
          " leaked absolute filesystem path in production around: " +
          withoutImportMap.slice(Math.max(0, leakIdx - 80), leakIdx + 160)
      );
      assert.ok(
        !withoutImportMap.includes("rsc-engine.mjs") &&
          !withoutImportMap.includes("at CrashNoBoundary") &&
          !withoutImportMap.includes("at CrashWithBoundary") &&
          !withoutImportMap.includes("at BrokenSidebar"),
        label + " leaked server stack trace in production"
      );
    };

    // 2A. Server Function throwing uncaught Error (no digest) -> MUST redact raw err.message in production
    {
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            id: "file:///src/actions/sec-actions.ts#throwSecretError",
            args: [],
          }),
        })
      );
      assert.equal(res.status, 500);
      const raw = await res.text();
      assertNoLeak("Server Function uncaught error", raw, "SECRET_DB_PASSWORD_LEAK");
      const json = JSON.parse(raw);
      assert.equal(json.error, "Internal Server Error");
      assert.equal("digest" in json, false);
    }

    // 2A2. Server Function throwing intentional validation error WITH digest -> MUST preserve digest safely
    {
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            id: "file:///src/actions/sec-actions.ts#throwIntentionalDigest",
            args: [],
          }),
        })
      );
      assert.equal(res.status, 500);
      const json = await res.json();
      assert.equal(json.digest, "Z2_VALIDATION_ERR");
      assert.equal(json.error, "Validation failed: title required");
    }

    // 2B. SSR page without error.tsx
    {
      const res = await appFetch(new Request("http://localhost:3000/crash-no-boundary"));
      assert.equal(res.status, 500);
      const html = await res.text();
      assertNoLeak("SSR no error.tsx", html, "SECRET_DB_PASSWORD_LEAK_NO_BOUNDARY");
    }

    // 2C. SSR page WITH error.tsx (with and without intentional digest)
    {
      const res = await appFetch(new Request("http://localhost:3000/crash-with-boundary"));
      assert.equal(res.status, 500);
      const html = await res.text();
      assertNoLeak("SSR with error.tsx", html, "SECRET_DB_PASSWORD_LEAK_WITH_BOUNDARY");
      assert.ok(html.includes("z2-error-boundary"), "Custom error.tsx should render");
      assert.ok(html.includes("no-stack"), "Stack must be stripped in production");

      const resDigest = await appFetch(
        new Request("http://localhost:3000/crash-with-boundary?with_digest=1")
      );
      assert.equal(resDigest.status, 500);
      const htmlDigest = await resDigest.text();
      assertNoLeak("SSR with error.tsx + digest", htmlDigest, "SECRET_DB_PASSWORD_LEAK_WITH_BOUNDARY");
      assert.ok(
        htmlDigest.includes("DIGEST_Z2_BOUNDARY_OK"),
        "Intentional err.digest must propagate to error.tsx in production, got:\\n" + htmlDigest.slice(0, 600)
      );
    }

    // 2C2. Parallel @sidebar slot throwing with @sidebar/error.tsx
    {
      const res = await appFetch(new Request("http://localhost:3000/crash-slot-boundary"));
      assert.equal(res.status, 500);
      const html = await res.text();
      assertNoLeak("Parallel @sidebar/error.tsx", html, "SECRET_PARALLEL_SLOT_LEAK");
      assertNoLeak("Page with broken sidebar", html, "SECRET_PAGE_WITH_BROKEN_SIDEBAR");
    }

    // 2D. Soft-nav RSC page (/____rsc_page____/crash-with-boundary)
    {
      const res = await appFetch(
        new Request("http://localhost:3000/____rsc_page____/crash-with-boundary?with_digest=1")
      );
      assert.equal(res.status, 500);
      const rscText = await res.text();
      assertNoLeak("RSC soft-nav error", rscText, "SECRET_DB_PASSWORD_LEAK_WITH_BOUNDARY");
      assert.ok(
        rscText.includes("DIGEST_Z2_BOUNDARY_OK"),
        "Intentional err.digest must propagate in RSC error payload"
      );
    }

    // 2E. PPR dynamic hole throwing uncaught error
    {
      const res = await appFetch(new Request("http://localhost:3000/ppr-crash?boom=1"));
      const html = await res.text();
      assertNoLeak("PPR dynamic hole error", html, "SECRET_DB_PASSWORD_LEAK_PPR_HOLE");
      assert.ok(html.includes("Error loading dynamic content") || html.includes("PPR Shell"));
    }

    // 2F. <DinouCacheSlot> throwing uncaught error on /____rsc_slot____
    {
      // Warm registration first
      const warmRes = await appFetch(new Request("http://localhost:3000/cache-slot-crash"));
      assert.equal(warmRes.status, 200);
      const slotErrRes = await appFetch(
        new Request("http://localhost:3000/____rsc_slot____/z2-fragile-slot?fresh=1", {
          headers: {
            "x-dinou-current-path": "/cache-slot-crash",
            "x-z2-boom": "1",
          },
        })
      );
      const slotText = await slotErrRes.text();
      assertNoLeak("DinouCacheSlot error", slotText, "SECRET_DB_PASSWORD_LEAK_CACHE_SLOT");
    }

    // 2G. Direct getErrorJSX(path, {}, { message: "SECRET_NO_STACK_LEAK" }, false) MUST NOT leak when stack is omitted
    {
      const { getErrorJSX } = await import(pathToFileURL(path.join(DINOU_ROOT, "core/get-error-jsx.js")).href);
      const jsxNoStack = await getErrorJSX(
        "/crash-with-boundary",
        {},
        { message: "SECRET_NO_STACK_LEAK", name: "Error", digest: "DIGEST_SAFE_1" },
        false,
        { segment: "page" }
      );
      const serialized = JSON.stringify(jsxNoStack, (_k, v) => (typeof v === "function" ? "[fn]" : v));
      assert.ok(
        !serialized.includes("SECRET_NO_STACK_LEAK"),
        "getErrorJSX must NOT leak raw error.message in production when error.stack is omitted: " + serialized
      );
      assert.ok(
        serialized.includes("DIGEST_SAFE_1"),
        "getErrorJSX must preserve error.digest in production: " + serialized
      );

      const jsxDefaultFallback = await getErrorJSX(
        "/crash-no-boundary",
        {},
        { message: "SECRET_DEFAULT_FALLBACK_LEAK", name: "Error" },
        false,
        { segment: "page" }
      );
      const serializedFallback = JSON.stringify(jsxDefaultFallback);
      assert.ok(
        !serializedFallback.includes("SECRET_DEFAULT_FALLBACK_LEAK"),
        "getErrorJSX default fallback must NOT leak raw error.message in production: " + serializedFallback
      );
    }
    `
  );
});

test("3. [#Z2] Open Redirect & XSS-via-Redirect prevention across handler.js, server-function-proxy(.js / -webpack.js), client-redirect.jsx, client(.jsx / -webpack.jsx) & ppr-runtime.js", async () => {
  // 3A. Server-side SSR, RSC, PPR hole & Server Function redirect validation
  runInCompiledSecurityApp(
    `
    const maliciousRedirects = [
      "//evil.com",
      "/\\\\evil.com",
      "///evil.com",
      "\\\\/evil.com",
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "/dashboard\\r\\nSet-Cookie: hacked=1",
      "/dashboard\\tfoo",
    ];

    for (const badTarget of maliciousRedirects) {
      // Server Function res.redirect() -> MUST clamp to "/"
      const sfRes = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            id: "file:///src/actions/sec-actions.ts#redirectTo",
            args: [badTarget],
          }),
        })
      );
      assert.equal(sfRes.status, 200);
      assert.equal(
        sfRes.headers.get("X-Dinou-Redirect"),
        "/",
        "Server Function redirect MUST block malicious target: " + JSON.stringify(badTarget)
      );
      const sfJson = await sfRes.json();
      assert.equal(sfJson.redirect, "/");

      // Direct SSR res.redirect() -> MUST clamp to "/"
      const ssrRes = await appFetch(
        new Request("http://localhost:3000/redir-test?to=" + encodeURIComponent(badTarget))
      );
      assert.equal(ssrRes.status, 302);
      assert.equal(
        ssrRes.headers.get("location"),
        "/",
        "SSR res.redirect MUST block malicious target: " + JSON.stringify(badTarget)
      );

      // Soft-nav RSC res.redirect() -> MUST clamp x-rsc-redirect to "/"
      const rscRes = await appFetch(
        new Request("http://localhost:3000/____rsc_page____/redir-test?to=" + encodeURIComponent(badTarget))
      );
      assert.equal(
        rscRes.headers.get("x-rsc-redirect"),
        "/",
        "RSC x-rsc-redirect MUST block malicious target: " + JSON.stringify(badTarget)
      );
    }

    // Server Function res.redirect("https://evil.com") -> MUST clamp to "/" (relative only!)
    {
      const sfExtRes = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            id: "file:///src/actions/sec-actions.ts#redirectTo",
            args: ["https://evil.com/phish"],
          }),
        })
      );
      assert.equal(sfExtRes.headers.get("X-Dinou-Redirect"), "/");
    }

    // Legitimate internal & deliberate external SSR redirects still work
    {
      const sfOk = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            id: "file:///src/actions/sec-actions.ts#redirectTo",
            args: ["/dashboard?tab=1#top"],
          }),
        })
      );
      assert.equal(sfOk.headers.get("X-Dinou-Redirect"), "/dashboard?tab=1#top");

      const ssrInt = await appFetch(
        new Request("http://localhost:3000/redir-test?to=" + encodeURIComponent("/dashboard?tab=1#top"))
      );
      assert.equal(ssrInt.headers.get("location"), "/dashboard?tab=1#top");

      const ssrExt = await appFetch(
        new Request("http://localhost:3000/redir-test?to=" + encodeURIComponent("https://example.com/ok"))
      );
      assert.equal(ssrExt.headers.get("location"), "https://example.com/ok");
    }

    // PPR dynamic hole redirect with malicious target -> MUST emit "/" in inline redirect script, never evil target
    {
      const pprRes = await appFetch(
        new Request("http://localhost:3000/ppr-crash?redir=" + encodeURIComponent("/\\\\evil.com"))
      );
      const html = await pprRes.text();
      assert.ok(!html.includes("evil.com"), "PPR hole redirect must block /\\\\evil.com: " + html);
    }
    `
  );

  // 3B. Client-side proxy & ClientRedirect & client router validation across ESM and Webpack builds
  const tmpProxyDir = createFixtureDir("tmp-z2-proxy-");
  try {
    const mockRsdPlugin = {
      name: "mock-rsd-client",
      setup(build) {
        build.onResolve(
          {
            filter:
              /^(@roggc\/react-server-dom-esm\/client|react-server-dom-webpack\/client)$/,
          },
          (args) => ({ path: args.path, namespace: "mock-rsd" })
        );
        build.onLoad({ filter: /.*/, namespace: "mock-rsd" }, () => ({
          contents: `export function createFromFetch(p) { return p; }\n`,
          loader: "js",
        }));
      },
    };

    const esmProxyOut = path.join(tmpProxyDir, "esm-proxy.mjs");
    const wpProxyOut = path.join(tmpProxyDir, "wp-proxy.mjs");
    await esbuild.build({
      entryPoints: [path.join(DINOU_ROOT, "core/server-function-proxy.js")],
      bundle: true,
      format: "esm",
      platform: "neutral",
      outfile: esmProxyOut,
      plugins: [mockRsdPlugin],
    });
    await esbuild.build({
      entryPoints: [path.join(DINOU_ROOT, "core/server-function-proxy-webpack.js")],
      bundle: true,
      format: "esm",
      platform: "neutral",
      outfile: wpProxyOut,
      plugins: [mockRsdPlugin],
    });

    const esmProxy = await import(pathToFileURL(esmProxyOut).href);
    const wpProxy = await import(pathToFileURL(wpProxyOut).href);

    const prevWindow = globalThis.window;
    const prevFetch = globalThis.fetch;
    const navigatedTo = [];
    const locationHrefWrites = [];

    try {
      globalThis.window = {
        location: {
          pathname: "/",
          origin: "http://localhost:3000",
          set href(val) {
            locationHrefWrites.push(val);
          },
          get href() {
            return "http://localhost:3000/";
          },
        },
        __DINOU_ROUTER_NAVIGATE__: (url) => {
          navigatedTo.push(url);
        },
      };

      const badUrls = [
        "//evil.com",
        "/\\evil.com",
        "///evil.com",
        "javascript:alert(1)",
        "data:text/html,xss",
        "https://evil.com/phish",
        "/ok\r\nX-Inject: 1",
        "/ok\tbad",
      ];

      for (const [label, createProxy] of [
        ["ESM server-function-proxy", esmProxy.createServerFunctionProxy],
        ["Webpack server-function-proxy", wpProxy.createServerFunctionProxy],
      ]) {
        const fn = createProxy("file:///src/actions/sec-actions.ts#redirectTo");
        for (const badUrl of badUrls) {
          navigatedTo.length = 0;
          locationHrefWrites.length = 0;
          globalThis.fetch = async () =>
            new Response(JSON.stringify({ redirect: badUrl }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          await fn(badUrl);
          assert.deepEqual(
            navigatedTo,
            ["/"],
            `${label} MUST clamp malicious redirect ${JSON.stringify(badUrl)} to "/"`
          );
          assert.deepEqual(locationHrefWrites, []);
        }

        // Valid relative path succeeds
        navigatedTo.length = 0;
        globalThis.fetch = async () =>
          new Response(JSON.stringify({ redirect: "/dashboard?tab=1#top" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        await fn("/dashboard?tab=1#top");
        assert.deepEqual(navigatedTo, ["/dashboard?tab=1#top"]);
      }

      // 3C. Verify client-redirect.jsx blocks javascript:, data:, //evil.com, /\evil.com
      const clientRedirOut = path.join(tmpProxyDir, "client-redirect.mjs");
      await esbuild.build({
        entryPoints: [path.join(DINOU_ROOT, "core/client-redirect.jsx")],
        bundle: true,
        format: "esm",
        platform: "neutral",
        jsx: "automatic",
        outfile: clientRedirOut,
        plugins: [
          {
            name: "mock-react-and-nav",
            setup(build) {
              build.onResolve({ filter: /^react$/ }, () => ({
                path: "react",
                namespace: "mock-react",
              }));
              build.onLoad({ filter: /.*/, namespace: "mock-react" }, () => ({
                contents: `export function useEffect(fn) { fn(); }\nexport default { useEffect };\n`,
                loader: "js",
              }));
              build.onResolve({ filter: /^\.\/navigation\.js$/ }, () => ({
                path: "navigation",
                namespace: "mock-nav",
              }));
              build.onLoad({ filter: /.*/, namespace: "mock-nav" }, () => ({
                contents: `export function useRouter() { return { replace: (u) => { globalThis.__MOCK_ROUTER_REPLACE__?.(u); } }; }\n`,
                loader: "js",
              }));
            },
          },
        ],
      });

      const clientRedirMod = await import(pathToFileURL(clientRedirOut).href);
      const prevDocument = globalThis.document;
      globalThis.document = {
        body: { setAttribute() {} },
      };
      try {
        // Test fallback path (no __DINOU_ROUTER_NAVIGATE__, no router.replace -> would hit window.location.href!)
        globalThis.window.__DINOU_ROUTER_NAVIGATE__ = undefined;
        globalThis.__MOCK_ROUTER_REPLACE__ = undefined;
        for (const bad of [
          "//evil.com",
          "/\\evil.com",
          "///evil.com",
          "javascript:alert(1)",
          "JAVASCRIPT:alert(1)",
          "data:text/html,<script>alert(1)</script>",
          "vbscript:msgbox(1)",
          "/ok\r\nX: 1",
        ]) {
          locationHrefWrites.length = 0;
          clientRedirMod.ClientRedirect({ to: bad });
          for (const written of locationHrefWrites) {
            assert.equal(
              written,
              "/",
              `ClientRedirect MUST NOT write unsafe target ${JSON.stringify(bad)} to window.location.href (wrote ${JSON.stringify(written)})`
            );
          }
        }

        // Also test when __DINOU_ROUTER_NAVIGATE__ IS present
        navigatedTo.length = 0;
        globalThis.window.__DINOU_ROUTER_NAVIGATE__ = (u) => navigatedTo.push(u);
        clientRedirMod.ClientRedirect({ to: "javascript:alert(1)" });
        clientRedirMod.ClientRedirect({ to: "//evil.com" });
        clientRedirMod.ClientRedirect({ to: "/\\evil.com" });
        for (const navTarget of navigatedTo) {
          assert.equal(
            navTarget,
            "/",
            `ClientRedirect must sanitize unsafe target before __DINOU_ROUTER_NAVIGATE__ (got ${JSON.stringify(navTarget)})`
          );
        }

        // Legitimate internal & explicit external http(s) targets still pass through
        navigatedTo.length = 0;
        clientRedirMod.ClientRedirect({ to: "/dashboard?tab=1#top" });
        clientRedirMod.ClientRedirect({ to: "http://127.0.0.1:4567/ext-client-redirect" });
        assert.deepEqual(navigatedTo, [
          "/dashboard?tab=1#top",
          "http://127.0.0.1:4567/ext-client-redirect",
        ]);
      } finally {
        globalThis.document = prevDocument;
        delete globalThis.__MOCK_ROUTER_REPLACE__;
      }

      // 3D. Verify client.jsx & client-webpack.jsx sanitize executeRscRedirect & navigate
      for (const rel of ["core/client.jsx", "core/client-webpack.jsx"]) {
        const src = fs.readFileSync(path.join(DINOU_ROOT, rel), "utf8");
        assert.ok(
          src.includes("isSafeRedirectUrl") || src.includes("sanitizeRedirectUrl"),
          `${rel} must validate/sanitize redirect URLs in executeRscRedirect and navigate`
        );
      }
    } finally {
      globalThis.window = prevWindow;
      globalThis.fetch = prevFetch;
    }
  } finally {
    removeDirSafe(tmpProxyDir);
  }
});

test("4. [#Z2] Path traversal, real symlink confinement, FileSystemStorage._resolve confinement, Server Function ID spoofing, /____rsc_slot____ traversal, /.well-known/security.txt & Range (206/416)", async () => {
  // 4A. Unit check on FileSystemStorage._resolve() confinement against traversal & null bytes
  const { FileSystemStorage } = await import(
    pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
  );
  const tmpStoreBase = createFixtureDir("tmp-z2-fsstore-");
  const dist2Dir = path.join(tmpStoreBase, "dist2");
  fs.mkdirSync(dist2Dir, { recursive: true });
  const outsideFile = path.join(tmpStoreBase, "outside-secret.txt");
  fs.writeFileSync(outsideFile, "OUTSIDE_DIST2_SECRET", "utf8");

  try {
    const store = new FileSystemStorage(dist2Dir);
    for (const badKey of [
      "../outside-secret.txt",
      "../../outside-secret.txt",
      "sub/../../outside-secret.txt",
      "..\\outside-secret.txt",
      "valid\0/index.html",
    ]) {
      const got = await store.get(badKey);
      assert.equal(got, null, `FileSystemStorage.get(${JSON.stringify(badKey)}) MUST NOT escape baseDir`);
      const hasRes = await store.has(badKey);
      assert.equal(hasRes, false, `FileSystemStorage.has(${JSON.stringify(badKey)}) MUST return false`);
      await assert.rejects(
        () => store.set(badKey, "PWNED"),
        `FileSystemStorage.set(${JSON.stringify(badKey)}) MUST reject traversal outside baseDir`
      );
    }
    assert.equal(
      fs.readFileSync(outsideFile, "utf8"),
      "OUTSIDE_DIST2_SECRET",
      "Outside file must remain completely untouched"
    );
  } finally {
    removeDirSafe(tmpStoreBase);
  }

  // 4B. Full production server traversal, symlink escape, SF ID spoofing & Range 206/416
  runInCompiledSecurityApp(
    `
    // Static traversal & dotfile probes
    for (const badPath of [
      "/../package.json",
      "/%2e%2e/package.json",
      "/%252e%252e/package.json",
      "/%5c..%5cpackage.json",
      "/range-sample.txt%00.png",
      "/.env",
      "/.git/config",
      "/.well-known/.env",
    ]) {
      const res = await appFetch(new Request("http://localhost:3000" + badPath));
      const body = await res.text();
      assert.ok(
        [400, 403, 404].includes(res.status),
        "Expected 400/403/404 for " + badPath + ", got " + res.status
      );
      assert.ok(!body.includes("ENV_SECRET_CANARY"), "Leaked .env on " + badPath);
      assert.ok(!body.includes("z2-security-app"), "Leaked package.json on " + badPath);
    }

    // Real symlink escape check in .dinou/dist3
    if (SYMLINK_CREATED) {
      for (const linkPath of ["/escape-link.txt", "/escape-dir/secret-outside.txt"]) {
        const res = await appFetch(new Request("http://localhost:3000" + linkPath));
        const body = await res.text();
        assert.ok(
          [400, 403, 404].includes(res.status),
          "Symlink escape " + linkPath + " MUST be blocked, got status " + res.status
        );
        assert.ok(
          !body.includes("TOP_SECRET_OUTSIDE_DIST3_CANARY"),
          "Symlink escape " + linkPath + " leaked outside file contents!"
        );
      }
    }

    // /.well-known/security.txt -> 200 OK
    {
      const res = await appFetch(new Request("http://localhost:3000/.well-known/security.txt"));
      assert.equal(res.status, 200, "/.well-known/security.txt must return 200 OK");
      const txt = await res.text();
      assert.ok(txt.includes("security@dinou.example"));
    }

    // Valid Range: bytes=0-9 -> 206 Partial Content
    {
      const res = await appFetch(
        new Request("http://localhost:3000/range-sample.txt", {
          headers: { range: "bytes=0-9" },
        })
      );
      assert.equal(res.status, 206, "Valid Range must return 206 Partial Content");
      assert.equal(res.headers.get("content-range"), "bytes 0-9/36");
      const chunk = await res.text();
      assert.equal(chunk, "0123456789");
    }

    // Unsatisfiable Range: bytes=99999-100000 -> 416 Range Not Satisfiable
    {
      const res = await appFetch(
        new Request("http://localhost:3000/range-sample.txt", {
          headers: { range: "bytes=99999-100000" },
        })
      );
      assert.equal(res.status, 416, "Unsatisfiable Range must return 416");
      assert.equal(res.headers.get("content-range"), "bytes */36");
    }

    // RSC, Slot & Error endpoints traversal surviving WHATWG URL normalization -> MUST return 400 Bad Request
    for (const badRsc of [
      "/____rsc_page____/%252e%252e/secret-route",
      "/____rsc_page____/%5c..%5csecret-route",
      "/____rsc_layout____/%252e%252e/secret-route",
      "/____rsc_slot____/z2-fragile-slot/extra-segment",
      "/____rsc_slot____/%252e%252e",
      "/____rsc_slot____/..%5cetc",
      "/____rsc_slot____/bad%00slot",
    ]) {
      const res = await appFetch(new Request("http://localhost:3000" + badRsc));
      assert.equal(res.status, 400, "Traversal on " + badRsc + " should return 400 Bad Request, got " + res.status);
    }
    // WHATWG URL-collapsed traversal probes (/%2e%2e/...) -> MUST return 400 or 404, never leak
    for (const collapsed of [
      "/____rsc_page____/%2e%2e/package.json",
      "/____rsc_page____/%2e%2e/secret-route",
      "/____rsc_layout____/%2e%2e/secret-route",
      "/____rsc_slot____/../../etc/passwd",
      "/____rsc_slot____/z2-fragile-slot/../../etc/passwd",
    ]) {
      const res = await appFetch(new Request("http://localhost:3000" + collapsed));
      const body = await res.text();
      assert.ok([400, 404].includes(res.status), "Expected 400/404 for " + collapsed + ", got " + res.status);
      assert.ok(!body.includes("z2-security-app"));
    }

    // Invalid x-dinou-current-path traversal on /____rsc_slot____ -> 400
    {
      const res = await appFetch(
        new Request("http://localhost:3000/____rsc_slot____/z2-fragile-slot", {
          headers: { "x-dinou-current-path": "/../../etc/passwd" },
        })
      );
      assert.equal(res.status, 400, "Traversal in x-dinou-current-path MUST return 400");
    }

    // Traversal on POST /____rsc_payload_error____ -> 400 (double-encoded survives URL normalization)
    {
      const res = await appFetch(
        new Request("http://localhost:3000/____rsc_payload_error____/%252e%252e/etc/passwd", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: { message: "x" } }),
        })
      );
      assert.equal(res.status, 400, "Traversal on /____rsc_payload_error____ MUST return 400");
    }

    // POST /____server_function____ ID spoofing & traversal
    for (const badId of [
      "file:///etc/passwd#x",
      "file:///src/../.env#x",
      "file:///src/%2e%2e/package.json#default",
      "file:///src/_private/secret.ts#leak",
      "file:///src/unregistered.ts#leak",
      "file:///src/actions/sec-actions.ts#__proto__",
      "file:///src/actions/sec-actions.ts#constructor",
      "file:///src/actions/sec-actions.ts\\0.js#pingOk",
    ]) {
      const res = await handleRequest(
        new Request("http://localhost:3000/____server_function____", {
          method: "POST",
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-server-function-call": "1",
            "content-type": "application/json",
          },
          body: JSON.stringify({ id: badId, args: [] }),
        })
      );
      assert.ok(
        [400, 403, 404].includes(res.status),
        "Spoofed Server Function id " + JSON.stringify(badId) + " MUST be rejected (got " + res.status + ")"
      );
      const txt = await res.text();
      assert.ok(!txt.includes("PRIVATE_DIR_LEAK"));
      assert.ok(!txt.includes("UNREGISTERED_MODULE_LEAK"));
      assert.ok(!txt.includes("ENV_SECRET_CANARY"));
    }
    `
  );
});
