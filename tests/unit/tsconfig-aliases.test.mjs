// tests/unit/tsconfig-aliases.test.mjs
// Node --test entry point delegating to scripts/verify-aliases-ci.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

test("Dinou v9.4.0 Unified tsconfig.json & jsconfig.json Path Aliases Suite", () => {
  const output = execFileSync(
    process.execPath,
    [path.resolve("scripts/verify-aliases-ci.mjs")],
    { encoding: "utf8", timeout: 330000 }
  );
  assert.ok(
    output.includes(
      "All 6 Dinou v9.4.0 Unified tsconfig.json & jsconfig.json Path Aliases verification suites PASSED!"
    )
  );
});

