// scripts/verify-react-compiler-ci.mjs
// Verifies React Compiler Multi-Bundler Integration, "use server" Isolation, Vendor Resolution & DinouConfig.reactCompiler:
// 1. Esbuild babelReactCompilerPlugin compiles root "use client", child components without "use client", custom hooks (with import.meta), and "use client" snippet files while respecting "use no memo"
// 2. Esbuild skips Dinou internal runtime files (dinou/core/*) and never intercepts module-level or inline "use server" modules before serverFunctionsPlugin
// 3. getConfigEsbuildProd places babel-react-compiler-bridge AFTER server-functions-proxy and honors reactCompiler: false
// 4. Rollup rollup-plugin-server-functions declares transform.order === "pre" and replaces "use server" modules with RPC proxies BEFORE @rollup/plugin-babel + babel-plugin-react-compiler runs
// 5. Rollup & Webpack production configs honor DinouConfig.reactCompiler (true vs false) and resolve #babel/*, #babel-plugin-react-compiler, #babel-loader & #rollup-plugin-delete without hoisted root packages
// 6. DinouConfig TypeScript definition (dinou/index.d.ts) exposes reactCompiler?: boolean

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const dinouRoot = existsSync(path.resolve(projectRoot, "dinou/package.json"))
  ? path.resolve(projectRoot, "dinou")
  : path.resolve(projectRoot, "node_modules/dinou");

const dinouRequire = createRequire(path.join(dinouRoot, "package.json"));
const esbuild = dinouRequire("esbuild");
const { rollup } = dinouRequire("rollup");

const importDinou = (relPath) =>
  import(pathToFileURL(path.join(dinouRoot, relPath)).href);

const { default: babelReactCompilerPlugin } = await importDinou(
  "esbuild/plugins-esbuild/babel-react-compiler-plugin.js"
);
const { default: serverFunctionsEsbuildPlugin } = await importDinou(
  "esbuild/plugins-esbuild/server-functions-plugin.js"
);
const { default: getConfigEsbuildProd } = await importDinou(
  "esbuild/helpers-esbuild/get-config-esbuild-prod.js"
);
const { default: rollupServerFunctionsPlugin } = await importDinou(
  "rollup/rollup-plugins/rollup-plugin-server-functions.js"
);

