// dinou/core/storage-adapter.js
// Pluggable storage abstraction for ISR/ISG cache and static artifacts.
// Supports FileSystem (Node.js/Netlify/Docker), Cloudflare KV (Edge), and Memory.

const path = require("path");
const fs = require("fs");

class StorageAdapter {
  async get(key) {
    throw new Error("StorageAdapter.get must be implemented");
  }
  async set(key, content, metadata = null) {
    throw new Error("StorageAdapter.set must be implemented");
  }
  async has(key) {
    throw new Error("StorageAdapter.has must be implemented");
  }
  async delete(key) {
    throw new Error("StorageAdapter.delete must be implemented");
  }
}

/**
 * FileSystem storage adapter (Default for Node.js, Netlify, Docker).
 * Reads and writes directly to .dinou/dist2.
 */
class FileSystemStorage extends StorageAdapter {
  constructor(baseDir = path.resolve(process.cwd(), ".dinou/dist2")) {
    super();
    this.baseDir = baseDir;
  }

  _resolve(key) {
    const cleanKey = key.replace(/^\/+/, "");
    return path.join(this.baseDir, cleanKey);
  }

  async get(key) {
    const targetPath = this._resolve(key);
    if (!fs.existsSync(targetPath)) return null;
    const content = fs.readFileSync(targetPath, "utf8");

    // Check companion metadata if available
    let metadata = null;
    const metaPath = path.join(path.dirname(targetPath), "metadata.json");
    if (fs.existsSync(metaPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      } catch (e) {}
    }
    return { content, metadata };
  }

  async set(key, content, metadata = null) {
    const targetPath = this._resolve(key);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, content, "utf8");

    if (metadata) {
      const metaPath = path.join(dir, "metadata.json");
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf8");
    }
  }

  async has(key) {
    const targetPath = this._resolve(key);
    return fs.existsSync(targetPath);
  }

  async delete(key) {
    const targetPath = this._resolve(key);
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { force: true });
    }
  }
}

/**
 * Cloudflare KV Storage Adapter for Cloudflare Workers.
 */
class CloudflareKVStorage extends StorageAdapter {
  constructor(kvNamespace) {
    super();
    this.kv = kvNamespace;
  }

  _cleanKey(key) {
    return key.replace(/^\/+/, "").replace(/\\/g, "/");
  }

  async get(key) {
    if (!this.kv) return null;
    const cleanKey = this._cleanKey(key);
    const res = await this.kv.getWithMetadata(cleanKey, "text");
    if (!res || res.value === null) return null;
    return {
      content: res.value,
      metadata: res.metadata || null,
    };
  }

  async set(key, content, metadata = null) {
    if (!this.kv) return;
    const cleanKey = this._cleanKey(key);
    const options = metadata ? { metadata } : undefined;
    await this.kv.put(cleanKey, content, options);
  }

  async has(key) {
    if (!this.kv) return false;
    const cleanKey = this._cleanKey(key);
    const val = await this.kv.get(cleanKey);
    return val !== null;
  }

  async delete(key) {
    if (!this.kv) return;
    const cleanKey = this._cleanKey(key);
    await this.kv.delete(cleanKey);
  }
}

/**
 * In-memory storage adapter.
 */
class MemoryStorage extends StorageAdapter {
  constructor() {
    super();
    this.store = new Map();
  }

  async get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    return { content: item.content, metadata: item.metadata };
  }

  async set(key, content, metadata = null) {
    this.store.set(key, { content, metadata });
  }

  async has(key) {
    return this.store.has(key);
  }

  async delete(key) {
    this.store.delete(key);
  }
}

let activeStorageAdapter = null;

function getStorageAdapter() {
  if (!activeStorageAdapter) {
    activeStorageAdapter = new FileSystemStorage();
  }
  return activeStorageAdapter;
}

function setStorageAdapter(adapter) {
  activeStorageAdapter = adapter;
}

module.exports = {
  StorageAdapter,
  FileSystemStorage,
  CloudflareKVStorage,
  MemoryStorage,
  getStorageAdapter,
  setStorageAdapter,
};
