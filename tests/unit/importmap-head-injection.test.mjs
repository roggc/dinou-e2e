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
const EDGE_SSR_PATH = path.join(DINOU_ROOT, "core", "edge-ssr.js");

const {
  injectImportMapIntoHeadSegment,
  createImportMapTransformStream,
} = await import(pathToFileURL(EDGE_SSR_PATH).href);

const IMPORT_MAP = `<script type="importmap">{"imports":{"src/a.tsx":"/a.js"}}</script>`;

async function pipeChunks(chunks, importMapHtml = IMPORT_MAP) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(typeof c === "string" ? encoder.encode(c) : c);
      }
      controller.close();
    },
  });
  const transformed = stream.pipeThrough(
    createImportMapTransformStream(importMapHtml)
  );
  return new Response(transformed).text();
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
        version: "10.0.1",
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

test("1. Syntax check & exported helpers in dinou/core/edge-ssr.js", () => {
  const check = spawnSync(process.execPath, ["--check", EDGE_SSR_PATH], {
    encoding: "utf8",
  });
  assert.equal(
    check.status,
    0,
    `node --check failed for edge-ssr.js:\n${check.stderr}`
  );
  assert.equal(typeof injectImportMapIntoHeadSegment, "function");
  assert.equal(typeof createImportMapTransformStream, "function");
});

