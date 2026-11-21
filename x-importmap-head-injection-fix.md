# Fix Plan: Inject `<script type="importmap">` Inside `<head>` Instead of Before `<!DOCTYPE html>` (`dinou/core/edge-ssr.js`)

## 1. Root Cause & Impact

Previously, `dinou/core/edge-ssr.js` injected `globalThis.__DINOU_IMPORT_MAP_HTML__` at **byte 0** of the HTML stream—**before `<!DOCTYPE html>`**:

```html
<script type="importmap">{"imports":{...}}</script><!DOCTYPE html><html lang="en"><head>...
```

Because `edge-ssr.js` is the single shared HTML streaming engine across **all runtimes and modes** (Node.js, Bun, Deno, Cloudflare Workers, Netlify Functions, Dev server, SSG, ISR, PPR shells, Lazy HTML Re-Composition, and Static Export) for Esbuild and Rollup builds, this caused three production defects:

1. **Quirks Mode in all browsers (`document.compatMode === "BackCompat"`):** By WHATWG HTML5 §13.2.6.4.1, any non-whitespace element preceding `<!DOCTYPE html>` forces browsers into Quirks Mode and flags Lighthouse Best Practices (*"Page lacks the HTML doctype, thus triggering Quirks Mode"*).
2. **Invalid HTML5 `<head>` structure:** A leading `<script>` implicitly opens `<head>` before `<!DOCTYPE html><html><head>`, failing W3C HTML validation and strict HTML/Open Graph scrapers.
3. **Open Graph / SEO `<meta>` tags pushed past crawler byte cutoffs:** In medium-to-large apps (e.g., `dinou-docs` with ~90 client components), the import map is **~31.7 KB**, pushing `<!DOCTYPE html>` to byte `31,675` and `<meta property="og:image">` to byte `32,739`—past the 16–32 KB `<head>` scan buffer used by several social preview scrapers.

---

## 2. Solution Overview

Modify **only one file**: `dinou/core/edge-ssr.js`.

Replace the naive prepend `TransformStream` with two exported helpers (`injectImportMapIntoHeadSegment` and `createImportMapTransformStream`):

1. **Byte-level `Uint8Array` scanning (zero UTF-8 corruption & zero body re-encoding):**
   - Buffers raw `Uint8Array` chunks only until the first ASCII `</head>` closing tag is detected (safe against multi-byte UTF-8 characters like `—` or emojis because all matched bytes are `< 0x80`).
   - Slices at the exact byte offset immediately after `</head>`: decodes/transforms **only** the `<head>` prefix (~1–3 KB), and emits the remaining tail bytes and all subsequent streaming chunks untouched (zero-copy passthrough).
