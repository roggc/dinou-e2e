import fs from "node:fs/promises";
import path from "node:path";
import { regex } from "../../core/asset-extensions.js";

export default async function write(result) {
  if (!result.metafile) {
    return;
  }
  const skipSet = new Set();
  const normalizeRel = (p) => p.replace(/\\/g, "/");
  const cssRegex = /\.(css|scss|less)$/i;
  for (const [relPath, info] of Object.entries(result.metafile.outputs)) {
    if (!info.entryPoint) continue;
    let entryPointNormalized = info.entryPoint;
    if (entryPointNormalized.startsWith("dinou-asset:")) {
      entryPointNormalized = entryPointNormalized.replace("dinou-asset:", "");
    }
    const inputKeys = Object.keys(info.inputs);
    // Logic for assets
    if (
      regex.test(entryPointNormalized) &&
      inputKeys.length === 1 &&
      inputKeys[0] === info.entryPoint
    ) {
      // Skip the useless .js file
      const normalizedPath = normalizeRel(relPath);
      skipSet.add(normalizedPath);
      // Skip the corresponding .map file if it exists
      const mapRelPath = relPath.replace(/\.js$/, ".js.map");
      if (result.metafile.outputs[mapRelPath]) {
        skipSet.add(normalizeRel(mapRelPath));
      }
    }
    // Logic for CSS
    if (
      cssRegex.test(info.entryPoint) &&
      ((inputKeys.length === 1 && inputKeys[0] === info.entryPoint) ||
        inputKeys.length === 0)
    ) {
      // Skip the useless .js file
      const normalizedPath = normalizeRel(relPath);
      skipSet.add(normalizedPath);
      // Skip the corresponding .map file if it exists
      const mapRelPath = relPath + ".map";
      if (result.metafile.outputs[mapRelPath]) {
        skipSet.add(normalizeRel(mapRelPath));
      }
    }
  }
  const filesToWrite = [];
  for (const file of result.outputFiles) {
    const fileRelPath = normalizeRel(path.relative(process.cwd(), file.path));
    if (skipSet.has(fileRelPath)) {
      continue;
    }
    filesToWrite.push(file);
  }

  const tWrite0 = Date.now();
  const uniqueDirs = new Set(filesToWrite.map((f) => path.dirname(f.path)));
  await Promise.all(
    Array.from(uniqueDirs).map((d) => fs.mkdir(d, { recursive: true }))
  );
  await Promise.all(
    filesToWrite.map(async (file) => {
      try {
        const existing = await fs.readFile(file.path);
        if (existing.equals(file.contents)) return;
      } catch (e) {}
      await fs.writeFile(file.path, file.contents);
    })
  );
  globalThis.__DINOU_WRITE_TIME__ = Date.now() - tWrite0;

  console.log(`✓ Build completed`);
}
