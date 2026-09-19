const { pathToFileURL } = require("url");
const path = require("path");
const fs = require("fs");

function getMtimeParam(absPath) {
  try {
    const stats = fs.statSync(absPath);
    return Math.round(stats.mtimeMs);
  } catch (e) {
    return Date.now();
  }
}

async function importModule(modulePath) {
  const absPath = path.isAbsolute(modulePath)
    ? modulePath
    : path.resolve(process.cwd(), modulePath);

  let fileUrl = pathToFileURL(absPath).href;
  if (process.env.NODE_ENV !== "production") {
    fileUrl += `?mtime=${getMtimeParam(absPath)}`;
  }

  const mod = await import(/* webpackIgnore: true */ fileUrl);
  return mod;
}

module.exports = importModule;
