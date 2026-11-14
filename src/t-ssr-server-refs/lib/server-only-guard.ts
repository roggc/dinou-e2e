import * as React from "react";

// Equivalent to `import "server-only"`: under Pass A ("react-server" export condition),
// React.useEffect is undefined. If Pass B ("browser" export condition) or any client
// bundle ever evaluates this module, React.useEffect is a function and throws immediately.
if (typeof (React as Record<string, unknown>).useEffect === "function") {
  throw new Error(
    "FATAL_PASS_B_LEAK: server-only-guard evaluated under browser/SSR conditions instead of react-server!"
  );
}

export const SERVER_VAULT_SECRET = "sk_live_DINOU_SSR_ISOLATION_VAULT_9402";

