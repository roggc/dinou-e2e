const fs = require("fs");
const path = require("path");

const isDevelopment = process.env.NODE_ENV !== "production";
const vfs = (typeof globalThis !== "undefined" && globalThis.__DINOU_VFS__) || {};

function normalizeKey(p) {
  return path.resolve(p).replace(/\\/g, "/");
}

function buildVfs(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const children = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const isDirectory = entry.isDirectory();
    children.push({
      name: entry.name,
      isDirectory
    });
    if (isDirectory) {
      buildVfs(fullPath);
    } else {
      vfs[normalizeKey(fullPath)] = { type: "file" };
    }
  }

  vfs[normalizeKey(dir)] = {
    type: "directory",
    children
  };
}

if (!isDevelopment && Object.keys(vfs).length === 0) {
  try {
    const srcDir = path.resolve(process.cwd(), "src");
    buildVfs(srcDir);
  } catch (e) {}
}

function existsSync(filePath) {
  if (isDevelopment) {
    return fs.existsSync(filePath);
  }
  const normalized = normalizeKey(filePath);
  if (vfs[normalized]) return true;
  if (normalized.startsWith("/src") || normalized.includes("/src/")) {
    const srcRelative = normalized.slice(normalized.indexOf("/src"));
    if (vfs[srcRelative]) return true;
  }
  return false;
}

function readdirSync(dirPath, options) {
  if (isDevelopment) {
    return fs.readdirSync(dirPath, options);
  }
  const normalized = normalizeKey(dirPath);
  let entry = vfs[normalized];
  if (!entry && (normalized.startsWith("/src") || normalized.includes("/src/"))) {
    const srcRelative = normalized.slice(normalized.indexOf("/src"));
    entry = vfs[srcRelative];
  }

  if (!entry || entry.type !== "directory") {
    return [];
  }

  if (options && options.withFileTypes) {
    return entry.children.map(child => ({
      name: child.name,
      isDirectory: () => child.isDirectory,
      isFile: () => !child.isDirectory
    }));
  }
  return entry.children.map(child => child.name);
}

module.exports = {
  existsSync,
  readdirSync,
  buildVfs,
  vfs
};
