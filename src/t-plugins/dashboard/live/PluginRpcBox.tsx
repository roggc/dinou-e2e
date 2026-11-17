"use client";

import { useState } from "react";
import { inspectPluginServerActionRpc } from "./actions";

export function PluginRpcBox() {
  const [result, setResult] = useState("idle");

  return (
    <div data-testid="t-plugins-rpc-box">
      <button
        id="t-plugins-rpc-btn"
        type="button"
        onClick={async () => {
          const out = await inspectPluginServerActionRpc("dashboard-live");
          setResult(JSON.stringify(out));
        }}
      >
        Verify Plugin Server Action
      </button>
      <pre id="t-plugins-rpc-result">{result}</pre>
    </div>
  );
}