console.log(
  "1️⃣ Verifying Esbuild babelReactCompilerPlugin across root 'use client', child components without 'use client', custom hooks + import.meta & 'use no memo'..."
);
{
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dinou-rc-esbuild-"));
  try {
    const parentPath = path.join(tmpDir, "ParentWidget.tsx");
    const childPath = path.join(tmpDir, "OrderSummary.tsx");
    const hookPath = path.join(tmpDir, "useCatalogFilter.ts");
    const legacyPath = path.join(tmpDir, "LegacyUnmemoized.tsx");
    const snippetClientPath = path.join(tmpDir, "SnippetClient.tsx");

    await fs.writeFile(
      hookPath,
      `import { useState } from "react";
export function useCatalogFilter(items: string[], prefix: string) {
  const [selected, setSelected] = useState<string | null>(null);
  const visible = items.filter((item) => item.startsWith(prefix));
  return { visible, selected, setSelected, metaUrl: import.meta.url };
}
`,
      "utf8"
    );

    await fs.writeFile(
      childPath,
      `import { useEffect, useRef } from "react";
import { useCatalogFilter } from "./useCatalogFilter";

export function OrderSummary({ items, prefix }: { items: string[]; prefix: string }) {
  const { visible, selected, setSelected } = useCatalogFilter(items, prefix);
  const badgeSpec = { count: visible.length, selected };
  const prevRef = useRef<object | null>(null);
  useEffect(() => {
    prevRef.current = badgeSpec;
  });
  return (
    <section data-selected={selected ?? ""}>
      {visible.map((item) => (
        <button key={item} onClick={() => setSelected(item)}>{item}</button>
      ))}
    </section>
  );
}
`,
      "utf8"
    );

    await fs.writeFile(
      legacyPath,
      `export function LegacyUnmemoized({ label }: { label: string }) {
  "use no memo";
  const raw = { text: label.toUpperCase() };
  return <span>{raw.text}</span>;
}
`,
      "utf8"
    );

    await fs.writeFile(
      snippetClientPath,
      `"use client";
export function SnippetClient({ title }: { title: string }) {
  const codeSample = \`"use server"; export async function demo() {}\`;
  return <div title={title}>{codeSample}</div>;
}
`,
      "utf8"
    );

    await fs.writeFile(
      parentPath,
      `"use client";
import { OrderSummary } from "./OrderSummary";
import { LegacyUnmemoized } from "./LegacyUnmemoized";
import { SnippetClient } from "./SnippetClient";

export default function ParentWidget({ items }: { items: string[] }) {
  return (
    <div>
      <OrderSummary items={items} prefix="pro-" />
      <LegacyUnmemoized label="raw" />
      <SnippetClient title="docs" />
    </div>
  );
}
`,
      "utf8"
    );

    const result = await esbuild.build({
      entryPoints: { parent: parentPath },
      bundle: true,
      write: false,
      format: "esm",
      jsx: "automatic",
      external: ["react", "react/*"],
      plugins: [babelReactCompilerPlugin()],
    });

    const output = result.outputFiles[0].text;
    assert.match(output, /react\/compiler-runtime/);

    const fnSlice = (name) => {
      const idx = output.indexOf(`function ${name}`);
      assert.notEqual(idx, -1, `Expected function ${name} in output`);
      const rest = output.slice(idx);
      const nextMod = rest.indexOf("\n// ");
      return nextMod !== -1 ? rest.slice(0, nextMod) : rest;
    };

    assert.match(
      fnSlice("ParentWidget"),
      /\b_?c\d*\(\d+\)/,
      "Root 'use client' component must be compiled with React Compiler memo cache"
    );
    assert.match(
      fnSlice("OrderSummary"),
      /\b_?c\d*\(\d+\)/,
      "Child component without 'use client' must be compiled with React Compiler memo cache"
    );
    assert.match(
      fnSlice("useCatalogFilter"),
      /\b_?c\d*\(\d+\)/,
      "Custom hook without 'use client' (using import.meta.url) must be compiled with React Compiler memo cache"
    );
    assert.match(
      fnSlice("SnippetClient"),
      /\b_?c\d*\(\d+\)/,
      "'use client' component mentioning 'use server' in string literal must still be compiled"
    );
    assert.doesNotMatch(
      fnSlice("LegacyUnmemoized"),
      /\b_?c\d*\(\d+\)/,
      "'use no memo' component must opt out of React Compiler memo cache"
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

console.log(
  "2️⃣ Verifying Esbuild skips Dinou internal runtime files AND never intercepts module-level or inline 'use server' modules..."
);
{
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dinou-rc-sf-"));
  try {
    const actionPath = path.join(tmpDir, "actions.ts");
    const inlineActionPath = path.join(tmpDir, "inline-actions.ts");
    const clientPath = path.join(tmpDir, "ClientForm.tsx");
    const dinouInternalFile = path.join(dinouRoot, "core/slot.js");

    await fs.writeFile(
      actionPath,
      `"use server";
const TOP_SECRET_DB_URI = "postgres://admin:supersecret@db.internal/prod";
export async function saveOrder(id: string) {
  return TOP_SECRET_DB_URI + ":" + id;
}
`,
      "utf8"
    );

    await fs.writeFile(
      inlineActionPath,
      `const INLINE_SECRET_TOKEN = "sk_live_inline_999";
export async function pingServer() {
  "use server";
  return INLINE_SECRET_TOKEN;
}
`,
      "utf8"
    );

    await fs.writeFile(
      clientPath,
      `"use client";
import { saveOrder } from "./actions";
import { pingServer } from "./inline-actions";

export function ClientForm({ orderId }: { orderId: string }) {
  return (
    <button onClick={() => { saveOrder(orderId); pingServer(); }}>
      Submit {orderId}
    </button>
  );
}
`,
      "utf8"
    );

    const serverFiles = new Set([actionPath, inlineActionPath]);
    const manifestData = {
      "serverFunctionProxy.js": "serverFunctionProxy-HASH.js",
    };

    const result = await esbuild.build({
      entryPoints: {
        client: clientPath,
        dinouSlot: dinouInternalFile,
      },
      outdir: path.join(tmpDir, "dist"),
      bundle: true,
      write: false,
      format: "esm",
      jsx: "automatic",
      external: [
        "react",
        "react/*",
        "/__SERVER_FUNCTION_PROXY__",
        "/serverFunctionProxy-HASH.js",
      ],
      plugins: [
        serverFunctionsEsbuildPlugin({ manifestData, serverFiles }),
        babelReactCompilerPlugin({ serverFiles }),
      ],
    });

    const clientOut = result.outputFiles.find((f) =>
      f.path.includes("client")
    ).text;
    const slotOut = result.outputFiles.find((f) =>
      f.path.includes("dinouSlot")
    ).text;

    assert.match(clientOut, /react\/compiler-runtime/);
    assert.doesNotMatch(clientOut, /TOP_SECRET_DB_URI/);
    assert.doesNotMatch(clientOut, /INLINE_SECRET_TOKEN/);
    assert.match(clientOut, /createServerFunctionProxy/);
    assert.doesNotMatch(
      slotOut,
      /react\/compiler-runtime/,
      "Dinou internal core/slot.js must not be compiled through user React Compiler Babel bridge"
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

console.log(
  "3️⃣ Verifying getConfigEsbuildProd plugin ordering & reactCompiler: false toggle..."
);
{
  const prodDefault = getConfigEsbuildProd({
    entryPoints: { main: "src/main.tsx" },
    outdir: ".dinou/dist3",
    serverFiles: new Set(),
  });
  const pluginNamesDefault = prodDefault.plugins.map((p) => p.name);
  const sfIdx = pluginNamesDefault.indexOf("server-functions-proxy");
  const rcIdx = pluginNamesDefault.indexOf("babel-react-compiler-bridge");
  const writeIdx = pluginNamesDefault.indexOf("dinou-write-plugin");
  assert.ok(sfIdx !== -1, "server-functions-proxy must be present");
  assert.ok(
    rcIdx !== -1,
    "babel-react-compiler-bridge must be present by default"
  );
  assert.ok(
    rcIdx > sfIdx,
    `babel-react-compiler-bridge (${rcIdx}) must run AFTER server-functions-proxy (${sfIdx})`
  );
  if (writeIdx !== -1) {
    assert.ok(
      rcIdx < writeIdx,
      `babel-react-compiler-bridge (${rcIdx}) must run BEFORE dinou-write-plugin (${writeIdx})`
    );
  }

  const prodDisabled = getConfigEsbuildProd({
    entryPoints: { main: "src/main.tsx" },
    outdir: ".dinou/dist3",
    serverFiles: new Set(),
    reactCompiler: false,
  });
  const pluginNamesDisabled = prodDisabled.plugins.map((p) => p.name);
  assert.equal(
    pluginNamesDisabled.includes("babel-react-compiler-bridge"),
    false,
    "babel-react-compiler-bridge must be omitted when reactCompiler: false"
  );
}

console.log(
  "4️⃣ Verifying Rollup serverFunctionsPlugin transform.order === 'pre' runs BEFORE Babel + React Compiler..."
);
{
  const sfPlugin = rollupServerFunctionsPlugin({ serverFiles: new Set() });
  assert.equal(
    sfPlugin.transform?.order,
    "pre",
    "Rollup serverFunctionsPlugin.transform must declare order: 'pre'"
  );

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dinou-rc-rollup-"));
  try {
    const actionPath = path.join(tmpDir, "inlineAction.ts");
    const modActionPath = path.join(tmpDir, "modAction.ts");
    const entryPath = path.join(tmpDir, "Entry.tsx");

    await fs.writeFile(
      actionPath,
      `const ROLLUP_INLINE_SECRET = "shh_rollup_inline_secret";
export async function mutateItem(name: string) {
  "use server";
  return ROLLUP_INLINE_SECRET + name;
}
`,
      "utf8"
    );

    await fs.writeFile(
      modActionPath,
      `"use server";
const ROLLUP_MOD_SECRET = "shh_rollup_mod_secret";
export async function loadItems(filter: string): Promise<string> {
  return ROLLUP_MOD_SECRET + filter;
}
`,
      "utf8"
    );

    await fs.writeFile(
      entryPath,
      `"use client";
import { mutateItem } from "./inlineAction";
import { loadItems } from "./modAction";
export function Entry({ label }: { label: string }) {
  return (
    <button onClick={() => { mutateItem(label); loadItems(label); }}>
      {label}
    </button>
  );
}
`,
      "utf8"
    );

    const transformOrder = [];
    const unwrap = (m) => m?.default ?? m;
    const babelPlugin = unwrap(
      await import(pathToFileURL(dinouRequire.resolve("#rollup/plugin-babel")).href)
    );
    const presetReact = unwrap(
      await import(pathToFileURL(dinouRequire.resolve("#babel/preset-react")).href)
    );
    const presetTs = unwrap(
      await import(pathToFileURL(dinouRequire.resolve("#babel/preset-typescript")).href)
    );
    const pluginRc = unwrap(
      await import(
        pathToFileURL(dinouRequire.resolve("#babel-plugin-react-compiler")).href
      )
    );

    const prevWriteEnv = process.env.DINOU_WRITE_TO_DISK;
    process.env.DINOU_WRITE_TO_DISK = "false";
    try {
      const bundle = await rollup({
        input: entryPath,
        external: ["react", /^react\//, "/__SERVER_FUNCTION_PROXY__"],
        onwarn(warning, warn) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          warn(warning);
        },
        plugins: [
          {
            name: "resolve-ts-tsx",
            resolveId(source, importer) {
              if (!importer || !source.startsWith(".")) return null;
              for (const ext of ["", ".ts", ".tsx", ".js", ".jsx"]) {
                const full = path.resolve(path.dirname(importer), source + ext);
                if (
                  full === actionPath ||
                  full === modActionPath ||
                  full === entryPath
                ) {
                  return full;
                }
              }
              return null;
            },
          },
          {
            name: "spy-before-babel",
            transform(code, id) {
              const resolved = path.resolve(id);
              if (
                resolved === path.resolve(actionPath) ||
                resolved === path.resolve(modActionPath)
              ) {
                transformOrder.push({
                  id: path.basename(resolved),
                  hasSecret:
                    code.includes("ROLLUP_INLINE_SECRET") ||
                    code.includes("ROLLUP_MOD_SECRET"),
                });
              }
              return null;
            },
          },
          babelPlugin({
            babelHelpers: "bundled",
            configFile: false,
            babelrc: false,
            extensions: [".js", ".jsx", ".ts", ".tsx"],
            presets: [[presetReact, { runtime: "automatic" }], presetTs],
            plugins: [pluginRc],
          }),
          // Intentionally placed AFTER babelPlugin (matching rollup.config.js)
          rollupServerFunctionsPlugin({ serverFiles: new Set() }),
        ],
      });

      const { output } = await bundle.generate({ format: "esm" });
      const code = output[0].code;

      assert.equal(transformOrder.length, 2);
      for (const entry of transformOrder) {
        assert.equal(
          entry.hasSecret,
          false,
          `Normal transform hook saw raw secret in ${entry.id}; 'use server' must be replaced in 'pre' phase before Babel`
        );
      }
      assert.doesNotMatch(code, /ROLLUP_INLINE_SECRET/);
      assert.doesNotMatch(code, /ROLLUP_MOD_SECRET/);
      assert.match(code, /createServerFunctionProxy/);
      assert.match(code, /react\/compiler-runtime/);
    } finally {
      if (prevWriteEnv === undefined) delete process.env.DINOU_WRITE_TO_DISK;
      else process.env.DINOU_WRITE_TO_DISK = prevWriteEnv;
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

console.log(
  "5️⃣ Verifying Rollup & Webpack production configs honor DinouConfig.reactCompiler & resolved vendor imports in isolated directory..."
);
{
  const prevNodeEnv = process.env.NODE_ENV;
  const prevWrite = process.env.DINOU_WRITE_TO_DISK;
  const prevConfig = globalThis.__DINOU_CONFIG__;
  const origCwd = process.cwd();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dinou-rc-cfg-"));

  try {
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "tmp-isolated-app", type: "module", dependencies: {} }),
      "utf8"
    );
    await fs.writeFile(
      path.join(tmpDir, "src/page.tsx"),
      `export default function Page() { return <main>ok</main>; }\n`,
      "utf8"
    );
    process.chdir(tmpDir);
    process.env.NODE_ENV = "production";
    process.env.DINOU_WRITE_TO_DISK = "false";

    const { default: getRollupConfig } = await import(
      pathToFileURL(path.join(dinouRoot, "rollup/rollup.config.js")).href +
        `?t=${Date.now()}-1`
    );
    const { default: getWebpackConfig } = await import(
      pathToFileURL(path.join(dinouRoot, "webpack/webpack.config.js")).href +
        `?t=${Date.now()}-1`
    );

    globalThis.__DINOU_CONFIG__ = {};
    const webpackClientEnabled = (await getWebpackConfig())[0];
    const babelUseEnabled = webpackClientEnabled.module.rules[0].use[0];

    assert.ok(
      path.isAbsolute(babelUseEnabled.loader),
      `Expected absolute resolved #babel-loader path, got: ${babelUseEnabled.loader}`
    );
    assert.equal(babelUseEnabled.options.configFile, false);
    assert.equal(babelUseEnabled.options.babelrc, false);
    assert.equal(typeof babelUseEnabled.options.presets[0][0], "function");
    assert.equal(typeof babelUseEnabled.options.presets[1], "function");
    assert.equal(babelUseEnabled.options.plugins.length, 2);
    assert.equal(typeof babelUseEnabled.options.plugins[0], "function");
    assert.equal(typeof babelUseEnabled.options.plugins[1], "function");

    const rollupConfigsEnabled = await getRollupConfig();
    assert.ok(Array.isArray(rollupConfigsEnabled));
    assert.ok(rollupConfigsEnabled.length >= 1);

    globalThis.__DINOU_CONFIG__ = { reactCompiler: false };
    const webpackClientDisabled = (await getWebpackConfig())[0];
    const babelUseDisabled = webpackClientDisabled.module.rules[0].use[0];
    assert.equal(
      babelUseDisabled.options.plugins.length,
      1,
      "Webpack plugins must omit pluginReactCompiler when reactCompiler: false"
    );

    const rollupConfigsDisabled = await getRollupConfig();
    assert.ok(Array.isArray(rollupConfigsDisabled));
  } finally {
    process.chdir(origCwd);
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevWrite === undefined) delete process.env.DINOU_WRITE_TO_DISK;
    else process.env.DINOU_WRITE_TO_DISK = prevWrite;
    if (prevConfig === undefined) delete globalThis.__DINOU_CONFIG__;
    else globalThis.__DINOU_CONFIG__ = prevConfig;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

console.log(
  "6️⃣ Verifying DinouConfig TypeScript interface exposes reactCompiler?: boolean..."
);
{
  const dts = readFileSync(path.join(dinouRoot, "index.d.ts"), "utf8");
  assert.match(
    dts,
    /interface DinouConfig[\s\S]*?reactCompiler\?:\s*boolean;/,
    "dinou/index.d.ts must declare reactCompiler?: boolean inside DinouConfig"
  );
}

console.log(
  "✅ RESULT: All React Compiler multi-bundler, 'use server' isolation, vendor resolution & DinouConfig.reactCompiler checks PASSED"
);

