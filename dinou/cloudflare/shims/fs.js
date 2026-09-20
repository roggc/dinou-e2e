// dinou/cloudflare/shims/fs.js
function getVfs() {
  return (typeof globalThis !== "undefined" && globalThis.__DINOU_VFS__) || {};
}

function normalizeKey(p) {
  if (!p) return "";
  let s = String(p).replace(/\\/g, "/");
  if (s.length > 2 && s[1] === ":") s = s.slice(2);
  return s;
}

export const existsSync = (p) => {
  const vfs = getVfs();
  const k = normalizeKey(p);
  if (vfs[k]) return true;
  if (k.includes("/src/")) {
    const rel = k.slice(k.indexOf("/src/"));
    if (vfs[rel]) return true;
  }
  return false;
};

export const readFileSync = (p) => {
  const vfs = getVfs();
  const k = normalizeKey(p);
  const entry = vfs[k] || (k.includes("/src/") ? vfs[k.slice(k.indexOf("/src/"))] : null);
  if (entry && typeof entry.content === "string") {
    return entry.content;
  }
  return "";
};

export const readdirSync = (p, options) => {
  const vfs = getVfs();
  const k = normalizeKey(p);
  const entry = vfs[k] || (k.includes("/src/") ? vfs[k.slice(k.indexOf("/src/"))] : null);
  if (!entry || entry.type !== "directory" || !Array.isArray(entry.children)) {
    return [];
  }
  if (options && options.withFileTypes) {
    return entry.children.map((c) => ({
      name: c.name,
      isDirectory: () => !!c.isDirectory,
      isFile: () => !c.isDirectory,
    }));
  }
  return entry.children.map((c) => c.name);
};

export const statSync = (p) => {
  const vfs = getVfs();
  const k = normalizeKey(p);
  const entry = vfs[k] || (k.includes("/src/") ? vfs[k.slice(k.indexOf("/src/"))] : null);
  const isDir = entry && entry.type === "directory";
  const isF = entry && entry.type === "file";
  return {
    isDirectory: () => !!isDir,
    isFile: () => !!isF,
  };
};

export const mkdirSync = () => {};
export const writeFileSync = () => {};
export const rmSync = () => {};

export const promises = {
  readFile: async (p) => readFileSync(p),
  writeFile: async () => {},
  readdir: async (p, opts) => readdirSync(p, opts),
  stat: async (p) => statSync(p),
  mkdir: async () => {},
  rm: async () => {},
};

export default {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  promises,
};
