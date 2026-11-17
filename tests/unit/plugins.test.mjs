// tests/unit/plugins.test.mjs
// Node --test entry point delegating to scripts/verify-plugins-ci.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

test("Dinou v9.4.0 Configuration, setupFiles & Plugin Architecture Suite", () => {
  const output = execFileSync(
    process.execPath,
    [path.resolve("scripts/verify-plugins-ci.mjs")],
    { encoding: "utf8", timeout: 330000 }
  );
  assert.ok(
    output.includes(
      "All 6 Dinou v9.4.0 Configuration, setupFiles & Plugin Architecture verification suites PASSED!"
    )
  );
});

