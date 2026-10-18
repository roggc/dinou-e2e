import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Core framework modules
import { resolveLayoutFunctionsConfig } from "../dinou/core/layout-functions.js";
import { resolvePageFunctionsConfig } from "../dinou/core/handler.js";
import { resolveModulePpr } from "../dinou/core/resolve-module-ppr.js";
import parseExports from "../dinou/core/parse-exports.js";
import { isDynamicRoute } from "../dinou/core/build-static-pages.js";
import importModule from "../dinou/core/import-module.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures-duality");

test.before(() => {
  if (fs.existsSync(fixturesDir)) {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(fixturesDir, { recursive: true });
});

test.after(() => {
  if (fs.existsSync(fixturesDir)) {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }
});

// ====================================================================
// 1. LAYOUT FUNCTIONS - FUNCTION INVOCATION
// ====================================================================
test("layout_functions: 5 contracts defined as FUNCTIONS (sync & async)", async () => {
  const dir = path.join(fixturesDir, "layout-fn");
  fs.mkdirSync(dir, { recursive: true });

  const code = `
    exports.ppr = async function ppr() {
      return true;
    };
    exports.revalidate = function revalidate() {
      return 120;
    };
    exports.getCacheTags = async function getCacheTags(params) {
      return ["layout-tag-" + (params?.tenant || "root")];
    };
    exports.getStaticPaths = async function getStaticPaths() {
      return ["tenant-1", "tenant-2"];
    };
    exports.allowISG = function allowISG() {
      return false;
    };
  `;
  fs.writeFileSync(path.join(dir, "layout_functions.js"), code, "utf8");

  const config = await resolveLayoutFunctionsConfig(dir, { tenant: "acme" });

  assert.strictEqual(config.ppr, true, "ppr function should resolve to true");
  assert.strictEqual(config.revalidate, 120, "revalidate function should resolve to 120");
  assert.strictEqual(config.isDynamic, false, "revalidate 120 is not dynamic");
  assert.deepStrictEqual(config.tags, ["layout-tag-acme"], "getCacheTags function should receive params and resolve tags");
  assert.ok(config.staticPathsSet instanceof Set, "staticPathsSet should be a Set");
  assert.ok(config.staticPathsSet.has("tenant-1") && config.staticPathsSet.has("tenant-2"), "staticPathsSet contains paths");
  assert.strictEqual(config.allowISG, false, "allowISG function should resolve to false");
});

// ====================================================================
// 2. LAYOUT FUNCTIONS - VALUE / CONSTANT INVOCATION
// ====================================================================
test("layout_functions: 5 contracts defined as VALUES / CONSTANTS", async () => {
  const dir = path.join(fixturesDir, "layout-val");
  fs.mkdirSync(dir, { recursive: true });

  const code = `
    exports.ppr = false;
    exports.revalidate = 45;
    exports.getCacheTags = ["global-layout", "marketing"];
    exports.getStaticPaths = [{ tenant: "t1" }, { tenant: "t2" }];
    exports.allowISG = true;
  `;
  fs.writeFileSync(path.join(dir, "layout_functions.js"), code, "utf8");

  const config = await resolveLayoutFunctionsConfig(dir, { tenant: "t1" });

  assert.strictEqual(config.ppr, false, "ppr constant should be false");
  assert.strictEqual(config.revalidate, 45, "revalidate constant should be 45");
  assert.strictEqual(config.isDynamic, false, "revalidate 45 is not dynamic");
  assert.deepStrictEqual(config.tags, ["global-layout", "marketing"], "getCacheTags constant array should be preserved");
  assert.ok(config.staticPathsSet instanceof Set, "staticPathsSet should be a Set");
  assert.strictEqual(config.allowISG, true, "allowISG constant should be true");
});

// ====================================================================
// 3. PAGE FUNCTIONS - FUNCTION INVOCATION
// ====================================================================
test("page_functions: 5 contracts defined as FUNCTIONS (sync & async)", async () => {
  const dir = path.join(fixturesDir, "page-fn");
  fs.mkdirSync(dir, { recursive: true });

  const code = `
    exports.ppr = function ppr() {
      return true;
    };
    exports.revalidate = function revalidate() {
      return 0; // Dynamic SSR
    };
    exports.getCacheTags = function getCacheTags(params) {
      return ["post-" + (params?.id || "default")];
    };
    exports.getStaticPaths = async function getStaticPaths() {
      return ["post-100", "post-200"];
    };
    exports.allowISG = async function allowISG() {
      return false;
    };
  `;
  fs.writeFileSync(path.join(dir, "page_functions.js"), code, "utf8");
  fs.writeFileSync(path.join(dir, "page.js"), "module.exports = () => null;", "utf8");

  const pagePath = path.join(dir, "page.js");
  const result = await resolvePageFunctionsConfig(
    pagePath,
    [],
    {},
    { id: "100" },
    "/page-fn"
  );

  assert.strictEqual(result.ppr, true, "ppr function should resolve to true");
  assert.strictEqual(result.revalidate, 0, "revalidate function should resolve to 0");
  assert.strictEqual(result.isDynamicConfig, true, "revalidate 0 should mark route as dynamic");
  assert.deepStrictEqual(result.tags, ["post-100"], "getCacheTags function should receive dynamicParams");
  assert.strictEqual(result.allowISGValue, false, "allowISG function should resolve to false");
});

// ====================================================================
// 4. PAGE FUNCTIONS - VALUE / CONSTANT INVOCATION
// ====================================================================
test("page_functions: 5 contracts defined as VALUES / CONSTANTS", async () => {
  const dir = path.join(fixturesDir, "page-val");
  fs.mkdirSync(dir, { recursive: true });

  const code = `
    exports.ppr = true;
    exports.revalidate = 300;
    exports.getCacheTags = ["catalog", "articles"];
    exports.getStaticPaths = ["item-a", "item-b"];
    exports.allowISG = true;
  `;
  fs.writeFileSync(path.join(dir, "page_functions.js"), code, "utf8");
  fs.writeFileSync(path.join(dir, "page.js"), "module.exports = () => null;", "utf8");

  const pagePath = path.join(dir, "page.js");
  const result = await resolvePageFunctionsConfig(
    pagePath,
    [],
    {},
    { slug: "item-a" },
    "/page-val"
  );

  assert.strictEqual(result.ppr, true, "ppr constant should be true");
  assert.strictEqual(result.revalidate, 300, "revalidate constant should be 300");
  assert.strictEqual(result.isDynamicConfig, false, "revalidate 300 is not dynamic");
  assert.deepStrictEqual(result.tags, ["catalog", "articles"], "getCacheTags constant array should be preserved");
  assert.strictEqual(result.allowISGValue, true, "allowISG constant should be true");
});

// ====================================================================
// 5. DEFAULT EXPORT DUALITY (page_functions & layout_functions)
// ====================================================================
test("layout_functions & page_functions: support contracts inside default export", async () => {
  const dir = path.join(fixturesDir, "default-exports");
  fs.mkdirSync(dir, { recursive: true });

  const code = `
    module.exports = {
      default: {
        ppr: () => true,
        revalidate: 60,
        getCacheTags: ["def-tag"],
        getStaticPaths: () => ["p1", "p2"],
        allowISG: false,
      }
    };
  `;
  fs.writeFileSync(path.join(dir, "layout_functions.js"), code, "utf8");
  fs.writeFileSync(path.join(dir, "page_functions.js"), code, "utf8");
  fs.writeFileSync(path.join(dir, "page.js"), "module.exports = () => null;", "utf8");

  // Layout check
  const lConfig = await resolveLayoutFunctionsConfig(dir, {});
  assert.strictEqual(lConfig.ppr, true, "layout default export: ppr");
  assert.strictEqual(lConfig.revalidate, 60, "layout default export: revalidate");
  assert.deepStrictEqual(lConfig.tags, ["def-tag"], "layout default export: tags");
  assert.ok(lConfig.staticPathsSet.has("p1"), "layout default export: staticPaths");
  assert.strictEqual(lConfig.allowISG, false, "layout default export: allowISG");

  // Page check
  const pResult = await resolvePageFunctionsConfig(
    path.join(dir, "page.js"),
    [],
    {},
    {},
    "/default-exports"
  );
  assert.strictEqual(pResult.ppr, true, "page default export: ppr");
  assert.strictEqual(pResult.revalidate, 60, "page default export: revalidate");
  assert.deepStrictEqual(pResult.tags, ["def-tag"], "page default export: tags");
  assert.strictEqual(pResult.allowISGValue, false, "page default export: allowISG");
});

// ====================================================================
// 6. DIRECT UNIT TEST: resolveModulePpr duality
// ====================================================================
test("resolveModulePpr handles both function and constant correctly", async () => {
  // Constant booleans
  assert.strictEqual(await resolveModulePpr({ ppr: true }), true);
  assert.strictEqual(await resolveModulePpr({ ppr: false }), false);
  assert.strictEqual(await resolveModulePpr({ default: { ppr: true } }), true);

  // Functions (sync and async)
  assert.strictEqual(await resolveModulePpr({ ppr: () => true }), true);
  assert.strictEqual(await resolveModulePpr({ ppr: () => false }), false);
  assert.strictEqual(await resolveModulePpr({ ppr: async () => true }), true);
  assert.strictEqual(await resolveModulePpr({ ppr: async () => false }), false);
  assert.strictEqual(await resolveModulePpr({ default: { ppr: async () => true } }), true);

  // Undefined or missing
  assert.strictEqual(await resolveModulePpr({}), null);
  assert.strictEqual(await resolveModulePpr(null), null);
});

// ====================================================================
// 7. AST STATIC PARSER: parseExports.parsePprConfig duality
// ====================================================================
test("parsePprConfig parses both constant and function declarations", () => {
  // Constant
  assert.strictEqual(parseExports.parsePprConfig("export const ppr = true;"), true);
  assert.strictEqual(parseExports.parsePprConfig("export const ppr = false;"), false);

  // Function
  assert.strictEqual(parseExports.parsePprConfig("export function ppr() { return true; }"), true);
  assert.strictEqual(parseExports.parsePprConfig("export function ppr() { return false; }"), false);

  // Arrow function
  assert.strictEqual(parseExports.parsePprConfig("export const ppr = () => true;"), true);
  assert.strictEqual(parseExports.parsePprConfig("export const ppr = () => false;"), false);
});

// ====================================================================
// 8. DIRECT UNIT TEST: isDynamicRoute duality (revalidate)
// ====================================================================
test("isDynamicRoute evaluates revalidate as value, sync fn, and async fn", async () => {


  // Dynamic (< 1)
  assert.strictEqual(await isDynamicRoute(0), true, "revalidate 0 is dynamic");
  assert.strictEqual(await isDynamicRoute(() => 0), true, "revalidate () => 0 is dynamic");
  assert.strictEqual(await isDynamicRoute(async () => 0), true, "revalidate async () => 0 is dynamic");
  assert.strictEqual(await isDynamicRoute(-1), true, "revalidate -1 is dynamic");

  // Static / ISR (>= 1)
  assert.strictEqual(await isDynamicRoute(60), false, "revalidate 60 is static ISR");
  assert.strictEqual(await isDynamicRoute(() => 60), false, "revalidate () => 60 is static ISR");
  assert.strictEqual(await isDynamicRoute(async () => 120), false, "revalidate async () => 120 is static ISR");

  // Static forever (false or undefined)
  assert.strictEqual(await isDynamicRoute(false), false, "revalidate false is static forever");
  assert.strictEqual(await isDynamicRoute(() => false), false, "revalidate () => false is static forever");
  assert.strictEqual(await isDynamicRoute(undefined), false, "revalidate undefined is static default");
});

// ====================================================================
// 9. ISG BLOCKING: allowISG (function vs constant) blocks ungenerated paths
// ====================================================================
test("allowISG blocks ungenerated paths when false (both as fn and const)", async () => {
  // Test with function: allowISG = () => false
  const dirFn = path.join(fixturesDir, "isg-fn");
  fs.mkdirSync(dirFn, { recursive: true });
  fs.writeFileSync(
    path.join(dirFn, "page_functions.js"),
    `
      exports.getStaticPaths = () => ["valid-slug"];
      exports.allowISG = () => false;
    `,
    "utf8"
  );
  fs.writeFileSync(path.join(dirFn, "page.js"), "module.exports = () => null;", "utf8");

  // Valid path should NOT be blocked
  const resValidFn = await resolvePageFunctionsConfig(
    path.join(dirFn, "page.js"),
    [],
    {},
    { slug: "valid-slug" },
    "/isg-fn"
  );
  assert.strictEqual(resValidFn.isPathBlocked, false, "valid static path is allowed");

  // Invalid path SHOULD be blocked
  const resInvalidFn = await resolvePageFunctionsConfig(
    path.join(dirFn, "page.js"),
    [],
    {},
    { slug: "unlisted-slug" },
    "/isg-fn"
  );
  assert.strictEqual(resInvalidFn.isPathBlocked, true, "unlisted path is blocked when allowISG() is false");

  // Test with constant: allowISG = false
  const dirConst = path.join(fixturesDir, "isg-const");
  fs.mkdirSync(dirConst, { recursive: true });
  fs.writeFileSync(
    path.join(dirConst, "page_functions.js"),
    `
      exports.getStaticPaths = ["known-id"];
      exports.allowISG = false;
    `,
    "utf8"
  );
  fs.writeFileSync(path.join(dirConst, "page.js"), "module.exports = () => null;", "utf8");

  const resValidConst = await resolvePageFunctionsConfig(
    path.join(dirConst, "page.js"),
    [],
    {},
    { id: "known-id" },
    "/isg-const"
  );
  assert.strictEqual(resValidConst.isPathBlocked, false, "valid static path is allowed with constant allowISG");

  const resInvalidConst = await resolvePageFunctionsConfig(
    path.join(dirConst, "page.js"),
    [],
    {},
    { id: "unknown-id" },
    "/isg-const"
  );
  assert.strictEqual(resInvalidConst.isPathBlocked, true, "unlisted path is blocked with constant allowISG = false");
});

// ====================================================================
// 10. EXACT USER PATTERN: PageFunctions / LayoutFunctions object with export default
// ====================================================================
test("exact user pattern: PageFunctions & LayoutFunctions as export default object", async () => {
  const dir = path.join(fixturesDir, "user-pattern");
  fs.mkdirSync(dir, { recursive: true });

  const rawTsCode = `
    const pageConfig: PageFunctions<BlogParams, BlogPageProps> = {
      ppr: true,
      revalidate: 60,
      getStaticPaths: ["welcome", "announcement"],
      getProps: async (params) => {
        return { post: { title: "Dinou Guide" }, views: 100 };
      },
      validateParams: (params) => Boolean(params?.slug),
      getCacheTags: (params) => ["blog", "post-" + params?.slug],
    };
    export default pageConfig;
  `;

  // 1. Check static AST parser on the raw TypeScript code
  const parsedPpr = parseExports.parsePprConfig(rawTsCode);
  assert.strictEqual(parsedPpr, true, "parsePprConfig should detect ppr: true in export default pageConfig");

  // 2. Check runtime resolution
  const runtimeCode = `
    const pageConfig = {
      ppr: true,
      revalidate: 60,
      getStaticPaths: ["welcome", "announcement"],
      getProps: async (params) => {
        return { post: { title: "Dinou Guide" }, views: 100 };
      },
      validateParams: (params) => Boolean(params?.slug),
      getCacheTags: (params) => ["blog", "post-" + params?.slug],
    };
    module.exports = { default: pageConfig };
  `;
  fs.writeFileSync(path.join(dir, "page_functions.js"), runtimeCode, "utf8");
  fs.writeFileSync(path.join(dir, "layout_functions.js"), runtimeCode, "utf8");
  fs.writeFileSync(path.join(dir, "page.js"), "module.exports = () => null;", "utf8");

  // PageFunctions check
  const pResult = await resolvePageFunctionsConfig(
    path.join(dir, "page.js"),
    [],
    {},
    { slug: "welcome" },
    "/user-pattern"
  );
  assert.strictEqual(pResult.ppr, true, "pageConfig.ppr should be true");
  assert.strictEqual(pResult.revalidate, 60, "pageConfig.revalidate should be 60");
  assert.strictEqual(pResult.isDynamicConfig, false, "revalidate 60 is static");
  assert.deepStrictEqual(pResult.tags, ["blog", "post-welcome"], "pageConfig.getCacheTags with dynamicParams");
  assert.ok(pResult.staticPathsSet.has("welcome"), "pageConfig.getStaticPaths contains welcome");
  assert.strictEqual(pResult.isPathBlocked, false, "pageConfig.validateParams returns true for welcome");

  // Invalid param check
  const pBlocked = await resolvePageFunctionsConfig(
    path.join(dir, "page.js"),
    [],
    {},
    { slug: "" },
    "/user-pattern"
  );
  assert.strictEqual(pBlocked.isPathBlocked, true, "pageConfig.validateParams returns false for empty slug");

  // LayoutFunctions check
  const lConfig = await resolveLayoutFunctionsConfig(dir, { slug: "welcome" });
  assert.strictEqual(lConfig.ppr, true, "layoutConfig.ppr should be true");
  assert.strictEqual(lConfig.revalidate, 60, "layoutConfig.revalidate should be 60");
  assert.deepStrictEqual(lConfig.tags, ["blog", "post-welcome"], "layoutConfig.tags");
  assert.ok(typeof lConfig.getProps === "function", "layoutConfig.getProps is a function");
  const layoutProps = await lConfig.getProps({ slug: "welcome" });
  assert.deepStrictEqual(layoutProps, { post: { title: "Dinou Guide" }, views: 100 });

  // Page getProps loader check (used by get-jsx and build-static-pages)
  const pfModule = await importModule(path.join(dir, "page_functions.js"));
  const defaultExport = pfModule.default?.default ? pfModule.default.default : pfModule.default;
  const pageGetProps = pfModule.getProps || defaultExport?.getProps;
  assert.ok(typeof pageGetProps === "function", "pageConfig.getProps is accessible via default export");
  const pageProps = await pageGetProps({ slug: "welcome" });
  assert.deepStrictEqual(pageProps, { post: { title: "Dinou Guide" }, views: 100 });
});

// ====================================================================
// 11. NATIVE ESM USER PATTERN: PageFunctions & LayoutFunctions as .mjs with export default
// ====================================================================
test("native ESM pattern: PageFunctions & LayoutFunctions as .mjs with export default", async () => {
  const dir = path.join(fixturesDir, "esm-pattern");
  fs.mkdirSync(dir, { recursive: true });

  const esmCode = `
    const pageConfig = {
      ppr: true,
      revalidate: 120,
      getStaticPaths: ["doc-1", "doc-2"],
      getProps: async (params) => ({ title: "ESM Post", id: params?.id }),
      validateParams: (params) => Boolean(params?.id),
      getCacheTags: (params) => ["docs", "doc-" + params?.id],
    };
    export default pageConfig;
  `;
  fs.writeFileSync(path.join(dir, "page_functions.mjs"), esmCode, "utf8");
  fs.writeFileSync(path.join(dir, "layout_functions.mjs"), esmCode, "utf8");
  fs.writeFileSync(path.join(dir, "page.mjs"), "export default () => null;", "utf8");

  // PageFunctions check
  const pResult = await resolvePageFunctionsConfig(
    path.join(dir, "page.mjs"),
    [],
    {},
    { id: "doc-1" },
    "/esm-pattern"
  );
  assert.strictEqual(pResult.ppr, true, "esm pageConfig.ppr should be true");
  assert.strictEqual(pResult.revalidate, 120, "esm pageConfig.revalidate should be 120");
  assert.strictEqual(pResult.isDynamicConfig, false, "revalidate 120 is static");
  assert.deepStrictEqual(pResult.tags, ["docs", "doc-doc-1"], "esm pageConfig.getCacheTags with dynamicParams");
  assert.ok(pResult.staticPathsSet.has("doc-1"), "esm pageConfig.getStaticPaths contains doc-1");
  assert.strictEqual(pResult.isPathBlocked, false, "esm pageConfig.validateParams returns true for doc-1");

  // LayoutFunctions check
  const lConfig = await resolveLayoutFunctionsConfig(dir, { id: "doc-1" });
  assert.strictEqual(lConfig.ppr, true, "esm layoutConfig.ppr should be true");
  assert.strictEqual(lConfig.revalidate, 120, "esm layoutConfig.revalidate should be 120");
  assert.deepStrictEqual(lConfig.tags, ["docs", "doc-doc-1"], "esm layoutConfig.tags");
  assert.ok(typeof lConfig.getProps === "function", "esm layoutConfig.getProps is a function");
  const layoutProps = await lConfig.getProps({ id: "doc-1" });
  assert.deepStrictEqual(layoutProps, { title: "ESM Post", id: "doc-1" });
});



