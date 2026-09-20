const fs = require("fs");
const path = require("path");

const isDevelopment = process.env.NODE_ENV !== "production";
function getVfs() {
  return (typeof globalThis !== "undefined" && globalThis.__DINOU_VFS__) || {};
}

function normalizeKey(p) {
  if (!p) return "";
  let s = String(p).replace(/\\/g, "/");
  if (s.length > 2 && s[1] === ":") s = s.slice(2);
  return s;
}

function buildVfs(dir) {
  const vfs = getVfs();
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

if (!isDevelopment) {
  try {
    const srcDir = path.resolve(process.cwd(), "src");
    if (Object.keys(getVfs()).length === 0 && fs.existsSync && fs.existsSync(srcDir)) {
      buildVfs(srcDir);
    }
  } catch (e) {}
}

function lookupVfs(vfs, p) {
  if (!vfs || !p) return null;
  if (vfs[p]) return vfs[p];

  const s = String(p).split("\\").join("/");
  if (vfs[s]) return vfs[s];

  if (s.length > 2 && s[1] === ":") {
    const noDrive = s.slice(2);
    if (vfs[noDrive]) return vfs[noDrive];
  }

  const idx = s.indexOf("/src");
  if (idx !== -1) {
    const fromSlash = s.slice(idx);
    if (vfs[fromSlash]) return vfs[fromSlash];
    const noSlash = fromSlash.slice(1);
    if (vfs[noSlash]) return vfs[noSlash];
  } else if (s.startsWith("src/") || s === "src") {
    if (vfs[s]) return vfs[s];
    if (vfs["/" + s]) return vfs["/" + s];
  }

  const trimmed = s.replace(/^\/+/, "");
  if (vfs[trimmed]) return vfs[trimmed];
  if (vfs["/" + trimmed]) return vfs["/" + trimmed];

  return null;
}

function existsSync(filePath) {
  if (isDevelopment) {
    return fs.existsSync(filePath);
  }
  const vfs = getVfs();
  return lookupVfs(vfs, filePath) !== null;
}

function readdirSync(dirPath, options) {
  if (isDevelopment) {
    return fs.readdirSync(dirPath, options);
  }
  const vfs = getVfs();
  const entry = lookupVfs(vfs, dirPath);

  if (!entry || entry.type !== "directory" || !Array.isArray(entry.children)) {
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
  getVfs,
};