2. **Spec-compliant `<head>` ordering:**
   - Keeps `<!DOCTYPE html>` at **byte 0** (Standards Mode `"CSS1Compat"`).
   - Leaves `<meta charset>`, `<meta viewport>`, `<title>`, `<meta name="description">`, `<meta property="og:*">`, `<meta name="twitter:*">`, `<link rel="canonical">`, favicons, and stylesheets at the very top of `<head>` (first ~1–2 KB regardless of import map size).
   - Injects `<script type="importmap">...</script>` right before `</head>` (or right before the first `<script type="module">` inside `<head>`, if present).
   - Moves any `<link rel="modulepreload" .../>` emitted earlier in `<head>` (e.g. React 19's `bootstrapModules` preload) to **immediately after** `<script type="importmap">` and before `</head>`, satisfying the browser spec rule that import maps must precede any module script load/preload (critical for Safari/Firefox/older Chromium).
3. **Safe fallbacks (zero streaming stalls):**
   - **`no_layout` bare JSX fragments** (e.g. `<div>...</div>`, `<header>...</header>`): detected immediately via `couldStartHtmlDocument()` (with word-boundary check so `<header>` is never confused with `<head>`) and flushed with `importMapHtml` prepended without stalling streaming.
   - **Documents with `<body>` and no `<head>`**: injected immediately before `<body`.
   - **Safety cap (`256 KB`) & `flush()` EOF fallback**: guarantees the stream never hangs even on malformed/truncated documents.
   - **No-ops unchanged:** Webpack builds (`importMapHtml === ""`) and PPR dynamic holes (`options.importMapHtml = ""`) skip the transform completely.
   - **Runtime compatibility:** Existing `handler.js` / `ppr-runtime.js` injections via `.replace("</head>", "<script>window.__DINOU_...;</script></head>")` continue to insert classic non-module scripts right before `</head>` after the import map and `modulepreload`.

### Verified Before vs. After (`dinou-docs` Production Build)

| Tag in `.dinou/dist2/index.html` | Before | After |
| :--- | :---: | :---: |
| `<!DOCTYPE html>` | byte `31,675` (`BackCompat`) | **byte `0`** (`CSS1Compat`) |
| `og:type` | byte `32,265` | **byte `518`** |
| `og:image` | byte `32,739` | **byte `992`** (< 1 KB) |
| `<script type="importmap">` | byte `0` (outside `<head>`) | **byte `2,003`** (inside `<head>`) |
| `<link rel="modulepreload">` | before `<title>` | **byte `33,458`** (after `importmap`, before `</head>`) |

---

## 3. Exact Code Change (`dinou/core/edge-ssr.js`)

Add the helpers below right after the imports in `dinou/core/edge-ssr.js`:

```js
const HEAD_OPEN_RE = /<head(?:\s[^>]*)?>/i;
const HEAD_CLOSE_END_RE = /<\/head\s*>$/i;
const MODULE_SCRIPT_RE = /<script\b[^>]*\btype\s*=\s*(?:"module"|'module'|module(?=\s|>|\/))[^>]*>/i;
const MODULE_PRELOAD_RE = /<link\b[^>]*\brel\s*=\s*(?:"modulepreload"|'modulepreload'|modulepreload(?=\s|>|\/))[^>]*\/?>/gi;
const MAX_HEAD_BUFFER_BYTES = 262144; // 256 KB safety cap

function concatBytes(a, b) {
  if (!a || a.byteLength === 0) return b;
  if (!b || b.byteLength === 0) return a;
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

function isAsciiWhitespace(byte) {
  return (
    byte === 0x20 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0d ||
    byte === 0x0c
  );
}

function findHeadCloseByteRange(bytes) {
  const len = bytes.length;
  for (let i = 0; i <= len - 7; i++) {
    if (
      bytes[i] === 0x3c && // '<'
      bytes[i + 1] === 0x2f && // '/'
      (bytes[i + 2] === 0x68 || bytes[i + 2] === 0x48) && // 'h' | 'H'
      (bytes[i + 3] === 0x65 || bytes[i + 3] === 0x45) && // 'e' | 'E'
      (bytes[i + 4] === 0x61 || bytes[i + 4] === 0x41) && // 'a' | 'A'
      (bytes[i + 5] === 0x64 || bytes[i + 5] === 0x44) // 'd' | 'D'
    ) {
      let j = i + 6;
      while (j < len && isAsciiWhitespace(bytes[j])) {
        j++;
      }
      if (j < len && bytes[j] === 0x3e) {
        return { start: i, end: j + 1 };
      }
    }
  }
  return null;
}

function hasHeadOpenTag(bytes) {
  const len = bytes.length;
  for (let i = 0; i <= len - 6; i++) {
    if (
      bytes[i] === 0x3c && // '<'
      (bytes[i + 1] === 0x68 || bytes[i + 1] === 0x48) && // 'h' | 'H'
      (bytes[i + 2] === 0x65 || bytes[i + 2] === 0x45) && // 'e' | 'E'
      (bytes[i + 3] === 0x61 || bytes[i + 3] === 0x41) && // 'a' | 'A'
      (bytes[i + 4] === 0x64 || bytes[i + 4] === 0x44) // 'd' | 'D'
    ) {
      const next = bytes[i + 5];
      if (next === 0x3e || next === 0x2f || isAsciiWhitespace(next)) {
        return true;
      }
    }
  }
  return false;
}

function findBodyOpenByteIndex(bytes) {
  const len = bytes.length;
  for (let i = 0; i <= len - 6; i++) {
    if (
      bytes[i] === 0x3c && // '<'
      (bytes[i + 1] === 0x62 || bytes[i + 1] === 0x42) && // 'b' | 'B'
      (bytes[i + 2] === 0x6f || bytes[i + 2] === 0x4f) && // 'o' | 'O'
      (bytes[i + 3] === 0x64 || bytes[i + 3] === 0x44) && // 'd' | 'D'
      (bytes[i + 4] === 0x79 || bytes[i + 4] === 0x59) // 'y' | 'Y'
    ) {
      const next = bytes[i + 5];
      if (next === 0x3e || next === 0x2f || isAsciiWhitespace(next)) {
        return i;
      }
    }
  }
  return -1;
}

function couldStartHtmlDocument(bytes) {
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    i = 3;
  }
  while (i < bytes.length && isAsciiWhitespace(bytes[i])) {
    i++;
  }
  if (i >= bytes.length) return true;
  const limit = Math.min(bytes.length, i + 10);
  let sample = "";
  for (let k = i; k < limit; k++) {
    sample += String.fromCharCode(bytes[k]).toLowerCase();
  }
  const prefixes = ["<!doctype", "<html", "<head"];
  return prefixes.some((p) => {
    if (sample.length < p.length) return p.startsWith(sample);
    if (!sample.startsWith(p)) return false;
    if (sample.length === p.length) return true;
    const next = sample[p.length];
    return (
      next === ">" ||
      next === "/" ||
      next === " " ||
      next === "\t" ||
      next === "\n" ||
      next === "\r" ||
      next === "\f"
    );
  });
}

export function injectImportMapIntoHeadSegment(headSegment, importMapHtml) {
  const closeMatch = HEAD_CLOSE_END_RE.exec(headSegment);
  if (!closeMatch) {
    return importMapHtml + headSegment;
  }

  const beforeClose = headSegment.slice(0, closeMatch.index);
  const closeTag = closeMatch[0];

  const openMatch = HEAD_OPEN_RE.exec(beforeClose);
  const headContentStart = openMatch ? openMatch.index + openMatch[0].length : 0;
  const prefix = beforeClose.slice(0, headContentStart);
  const headInner = beforeClose.slice(headContentStart);

  const moduleScriptMatch = MODULE_SCRIPT_RE.exec(headInner);
  if (moduleScriptMatch) {
    const splitAt = moduleScriptMatch.index;
    const beforeModule = headInner.slice(0, splitAt);
    const fromModule = headInner.slice(splitAt);
    const preloads = [];
    const cleanedBeforeModule = beforeModule.replace(MODULE_PRELOAD_RE, (m) => {
      preloads.push(m);
      return "";
    });
    return prefix + cleanedBeforeModule + importMapHtml + preloads.join("") + fromModule + closeTag;
  }

  const preloads = [];
  const cleanedHeadInner = headInner.replace(MODULE_PRELOAD_RE, (m) => {
    preloads.push(m);
    return "";
  });
  return prefix + cleanedHeadInner + importMapHtml + preloads.join("") + closeTag;
}

export function createImportMapTransformStream(importMapHtml) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");
  const importMapBytes = encoder.encode(importMapHtml);
  let injected = false;
  let buffered = new Uint8Array(0);

  const flushFallback = (controller) => {
    if (injected) return;
    injected = true;
    const data = buffered;
    buffered = new Uint8Array(0);
    if (data.byteLength === 0) {
      controller.enqueue(importMapBytes);
      return;
    }
    const bodyIdx = findBodyOpenByteIndex(data);
    if (bodyIdx !== -1) {
      if (bodyIdx > 0) controller.enqueue(data.subarray(0, bodyIdx));
      controller.enqueue(importMapBytes);
      controller.enqueue(data.subarray(bodyIdx));
      return;
    }
    controller.enqueue(importMapBytes);
    controller.enqueue(data);
  };

  return new TransformStream({
    transform(chunk, controller) {
      const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
      if (injected) {
        controller.enqueue(bytes);
        return;
      }

      buffered = concatBytes(buffered, bytes);

      // Standard full HTML document: inject inside <head> right before </head>
      const headClose = findHeadCloseByteRange(buffered);
      if (headClose) {
        injected = true;
        const headStr = decoder.decode(buffered.subarray(0, headClose.end));
        const transformedHead = injectImportMapIntoHeadSegment(headStr, importMapHtml);
        const tail = buffered.subarray(headClose.end);
        buffered = new Uint8Array(0);
        controller.enqueue(encoder.encode(transformedHead));
        if (tail.byteLength > 0) {
          controller.enqueue(tail);
        }
        return;
      }

      // Fragment without <html>/<head> (e.g. `no_layout` route): don't stall streaming
      if (!couldStartHtmlDocument(buffered)) {
        injected = true;
        const data = buffered;
        buffered = new Uint8Array(0);
        controller.enqueue(importMapBytes);
        controller.enqueue(data);
        return;
      }

      // Document with <body> and no <head> tag at all
      if (!hasHeadOpenTag(buffered)) {
        const bodyIdx = findBodyOpenByteIndex(buffered);
        if (bodyIdx !== -1) {
          injected = true;
          const data = buffered;
          buffered = new Uint8Array(0);
          if (bodyIdx > 0) controller.enqueue(data.subarray(0, bodyIdx));
          controller.enqueue(importMapBytes);
          controller.enqueue(data.subarray(bodyIdx));
          return;
        }
      }

      if (buffered.byteLength >= MAX_HEAD_BUFFER_BYTES) {
        flushFallback(controller);
      }
    },
    flush(controller) {
      if (!injected) {
        const headClose = findHeadCloseByteRange(buffered);
        if (headClose) {
          injected = true;
          const headStr = decoder.decode(buffered.subarray(0, headClose.end));
          const transformedHead = injectImportMapIntoHeadSegment(headStr, importMapHtml);
          const tail = buffered.subarray(headClose.end);
          buffered = new Uint8Array(0);
          controller.enqueue(encoder.encode(transformedHead));
          if (tail.byteLength > 0) {
            controller.enqueue(tail);
          }
        } else {
          flushFallback(controller);
        }
      }
    },
  });
}
```

And inside `renderRscStreamToHtmlStream()`, replace lines 126–141 with:

```js
    const importMapHtml =
      options.importMapHtml !== undefined
        ? options.importMapHtml
        : (typeof globalThis !== "undefined" && globalThis.__DINOU_IMPORT_MAP_HTML__) || "";
    if (importMapHtml) {
      return htmlStream.pipeThrough(createImportMapTransformStream(importMapHtml));
    }
```

---

## 4. Regression Tests to Add in `dinou-e2e`

Yes—adding dedicated regression tests is strongly recommended because none of the existing E2E tests previously asserted `document.compatMode === "CSS1Compat"` or raw HTML `<head>` ordering (that's why Quirks Mode went unnoticed).

### 4.1. Unit Test Suite (Streaming & Edge Cases — Fast, Zero Browser)

Create a standalone unit test (e.g. `tests/unit/importmap-head-injection.test.mjs` or integrate into the existing unit runner) importing `createImportMapTransformStream` from `dinou/core/edge-ssr.js`:

```js
import assert from "node:assert/strict";
import { createImportMapTransformStream } from "../../dinou/core/edge-ssr.js";

const IMPORT_MAP = `<script type="importmap">{"imports":{"src/a.tsx":"/a.js"}}</script>`;

async function pipeChunks(chunks) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(typeof c === "string" ? encoder.encode(c) : c);
      }
      controller.close();
    },
  });
  const transformed = stream.pipeThrough(createImportMapTransformStream(IMPORT_MAP));
  return new Response(transformed).text();
}

// 1. Standard React 19 HTML with multi-byte UTF-8 in <title> + modulepreload before og:*
{
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
  assert.ok(out.indexOf("og:image") < out.indexOf('type="importmap"'), "og:image must precede importmap");
  assert.ok(out.indexOf('type="importmap"') < out.indexOf('rel="modulepreload"'), "importmap must precede modulepreload");
  assert.ok(out.indexOf('rel="modulepreload"') < out.indexOf("</head>"), "modulepreload must stay inside </head>");
  assert.ok(out.includes("<h1>Hola — Dinou 🚀</h1>"), "Body UTF-8 must be preserved");
}

// 2. Chunk split mid-</head> AND mid-3-byte UTF-8 character right after </head>
{
  const encoder = new TextEncoder();
  const part1 = encoder.encode(
    `<!DOCTYPE html><html lang="en"><head><title>A — B</title><link rel="modulepreload" href="/m.js"/><meta property="og:type" content="website"/></he`
  );
  const tailFull = encoder.encode(`ad><body>—🚀</body></html>`);
  const part2 = tailFull.subarray(0, 10); // cuts inside 3-byte em-dash (0xE2 | 0x80 0x94)
  const part3 = tailFull.subarray(10);

  const out = await pipeChunks([part1, part2, part3]);
  assert.equal(
    out,
    `<!DOCTYPE html><html lang="en"><head><title>A — B</title><meta property="og:type" content="website"/>${IMPORT_MAP}<link rel="modulepreload" href="/m.js"/></head><body>—🚀</body></html>`
  );
}

// 3. Tiny 3-byte chunks across entire document
{
  const html = `<!DOCTYPE html><html><head><title>X</title><link rel="modulepreload" href="/m.js"/></head><body>OK</body></html>`;
  const chunks = [];
  for (let i = 0; i < html.length; i += 3) chunks.push(html.slice(i, i + 3));
  const out = await pipeChunks(chunks);
  assert.equal(
    out,
    `<!DOCTYPE html><html><head><title>X</title>${IMPORT_MAP}<link rel="modulepreload" href="/m.js"/></head><body>OK</body></html>`
  );
}

// 4. User <script type="module"> inside <head>
{
  const html = `<!DOCTYPE html><html><head><link rel="modulepreload" href="/a.js"/><meta property="og:title" content="Hi"/><script type="module" src="/user.js"></script></head><body>ok</body></html>`;
  const out = await pipeChunks([html]);
  assert.equal(
    out,
    `<!DOCTYPE html><html><head><meta property="og:title" content="Hi"/>${IMPORT_MAP}<link rel="modulepreload" href="/a.js"/><script type="module" src="/user.js"></script></head><body>ok</body></html>`
  );
}

// 5. `no_layout` bare fragments (<div> and <header> must NOT stall or match <head>)
{
  const outDiv = await pipeChunks([`<div>Bare page</div>`]);
  assert.equal(outDiv, `${IMPORT_MAP}<div>Bare page</div>`);

  const outHeader = await pipeChunks([`<header>Top nav</header><main>Body</main>`]);
  assert.equal(outHeader, `${IMPORT_MAP}<header>Top nav</header><main>Body</main>`);
}

// 6. Document with <body> and no <head>
{
  const out = await pipeChunks([`<!DOCTYPE html><html><body>No head</body></html>`]);
  assert.equal(out, `<!DOCTYPE html><html>${IMPORT_MAP}<body>No head</body></html>`);
}

// 7. Unquoted HTML attributes (rel=modulepreload and type=module)
{
  const html = `<!DOCTYPE html><html><head><link rel=modulepreload href=/a.js><meta property="og:title" content="Hi"><script type=module>import "x"</script></head><body>ok</body></html>`;
  const out = await pipeChunks([html]);
  assert.equal(
    out,
    `<!DOCTYPE html><html><head><meta property="og:title" content="Hi">${IMPORT_MAP}<link rel=modulepreload href=/a.js><script type=module>import "x"</script></head><body>ok</body></html>`
  );
}
```

### 4.2. Playwright / HTTP E2E Assertions (Run Across Esbuild, Rollup & Webpack; Dev, Prod SSG/SSR & PPR)

Add a spec (e.g. `tests/importmap-standards-mode.spec.ts`) or append these assertions to the core rendering/PPR/layout E2E suites:

```ts
import { test, expect } from "@playwright/test";

test.describe("HTML5 Standards Mode & Importmap <head> Ordering", () => {
  test("renders <!DOCTYPE html> at byte 0, Standards Mode (CSS1Compat), and valid <head> tag ordering", async ({
    page,
    request,
    baseURL,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // 1. Raw HTTP HTML structure verification (SSG / SSR / Dev)
    const res = await request.get(`${baseURL}/`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    // DOCTYPE must be at byte 0 (prevents Quirks Mode & HTML5 parse errors)
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);

    const headOpenIdx = html.search(/<head(?:\s[^>]*)?>/i);
    const headCloseIdx = html.search(/<\/head>/i);
    expect(headOpenIdx).toBeGreaterThan(-1);
    expect(headCloseIdx).toBeGreaterThan(headOpenIdx);

    const headHtml = html.slice(headOpenIdx, headCloseIdx);

    // Non-Webpack builds (Esbuild / Rollup) emit <script type="importmap"> strictly inside <head>
    const importMapMatches = html.match(/<script\s+type="importmap">/g) || [];
    if (importMapMatches.length > 0) {
      expect(importMapMatches.length).toBe(1); // Never duplicated
      const importMapIdx = headHtml.indexOf('<script type="importmap">');
      expect(importMapIdx).toBeGreaterThan(-1);

      // All <title> and <meta> tags must appear BEFORE <script type="importmap">
      const lastMetaIdx = Math.max(
        headHtml.lastIndexOf("<meta "),
        headHtml.lastIndexOf("<title>")
      );
      if (lastMetaIdx !== -1) {
        expect(lastMetaIdx).toBeLessThan(importMapIdx);
      }

      // Every <link rel="modulepreload"> in <head> must appear AFTER <script type="importmap">
      const firstModulePreloadIdx = headHtml.search(
        /<link\b[^>]*\brel="modulepreload"/i
      );
      if (firstModulePreloadIdx !== -1) {
        expect(importMapIdx).toBeLessThan(firstModulePreloadIdx);
      }
    }

    // 2. Real browser verification: Standards Mode + zero hydration/importmap errors
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    const compatMode = await page.evaluate(() => document.compatMode);
    expect(compatMode).toBe("CSS1Compat");

    const fatalErrors = consoleErrors.filter((e) =>
      /import map|hydration|418|419|422/i.test(e)
    );
    expect(fatalErrors).toEqual([]);
  });
});
```

#### Additional Quick Assertions to Piggyback on Existing E2E Suites
1. **PPR route test (in existing PPR spec):**
   - Assert `rawPprHtml.startsWith("<!DOCTYPE html>")`.
   - Assert `(rawPprHtml.match(/<script\s+type="importmap">/g) || []).length <= 1` (confirms PPR dynamic holes with `importMapHtml: ""` never inject duplicate import maps).
   - Assert `await page.evaluate(() => document.compatMode) === "CSS1Compat"`.
2. **Dynamic SSR (`revalidate = 0`) route test:**
   - Same raw HTML `startsWith("<!DOCTYPE html>")` + `CSS1Compat` check (verifies streaming SSR path without `waitForAll`).
3. **`no_layout` bare fragment route test (if present in `dinou-e2e`):**
   - Confirm route renders and hydrates cleanly with zero timeout/stall.
4. **Cross-runtime matrix (Node, Bun, Deno, Cloudflare, Netlify, Static Export):**
   - Because all runtimes share `dinou/core/edge-ssr.js`, running the existing GitHub Actions matrix with the spec above automatically verifies all 5 server runtimes + Static Export + all 3 bundlers.

---

## 5. Checklist Before Publishing `dinou@10.0.2`

1. Copy patched `dinou/core/edge-ssr.js` into the `dinou` repository.
2. Add the unit test (`4.1`) and E2E spec (`4.2`) to `dinou-e2e`.
3. Run the full GitHub Actions matrix (Node / Bun / Deno / Cloudflare / Netlify / Static Export × Esbuild / Rollup / Webpack × Dev / Prod).
4. Bump `dinou` to `10.0.2`, update `CHANGELOG.md`, and `npm publish`.
5. In `dinou-docs`: run `npm run uneject`, delete `x-importmap-head-injection-fix.md`, verify `package.json` uses `dinou@^10.0.2`, push & redeploy `dinou.dev`.