test("2. Standard React 19 HTML with multi-byte UTF-8 & modulepreload before og:*", async () => {
  const html =
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charSet="UTF-8"/>` +
    `<link rel="stylesheet" href="/styles.css"/>` +
    `<link rel="modulepreload" fetchPriority="low" href="/main-ABC.js"/>` +
    `<title>Dinou — Full-Stack React 19 🚀</title>` +
    `<meta property="og:title" content="Dinou"/>` +
    `<meta property="og:image" content="https://dinou.dev/og-image.png"/>` +
    `</head><body><h1>Hola — Dinou 🚀</h1></body></html>`;

  const out = await pipeChunks([html]);
  assert.ok(out.startsWith("<!DOCTYPE html>"), "DOCTYPE must be at byte 0");
  assert.ok(
    out.indexOf("og:image") < out.indexOf('type="importmap"'),
    "og:image must precede importmap"
  );
  assert.ok(
    out.indexOf('type="importmap"') < out.indexOf('rel="modulepreload"'),
    "importmap must precede modulepreload"
  );
  assert.ok(
    out.indexOf('rel="modulepreload"') < out.indexOf("</head>"),
    "modulepreload must stay inside </head>"
  );
  assert.ok(
    out.includes("<h1>Hola — Dinou 🚀</h1>"),
    "Body UTF-8 must be preserved"
  );
});

test("3. Chunk split mid-</head> AND mid-3-byte UTF-8 character right after </head>", async () => {
  const encoder = new TextEncoder();
  const part1 = encoder.encode(
    `<!DOCTYPE html><html lang="en"><head><title>A — B</title><link rel="modulepreload" href="/m.js"/><meta property="og:type" content="website"/></he`
  );
  const tailFull = encoder.encode(`ad><body>—🚀</body></html>`);
  // Cuts inside 3-byte em-dash (0xE2 | 0x80 0x94) right after `ad><body>`
  const part2 = tailFull.subarray(0, 10);
  const part3 = tailFull.subarray(10);

  const out = await pipeChunks([part1, part2, part3]);
  assert.equal(
    out,
    `<!DOCTYPE html><html lang="en"><head><title>A — B</title><meta property="og:type" content="website"/>${IMPORT_MAP}<link rel="modulepreload" href="/m.js"/></head><body>—🚀</body></html>`
  );
});

test("4. Tiny 3-byte and 1-byte UTF-8 chunks across entire document", async () => {
  const html = `<!DOCTYPE html><html><head><title>X — 🚀</title><link rel="modulepreload" href="/m.js"/></head><body>OK — 🚀</body></html>`;
  const expected = `<!DOCTYPE html><html><head><title>X — 🚀</title>${IMPORT_MAP}<link rel="modulepreload" href="/m.js"/></head><body>OK — 🚀</body></html>`;

  const rawBytes = new TextEncoder().encode(html);

  // 3-byte UTF-8 chunks (splits multi-byte UTF-8 characters & </head> across chunks)
  const threeByteChunks = [];
  for (let i = 0; i < rawBytes.length; i += 3) {
    threeByteChunks.push(rawBytes.subarray(i, i + 3));
  }
  assert.equal(await pipeChunks(threeByteChunks), expected);

  // 1-byte Uint8Array chunks (splits every multi-byte UTF-8 char and every ASCII tag)
  const oneByteChunks = [];
  for (let i = 0; i < rawBytes.length; i++) {
    oneByteChunks.push(rawBytes.subarray(i, i + 1));
  }
  assert.equal(await pipeChunks(oneByteChunks), expected);
});

test("5. User <script type=\"module\"> inside <head> + multiple modulepreload tags", async () => {
  const html =
    `<!DOCTYPE html><html><head>` +
    `<link rel="modulepreload" href="/a.js"/>` +
    `<meta property="og:title" content="Hi"/>` +
    `<link rel="modulepreload" href="/b.js"/>` +
    `<script type="module" src="/user.js"></script>` +
    `</head><body>ok</body></html>`;

  const out = await pipeChunks([html]);
  assert.equal(
    out,
    `<!DOCTYPE html><html><head>` +
      `<meta property="og:title" content="Hi"/>` +
      `${IMPORT_MAP}` +
      `<link rel="modulepreload" href="/a.js"/>` +
      `<link rel="modulepreload" href="/b.js"/>` +
      `<script type="module" src="/user.js"></script>` +
      `</head><body>ok</body></html>`
  );
});

test("6. no_layout bare fragments (<div> and <header>) flush immediately without stalling or matching <head>", async () => {
  const outDiv = await pipeChunks([`<div>Bare page</div>`]);
  assert.equal(outDiv, `${IMPORT_MAP}<div>Bare page</div>`);

  const outHeader = await pipeChunks([
    `<header>Top nav</header><main>Body</main>`,
  ]);
  assert.equal(
    outHeader,
    `${IMPORT_MAP}<header>Top nav</header><main>Body</main>`
  );

  // Verify true non-blocking streaming: first chunk `<header>Top</header>` must emit BEFORE stream closes!
  const encoder = new TextEncoder();
  let streamController;
  const liveStream = new ReadableStream({
    start(controller) {
      streamController = controller;
    },
  });
  const transformed = liveStream.pipeThrough(
    createImportMapTransformStream(IMPORT_MAP)
  );
  const reader = transformed.getReader();
  const decoder = new TextDecoder();

  streamController.enqueue(encoder.encode(`<header>Top</header>`));

  let received = "";
  while (!received.includes("<header>Top</header>")) {
    const { value, done } = await reader.read();
    assert.equal(done, false, "Stream should still be open while reading first flushed bare fragment");
    received += decoder.decode(value, { stream: true });
  }
  assert.equal(received, `${IMPORT_MAP}<header>Top</header>`);

  streamController.enqueue(encoder.encode(`<main>Late chunk</main>`));
  streamController.close();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += decoder.decode(value, { stream: true });
  }
  received += decoder.decode();
  assert.equal(
    received,
    `${IMPORT_MAP}<header>Top</header><main>Late chunk</main>`
  );
});

test("7. Document with <body> and no <head>, unquoted/single-quoted attrs, uppercase </HEAD >, BOM & EOF fallbacks", async () => {
  // 7a. <body> with no <head>
  const outNoHead = await pipeChunks([
    `<!DOCTYPE html><html><body>No head</body></html>`,
  ]);
  assert.equal(
    outNoHead,
    `<!DOCTYPE html><html>${IMPORT_MAP}<body>No head</body></html>`
  );

  // 7b. Unquoted HTML attributes (rel=modulepreload and type=module)
  const outUnquoted = await pipeChunks([
    `<!DOCTYPE html><html><head><link rel=modulepreload href=/a.js><meta property="og:title" content="Hi"><script type=module>import "x"</script></head><body>ok</body></html>`,
  ]);
  assert.equal(
    outUnquoted,
    `<!DOCTYPE html><html><head><meta property="og:title" content="Hi">${IMPORT_MAP}<link rel=modulepreload href=/a.js><script type=module>import "x"</script></head><body>ok</body></html>`
  );

  // 7c. Single-quoted attributes, uppercase </HEAD  >, and UTF-8 BOM
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const bodyBytes = new TextEncoder().encode(
    `<!DOCTYPE html><html><HEAD><link rel='modulepreload' href='/s.js'><title>Case</title><script type='module' src='/u.js'></script></HEAD  ><body>ok</body></html>`
  );
  const outBom = await pipeChunks([bom, bodyBytes]);
  assert.ok(outBom.includes("<!DOCTYPE html><html><HEAD><title>Case</title>"));
  assert.ok(
    outBom.indexOf("<title>Case</title>") < outBom.indexOf(IMPORT_MAP)
  );
  assert.ok(
    outBom.indexOf(IMPORT_MAP) <
      outBom.indexOf("<link rel='modulepreload' href='/s.js'>")
  );
  assert.ok(
    outBom.indexOf("<link rel='modulepreload' href='/s.js'>") <
      outBom.indexOf("<script type='module' src='/u.js'></script>")
  );
  assert.ok(
    outBom.indexOf("<script type='module' src='/u.js'></script>") <
      outBom.indexOf("</HEAD  >")
  );

  // 7d. Truncated document hitting flush() EOF fallback (never hangs)
  const outTruncated = await pipeChunks([
    `<!DOCTYPE html><html><head><title>Truncated`,
  ]);
  assert.equal(
    outTruncated,
    `${IMPORT_MAP}<!DOCTYPE html><html><head><title>Truncated`
  );

  // 7e. >256 KB unclosed <head> triggers MAX_HEAD_BUFFER_BYTES safety flush without stalling
  const hugePadding = "x".repeat(270_000);
  const outHuge = await pipeChunks([
    `<!DOCTYPE html><html><head><meta name="pad" content="${hugePadding}">`,
    `</head><body>after</body></html>`,
  ]);
  assert.ok(outHuge.includes(IMPORT_MAP), "Safety flush must still inject importmap");
  assert.ok(outHuge.endsWith("</head><body>after</body></html>"));
});

test("8. Tri-bundler real build parity (esbuild, rollup, webpack): DOCTYPE byte 0, <head> importmap ordering & bare no_layout fragment", () => {
  const tmpApp = createFixtureDir("tmp-importmap-head-");
  try {
    fs.mkdirSync(path.join(tmpApp, "src", "bare"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify(
        { name: "importmap-head-fixture", private: true, type: "module" },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
          },
        },
        null,
        2
      )
    );
    writeDinouShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "src", "counter.tsx"),
      `"use client";
import { useState } from "react";
export function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN((v) => v + 1)}>Count:{n}</button>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Dinou — Tri-Bundler Head 🚀</title>
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Dinou — Standards Mode" />
        <meta property="og:image" content="https://dinou.dev/og-image.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import { Counter } from "./counter";
export default function HomePage() {
  return (
    <main>
      <h1>Hola — Dinou 🚀</h1>
      <Counter />
    </main>
  );
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src", "bare", "no_layout"), "");
    fs.writeFileSync(
      path.join(tmpApp, "src", "bare", "page.tsx"),
      `export default function BarePage() {
  return (
    <>
      <header>Bare Nav</header>
      <main>Bare Body — 🚀</main>
    </>
  );
}
`
    );

    const nodePathEntries = [
      path.join(tmpApp, "node_modules"),
      path.join(REPO_ROOT, "node_modules"),
      path.join(DINOU_ROOT, "node_modules"),
    ].filter((p) => fs.existsSync(p));

    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      const buildRes = spawnSync(
        process.execPath,
        [CLI_PATH, `build:node:${bundler}`],
        {
          cwd: tmpApp,
          encoding: "utf8",
          env: {
            ...process.env,
            NODE_ENV: "production",
            NODE_PATH: nodePathEntries.join(path.delimiter),
          },
          timeout: 180_000,
        }
      );
      assert.equal(
        buildRes.status,
        0,
        `build:node:${bundler} failed:\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
      );

      const indexHtml = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist2", "index.html"),
        "utf8"
      );
      assert.ok(
        indexHtml.startsWith("<!DOCTYPE html>"),
        `[${bundler}] index.html must start with <!DOCTYPE html> at byte 0, got: ${indexHtml.slice(0, 120)}`
      );

      const headOpen = indexHtml.search(/<head(?:\s[^>]*)?>/i);
      const headClose = indexHtml.search(/<\/head>/i);
      assert.ok(headOpen > -1 && headClose > headOpen, `[${bundler}] expected valid <head>...</head>`);
      const headHtml = indexHtml.slice(headOpen, headClose);

      const importMapMatches =
        indexHtml.match(/<script\s+type="importmap">/g) || [];
      if (bundler === "webpack") {
        assert.equal(
          importMapMatches.length,
          0,
          "[webpack] must not emit importmap"
        );
      } else {
        assert.equal(
          importMapMatches.length,
          1,
          `[${bundler}] must emit exactly 1 importmap tag`
        );
        const importMapIdx = headHtml.indexOf('<script type="importmap">');
        assert.ok(
          importMapIdx > -1,
          `[${bundler}] importmap must live strictly inside <head>`
        );
        const ogImageIdx = headHtml.indexOf("og:image");
        const titleIdx = headHtml.indexOf("<title>");
        assert.ok(ogImageIdx > -1 && ogImageIdx < importMapIdx, `[${bundler}] og:image must appear before importmap`);
        assert.ok(titleIdx > -1 && titleIdx < importMapIdx, `[${bundler}] <title> must appear before importmap`);
        const firstModulePreload = headHtml.search(
          /<link\b[^>]*\brel="modulepreload"/i
        );
        if (firstModulePreload !== -1) {
          assert.ok(
            importMapIdx < firstModulePreload,
            `[${bundler}] importmap must precede <link rel="modulepreload">`
          );
        }
      }
      assert.ok(
        indexHtml.includes("Hola — Dinou 🚀"),
        `[${bundler}] UTF-8 body content must remain intact`
      );

      const bareHtml = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist2", "bare", "index.html"),
        "utf8"
      );
      assert.ok(
        bareHtml.includes("<header>Bare Nav</header>") &&
          bareHtml.includes("<main>Bare Body — 🚀</main>"),
        `[${bundler}] bare no_layout <header> fragment must render without stalling`
      );
    }
  } finally {
    removeDirSafe(tmpApp);
  }
});
