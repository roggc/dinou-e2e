# Fix: Windows `EPERM` / `EBUSY` When Removing `./dinou` During `dinou uneject` (and `dinou eject --force`)

## Root Cause

In `dinou/core/uneject.js`, removing the local `./dinou` directory calls `fs.rmSync` with no retry options and no error handling:

- **Line 563 (`uneject`)**:
  ```js
  if (!keepDinouDir && fs.existsSync(localDinouDir)) {
    fs.rmSync(localDinouDir, { recursive: true, force: true });
    console.log("🗑️  Removed local ./dinou directory");
  }
  ```
- **Line 342 (`runEject` with `force: true`)**:
  ```js
  if (fs.existsSync(targetDinouDir) && force) {
    fs.rmSync(targetDinouDir, { recursive: true, force: true });
  }
  ```

On Windows, running `npm run uneject` (`node dinou/cli.js uneject ...`) executes scripts from inside `./dinou` while the TypeScript language server, IDE file watchers, Windows Defender, or a recently exited `npm install` may briefly hold handles on `./dinou` or its `.d.ts` files. Without `maxRetries`/`retryDelay` or a `try/catch` fallback, `fs.rmSync` throws an unhandled `Error: EPERM, Permission denied` and exits with code `1` **after** `package.json` has already been rewritten and `node_modules/dinou` has already been installed successfully.

---

## Required Changes in `dinou/core/uneject.js`

### 1. Import `spawn` alongside `spawnSync` (line 4)

```js
import { spawn, spawnSync } from "node:child_process";
```

### 2. Add a Windows-resilient removal helper

Add a helper function above `runEject`:

```js
const WIN_LOCK_ERROR_CODES = new Set(["EPERM", "EBUSY", "ENOTEMPTY", "EACCES"]);

function scheduleDeferredRemoveOnWindows(targetDir) {
  try {
    const script =
      "const fs=require('node:fs');const dir=process.argv[1];" +
      "setTimeout(()=>{try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:20,retryDelay:250});}catch{}},400);";
    const child = spawn(process.execPath, ["-e", script, targetDir], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function removeDinouDirSafely(targetDir, { allowDeferredFallback = false } = {}) {
  try {
    fs.rmSync(targetDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 150,
    });
    return { removed: true, deferred: false, error: null };
  } catch (err) {
    const isWinLock =
      process.platform === "win32" &&
      err &&
      typeof err.code === "string" &&
      WIN_LOCK_ERROR_CODES.has(err.code);

    if (allowDeferredFallback && isWinLock) {
      const deferred = scheduleDeferredRemoveOnWindows(targetDir);
      return { removed: false, deferred, error: err };
    }

    if (allowDeferredFallback) {
      return { removed: false, deferred: false, error: err };
    }

    throw err;
  }
}
```

### 3. Use `removeDinouDirSafely` in `runEject` (line 341)

```js
  if (fs.existsSync(targetDinouDir) && force) {
    removeDinouDirSafely(targetDinouDir, { allowDeferredFallback: false });
  }
```

### 4. Use `removeDinouDirSafely` in `uneject` (lines 562–570)

Replace lines 562–570 with:

```js
  let dinouDirRemaining = false;
  if (!keepDinouDir && fs.existsSync(localDinouDir)) {
    const rmResult = removeDinouDirSafely(localDinouDir, {
      allowDeferredFallback: true,
    });
    if (rmResult.removed) {
      console.log("🗑️  Removed local ./dinou directory");
    } else {
      dinouDirRemaining = true;
      const code = rmResult.error?.code || "ERROR";
      if (rmResult.deferred) {
        console.warn(
          `⚠️  [Dinou Uneject] ./dinou is currently locked (${code}). Scheduled automatic cleanup after exit — if ./dinou still remains (e.g. held by an open dev server or IDE), you can safely delete it manually.`
        );
      } else {
        console.warn(
          `⚠️  [Dinou Uneject] Could not delete ./dinou automatically (${code}: ${rmResult.error?.message || "locked"}). package.json and node_modules/dinou were updated successfully — please delete ./dinou manually.`
        );
      }
    }
  }

  console.log(
    "🎉 Uneject completed successfully! Dinou is now running from node_modules/dinou."
  );
  return { cancelled: false, ...(dinouDirRemaining ? { dinouDirRemaining: true } : {}) };
```

---

## Verification

1. **Windows real-world test**: In an ejected project on Windows (with an editor open on the workspace), run:
   ```bash
   npm run uneject -- path/to/dinou-10.0.0.tgz -y
   ```
   Confirm:
   - Exit code is `0` (no unhandled `EPERM` crash).
   - `package.json` scripts and `dependencies.dinou` are updated and `node_modules/dinou` is installed.
   - `./dinou` is deleted either immediately via `maxRetries` or ~400ms after the parent `node dinou/cli.js` process exits via the detached cleanup helper.
2. **Unit test**: Mock `fs.rmSync` to throw `{ code: "EPERM", message: "Permission denied" }` and assert that `uneject({ yes: true, skipInstall: true, projectRoot })` does **not** roll back `package.json`, logs the warning cleanly, and resolves with `{ cancelled: false, dinouDirRemaining: true }`.
3. **Linux/macOS regression check**: Confirm `rmResult.removed === true` deletes `./dinou` synchronously and returns `{ cancelled: false }` identically to before.
