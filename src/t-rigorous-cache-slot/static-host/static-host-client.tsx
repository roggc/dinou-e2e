"use client";

import React, { useState, useEffect } from "react";
import { refreshSlot } from "dinou";
import { invalidateSlotTag } from "../actions";

export default function StaticHostSlotClient() {
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div
      id="static-host-controls"
      data-testid="static-host-controls"
      data-hydrated={hydrated ? "true" : "false"}
      style={{ marginTop: "16px", display: "flex", gap: "8px", flexWrap: "wrap" }}
    >
      <span id="static-host-status" data-testid="static-host-status">
        {status}
      </span>
      <button
        id="btn-static-host-inv-only"
        onClick={async () => {
          setStatus("invalidating...");
          await invalidateSlotTag("rig-tag-static-host-slot");
          setStatus("invalidated");
        }}
      >
        Invalidate Slot on Static Host
      </button>
      <button
        id="btn-static-host-inv-and-refresh"
        onClick={async () => {
          setStatus("invalidating...");
          await invalidateSlotTag("rig-tag-static-host-slot");
          setStatus("refreshing...");
          refreshSlot("rig-slot-static-host", { fresh: true });
          setStatus("refreshed");
        }}
      >
        Invalidate & Live Refresh Slot on Static Host
      </button>
      <button
        id="btn-static-host-fresh-only"
        onClick={() => {
          refreshSlot("rig-slot-static-host", { fresh: true });
          setStatus("fresh-requested");
        }}
      >
        Force Fresh Slot on Static Host
      </button>
    </div>
  );
}

