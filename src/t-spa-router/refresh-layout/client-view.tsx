"use client";

import { useRouter } from "dinou";
import { useState } from "react";

export default function ClientRefreshLayoutView({ serverId }: { serverId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");

  return (
    <div style={{ border: "2px solid blue", padding: "16px", marginTop: "12px" }}>
      <p>
        Page Random ID:{" "}
        <strong id="page-random-id" suppressHydrationWarning={true}>
          {serverId}
        </strong>
      </p>

      <input
        id="client-refresh-input"
        type="text"
        placeholder="Type here to test state preservation..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ display: "block", marginBottom: "12px", padding: "4px" }}
      />

      <div style={{ display: "flex", gap: "8px" }}>
        <button id="btn-refresh-page-only" onClick={() => router.refresh()}>
          🔄 Refresh Page Only
        </button>
        <button id="btn-refresh-with-layout" onClick={() => router.refresh({ layout: true })}>
          🔄 Refresh Page And Layout
        </button>
      </div>
    </div>
  );
}
