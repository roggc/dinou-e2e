# Changelog — Dinou `10.0.7` (Series Z — Phase 1: Core Production Hardening)

All notable core security, memory-bound, Server Function, DX/HMR, and deployment-adapter fixes uncovered and resolved during Series Z Phase 1 (`z-phase1-tests.md`, Checks `#Z1–#Z5`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [10.0.7] - Unreleased

### Fixed / Hardened

#### HTTP Security & Hardening — CSRF Origin/Host Validation, Body Size DoS Caps, Production Error Sanitization, Open Redirect Prevention & Path/Symlink Confinement (`Stage 2 / Check #Z2`)
- **Fixed Server Function CSRF bypasses, untrusted `X-Forwarded-Host` spoofing, missing `Sec-Fetch-Site` check, and unbounded JSON/multipart body-size DoS risk (`dinou/core/handler.js`)**:
  - Replaced the vulnerable `origin.includes(host)` substring check on `POST /____server_function____` with strict `new URL(origin)` parsing verifying `http:`/`https:` scheme and exact case-insensitive `originUrl.host === expectedHost` equality (closing `https://localhost:3000.evil.com` and `https://evil.com/localhost:3000` bypasses).
  - Stopped blindly trusting `X-Forwarded-Host` by default (preventing external `X-Forwarded-Host: evil.com` + `Origin: https://evil.com` CSRF spoofing); `X-Forwarded-Host` is now honored only when explicitly opted in via `dinou.config` (`security.trustProxy: true` / `trustProxy: true`) or `DINOU_TRUST_PROXY=true`, alongside optional `security.allowedOrigins` / `allowedOrigins` allowlisting.
  - Added production `Sec-Fetch-Site: cross-site` blocking (`403 Forbidden`) unless the `Origin` is explicitly allowlisted.
  - Added streaming `readRequestBodyWithLimit()` enforcing configurable body-size limits (`security.maxServerFunctionBodyBytes` / `maxServerFunctionBodyBytes` / `DINOU_MAX_SERVER_FUNCTION_BODY_BYTES`; safe defaults: `1 MB` JSON, `10 MB` multipart, `64 KB` on `POST /____rsc_payload_error____`) across both declared `Content-Length` headers and chunked streams without `Content-Length`, returning `413 Payload Too Large` without OOM or Undici stream-cancel crashes, and exported `DinouSecurityConfig` on `DinouConfig` in `dinou/index.d.ts`.
- **Fixed production error message & dev-title leakage across Server Functions, `error.tsx`, `@slot/error.tsx`, isolated layout errors, `<DinouCacheSlot>` discovery, emergency HTML fallbacks, and client ErrorBoundary (`dinou/core/handler.js`, `dinou/core/get-error-jsx.js`, `dinou/core/get-jsx.js`, `dinou/core/layout-composition.js`, `dinou/core/cache-slot.js`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`)**:
  - Redacted uncaught Server Function errors in `NODE_ENV=production` to `{ error: "Internal Server Error" }` while continuing to preserve intentional developer errors that attach `err.digest` (or `err.expose === true`).
  - Fixed production error leakage in `get-error-jsx.js` (default fallback, `!error.stack` branch, and `@slot/error.tsx`), `get-jsx.js` (`@slot/error.tsx` and isolated layout error catches), `layout-composition.js` (`renderSingleLayoutLevel` and `SafeParallelSlot` error catches), and `cache-slot.js` (`error.tsx` cold slot discovery).
  - Propagated intentional `err.digest` consistently across SSR, RSC, `POST /____rsc_payload_error____`, `window.__DINOU_ERROR_DIGEST__` bootstrap script, and `client.jsx` / `client-webpack.jsx` hydration (fixing a real `#418` hydration mismatch where `error.digest` rendered on SSR was dropped after client hydration).
  - Replaced hardcoded `<title>Dinou Dev Error</title>` in `handler.js` emergency fallback HTML and `<title>"Dinou Dev Error from client.jsx ErrorBoundary"</title>` in `client.jsx` / `client-webpack.jsx` with `${isDevelopment ? "Dinou Dev Error" : "Application Error"}`.
- **Fixed Open Redirect & XSS-via-Redirect gaps across Server & Client layers (`dinou/core/handler.js`, `dinou/core/server-function-proxy.js`, `dinou/core/server-function-proxy-webpack.js`, `dinou/core/client-redirect.jsx`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`, `dinou/core/ppr-runtime.js`, `dinou/core/navigation-utils.js`)**:
  - Added strict `isSafeRelativeRedirectPath()` / `isSafeExternalHttpUrl()` / `sanitizeRedirectUrl()` validation blocking protocol-relative (`//evil.com`, `///evil.com`), backslash-prefixed (`/\evil.com`, `\/evil.com`), dangerous URI schemes (`javascript:`, `data:`, `vbscript:`), and ASCII control characters (`\r`, `\n`, `\t`, `\0` — preventing CRLF header injection), clamping unsafe redirect targets to `"/"` while preserving legitimate internal routes (`/dashboard?tab=1#top`) and deliberate `http://`/`https://` external navigations (`router.push`, `router.replace`, `<ClientRedirect>`, SSR `res.redirect`).
  - Enforced relative-only redirects in Server Functions (`createServerFunctionContext.res.redirect`, `server-function-proxy.js`, and `server-function-proxy-webpack.js`).
  - Updated `isExternalUrl()` in `navigation-utils.js` to recognize backslash-prefixed paths (`/\`, `\/`) so they are never treated as safe relative routes.
- **Hardened Path Traversal, Real Symlink Escape Confinement & Server Function ID Validation (`dinou/core/static-assets.js`, `dinou/core/storage-adapter.js`, `dinou/core/handler.js`, `dinou/cloudflare/shims/fs.js`)**:
  - Added `fs.realpathSync()` symlink-escape containment inside `resolveConfinedStaticFile()` (with case-insensitive Windows prefix comparison and Cloudflare `shims/fs.js` `realpathSync` parity) and double-encoded traversal rejection (`%252e%252e`, `%255c`, `%2500`, double-encoded dotfiles) in `normalizePublicRequestPath()` and `decodePathSegmentsSafely()`.
  - Added zero-syscall lexical path-confinement (`..`, `\`, `\0`, baseDir prefix guard) in `FileSystemStorage._resolve()`, returning `null`/`false` on `get`/`has`/`getSlotMetadata` and refusing unsafe `set`/`delete` outside `baseDir` while preserving `OPT-4`'s zero-`existsSync` hot path.
  - Hardened `GET /____rsc_slot____/*` against multi-segment traversal (`/____rsc_slot____/slot/extra`), double-encoded slot IDs, and traversal in `x-dinou-current-path` (`400 Bad Request`), and added `decodePathSegmentsSafely()` confinement to `POST /____rsc_payload_error____/*`.
  - Hardened `POST /____server_function____` `id` parsing against null bytes, prototype/empty export names (`__proto__`, `constructor`, `prototype`), percent-encoded traversal (`file:///src/%2e%2e/...`), and `src/` realpath containment.

---

## Tracking Log by Stage

| # | Stage / Check | Hardening Summary | Core Files Modified | Verification |
| :-: | --- | --- | --- | --- |
| 1 | Stage 2 (`#Z2` — HTTP Security & Hardening) | Exact `URL.host` CSRF Origin validation, opt-in `trustProxy` / `allowedOrigins`, `Sec-Fetch-Site: cross-site` block, streaming JSON/multipart `413` body-size caps; production error redaction across Server Functions, `error.tsx`, `@slot/error.tsx`, layout errors, slot discovery & client hydration `window.__DINOU_ERROR_DIGEST__` parity (`#418` fix); Open Redirect & XSS-via-Redirect validation (`//`, `/\`, `javascript:`, `data:`, CRLF) across server/client/proxies/PPR; real symlink containment in `resolveConfinedStaticFile`, lexical confinement in `FileSystemStorage._resolve`, double-encoded traversal & Server Function ID hardening | `handler.js`, `static-assets.js`, `storage-adapter.js`, `get-error-jsx.js`, `get-jsx.js`, `layout-composition.js`, `cache-slot.js`, `ppr-runtime.js`, `server-function-proxy.js`, `server-function-proxy-webpack.js`, `client-redirect.jsx`, `client.jsx`, `client-webpack.jsx`, `navigation-utils.js`, `cloudflare/shims/fs.js` | `tests/unit/security-hardening.test.mjs` (4/4), `test:ssr-server-refs`, `test:public-assets`, full `npm run test:unit` (115/115), Playwright Chromium production E2E (`20/20`, incl. `/t-z-security`, `/t-api-ref-nav`, `/t-type-safe-contextual`, `/t-ssr-server-refs`) |
